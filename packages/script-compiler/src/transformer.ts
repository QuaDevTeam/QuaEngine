import { parse } from '@babel/parser'
import traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import generate from '@babel/generator'
import { QuaScriptParser } from './parser'
import type { 
  ParsedQuaScript, 
  QuaScriptDialogue, 
  DecoratorMapping, 
  CompilerOptions
} from './types'
import { DEFAULT_DECORATOR_MAPPINGS } from './types'

/**
 * Transform QuaScript to JavaScript GameStep array
 */
export class QuaScriptTransformer {
  private decoratorMappings: DecoratorMapping
  private options: CompilerOptions
  private usedDecorators: Set<string> = new Set()

  constructor(
    decoratorMappings: DecoratorMapping = DEFAULT_DECORATOR_MAPPINGS,
    options: CompilerOptions = {}
  ) {
    this.decoratorMappings = decoratorMappings
    this.options = {
      generateUUID: true,
      preserveDecorators: false,
      outputFormat: 'esm',
      ...options
    }
  }

  /**
   * Transform TypeScript source containing qs template literals
   */
  transformSource(source: string): string {
    this.usedDecorators.clear()
    
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx']
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
      }
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
      sourceMaps: this.options.outputFormat === 'esm'
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
        } else if (t.isMemberExpression(expr)) {
          result += `\${${generate(expr).code}}`
        } else {
          // For complex expressions, generate code
          result += `\${${generate(expr).code}}`
        }
      }
    }
    
    return result
  }

  private collectUsedDecorators(parsed: ParsedQuaScript): void {
    parsed.steps.forEach(step => {
      if (step.type === 'dialogue') {
        const dialogue = step.content as QuaScriptDialogue
        dialogue.decorators.forEach(decorator => {
          this.usedDecorators.add(decorator.name)
        })
      } else if (step.type === 'action') {
        const action = step.content as any
        action.decorators?.forEach((decorator: any) => {
          this.usedDecorators.add(decorator.name)
        })
      }
    })
  }

  private transformToGameSteps(parsed: ParsedQuaScript, quasi: t.TemplateLiteral): t.ArrayExpression {
    const elements = parsed.steps.map(step => {
      if (step.type === 'dialogue') {
        return this.createDialogueStep(step.content as QuaScriptDialogue, step.uuid, quasi)
      } else {
        return this.createActionStep(step.content, step.uuid)
      }
    })

    return t.arrayExpression(elements)
  }

  private createDialogueStep(
    dialogue: QuaScriptDialogue, 
    uuid: string, 
    quasi: t.TemplateLiteral
  ): t.ObjectExpression {
    const runFunction = this.createRunFunction(dialogue, quasi)

    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), runFunction)
    ])
  }

  private createActionStep(content: any, uuid: string): t.ObjectExpression {
    const runFunction = this.createActionRunFunction(content)

    return t.objectExpression([
      t.objectProperty(t.identifier('uuid'), t.stringLiteral(uuid)),
      t.objectProperty(t.identifier('run'), runFunction)
    ])
  }

  private createRunFunction(dialogue: QuaScriptDialogue, quasi: t.TemplateLiteral): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []

    // Add decorator function calls
    dialogue.decorators.forEach(decorator => {
      const mapping = this.decoratorMappings[decorator.name]
      if (mapping) {
        const call = this.createDecoratorCall(decorator, mapping)
        statements.push(t.expressionStatement(call))
      }
    })

    // Add character speak call
    const speakCall = this.createSpeakCall(dialogue, quasi)
    statements.push(t.expressionStatement(speakCall))

    return t.arrowFunctionExpression(
      [],
      t.blockStatement(statements)
    )
  }

  private createActionRunFunction(content: any): t.ArrowFunctionExpression {
    const statements: t.Statement[] = []

    // Add decorator function calls
    content.decorators?.forEach((decorator: any) => {
      const mapping = this.decoratorMappings[decorator.name]
      if (mapping) {
        const call = this.createDecoratorCall(decorator, mapping)
        statements.push(t.expressionStatement(call))
      }
    })

    return t.arrowFunctionExpression(
      [],
      t.blockStatement(statements)
    )
  }

  private createDecoratorCall(decorator: any, mapping: any): t.CallExpression {
    const args = decorator.args.map((arg: any) => {
      if (typeof arg === 'string') {
        return t.stringLiteral(arg)
      } else if (typeof arg === 'number') {
        return t.numericLiteral(arg)
      } else if (typeof arg === 'boolean') {
        return t.booleanLiteral(arg)
      } else {
        return t.identifier(arg)
      }
    })

    return t.callExpression(
      t.identifier(mapping.function),
      args
    )
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
          expressions.push(quasi.expressions[index])
        } else {
          // Fallback: create identifier from expression text
          expressions.push(t.identifier(expr))
        }
      })
      
      // Create template elements
      const quasis = parts.map((part, index) => {
        const isLast = index === parts.length - 1
        return t.templateElement(
          { raw: part, cooked: part },
          isLast
        )
      })
      
      textExpression = t.templateLiteral(quasis, expressions)
    } else {
      textExpression = t.stringLiteral(dialogue.text)
    }

    return t.callExpression(
      t.memberExpression(
        t.identifier(dialogue.character),
        t.identifier('speak')
      ),
      [textExpression]
    )
  }

  private generateImports(ast: any): t.ImportDeclaration[] {
    const imports: t.ImportDeclaration[] = []
    const importMap = new Map<string, Set<string>>()

    // Collect required imports from used decorators only
    this.usedDecorators.forEach(decoratorName => {
      const mapping = this.decoratorMappings[decoratorName]
      if (mapping) {
        if (!importMap.has(mapping.module)) {
          importMap.set(mapping.module, new Set())
        }
        importMap.get(mapping.module)!.add(mapping.function)
      }
    })

    // Add dialogue import if not already present
    let hasDialogueImport = false
    const program = ast.program || ast
    if (program.body) {
      program.body.forEach((node: any) => {
        if (t.isImportDeclaration(node) && 
            node.source.value === '@quajs/engine') {
          node.specifiers.forEach((spec: any) => {
            if (t.isImportSpecifier(spec) && 
                t.isIdentifier(spec.imported) && 
                spec.imported.name === 'dialogue') {
              hasDialogueImport = true
            }
          })
        }
      })
    }

    if (!hasDialogueImport) {
      if (!importMap.has('@quajs/engine')) {
        importMap.set('@quajs/engine', new Set())
      }
      importMap.get('@quajs/engine')!.add('dialogue')
    }

    // Generate import statements for modules that have functions to import
    importMap.forEach((functions, module) => {
      if (functions.size > 0) {
        const specifiers = Array.from(functions).map(func =>
          t.importSpecifier(t.identifier(func), t.identifier(func))
        )
        
        imports.push(
          t.importDeclaration(specifiers, t.stringLiteral(module))
        )
      }
    })

    return imports
  }
}