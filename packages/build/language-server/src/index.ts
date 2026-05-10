import type { QuaScriptDiagnostic } from '@quajs/script-compiler'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDiscoveredDecoratorMappings } from '@quajs/plugin-discovery'
import {
  compileQuaScriptModuleToTs,
  DEFAULT_DECORATOR_MAPPINGS,
  parseQuaScriptDocument,
  QuaScriptParser,
} from '@quajs/script-compiler'
import ts from 'typescript'

export interface QuaScriptLanguagePosition {
  character: number
  line: number
}

export interface QuaScriptCompletionItem {
  detail?: string
  kind: 'character' | 'decorator' | 'variable'
  label: string
}

export interface QuaScriptLanguageOptions {
  projectRoot?: string
}

export interface QuaScriptAnalysis {
  characters: string[]
  diagnostics: QuaScriptDiagnostic[]
  setupVariables: string[]
  virtualTypeScript: string
}

export async function analyzeQuaScript(source: string, options: QuaScriptLanguageOptions = {}): Promise<QuaScriptAnalysis> {
  const diagnostics: QuaScriptDiagnostic[] = []
  const document = parseQuaScriptDocument(source)
  diagnostics.push(...document.diagnostics)

  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  diagnostics.push(...parsed.diagnostics)

  let virtualTypeScript = ''
  try {
    virtualTypeScript = compileQuaScriptModuleToTs(source, {
      hotReload: false,
      projectRoot: options.projectRoot,
    })
  }
  catch (error) {
    diagnostics.push({
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    })
  }

  if (virtualTypeScript) {
    diagnostics.push(...collectTypeScriptDiagnostics(virtualTypeScript))
  }

  return {
    characters: [...parsed.characters],
    diagnostics,
    setupVariables: collectSetupVariables(document.setupScript?.content || '', document.moduleScript?.content || ''),
    virtualTypeScript,
  }
}

export async function getQuaScriptCompletions(
  source: string,
  position: QuaScriptLanguagePosition,
  options: QuaScriptLanguageOptions = {},
): Promise<QuaScriptCompletionItem[]> {
  const lines = source.split(/\r?\n/)
  const line = lines[position.line] || ''
  const beforeCursor = line.slice(0, position.character)

  if (isDecoratorContext(beforeCursor)) {
    return getDecoratorCompletions(options.projectRoot)
  }

  if (isExpressionContext(line, position.character)) {
    return getVariableCompletions(source)
  }

  if (isSpeakerContext(beforeCursor)) {
    const analysis = await analyzeQuaScript(source, options)
    return [
      ...new Set([
        ...analysis.characters,
        ...readCharacterNamesFromAssets(options.projectRoot),
      ]),
    ].map(label => ({
      label,
      kind: 'character' as const,
      detail: 'QuaScript character',
    }))
  }

  return []
}

export function createQuaScriptVirtualTypeScript(source: string, options: QuaScriptLanguageOptions = {}): string {
  return compileQuaScriptModuleToTs(source, {
    hotReload: false,
    projectRoot: options.projectRoot,
  })
}

async function getDecoratorCompletions(projectRoot?: string): Promise<QuaScriptCompletionItem[]> {
  const discovered = await getDiscoveredDecoratorMappings(projectRoot)
  return Object.keys({
    ...DEFAULT_DECORATOR_MAPPINGS,
    ...discovered,
  })
    .sort()
    .map(label => ({
      label,
      kind: 'decorator' as const,
      detail: 'QuaScript decorator',
    }))
}

function getVariableCompletions(source: string): QuaScriptCompletionItem[] {
  const document = parseQuaScriptDocument(source)
  return [...new Set([
    'scope',
    ...collectSetupVariables(document.setupScript?.content || '', document.moduleScript?.content || ''),
  ])]
    .sort()
    .map(label => ({
      label,
      kind: 'variable' as const,
      detail: 'TypeScript binding',
    }))
}

function collectSetupVariables(setupScript: string, moduleScript: string): string[] {
  const source = `${moduleScript}\n${setupScript}`
  const names = new Set<string>()
  const patterns = [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from\b/g,
    /\bimport\s*\{([^}]+)\}\s*from\b/g,
  ]

  for (const pattern of patterns) {
    let match = pattern.exec(source)
    while (match) {
      if (match[1].includes(',')) {
        match[1].split(',').forEach((name) => {
          const normalized = name.trim().split(/\s+as\s+/).pop()
          if (normalized) {
            names.add(normalized)
          }
        })
      }
      else {
        names.add(match[1].trim())
      }
      match = pattern.exec(source)
    }
  }

  return [...names]
}

function collectTypeScriptDiagnostics(source: string): QuaScriptDiagnostic[] {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })

  return (result.diagnostics || []).map(diagnostic => ({
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    severity: diagnostic.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
  }))
}

function readCharacterNamesFromAssets(projectRoot?: string): string[] {
  if (!projectRoot) {
    return []
  }

  const charactersPath = join(projectRoot, 'assets', 'characters')
  if (!existsSync(charactersPath)) {
    return []
  }

  return readdirSync(charactersPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function isDecoratorContext(beforeCursor: string): boolean {
  return /^\s*@[\w$]*$/.test(beforeCursor)
}

function isSpeakerContext(beforeCursor: string): boolean {
  return beforeCursor.trim().length > 0
    && !beforeCursor.includes(':')
    && !beforeCursor.trimStart().startsWith('-')
    && !beforeCursor.trimStart().startsWith('@')
    && !beforeCursor.includes('<script')
}

function isExpressionContext(line: string, character: number): boolean {
  const before = line.slice(0, character)
  const lastOpen = before.lastIndexOf('${')
  const lastClose = before.lastIndexOf('}')
  if (lastOpen > lastClose) {
    return true
  }

  return /\sif\s[\s\S]*$/.test(before)
}

export function uriToFilePath(uri: string): string | undefined {
  if (!uri.startsWith('file:')) {
    return undefined
  }
  return fileURLToPath(uri)
}
