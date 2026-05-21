import type { ParserPlugin } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import type { DecoratorCompilerRegistry } from '../decorators'
import type {
  DecoratorMapping,
  ParsedQuaScript,
  ParsedQuaScriptDocument,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDialogue,
  SourceRange,
} from './types'
import generateModule from '@babel/generator'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import * as t from '@babel/types'
import { createDefaultDecoratorCompilerRegistry } from '../decorators'
import { parseQuaScriptDocument } from './document'
import { QuaScriptParser, scanTemplateText } from './parser'
import { DEFAULT_DECORATOR_MAPPINGS } from './types'

const HOST_SOURCE_PARSER_PLUGINS: ParserPlugin[] = ['typescript', 'jsx', 'decorators']
const generateCode = resolveCallableDefault(generateModule)
const traverseAst = resolveCallableDefault(traverseModule)
const ENGINE_EXPRESSION_HELPERS = new Set(['node', 'label', 'scene', 'script', 'packageNode', 'checkpoint', 'image'])

// Babel ships these helpers through CommonJS interop, so resolve a callable
// default export that works both in Vitest bundling and native Node ESM.
function resolveCallableDefault<T extends (...args: any[]) => unknown>(module: T | { default?: T }): T {
  const maybeDefault = (module as { default?: T }).default
  return typeof maybeDefault === 'function'
    ? maybeDefault
    : module as T
}

export interface QuaScriptTransformerOptions {
  decoratorCompilerRegistry?: DecoratorCompilerRegistry
  runtimeModule?: {
    moduleId: string
    version?: string
    stableSeed?: string
  }
}

/**
 * Transform QuaScript to JavaScript GameStep array.
 *
 * The transformer owns the syntax-to-AST flow only. Feature-specific
 * decorator lowering is delegated to registered decorator compilers.
 */
export class QuaScriptTransformer {
  protected decoratorMappings: DecoratorMapping
  private usedDecorators: Set<string> = new Set()
  private usedRuntimeHelpers: Set<string> = new Set()
  private usedEngineHelpers: Set<string> = new Set()
  private handledDecoratorModules: Set<string> = new Set()
  protected decoratorCompilerRegistry: DecoratorCompilerRegistry
  private runtimeModule?: NonNullable<QuaScriptTransformerOptions['runtimeModule']>

  constructor(
    decoratorMappings: DecoratorMapping = DEFAULT_DECORATOR_MAPPINGS,
    options: QuaScriptTransformerOptions = {},
  ) {
    const { decoratorCompilerRegistry } = options

    this.decoratorMappings = decoratorMappings
    this.decoratorCompilerRegistry = decoratorCompilerRegistry || createDefaultDecoratorCompilerRegistry()
    this.runtimeModule = options.runtimeModule
  }

  /**
   * Transform TypeScript source containing qs template literals.
   */
  transformSource(source: string): string {
    this.usedDecorators.clear()
    this.usedRuntimeHelpers.clear()
    this.usedEngineHelpers.clear()
    this.handledDecoratorModules.clear()

    const ast = parse(source, {
      sourceType: 'module',
      plugins: HOST_SOURCE_PARSER_PLUGINS,
    })

    let transformed = false

    traverseAst(ast, {
      TaggedTemplateExpression: (path: NodePath<t.TaggedTemplateExpression>) => {
        if (t.isIdentifier(path.node.tag) && path.node.tag.name === 'qs') {
          const quasiValue = this.extractQuasiValue(path.node.quasi)
          if (quasiValue) {
            const parser = new QuaScriptParser()
            const parsed = parser.parse(quasiValue)
            this.throwDocumentDiagnostics(parsed.diagnostics.filter(diagnostic => diagnostic.severity === 'error'))
            this.collectUsedDecorators(parsed)
            const gameStepsArray = this.transformToGameSteps(parsed, {
              quasi: path.node.quasi,
            })
            path.replaceWith(gameStepsArray)
            transformed = true
          }
        }
      },
    })

    if (transformed) {
      const imports = this.generateImports(ast)
      if (imports.length > 0) {
        const program = ast.program || ast
        program.body.unshift(...imports)
      }
    }

    const result = generateCode(ast, {
      retainLines: false,
      compact: false,
    })

    return result.code
  }

  /**
   * Transform a standalone QuaScript source file into a TypeScript ES module.
   * The module exports a factory so the caller can provide runtime bindings.
   */
  transformModuleSource(source: string, _filePath?: string): string {
    const document = parseQuaScriptDocument(source)
    const parser = new QuaScriptParser()
    const parsed = parser.parse(document.dslBody)
    return this.transformParsedModuleSource(document, parsed)
  }

  transformParsedModuleSource(document: ParsedQuaScriptDocument, parsed: ParsedQuaScript): string {
    this.usedDecorators.clear()
    this.usedRuntimeHelpers.clear()
    this.usedEngineHelpers.clear()
    this.handledDecoratorModules.clear()

    this.throwDocumentDiagnostics(document.diagnostics)
    this.throwDocumentDiagnostics(parsed.diagnostics.filter(diagnostic => diagnostic.severity === 'error'))
    this.collectUsedDecorators(parsed)

    const scopeIdentifier = t.identifier('scope')
    const stepsArray = this.transformToGameSteps(parsed, {
      scopeIdentifier,
    })

    const moduleScript = document.moduleScript?.content.trim() || ''
    const setupScript = document.setupScript?.content.trim() || ''
    const moduleAst = this.parseModuleScriptForImports(moduleScript)
    const imports = this.generateImports(moduleAst)
    const importProgram = t.program(imports)
    const runtimeImports = generateCode(importProgram, {
      retainLines: false,
      compact: false,
    }).code
    const gameStepImport = this.isAlreadyImported(moduleAst, '@quajs/engine', 'GameStep')
      ? ''
      : 'import type { GameStep } from "@quajs/engine";'
    const stepsCode = generateCode(stepsArray, {
      retainLines: false,
      compact: false,
      sourceMaps: false,
    }).code
    const hasScopeType = hasExportedScopeType(moduleScript)
    const scopeParam = hasScopeType
      ? 'scope: Scope'
      : 'scope: Record<string, unknown> = {}'
    const setupCode = setupScript
      ? `${indent(setupScript)}\n`
      : ''

    return [
      gameStepImport,
      runtimeImports,
      moduleScript,
      `export default function createQuaScript(${scopeParam}): GameStep[] {\n${setupCode}  return ${stepsCode}\n}`,
    ]
      .filter(part => part.trim().length > 0)
      .join('\n\n')
  }

  private extractQuasiValue(quasi: t.TemplateLiteral): string | null {
    if (quasi.expressions.length === 0) {
      return quasi.quasis[0].value.cooked || quasi.quasis[0].value.raw
    }

    let result = ''
    for (let i = 0; i < quasi.quasis.length; i++) {
      result += quasi.quasis[i].value.cooked || quasi.quasis[i].value.raw

      if (i < quasi.expressions.length) {
        const expr = quasi.expressions[i]
        if (t.isIdentifier(expr)) {
          result += `\${${expr.name}}`
        }
        else if (t.isMemberExpression(expr)) {
          result += `\${${generateCode(expr).code}}`
        }
        else {
          result += `\${${generateCode(expr).code}}`
        }
      }
    }

    return result
  }

  private collectUsedDecorators(parsed: ParsedQuaScript): void {
    parsed.steps.forEach((step) => {
      if (step.type === 'dialogue') {
        const dialogue = step.content as QuaScriptDialogue
        dialogue.decorators.forEach((decorator) => {
          this.usedDecorators.add(decorator.name)
          decorator.args.forEach(arg => this.collectEngineHelpersFromUnknown(arg))
        })
      }
      else if (step.type === 'action') {
        const action = step.content as any
        action.decorators?.forEach((decorator: QuaScriptDecorator) => {
          this.usedDecorators.add(decorator.name)
          decorator.args.forEach(arg => this.collectEngineHelpersFromUnknown(arg))
        })
      }
      else if (step.type === 'choice') {
        const choice = step.content as QuaScriptChoice
        choice.options.forEach((option) => {
          this.collectEngineHelpersFromUnknown(option.target)
          this.collectEngineHelpersFromUnknown(option.options)
        })
      }
    })
  }

  private collectEngineHelpersFromUnknown(value: unknown): void {
    if (isBabelExpression(value)) {
      this.collectEngineHelpersFromExpression(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(item => this.collectEngineHelpersFromUnknown(item))
      return
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(item => this.collectEngineHelpersFromUnknown(item))
    }
  }

  private collectEngineHelpersFromExpression(expression: t.Expression): void {
    const file = t.file(t.program([t.expressionStatement(expression)]))
    traverseAst(file, {
      CallExpression: (path: NodePath<t.CallExpression>) => {
        if (t.isIdentifier(path.node.callee) && ENGINE_EXPRESSION_HELPERS.has(path.node.callee.name)) {
          this.usedEngineHelpers.add(path.node.callee.name)
        }
      },
    })
  }

  private transformToGameSteps(
    parsed: ParsedQuaScript,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.ArrayExpression {
    const compileState: Record<string, unknown> = {}
    const elements = parsed.steps.map((step, index) => {
      const stepUuid = this.resolveStepUuid(step, index)
      const metadataPoint = this.updateStoryPointCompileState(compileState, step)
      if (step.type === 'dialogue') {
        return this.createDialogueStep(step.content as QuaScriptDialogue, stepUuid, index, compileState, options, metadataPoint)
      }
      if (step.type === 'choice') {
        return this.createChoiceStep(step.content as QuaScriptChoice, stepUuid, index, compileState, options, metadataPoint)
      }
      return this.createActionStep(step.content, stepUuid, index, compileState, options, metadataPoint)
    })

    return t.arrayExpression(elements)
  }

  private updateStoryPointCompileState(state: Record<string, unknown>, step: { type: 'dialogue' | 'action' | 'choice', content: unknown }): Record<string, unknown> | undefined {
    const current = isPlainRecord(state.__quaStoryPoint)
      ? { ...(state.__quaStoryPoint as Record<string, unknown>) }
      : {}
    const decorators = getStoryPointDecorators(step)
    for (const decorator of decorators) {
      const value = typeof decorator.args[0] === 'string' ? decorator.args[0] : undefined
      if (!value) {
        continue
      }
      switch (decorator.name) {
        case 'Chapter':
          delete current.sceneId
          delete current.entryId
          delete current.nodeId
          delete current.labelId
          current.chapterId = value
          break
        case 'Scene':
          delete current.entryId
          delete current.nodeId
          delete current.labelId
          current.sceneId = value
          break
        case 'Entry':
          delete current.nodeId
          delete current.labelId
          current.entryId = value
          break
        case 'Node':
        case 'Interaction':
          delete current.labelId
          current.nodeId = value
          break
        case 'Label':
          current.labelId = value
          break
        case 'Lane':
          current.laneId = value
          break
        case 'Route':
          current.routeId = value
          break
        case 'Timeline':
          current.timelineId = value
          break
        case 'Protagonist':
          current.protagonistId = value
          break
      }
    }

    if (Object.keys(current).length === 0) {
      delete state.__quaStoryPoint
      return undefined
    }

    state.__quaStoryPoint = current
    return current
  }

  private createStepMetadataProperties(point?: Record<string, unknown>): t.ObjectProperty[] {
    return point
      ? [t.objectProperty(t.identifier('metadata'), t.objectExpression([
          t.objectProperty(t.identifier('point'), this.createLiteralExpression(point)),
        ]))]
      : []
  }

  private resolveStepUuid(step: { uuid: string, range?: SourceRange }, index: number): string {
    if (!this.runtimeModule)
      return step.uuid

    const seed = [
      this.runtimeModule.moduleId,
      this.runtimeModule.version || '',
      this.runtimeModule.stableSeed || '',
      index,
      step.range?.start.offset ?? '',
      step.range?.end.offset ?? '',
    ].join('|')
    return `qs:${this.runtimeModule.moduleId}:${stableHash(seed)}`
  }

  private createDialogueStep(
    dialogue: QuaScriptDialogue,
    uuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
    metadataPoint?: Record<string, unknown>,
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      ...this.createStepMetadataProperties(metadataPoint),
      t.objectProperty(t.identifier('run'), this.createRunFunction(dialogue, uuid, stepIndex, compileState, options)),
    ])
  }

  private createActionStep(
    content: any,
    uuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
    metadataPoint?: Record<string, unknown>,
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      ...this.createStepMetadataProperties(metadataPoint),
      t.objectProperty(t.identifier('run'), this.createActionRunFunction(content, uuid, stepIndex, compileState, options)),
    ])
  }

  private createChoiceStep(
    choice: QuaScriptChoice,
    uuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
    metadataPoint?: Record<string, unknown>,
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      ...this.createStepMetadataProperties(metadataPoint),
      t.objectProperty(t.identifier('run'), this.createChoiceRunFunction(choice, uuid, stepIndex, compileState, options)),
    ])
  }

  private createRunFunction(
    dialogue: QuaScriptDialogue,
    stepUuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []
    const context = {
      characterName: dialogue.character,
      stepType: 'dialogue' as const,
      stepIndex,
      stepUuid,
      state: compileState,
    }

    if (dialogue.templateExpressions.length > 0) {
      statements.push(...this.createTextHelperStatements())
    }
    statements.push(...this.createDecoratorStatements(dialogue.decorators, context, options.scopeIdentifier))
    statements.push(...this.createImplicitDecoratorStatements(dialogue.decorators, context, options.scopeIdentifier))

    statements.push(t.expressionStatement(t.awaitExpression(this.createSpeakCall(dialogue, options))))

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createActionRunFunction(
    content: any,
    stepUuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.ArrowFunctionExpression {
    const context = {
      stepType: 'action' as const,
      stepIndex,
      stepUuid,
      state: compileState,
    }
    const statements = this.createDecoratorStatements(content.decorators || [], context, options.scopeIdentifier)

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createChoiceRunFunction(
    choice: QuaScriptChoice,
    stepUuid: string,
    stepIndex: number,
    compileState: Record<string, unknown>,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.ArrowFunctionExpression {
    void stepUuid
    void stepIndex
    void compileState
    const choicesIdentifier = t.identifier('choices')
    const choicesArray = t.arrayExpression(choice.options.map(option => this.createChoiceDefinitionExpression(option, options)))

    const selected = t.identifier('selected')
    const selectedChoice = t.identifier('selectedChoice')
    const statements: t.Statement[] = []
    if (choice.options.some(option => option.templateExpressions.length > 0)) {
      statements.push(...this.createTextHelperStatements())
    }
    statements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(choicesIdentifier, choicesArray),
      ]),
      t.expressionStatement(t.awaitExpression(t.callExpression(
        t.memberExpression(
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          t.identifier('showChoices'),
        ),
        [choicesIdentifier],
      ))),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          selected,
          t.awaitExpression(t.callExpression(
            t.memberExpression(
              t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
              t.identifier('waitFor'),
            ),
            [
              t.stringLiteral('user/choice_select'),
              t.arrowFunctionExpression(
                [t.identifier('payload')],
                t.callExpression(
                  t.memberExpression(choicesIdentifier, t.identifier('some')),
                  [
                    t.arrowFunctionExpression(
                      [t.identifier('choice')],
                      t.binaryExpression(
                        '===',
                        t.memberExpression(t.identifier('choice'), t.identifier('id')),
                        t.memberExpression(t.identifier('payload'), t.identifier('choiceId')),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          )),
        ),
      ]),
      t.expressionStatement(t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier('ctx'), t.identifier('choice')),
        selected,
      )),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          selectedChoice,
          t.callExpression(
            t.memberExpression(choicesIdentifier, t.identifier('find')),
            [
              t.arrowFunctionExpression(
                [t.identifier('choice')],
                t.binaryExpression(
                  '===',
                  t.memberExpression(t.identifier('choice'), t.identifier('id')),
                  t.memberExpression(selected, t.identifier('choiceId')),
                ),
              ),
            ],
          ),
        ),
      ]),
      t.ifStatement(
        t.logicalExpression(
          '&&',
          selectedChoice,
          t.memberExpression(selectedChoice, t.identifier('target')),
        ),
        t.blockStatement([
          t.expressionStatement(t.awaitExpression(t.callExpression(
            t.memberExpression(
              t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
              t.identifier('jumpToChoice'),
            ),
            [t.memberExpression(selected, t.identifier('choiceId'))],
          ))),
        ]),
        t.blockStatement([
          t.expressionStatement(t.awaitExpression(t.callExpression(
            t.memberExpression(
              t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
              t.identifier('clearChoices'),
            ),
            [],
          ))),
        ]),
      ),
      t.returnStatement(),
    )

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createChoiceDefinitionExpression(
    option: QuaScriptChoice['options'][number],
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.ObjectExpression {
    const textExpression = this.createTextExpression(option.text, option.templateExpressions, options)
    const targetExpression = this.createChoiceTargetExpression(option)
    const choiceOptions = this.createChoiceOptionsExpression(option, options)
    const enabledExpression = option.condition
      ? this.parseExpression(option.condition, options.scopeIdentifier)
      : getObjectPropertyExpression(choiceOptions, 'when') || t.booleanLiteral(true)
    const idExpression = getObjectPropertyExpression(choiceOptions, 'id') || t.stringLiteral(option.id || this.createStaticChoiceId(option))
    const unavailable = getObjectPropertyExpression(choiceOptions, 'unavailable')
    const presentation = getObjectPropertyExpression(choiceOptions, 'presentation')
    const optionMetadata = getObjectPropertyExpression(choiceOptions, 'metadata')
    const targetNodeId = this.createChoiceTargetNodeIdExpression(targetExpression, option)
    const metadataProperties: t.ObjectProperty[] = [
      t.objectProperty(t.identifier('jumpTarget'), targetExpression),
      t.objectProperty(t.identifier('storyGraph'), t.objectExpression([
        t.objectProperty(t.identifier('edge'), t.objectExpression([
          t.objectProperty(t.identifier('kind'), t.stringLiteral('choice')),
          t.objectProperty(t.identifier('to'), targetNodeId),
          ...(option.condition
            ? [t.objectProperty(t.identifier('condition'), t.stringLiteral(option.condition))]
            : []),
        ])),
      ])),
      ...(option.condition
        ? [t.objectProperty(t.identifier('condition'), t.stringLiteral(option.condition))]
        : []),
      ...(optionMetadata && t.isObjectExpression(optionMetadata)
        ? optionMetadata.properties.filter((property): property is t.ObjectProperty => t.isObjectProperty(property))
        : optionMetadata
          ? [t.objectProperty(t.identifier('custom'), optionMetadata)]
          : []),
    ]

    return t.objectExpression([
      t.objectProperty(t.identifier('id'), idExpression),
      t.objectProperty(t.identifier('text'), textExpression),
      t.objectProperty(t.identifier('target'), targetExpression),
      t.objectProperty(t.identifier('enabled'), enabledExpression),
      ...(unavailable ? [t.objectProperty(t.identifier('unavailable'), unavailable)] : []),
      ...(presentation ? [t.objectProperty(t.identifier('presentation'), presentation)] : []),
      t.objectProperty(t.identifier('metadata'), t.objectExpression(metadataProperties)),
    ])
  }

  private createChoiceOptionsExpression(
    option: QuaScriptChoice['options'][number],
    options: { scopeIdentifier?: t.Identifier } = {},
  ): t.ObjectExpression {
    const source = option.options
    const properties: t.ObjectProperty[] = []
    if (source && typeof source === 'object' && !Array.isArray(source) && !isBabelExpression(source)) {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        properties.push(t.objectProperty(createObjectKey(key), this.createLiteralExpression(value)))
      }
    }
    else if (isBabelExpression(source)) {
      return t.objectExpression([t.objectProperty(t.identifier('metadata'), source)])
    }
    if (option.condition && !properties.some(property => getObjectKeyName(property.key) === 'when')) {
      properties.push(t.objectProperty(t.identifier('when'), this.parseExpression(option.condition, options.scopeIdentifier)))
    }
    return t.objectExpression(properties)
  }

  private createChoiceTargetExpression(option: QuaScriptChoice['options'][number]): t.Expression {
    if (option.source === 'decorator') {
      if (!option.target) {
        return t.objectExpression([t.objectProperty(t.identifier('kind'), t.stringLiteral('node')), t.objectProperty(t.identifier('id'), t.stringLiteral(option.id || this.createStaticChoiceId(option)))])
      }
      return this.createLiteralExpression(option.target)
    }
    if (typeof option.target === 'string') {
      return this.createTargetExpressionFromSugar(option.target)
    }
    return this.createLiteralExpression(option.target)
  }

  private createTargetExpressionFromSugar(source: string): t.ObjectExpression {
    const target = source.trim()
    if (target.startsWith('#')) {
      return t.objectExpression([
        t.objectProperty(t.identifier('kind'), t.stringLiteral('label')),
        t.objectProperty(t.identifier('id'), t.stringLiteral(target.slice(1))),
      ])
    }
    const sceneMatch = /^scene:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
    if (sceneMatch) {
      return t.objectExpression([
        t.objectProperty(t.identifier('kind'), t.stringLiteral('scene')),
        t.objectProperty(t.identifier('sceneId'), t.stringLiteral(sceneMatch[1])),
        ...(sceneMatch[2] ? [t.objectProperty(t.identifier('entry'), t.stringLiteral(sceneMatch[2]))] : []),
      ])
    }
    const packageMatch = /^package:([^#\s]+)#([^\s]+)$/.exec(target)
    if (packageMatch) {
      return t.objectExpression([
        t.objectProperty(t.identifier('kind'), t.stringLiteral('package-node')),
        t.objectProperty(t.identifier('packageId'), t.stringLiteral(packageMatch[1])),
        t.objectProperty(t.identifier('nodeId'), t.stringLiteral(packageMatch[2])),
      ])
    }
    const scriptMatch = /^script:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
    if (scriptMatch) {
      return t.objectExpression([
        t.objectProperty(t.identifier('kind'), t.stringLiteral('script')),
        t.objectProperty(t.identifier('moduleId'), t.stringLiteral(scriptMatch[1])),
        ...(scriptMatch[2] ? [t.objectProperty(t.identifier('nodeId'), t.stringLiteral(scriptMatch[2]))] : []),
      ])
    }
    return t.objectExpression([
      t.objectProperty(t.identifier('kind'), t.stringLiteral('node')),
      t.objectProperty(t.identifier('id'), t.stringLiteral(target)),
    ])
  }

  private createChoiceTargetNodeIdExpression(targetExpression: t.Expression, option: QuaScriptChoice['options'][number]): t.Expression {
    if (t.isObjectExpression(targetExpression)) {
      const nodeId = getObjectPropertyExpression(targetExpression, 'id')
        || getObjectPropertyExpression(targetExpression, 'nodeId')
        || getObjectPropertyExpression(targetExpression, 'labelId')
        || getObjectPropertyExpression(targetExpression, 'entry')
        || getObjectPropertyExpression(targetExpression, 'stepId')
        || getObjectPropertyExpression(targetExpression, 'moduleId')
      if (nodeId) {
        return nodeId
      }
    }
    return t.stringLiteral(option.id || this.createStaticChoiceId(option))
  }

  private createStaticChoiceId(option: QuaScriptChoice['options'][number]): string {
    if (typeof option.target === 'string' && option.target.trim()) {
      return option.target.trim()
    }
    return option.text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'choice'
  }

  private createDecoratorStatements(
    decorators: QuaScriptDecorator[],
    context: { characterName?: string, stepType: 'dialogue' | 'action', stepIndex: number, stepUuid: string, state: Record<string, unknown> },
    scopeIdentifier?: t.Identifier,
  ): t.Statement[] {
    void scopeIdentifier
    const statements: t.Statement[] = []

    for (let index = 0; index < decorators.length; index++) {
      const decorator = decorators[index]
      const mapping = this.decoratorMappings[decorator.name]
      if (!mapping) {
        continue
      }

      const compiled = this.decoratorCompilerRegistry.compile({
        decorator,
        decorators,
        index,
        context,
        mapping,
      })

      if (compiled) {
        this.handledDecoratorModules.add(compiled.compiler.module)
        this.handledDecoratorModules.add(mapping.module)
        compiled.result.runtimeHelpers?.forEach(helper => this.usedRuntimeHelpers.add(helper))
        if (compiled.result.skip) {
          index = compiled.result.nextIndex ?? index
          continue
        }
        if (compiled.result.call) {
          statements.push(t.expressionStatement(t.awaitExpression(compiled.result.call)))
        }
        index = compiled.result.nextIndex ?? index
        continue
      }

      const call = this.createDecoratorCall(decorator, mapping)
      statements.push(t.expressionStatement(t.awaitExpression(call)))
      if (isTerminatingEngineDecorator(decorator.name)) {
        statements.push(t.returnStatement())
        break
      }
    }

    return statements
  }

  private createImplicitDecoratorStatements(
    decorators: QuaScriptDecorator[],
    context: { characterName?: string, stepType: 'dialogue' | 'action', stepIndex: number, stepUuid: string, state: Record<string, unknown> },
    scopeIdentifier?: t.Identifier,
  ): t.Statement[] {
    void scopeIdentifier
    const implicit = this.decoratorCompilerRegistry.compileImplicit({
      decorators,
      context,
    })

    return implicit.flatMap((compiled) => {
      this.handledDecoratorModules.add(compiled.compiler.module)
      compiled.result.runtimeHelpers?.forEach(helper => this.usedRuntimeHelpers.add(helper))
      if (compiled.result.skip || !compiled.result.call) {
        return []
      }
      return [t.expressionStatement(t.awaitExpression(compiled.result.call))]
    })
  }

  private createDecoratorCall(decorator: QuaScriptDecorator, mapping: DecoratorMapping[string]): t.CallExpression {
    const args = this.createDecoratorArgs(decorator)

    if (mapping.module === '@quajs/engine') {
      return t.callExpression(
        t.memberExpression(
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          t.identifier(mapping.function),
        ),
        args,
      )
    }

    if (mapping.function.endsWith('WithEngine')) {
      return t.callExpression(
        t.identifier(mapping.function),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          ...args,
        ],
      )
    }

    return t.callExpression(t.identifier(mapping.function), args)
  }

  private createDecoratorArgs(decorator: QuaScriptDecorator): t.Expression[] {
    return decorator.args.map(arg => this.createLiteralExpression(arg))
  }

  private createLiteralExpression(value: unknown): t.Expression {
    if (isBabelExpression(value)) {
      this.collectEngineHelpersFromExpression(value)
      return value
    }
    if (typeof value === 'string') {
      return t.stringLiteral(value)
    }
    if (typeof value === 'number') {
      return t.numericLiteral(value)
    }
    if (typeof value === 'boolean') {
      return t.booleanLiteral(value)
    }
    if (value === null) {
      return t.nullLiteral()
    }
    if (Array.isArray(value)) {
      return t.arrayExpression(value.map(item => this.createLiteralExpression(item)))
    }
    if (typeof value === 'object') {
      return t.objectExpression(
        Object.entries(value as Record<string, unknown>).map(([key, item]) =>
          t.objectProperty(t.identifier(key), this.createLiteralExpression(item)),
        ),
      )
    }
    return t.identifier('undefined')
  }

  private parseExpression(source: string, scopeIdentifier?: t.Identifier): t.Expression {
    try {
      const parsed = parse(`(${source})`, {
        sourceType: 'module',
        plugins: HOST_SOURCE_PARSER_PLUGINS,
      })
      const statement = parsed.program.body[0]
      if (
        t.isExpressionStatement(statement)
        && t.isExpression(statement.expression)
      ) {
        return statement.expression
      }
    }
    catch (error) {
      throw new Error(`Invalid TypeScript expression in QuaScript: ${source}\n${error instanceof Error ? error.message : String(error)}`)
    }

    void scopeIdentifier
    throw new Error(`Invalid TypeScript expression in QuaScript: ${source}`)
  }

  private throwDocumentDiagnostics(diagnostics: Array<{ message: string, severity: 'error' | 'warning' }>): void {
    const errors = diagnostics.filter(diagnostic => diagnostic.severity === 'error')
    if (errors.length > 0) {
      throw new Error(errors.map(error => error.message).join('\n'))
    }
  }

  private parseModuleScriptForImports(moduleScript: string): t.Program {
    if (!moduleScript.trim()) {
      return t.program([])
    }

    const parsed = parse(moduleScript, {
      sourceType: 'module',
      plugins: HOST_SOURCE_PARSER_PLUGINS,
    })
    return parsed.program
  }

  private createTextHelperStatements(): t.Statement[] {
    const translate = t.identifier('$t')
    return [
      t.variableDeclaration('const', [
        t.variableDeclarator(
          translate,
          t.arrowFunctionExpression(
            [t.identifier('key'), t.identifier('options')],
            t.callExpression(
              t.memberExpression(t.identifier('ctx'), t.identifier('t')),
              [t.identifier('key'), t.identifier('options')],
            ),
          ),
        ),
      ]),
      t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier('t'), translate),
      ]),
    ]
  }

  private createTextExpression(
    text: string,
    templateExpressions: readonly string[],
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.Expression {
    void options.quasi
    if (templateExpressions.length === 0) {
      return t.stringLiteral(text)
    }

    const { parts } = scanTemplateText(text)
    const values: t.Expression[] = []
    parts.forEach((part, index) => {
      values.push(t.stringLiteral(part))
      if (index < templateExpressions.length) {
        values.push(this.parseExpression(templateExpressions[index], options.scopeIdentifier))
      }
    })

    this.usedEngineHelpers.add('resolveQuaText')
    return t.awaitExpression(t.callExpression(
      t.identifier('resolveQuaText'),
      [
        t.identifier('ctx'),
        t.arrayExpression(values),
      ],
    ))
  }

  private createSpeakCall(
    dialogue: QuaScriptDialogue,
    options: {
      quasi?: t.TemplateLiteral
      scopeIdentifier?: t.Identifier
    } = {},
  ): t.CallExpression {
    const textExpression = this.createTextExpression(dialogue.text, dialogue.templateExpressions, options)

    this.usedRuntimeHelpers.add('speakWithEngine')
    return t.callExpression(
      t.identifier('speakWithEngine'),
      [
        t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
        t.stringLiteral(dialogue.character),
        textExpression,
      ],
    )
  }

  private generateImports(ast: any): t.ImportDeclaration[] {
    const imports: t.ImportDeclaration[] = []
    const importMap = new Map<string, Set<string>>()

    this.usedDecorators.forEach((decoratorName) => {
      const mapping = this.decoratorMappings[decoratorName]
      if (!mapping || mapping.module === '@quajs/engine') {
        return
      }
      if (this.handledDecoratorModules.has(mapping.module)) {
        return
      }
      if (this.isAlreadyImported(ast, mapping.module, mapping.function)) {
        return
      }
      this.addImport(importMap, mapping.module, mapping.function)
    })

    this.decoratorCompilerRegistry.getRuntimeHelperNames().forEach((helperName) => {
      if (!this.usedRuntimeHelpers.has(helperName)) {
        return
      }

      const module = this.decoratorCompilerRegistry.getRuntimeHelperModule(helperName)
      if (!module || this.isAlreadyImported(ast, module, helperName)) {
        return
      }

      this.addImport(importMap, module, helperName)
    })

    this.usedEngineHelpers.forEach((helperName) => {
      if (!this.isAlreadyImported(ast, '@quajs/engine', helperName)) {
        this.addImport(importMap, '@quajs/engine', helperName)
      }
    })

    importMap.forEach((functions, module) => {
      if (functions.size > 0) {
        const specifiers = Array.from(functions).map(func =>
          t.importSpecifier(t.identifier(func), t.identifier(func)),
        )

        imports.push(t.importDeclaration(specifiers, t.stringLiteral(module)))
      }
    })

    return imports
  }

  private addImport(importMap: Map<string, Set<string>>, module: string, name: string): void {
    if (!importMap.has(module)) {
      importMap.set(module, new Set())
    }
    importMap.get(module)!.add(name)
  }

  private isAlreadyImported(ast: any, module: string, name: string): boolean {
    const program = ast.program || ast
    return Boolean(program.body?.some((node: any) => {
      if (!t.isImportDeclaration(node) || node.source.value !== module) {
        return false
      }

      return node.specifiers.some((spec: any) =>
        t.isImportSpecifier(spec)
        && t.isIdentifier(spec.imported)
        && spec.imported.name === name,
      )
    }))
  }
}

function hasExportedScopeType(source: string): boolean {
  return /\bexport\s+(?:interface|type)\s+Scope\b/.test(source)
}

function stableHash(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function indent(source: string): string {
  return source
    .split('\n')
    .map(line => (line.trim().length > 0 ? `  ${line}` : line))
    .join('\n')
}

function isTerminatingEngineDecorator(decoratorName: string): boolean {
  return decoratorName === 'LoadFromSlot' || decoratorName === 'QuickLoad'
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}

function getObjectPropertyExpression(object: t.ObjectExpression, propertyName: string): t.Expression | undefined {
  const property = object.properties.find((item): item is t.ObjectProperty =>
    t.isObjectProperty(item) && getObjectKeyName(item.key) === propertyName,
  )
  return property && t.isExpression(property.value) ? property.value : undefined
}

function getObjectKeyName(key: t.ObjectProperty['key']): string | undefined {
  if (t.isIdentifier(key)) {
    return key.name
  }
  if (t.isStringLiteral(key) || t.isNumericLiteral(key)) {
    return String(key.value)
  }
  return undefined
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getStoryPointDecorators(step: { type: 'dialogue' | 'action' | 'choice', content: unknown }): QuaScriptDecorator[] {
  if (step.type === 'dialogue') {
    return (step.content as QuaScriptDialogue).decorators || []
  }
  if (step.type === 'action') {
    return ((step.content as { decorators?: QuaScriptDecorator[] }).decorators || [])
  }
  return []
}

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}
