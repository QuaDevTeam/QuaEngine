import type {
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDecorator,
  QuaScriptDialogue,
  QuaScriptStep,
  QuaScriptDecoratorValue,
} from './types'
import { parse } from '@babel/parser'
import { v4 as uuidv4 } from 'uuid'

/**
 * Parse QuaScript DSL string into structured AST
 */
export class QuaScriptParser {
  private lines: string[] = []
  private originalLines: string[] = []
  private lineOriginalIndices: number[] = []
  private position = 0

  parse(quaScript: string): ParsedQuaScript {
    // Keep both original lines (with empty lines) and filtered lines
    this.originalLines = quaScript.split('\n')
    this.lines = []
    this.lineOriginalIndices = []
    this.originalLines.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.length > 0) {
        this.lines.push(trimmed)
        this.lineOriginalIndices.push(index)
      }
    })

    this.position = 0

    const steps: QuaScriptStep[] = []
    const characters = new Set<string>()
    const imports = new Set<string>()

    while (this.position < this.lines.length) {
      const step = this.parseStep()
      if (step) {
        steps.push(step)

        if (step.type === 'dialogue') {
          const dialogue = step.content as QuaScriptDialogue
          characters.add(dialogue.character)

          // Add required imports based on decorators
          dialogue.decorators.forEach((decorator) => {
            this.addRequiredImports(decorator, imports)
          })
        }
        else if (step.type === 'action') {
          const action = step.content as any
          action.decorators?.forEach((decorator: any) => {
            this.addRequiredImports(decorator, imports)
          })
        }
      }
    }

    return {
      steps,
      imports,
      characters,
    }
  }

  private parseDecorators(): { decorators: QuaScriptDecorator[], shouldCreateSeparateAction: boolean } {
    const decorators: QuaScriptDecorator[] = []
    const decoratorStartPos = this.position

    while (this.position < this.lines.length) {
      const line = this.getCurrentLine()
      if (!line?.startsWith('@'))
        break

      const decorator = this.parseDecorator(line)
      if (decorator) {
        decorators.push(decorator)
      }

      this.advance()
    }

    // Check if there should be a separate action step
    // This happens when there are decorators followed by empty lines before dialogue
    let shouldCreateSeparateAction = false
    if (decorators.length > 0) {
      const nextLine = this.getCurrentLine()
      const hasDialogueNext = nextLine?.match(/^(\w+):\s(.*)$/)

      if (hasDialogueNext) {
        // Check if there was a gap in the original input
        // Find the positions in original lines to check for gaps
        shouldCreateSeparateAction = this.hasGapBeforeDialogue(decoratorStartPos)
      }
      else {
        // If no dialogue follows, these are definitely standalone action decorators
        shouldCreateSeparateAction = true
      }
    }

    return { decorators, shouldCreateSeparateAction }
  }

  private hasGapBeforeDialogue(_decoratorStartPos: number): boolean {
    const lastDecoratorOriginalIndex = this.lineOriginalIndices[this.position - 1]
    const dialogueOriginalIndex = this.lineOriginalIndices[this.position]

    if (lastDecoratorOriginalIndex === undefined || dialogueOriginalIndex === undefined)
      return false

    return this.originalLines
      .slice(lastDecoratorOriginalIndex + 1, dialogueOriginalIndex)
      .some(line => line.trim() === '')
  }

  private parseStep(): QuaScriptStep | null {
    const { decorators, shouldCreateSeparateAction } = this.parseDecorators()
    const line = this.getCurrentLine()

    const choice = this.parseChoiceBlock()
    if (choice) {
      return {
        uuid: uuidv4(),
        type: 'choice',
        content: choice,
      }
    }

    // Check if it's a dialogue line (Character: Text)
    const dialogueMatch = line?.match(/^(\w+):\s(.*)$/)
    if (dialogueMatch) {
      const [, character, text] = dialogueMatch
      this.advance()

      // If decorators should be separate, create action first
      if (decorators.length > 0 && shouldCreateSeparateAction) {
        // Reset position to re-parse dialogue without decorators
        this.position--
        return {
          uuid: uuidv4(),
          type: 'action',
          content: {
            type: 'action',
            decorators,
          },
        }
      }

      return {
        uuid: uuidv4(),
        type: 'dialogue',
        content: {
          type: 'dialogue',
          character,
          text,
          decorators,
          templateExpressions: this.extractTemplateExpressions(text),
        } as QuaScriptDialogue,
      }
    }

    // If we have decorators but no dialogue, create an action step
    if (decorators.length > 0) {
      return {
        uuid: uuidv4(),
        type: 'action',
        content: {
          type: 'action',
          decorators,
        },
      }
    }

    // Skip unknown lines
    if (line) {
      this.advance()
    }
    return null
  }

  private parseChoiceBlock(): QuaScriptChoice | null {
    const options: QuaScriptChoice['options'] = []

    while (this.position < this.lines.length) {
      const line = this.getCurrentLine()
      const option = line ? this.parseChoiceOption(line) : null
      if (!option)
        break

      options.push(option)
      this.advance()
    }

    return options.length
      ? {
          type: 'choice',
          options,
        }
      : null
  }

  private parseChoiceOption(line: string): QuaScriptChoice['options'][number] | null {
    const match = line.match(/^-\s+(.+?)(?:\s*->\s*([A-Za-z0-9_.:-]+))?(?:\s+if\s+(.+))?$/)
    if (!match)
      return null

    const [, text, target, condition] = match
    const id = target || this.slugChoiceId(text)
    return {
      id,
      text,
      target: target || id,
      condition,
    }
  }

  private slugChoiceId(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'choice'
  }

  private parseDecorator(line: string): QuaScriptDecorator | null {
    // Match @DecoratorName(arg1, arg2, ...)
    const match = line.match(/^@(\w+)(?:\(([^)]*)\))?$/)
    if (!match)
      return null

    const [, name, argsString] = match
    const args = argsString ? this.parseDecoratorArgs(argsString) : []

    return { name, args }
  }

  private parseDecoratorArgs(argsString: string): QuaScriptDecoratorValue[] {
    if (!argsString.trim())
      return []

    try {
      const parsed = parse(`__quaDecorator__(${argsString})`, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      })
      const statement = parsed.program.body[0]
      if (statement?.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
        return statement.expression.arguments.map((argument: any) => this.convertExpressionValue(argument))
      }
    }
    catch {
      // Fall back to the legacy parser below.
    }

    return argsString
      .split(',')
      .map((arg) => this.parseLegacyArgument(arg.trim()))
  }

  private parseLegacyArgument(arg: string): QuaScriptDecoratorValue {
    if ((arg.startsWith('"') && arg.endsWith('"'))
      || (arg.startsWith('\'') && arg.endsWith('\''))) {
      return arg.slice(1, -1)
    }
    if (arg === 'true')
      return true
    if (arg === 'false')
      return false
    const num = Number(arg)
    if (!Number.isNaN(num))
      return num
    return arg
  }

  private convertExpressionValue(node: any): any {
    if (!node) {
      return null
    }
    switch (node.type) {
      case 'StringLiteral':
        return node.value
      case 'NumericLiteral':
        return node.value
      case 'BooleanLiteral':
        return node.value
      case 'NullLiteral':
        return null
      case 'ArrayExpression':
        return node.elements.map((element: any) => this.convertExpressionValue(element))
      case 'ObjectExpression':
        return Object.fromEntries(node.properties
          .filter((property: any) => property.type === 'ObjectProperty')
          .map((property: any) => {
            const key = property.key.type === 'Identifier'
              ? property.key.name
              : String(property.key.value)
            return [key, this.convertExpressionValue(property.value)]
          }))
      case 'TemplateLiteral':
        if (node.expressions.length === 0) {
          return node.quasis.map((quasi: any) => quasi.value.cooked || quasi.value.raw).join('')
        }
        return node.quasis.map((quasi: any) => quasi.value.cooked || quasi.value.raw).join('')
      case 'UnaryExpression':
        if (node.operator === '-' && node.argument?.type === 'NumericLiteral') {
          return -node.argument.value
        }
        return this.stringifyExpression(node)
      default:
        return this.stringifyExpression(node)
    }
  }

  private stringifyExpression(node: any): string {
    if (!node) {
      return ''
    }
    if (typeof node.value === 'string') {
      return node.value
    }
    if (node.type === 'Identifier') {
      return node.name
    }
    return String(node.value ?? node.name ?? '')
  }

  private extractTemplateExpressions(text: string): string[] {
    const expressions: string[] = []
    const regex = /\$\{([^}]+)\}/g

    // Use a different approach to avoid assignment in while
    let result = regex.exec(text)
    while (result !== null) {
      expressions.push(result[1])
      result = regex.exec(text)
    }

    return expressions
  }

  private addRequiredImports(decorator: QuaScriptDecorator, imports: Set<string>) {
    // This will be used later to determine required imports
    // For now, just add common ones
    switch (decorator.name) {
      case 'SetSprite':
      case 'ShowCharacter':
      case 'HideCharacter':
      case 'MoveCharacter':
      case 'SetExpression':
        imports.add('@quajs/character')
        break
    }
  }

  private getCurrentLine(): string | null {
    return this.position < this.lines.length ? this.lines[this.position] : null
  }

  private advance(): void {
    this.position++
  }
}
