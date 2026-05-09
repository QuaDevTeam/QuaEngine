import type { NodePath } from '@babel/traverse'
import type { DecoratorCompilerRegistry } from '../decorators'
import type {
  CompilerOptions,
  DecoratorMapping,
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDialogue,
} from './types'
import generate from '@babel/generator'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import { createDefaultDecoratorCompilerRegistry } from '../decorators'
import { QuaScriptParser } from './parser'
import { DEFAULT_DECORATOR_MAPPINGS } from './types'

export interface QuaScriptTransformerOptions extends CompilerOptions {
  decoratorCompilerRegistry?: DecoratorCompilerRegistry
}

/**
 * Transform QuaScript to JavaScript GameStep array.
 *
 * The transformer owns the syntax-to-AST flow only. Feature-specific
 * decorator lowering is delegated to registered decorator compilers.
 */
export class QuaScriptTransformer {
  protected decoratorMappings: DecoratorMapping
  private options: CompilerOptions
  private usedDecorators: Set<string> = new Set()
  private usedRuntimeHelpers: Set<string> = new Set()
  private handledDecoratorModules: Set<string> = new Set()
  protected decoratorCompilerRegistry: DecoratorCompilerRegistry

  constructor(
    decoratorMappings: DecoratorMapping = DEFAULT_DECORATOR_MAPPINGS,
    options: QuaScriptTransformerOptions = {},
  ) {
    const { decoratorCompilerRegistry, ...compilerOptions } = options

    this.decoratorMappings = decoratorMappings
    this.decoratorCompilerRegistry = decoratorCompilerRegistry || createDefaultDecoratorCompilerRegistry()
    this.options = {
      generateUUID: true,
      preserveDecorators: false,
      outputFormat: 'esm',
      ...compilerOptions,
    }
  }

  /**
   * Transform TypeScript source containing qs template literals.
   */
  transformSource(source: string): string {
    this.usedDecorators.clear()
    this.usedRuntimeHelpers.clear()
    this.handledDecoratorModules.clear()

    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })

    let transformed = false

    traverse(ast, {
      TaggedTemplateExpression: (path: NodePath<t.TaggedTemplateExpression>) => {
        if (t.isIdentifier(path.node.tag) && path.node.tag.name === 'qs') {
          const quasiValue = this.extractQuasiValue(path.node.quasi)
          if (quasiValue) {
            const parser = new QuaScriptParser()
            const parsed = parser.parse(quasiValue)
            this.collectUsedDecorators(parsed)
            const gameStepsArray = this.transformToGameSteps(parsed, path.node.quasi)
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

    const result = generate(ast, {
      retainLines: false,
      compact: false,
      sourceMaps: this.options.outputFormat === 'esm',
    })

    return result.code
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
          result += `\${${generate(expr).code}}`
        }
        else {
          result += `\${${generate(expr).code}}`
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

  private transformToGameSteps(parsed: ParsedQuaScript, quasi: t.TemplateLiteral): t.ArrayExpression {
    const elements = parsed.steps.map((step) => {
      if (step.type === 'dialogue') {
        return this.createDialogueStep(step.content as QuaScriptDialogue, step.uuid, quasi)
      }
      if (step.type === 'choice') {
        return this.createChoiceStep(step.content as QuaScriptChoice, step.uuid)
      }
      return this.createActionStep(step.content, step.uuid)
    })

    return t.arrayExpression(elements)
  }

  private createDialogueStep(
    dialogue: QuaScriptDialogue,
    uuid: string,
    quasi: t.TemplateLiteral,
  ): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), this.createRunFunction(dialogue, quasi)),
    ])
  }

  private createActionStep(content: any, uuid: string): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), this.createActionRunFunction(content)),
    ])
  }

  private createChoiceStep(choice: QuaScriptChoice, uuid: string): t.ObjectExpression {
    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), this.createChoiceRunFunction(choice)),
    ])
  }

  private createRunFunction(dialogue: QuaScriptDialogue, quasi: t.TemplateLiteral): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []

    statements.push(...this.createDecoratorStatements(dialogue.decorators, {
      characterName: dialogue.character,
      stepType: 'dialogue',
    }))

    statements.push(t.expressionStatement(t.awaitExpression(this.createSpeakCall(dialogue, quasi))))

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createActionRunFunction(content: any): t.ArrowFunctionExpression {
    const statements = this.createDecoratorStatements(content.decorators || [], {
      stepType: 'action',
    })

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createChoiceRunFunction(choice: QuaScriptChoice): t.ArrowFunctionExpression {
    const choicesIdentifier = t.identifier('choices')
    const choicesArray = t.arrayExpression(choice.options.map(option =>
      t.objectExpression([
        t.objectProperty(t.identifier('id'), t.stringLiteral(option.id)),
        t.objectProperty(t.identifier('text'), t.stringLiteral(option.text)),
        t.objectProperty(t.identifier('enabled'), option.condition ? this.parseExpression(option.condition) : t.booleanLiteral(true)),
        t.objectProperty(t.identifier('metadata'), t.objectExpression([
          t.objectProperty(t.identifier('target'), t.stringLiteral(option.target)),
          ...(option.condition
            ? [t.objectProperty(t.identifier('condition'), t.stringLiteral(option.condition))]
            : []),
        ])),
      ]),
    ))

    const selected = t.identifier('selected')
    const statements: t.Statement[] = [
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
    ]

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createDecoratorStatements(
    decorators: QuaScriptDecorator[],
    context: { characterName?: string, stepType: 'dialogue' | 'action' },
  ): t.Statement[] {
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
        compiled.result.runtimeHelpers?.forEach(helper => this.usedRuntimeHelpers.add(helper))
        statements.push(t.expressionStatement(t.awaitExpression(compiled.result.call)))
        index = compiled.result.nextIndex ?? index
        continue
      }

      const call = this.createDecoratorCall(decorator, mapping)
      statements.push(t.expressionStatement(t.awaitExpression(call)))
    }

    return statements
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
    return decorator.args.map((arg) => {
      if (typeof arg === 'string') {
        return t.stringLiteral(arg)
      }
      if (typeof arg === 'number') {
        return t.numericLiteral(arg)
      }
      return t.booleanLiteral(arg)
    })
  }

  private parseExpression(source: string): t.Expression {
    const parsed = parse(`(${source})`, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })
    const statement = parsed.program.body[0]
    if (
      t.isExpressionStatement(statement)
      && t.isExpression(statement.expression)
    ) {
      return statement.expression
    }
    return t.identifier(source)
  }

  private createSpeakCall(dialogue: QuaScriptDialogue, quasi: t.TemplateLiteral): t.CallExpression {
    let textExpression: t.Expression

    if (dialogue.templateExpressions.length > 0) {
      const parts = dialogue.text.split(/\$\{[^}]+\}/)
      const expressions: t.Expression[] = []

      dialogue.templateExpressions.forEach((expr, index) => {
        if (index < quasi.expressions.length) {
          const expression = quasi.expressions[index]
          expressions.push(t.isExpression(expression) ? expression : t.identifier(expr))
        }
        else {
          expressions.push(t.identifier(expr))
        }
      })

      const quasis = parts.map((part, index) => {
        const isLast = index === parts.length - 1
        return t.templateElement(
          { raw: part, cooked: part },
          isLast,
        )
      })

      textExpression = t.templateLiteral(quasis, expressions)
    }
    else {
      textExpression = t.stringLiteral(dialogue.text)
    }

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
