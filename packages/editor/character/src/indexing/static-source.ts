import type { EditorDocument, EditorSourceLocation } from '@quajs/editor-core'
import type { SourceTarget } from '../contracts.js'
import ts from 'typescript'

export interface StaticValue {
  node: ts.Node
  scalar?: string | number | boolean
  fields?: Map<string, StaticValue>
  items?: StaticValue[]
  partial?: boolean
}

/** Finite AST interpretation only: no eval, imports, getters or project code execution. */
export class StaticSources {
  readonly files: ts.SourceFile[]
  readonly checker: ts.TypeChecker
  private budget = 100000
  private readonly documents = new Map<string, EditorDocument>()

  constructor(
    readonly root: string,
    documents: Map<string, EditorDocument>,
  ) {
    this.documents = documents
    const files = new Map(
      [...documents].map(([path, document]) => [
        path,
        ts.createSourceFile(
          path,
          document.text,
          ts.ScriptTarget.Latest,
          true,
          path.endsWith('.json')
            ? ts.ScriptKind.JSON
            : path.endsWith('x')
              ? ts.ScriptKind.TSX
              : ts.ScriptKind.TS,
        ),
      ]),
    )
    const host: ts.CompilerHost = {
      getSourceFile: path => files.get(path),
      getDefaultLibFileName: () => '',
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getDirectories: () => [],
      fileExists: path => files.has(path),
      readFile: path => documents.get(path)?.text,
      getCanonicalFileName: path => path,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      resolveModuleNames: (names, from) =>
        names.map((name) => {
          if (!name.startsWith('.'))
            return undefined
          const path = normalizePath(
            `${from.slice(0, from.lastIndexOf('/') + 1)}${name}`,
          )
          const base = path.replace(/\.[cm]?jsx?$/, '')
          const resolved = [
            path,
            ...[
              '.ts',
              '.tsx',
              '.mts',
              '.cts',
              '.js',
              '.jsx',
              '/index.ts',
              '/index.js',
            ].map(suffix => base + suffix),
          ].find(path => files.has(path))
          return resolved ? { resolvedFileName: resolved } : undefined
        }),
    }
    const program = ts.createProgram(
      [...files.keys()],
      {
        noLib: true,
        noResolve: false,
        allowJs: true,
        target: ts.ScriptTarget.Latest,
      },
      host,
    )
    this.checker = program.getTypeChecker()
    this.files = [...files.values()]
  }

  location(node: ts.Node): EditorSourceLocation {
    const file = node.getSourceFile()
    const position = file.getLineAndCharacterOfPosition(node.getStart(file))
    return {
      path: file.fileName,
      line: position.line + 1,
      column: position.character + 1,
    }
  }

  target(
    node: ts.Node,
    start = node.getStart(),
    end = node.getEnd(),
  ): SourceTarget {
    const file = node.getSourceFile()
    return {
      root: this.root,
      path: file.fileName,
      revision: this.documents.get(file.fileName)!.revision,
      start,
      end,
      expectedText: file.text.slice(start, end),
    }
  }

  append(
    node: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
  ): SourceTarget {
    // Replace the interior so comments, trailing commas and CRLF remain intact.
    const items = ts.isArrayLiteralExpression(node)
      ? node.elements
      : node.properties
    return {
      ...this.target(node, node.getStart() + 1, node.getEnd() - 1),
      appendComma: Boolean(items.length && !items.hasTrailingComma),
    }
  }

  remove(node: ts.Node): SourceTarget | undefined {
    const parent = node.parent
    const siblings = ts.isArrayLiteralExpression(parent)
      ? parent.elements
      : ts.isObjectLiteralExpression(parent)
        ? parent.properties
        : undefined
    if (!siblings)
      return undefined
    const index = siblings.indexOf(node as never)
    const next = siblings[index + 1]
    const previous = siblings[index - 1]
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      true,
      ts.LanguageVariant.Standard,
      node.getSourceFile().text,
    )
    scanner.setTextPos(node.getEnd())
    const commaEnd
      = scanner.scan() === ts.SyntaxKind.CommaToken
        ? scanner.getTextPos()
        : node.getEnd()
    return this.target(
      node,
      next || !previous ? node.getStart() : previous.getEnd(),
      next || !previous ? commaEnd : node.getEnd(),
    )
  }

  registration(node: ts.Expression): string | undefined {
    let symbol = this.checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(node) ? node.name : node,
    )
    if (!symbol && ts.isPropertyAccessExpression(node))
      symbol = this.checker.getSymbolAtLocation(node.expression)
    const declaration = symbol?.declarations?.[0]
    if (declaration && ts.isImportSpecifier(declaration)) {
      const statement = declaration.parent.parent.parent
      if (
        !declaration.isTypeOnly
        && !declaration.parent.parent.isTypeOnly
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text === '@quajs/character'
      ) {
        return (declaration.propertyName ?? declaration.name).text
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const declaration = this.checker.getSymbolAtLocation(node.expression)
        ?.declarations?.[0]
      if (declaration && ts.isNamespaceImport(declaration)) {
        const statement = declaration.parent.parent
        if (
          !declaration.parent.isTypeOnly
          && ts.isStringLiteral(statement.moduleSpecifier)
          && statement.moduleSpecifier.text === '@quajs/character'
        ) {
          return node.name.text
        }
      }
    }
    return undefined
  }

  evaluate(
    node: ts.Node | undefined,
    env = new Map<ts.Symbol, StaticValue>(),
    seen = new Set<ts.Node>(),
    depth = 0,
  ): StaticValue | undefined {
    if (!node || depth > 40 || seen.has(node))
      return undefined
    if (--this.budget < 0)
      throw new Error('角色静态分析达到计算上限。')
    seen = new Set(seen).add(node)
    const read = (child: ts.Node | undefined) =>
      this.evaluate(child, env, seen, depth + 1)
    if (ts.isStringLiteralLike(node))
      return { node, scalar: node.text }
    if (ts.isNumericLiteral(node))
      return { node, scalar: Number(node.text) }
    if (
      node.kind === ts.SyntaxKind.TrueKeyword
      || node.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return { node, scalar: node.kind === ts.SyntaxKind.TrueKeyword }
    }
    if (
      ts.isParenthesizedExpression(node)
      || ts.isAsExpression(node)
      || ts.isSatisfiesExpression(node)
      || ts.isTypeAssertionExpression(node)
    ) {
      return read(node.expression)
    }
    if (ts.isIdentifier(node)) {
      let symbol = this.checker.getSymbolAtLocation(node)
      if (symbol && env.has(symbol))
        return env.get(symbol)
      if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
        symbol = this.checker.getAliasedSymbol(symbol)
      const declaration = symbol?.valueDeclaration
      if (
        declaration
        && ts.isVariableDeclaration(declaration)
        && ts.isVariableDeclarationList(declaration.parent)
        && declaration.parent.flags & ts.NodeFlags.Const
      ) {
        return read(declaration.initializer)
      }
      return undefined
    }
    if (ts.isArrayLiteralExpression(node)) {
      const items: StaticValue[] = []
      let partial = false
      for (const element of node.elements) {
        const value = read(
          ts.isSpreadElement(element) ? element.expression : element,
        )
        if (ts.isSpreadElement(element)) {
          if (value?.items)
            items.push(...value.items)
          else return { node, partial: true }
        }
        else if (value) {
          items.push(value)
        }
        else {
          items.push({ node: element, partial: true })
          partial = true
        }
      }
      return { node, items, partial }
    }
    if (ts.isObjectLiteralExpression(node)) {
      const fields = new Map<string, StaticValue>()
      let partial = false
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const value = read(property.expression)
          if (!value?.fields || value.partial) {
            fields.clear()
            partial = true
          }
          if (value?.fields) {
            for (const [key, field] of value.fields) fields.set(key, field)
          }
          continue
        }
        if (!property.name || ts.isComputedPropertyName(property.name)) {
          fields.clear()
          partial = true
          continue
        }
        const key = property.name.text
        const value = ts.isPropertyAssignment(property)
          ? read(property.initializer)
          : ts.isShorthandPropertyAssignment(property)
            ? this.evaluateSymbolValue(property, env, seen, depth)
            : undefined
        if (value) {
          fields.set(key, value)
        }
        else {
          fields.delete(key)
          partial = true
        }
      }
      return { node, fields, partial }
    }
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text
      for (const span of node.templateSpans) {
        const value = read(span.expression)?.scalar
        if (value === undefined)
          return undefined
        text += String(value) + span.literal.text
      }
      return { node, scalar: text }
    }
    if (ts.isPropertyAccessExpression(node))
      return read(node.expression)?.fields?.get(node.name.text)
    if (ts.isElementAccessExpression(node)) {
      const object = read(node.expression)
      const key = read(node.argumentExpression)?.scalar
      return typeof key === 'number'
        ? object?.items?.[key]
        : typeof key === 'string'
          ? object?.fields?.get(key)
          : undefined
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'map'
      && node.arguments.length === 1
    ) {
      const values = read(node.expression.expression)
      const callback = node.arguments[0]
      if (
        !values?.items
        || !ts.isArrowFunction(callback)
        || ts.isBlock(callback.body)
        || callback.parameters.length !== 1
      ) {
        return undefined
      }
      const items: StaticValue[] = []
      let partial = values.partial
      for (const item of values.items.slice(0, 2000)) {
        const local = new Map(env)
        this.bind(callback.parameters[0].name, item, local)
        const value = this.evaluate(callback.body, local, seen, depth + 1)
        if (value)
          items.push(value)
        else partial = true
      }
      return { node, items, partial: partial || values.items.length > 2000 }
    }
    return undefined
  }

  private evaluateSymbolValue(
    property: ts.ShorthandPropertyAssignment,
    env: Map<ts.Symbol, StaticValue>,
    seen: Set<ts.Node>,
    depth: number,
  ): StaticValue | undefined {
    const symbol = this.checker.getShorthandAssignmentValueSymbol(property)
    if (symbol && env.has(symbol))
      return env.get(symbol)
    const declaration = symbol?.valueDeclaration
    if (
      declaration
      && ts.isVariableDeclaration(declaration)
      && ts.isVariableDeclarationList(declaration.parent)
      && declaration.parent.flags & ts.NodeFlags.Const
    ) {
      return this.evaluate(declaration.initializer, env, seen, depth + 1)
    }
    return undefined
  }

  private bind(
    name: ts.BindingName,
    value: StaticValue,
    env: Map<ts.Symbol, StaticValue>,
  ): void {
    if (ts.isIdentifier(name)) {
      const symbol = this.checker.getSymbolAtLocation(name)
      if (symbol)
        env.set(symbol, value)
    }
    else if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, index) => {
        if (
          ts.isBindingElement(element)
          && !element.dotDotDotToken
          && value.items?.[index]
        ) {
          this.bind(element.name, value.items[index], env)
        }
      })
    }
    else {
      for (const element of name.elements) {
        const key = element.propertyName ?? element.name
        if (!ts.isIdentifier(key) && !ts.isStringLiteral(key))
          continue
        const field = value.fields?.get(key.text)
        if (field && !element.dotDotDotToken)
          this.bind(element.name, field, env)
      }
    }
  }
}

export function normalizePath(path: string): string {
  const result: string[] = []
  for (const part of path.split('/')) {
    if (part === '../..') {
      if (!result.length)
        return ''
      result.pop()
    }
    else if (part && part !== '.') {
      result.push(part)
    }
  }
  return result.join('/')
}
