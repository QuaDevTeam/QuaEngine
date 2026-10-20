import { parse } from '@babel/parser'
import traverseImport from '@babel/traverse'

export function assertStandaloneRuntimeCode(code: string, target: string): void {
  const traverse = (traverseImport as unknown as { default?: typeof traverseImport }).default || traverseImport
  traverse(parse(code, { sourceType: 'module' }), {
    ReferencedIdentifier(path) {
      if (['document', 'window', 'Blob', 'Worker', 'require', '__dirname', '__filename'].includes(path.node.name) && !path.scope.hasBinding(path.node.name))
        throw new Error(`${target} runtime retained browser global ${path.node.name} at line ${path.node.loc?.start.line}: ${code.slice(Math.max(0, (path.node.start ?? 0) - 120), (path.node.end ?? 0) + 120)}`)
    },
    MemberExpression(path) {
      const object = path.node.object
      const property = path.node.property
      const name = property.type === 'Identifier' && !path.node.computed ? property.name : property.type === 'StringLiteral' ? property.value : ''
      if (object.type === 'Identifier' && object.name === 'globalThis' && ['document', 'window', 'Blob', 'Worker'].includes(name))
        throw new Error(`${target} runtime retained browser global ${name}`)
    },
  })
}
