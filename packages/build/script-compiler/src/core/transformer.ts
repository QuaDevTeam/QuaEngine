import type { NodePath } from '@babel/traverse'
import type {
  CompilerOptions,
  DecoratorMapping,
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDialogue,
} from './types'
import generate from '@babel/generator'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import * as t from '@babel/types'
import { QuaScriptParser } from './parser'
import { DEFAULT_DECORATOR_MAPPINGS } from './types'

/**
 * Transform QuaScript to JavaScript GameStep array
 */
export class QuaScriptTransformer {
  protected decoratorMappings: DecoratorMapping
  private options: CompilerOptions
  private usedDecorators: Set<string> = new Set()
  private usedRuntimeHelpers: Set<string> = new Set()

  constructor(
    decoratorMappings: DecoratorMapping = DEFAULT_DECORATOR_MAPPINGS,
    options: CompilerOptions = {},
  ) {
    this.decoratorMappings = decoratorMappings
    this.options = {
      generateUUID: true,
      preserveDecorators: false,
      outputFormat: 'esm',
      ...options,
    }
  }

  /**
   * Transform TypeScript source containing qs template literals
   */
  transformSource(source: string): string {
    this.usedDecorators.clear()
    this.usedRuntimeHelpers.clear()

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
      // Add required imports
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
    // Handle template literals with expressions
    if (quasi.expressions.length === 0) {
      return quasi.quasis[0].value.cooked || quasi.quasis[0].value.raw
    }

    // For template literals with expressions, construct the template string
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
          // For complex expressions, generate code
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
        action.decorators?.forEach((decorator: any) => {
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
      else {
        return this.createActionStep(step.content, step.uuid)
      }
    })

    return t.arrayExpression(elements)
  }

  private createDialogueStep(
    dialogue: QuaScriptDialogue,
    uuid: string,
    quasi: t.TemplateLiteral,
  ): t.ObjectExpression {
    const runFunction = this.createRunFunction(dialogue, quasi)

    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), runFunction),
    ])
  }

  private createActionStep(content: any, uuid: string): t.ObjectExpression {
    const runFunction = this.createActionRunFunction(content)

    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), runFunction),
    ])
  }

  private createChoiceStep(choice: QuaScriptChoice, uuid: string): t.ObjectExpression {
    const runFunction = this.createChoiceRunFunction(choice)

    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), runFunction),
    ])
  }

  private createRunFunction(dialogue: QuaScriptDialogue, quasi: t.TemplateLiteral): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []

    // Add decorator function calls
    dialogue.decorators.forEach((decorator) => {
      const mapping = this.decoratorMappings[decorator.name]
      if (mapping) {
        const call = this.createDecoratorCall(decorator, mapping, dialogue.character)
        statements.push(t.expressionStatement(t.awaitExpression(call)))
      }
    })

    // Add character speak call
    const speakCall = this.createSpeakCall(dialogue, quasi)
    statements.push(t.expressionStatement(t.awaitExpression(speakCall)))

    return t.arrowFunctionExpression(
      [t.identifier('ctx')],
      t.blockStatement(statements),
      true,
    )
  }

  private createActionRunFunction(content: any): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []

    // Add decorator function calls
    content.decorators?.forEach((decorator: any) => {
      const mapping = this.decoratorMappings[decorator.name]
      if (mapping) {
        const call = this.createDecoratorCall(decorator, mapping)
        statements.push(t.expressionStatement(t.awaitExpression(call)))
      }
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

  private createDecoratorCall(decorator: any, mapping: any, characterName?: string): t.CallExpression {
    const args = decorator.args.map((arg: any) => {
      if (typeof arg === 'string') {
        return t.stringLiteral(arg)
      }
      else if (typeof arg === 'number') {
        return t.numericLiteral(arg)
      }
      else if (typeof arg === 'boolean') {
        return t.booleanLiteral(arg)
      }
      else {
        return t.identifier(arg)
      }
    })

    if (mapping.module === '@quajs/engine') {
      return t.callExpression(
        t.memberExpression(
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          t.identifier(mapping.function),
        ),
        args,
      )
    }

    if (mapping.module === '@quajs/character' && mapping.function === 'sprite') {
      this.usedRuntimeHelpers.add('spriteWithEngine')
      const sprite = this.requireDecoratorArg(decorator, args[0], 'asset')
      const character = args[1] || this.requireDecoratorCharacter(decorator, characterName)
      return t.callExpression(
        t.identifier('spriteWithEngine'),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          character,
          sprite,
        ],
      )
    }

    if (mapping.module === '@quajs/character' && mapping.function === 'show') {
      this.usedRuntimeHelpers.add('showWithEngine')
      const character = args[0] || this.requireDecoratorCharacter(decorator, characterName)
      return t.callExpression(
        t.identifier('showWithEngine'),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          character,
          this.createCharacterOptionsObject(args.slice(1)),
        ],
      )
    }

    if (mapping.module === '@quajs/character' && mapping.function === 'hide') {
      this.usedRuntimeHelpers.add('hideWithEngine')
      const character = args[0] || this.requireDecoratorCharacter(decorator, characterName)
      return t.callExpression(
        t.identifier('hideWithEngine'),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          character,
        ],
      )
    }

    if (mapping.module === '@quajs/character' && mapping.function === 'move') {
      this.usedRuntimeHelpers.add('moveWithEngine')
      const character = args[0] || this.requireDecoratorCharacter(decorator, characterName)
      return t.callExpression(
        t.identifier('moveWithEngine'),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          character,
          this.createCharacterPositionObject(args.slice(1)),
        ],
      )
    }

    if (mapping.module === '@quajs/character' && mapping.function === 'expression') {
      this.usedRuntimeHelpers.add('expressionWithEngine')
      const character = args[1] || this.requireDecoratorCharacter(decorator, characterName)
      return t.callExpression(
        t.identifier('expressionWithEngine'),
        [
          t.memberExpression(t.identifier('ctx'), t.identifier('engine')),
          character,
          args[0] || t.identifier('undefined'),
        ],
      )
    }

    return t.callExpression(t.identifier(mapping.function), args)
  }

  private createCharacterOptionsObject(args: t.Expression[]): t.ObjectExpression {
    const properties: t.ObjectProperty[] = []
    const [sprite, expression, x, y, layer] = args
    if (sprite)
      properties.push(t.objectProperty(t.identifier('sprite'), sprite))
    if (expression)
      properties.push(t.objectProperty(t.identifier('expression'), expression))
    if (x || y) {
      properties.push(t.objectProperty(
        t.identifier('position'),
        this.createCharacterPositionObject([x, y]),
      ))
    }
    if (layer)
      properties.push(t.objectProperty(t.identifier('layer'), layer))
    return t.objectExpression(properties)
  }

  private createCharacterPositionObject(args: Array<t.Expression | undefined>): t.ObjectExpression {
    const properties: t.ObjectProperty[] = []
    const [x, y, scale, rotation, anchor] = args
    if (x)
      properties.push(t.objectProperty(t.identifier('x'), x))
    if (y)
      properties.push(t.objectProperty(t.identifier('y'), y))
    if (scale)
      properties.push(t.objectProperty(t.identifier('scale'), scale))
    if (rotation)
      properties.push(t.objectProperty(t.identifier('rotation'), rotation))
    if (anchor)
      properties.push(t.objectProperty(t.identifier('anchor'), anchor))
    return t.objectExpression(properties)
  }

  private requireDecoratorCharacter(decorator: any, characterName?: string): t.StringLiteral {
    if (!characterName) {
      throw new Error(`@${decorator.name} requires an explicit character when used outside a dialogue line.`)
    }
    return t.stringLiteral(characterName)
  }

  private requireDecoratorArg(decorator: any, arg: t.Expression | undefined, name: string): t.Expression {
    if (!arg) {
      throw new Error(`@${decorator.name} requires ${name}.`)
    }
    return arg
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
    // Handle template expressions in dialogue text
    let textExpression: t.Expression

    if (dialogue.templateExpressions.length > 0) {
      // Create template literal with proper expressions
      const parts = dialogue.text.split(/\$\{[^}]+\}/)
      const expressions: t.Expression[] = []

      // Extract expressions from the original quasi if available
      dialogue.templateExpressions.forEach((expr, index) => {
        // Try to find matching expression in original quasi
        if (index < quasi.expressions.length) {
          const expression = quasi.expressions[index]
          if (t.isExpression(expression)) {
            expressions.push(expression)
          }
          else {
            expressions.push(t.identifier(expr))
          }
        }
        else {
          // Fallback: create identifier from expression text
          expressions.push(t.identifier(expr))
        }
      })

      // Create template elements
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

    // Collect required imports from used decorators only
    this.usedDecorators.forEach((decoratorName) => {
      const mapping = this.decoratorMappings[decoratorName]
      if (mapping) {
        if (mapping.module === '@quajs/engine') {
          return
        }
        if (mapping.module === '@quajs/character' && this.isEngineInjectedCharacterHelper(mapping.function)) {
          return
        }
        if (!importMap.has(mapping.module)) {
          importMap.set(mapping.module, new Set())
        }
        importMap.get(mapping.module)!.add(mapping.function)
      }
    })

    let hasSpeakImport = false
    const program = ast.program || ast
    if (program.body) {
      program.body.forEach((node: any) => {
        if (t.isImportDeclaration(node) && node.source.value === '@quajs/character') {
          node.specifiers.forEach((spec: any) => {
            if (t.isImportSpecifier(spec)
              && t.isIdentifier(spec.imported)
              && spec.imported.name === 'speakWithEngine') {
              hasSpeakImport = true
            }
          })
        }
      })
    }

    if (this.usedRuntimeHelpers.has('speakWithEngine') && !hasSpeakImport) {
      if (!importMap.has('@quajs/character')) {
        importMap.set('@quajs/character', new Set())
      }
      importMap.get('@quajs/character')!.add('speakWithEngine')
    }

    if (this.usedRuntimeHelpers.has('spriteWithEngine')) {
      if (!importMap.has('@quajs/character')) {
        importMap.set('@quajs/character', new Set())
      }
      importMap.get('@quajs/character')!.add('spriteWithEngine')
    }

    ;[
      'showWithEngine',
      'hideWithEngine',
      'moveWithEngine',
      'expressionWithEngine',
    ].forEach((helper) => {
      if (this.usedRuntimeHelpers.has(helper)) {
        if (!importMap.has('@quajs/character')) {
          importMap.set('@quajs/character', new Set())
        }
        importMap.get('@quajs/character')!.add(helper)
      }
    })

    // Generate import statements for modules that have functions to import
    importMap.forEach((functions, module) => {
      if (functions.size > 0) {
        const specifiers = Array.from(functions).map(func =>
          t.importSpecifier(t.identifier(func), t.identifier(func)),
        )

        imports.push(
          t.importDeclaration(specifiers, t.stringLiteral(module)),
        )
      }
    })

    return imports
  }

  private isEngineInjectedCharacterHelper(functionName: string): boolean {
    return ['sprite', 'show', 'hide', 'move', 'expression'].includes(functionName)
  }
}
