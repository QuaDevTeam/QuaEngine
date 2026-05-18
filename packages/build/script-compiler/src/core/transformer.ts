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
        })
      }
      else if (step.type === 'action') {
        const action = step.content as any
        action.decorators?.forEach((decorator: QuaScriptDecorator) => {
          this.usedDecorators.add(decorator.name)
        })
      }
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
      if (step.type === 'dialogue') {
        return this.createDialogueStep(step.content as QuaScriptDialogue, stepUuid, index, compileState, options)
      }
      if (step.type === 'choice') {
        return this.createChoiceStep(step.content as QuaScriptChoice, stepUuid, index, compileState, options)
      }
      return this.createActionStep(step.content, stepUuid, index, compileState, options)
    })

    return t.arrayExpression(elements)
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
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
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
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
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
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
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
    const choicesArray = t.arrayExpression(choice.options.map(option =>
      t.objectExpression([
        t.objectProperty(t.identifier('id'), t.stringLiteral(option.id)),
        t.objectProperty(t.identifier('text'), this.createTextExpression(option.text, option.templateExpressions, options)),
        t.objectProperty(t.identifier('enabled'), option.condition ? this.parseExpression(option.condition, options.scopeIdentifier) : t.booleanLiteral(true)),
        t.objectProperty(t.identifier('metadata'), t.objectExpression([
          t.objectProperty(t.identifier('target'), t.stringLiteral(option.target)),
          t.objectProperty(t.identifier('storyGraph'), t.objectExpression([
            t.objectProperty(t.identifier('edge'), t.objectExpression([
              t.objectProperty(t.identifier('kind'), t.stringLiteral('choice')),
              t.objectProperty(t.identifier('to'), t.stringLiteral(option.target)),
              ...(option.condition
                ? [t.objectProperty(t.identifier('condition'), t.stringLiteral(option.condition))]
                : []),
            ])),
          ])),
          ...(option.condition
            ? [t.objectProperty(t.identifier('condition'), t.stringLiteral(option.condition))]
            : []),
        ])),
      ]),
    ))

    const selected = t.identifier('selected')
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
      t.expressionStatement(t.awaitExpression(t.callExpression(
        t.memberExpression(
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          t.identifier('clearChoices'),
        ),
        [],
      ))),
      t.expressionStatement(t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier('ctx'), t.identifier('choice')),
        selected,
      )),
    )

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
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

function isBabelExpression(value: unknown): value is t.Expression {
  return typeof value === 'object' && value !== null && t.isExpression(value as t.Node)
}
