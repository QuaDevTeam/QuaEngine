import type {
  NativeQuiImport,
  NativeUiDiagnostic,
} from './types'
import { rangeFromOffsets } from './source'

const IMPORT_PATTERN = /^\s*import\s+(style|tokens|component)\s+(['"])([^'"]+)\2\s*;?\s*$/
const IMPORT_START_PATTERN = /^\s*import\b/

export function collectQuiImports(
  source: string,
  lineStarts: readonly number[],
  diagnostics: NativeUiDiagnostic[],
): NativeQuiImport[] {
  const imports: NativeQuiImport[] = []
  const lines = source.split(/\r?\n/)
  let offset = 0

  for (const line of lines) {
    const match = IMPORT_PATTERN.exec(line)
    if (match) {
      const pathStartInLine = line.indexOf(match[3])
      imports.push({
        kind: match[1] as NativeQuiImport['kind'],
        path: match[3],
        pathRange: rangeFromOffsets(lineStarts, offset + pathStartInLine, offset + pathStartInLine + match[3].length),
        range: rangeFromOffsets(lineStarts, offset, offset + line.length),
      })
    }
    else if (IMPORT_START_PATTERN.test(line)) {
      diagnostics.push({
        code: 'QUI_INVALID_IMPORT',
        message: 'QUI imports must use import style|tokens|component "./path"; syntax.',
        range: rangeFromOffsets(lineStarts, offset, offset + line.length),
        severity: 'error',
        source: 'qui',
      })
    }
    offset += line.length + 1
  }

  return imports
}

export function validateQuiImports(imports: readonly NativeQuiImport[], diagnostics: NativeUiDiagnostic[]): void {
  for (const item of imports) {
    if (/^(?:[a-z]+:)?\/\//i.test(item.path) || item.path.startsWith('/')) {
      diagnostics.push({
        code: 'QUI_UNSAFE_IMPORT',
        message: 'QUI imports must be package-local relative paths, not URLs or absolute paths.',
        range: item.pathRange,
        severity: 'error',
        source: 'qui',
      })
    }
    const extension = item.path.split('.').pop()
    const expected = item.kind === 'style' ? 'qss' : item.kind === 'tokens' ? 'json' : 'qui'
    if (extension !== expected) {
      diagnostics.push({
        code: 'QUI_IMPORT_EXTENSION_MISMATCH',
        message: `import ${item.kind} expects a .${expected} file.`,
        range: item.pathRange,
        severity: 'warning',
        source: 'qui',
      })
    }
  }
}

export function inferImportedComponentNames(imports: readonly NativeQuiImport[]): string[] {
  return imports
    .filter(item => item.kind === 'component')
    .map((item) => {
      const basename = item.path.split('/').pop() || ''
      return basename.replace(/\.qui$/, '')
    })
    .filter(Boolean)
}
