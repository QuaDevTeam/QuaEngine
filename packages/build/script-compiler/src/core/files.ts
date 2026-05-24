import type { QuaScriptToolingConfig } from './types'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { DEFAULT_QUASCRIPT_TOOLING_CONFIG } from './config'

export interface QuaScriptFileMatchOptions {
  cwd?: string
  exclude?: string[]
  include?: string[]
}

export function resolveQuaScriptFiles(patterns: readonly string[], options: QuaScriptFileMatchOptions = {}): string[] {
  const cwd = resolve(options.cwd || process.cwd())
  const include = options.include?.length ? options.include : defaultIncludePatterns()
  const exclude = options.exclude?.length ? options.exclude : defaultExcludePatterns()
  const candidates = new Set<string>()
  const inputs = patterns.length > 0 ? patterns : include

  for (const input of inputs) {
    const absoluteInput = isAbsolute(input) ? input : resolve(cwd, input)
    if (existsSync(absoluteInput)) {
      addExistingPath(candidates, absoluteInput, cwd, include, exclude)
      continue
    }

    const matcher = createGlobMatcher(normalizePath(isAbsolute(input) ? relative(cwd, input) : input))
    for (const filePath of walkQuaScriptFiles(cwd, exclude)) {
      const rel = normalizePath(relative(cwd, filePath))
      if (matcher(rel)) {
        candidates.add(filePath)
      }
    }
  }

  return [...candidates].sort()
}

export function fileMatchesQuaScriptConfig(filePath: string, config: QuaScriptToolingConfig = {}, cwd = process.cwd()): boolean {
  const include = config.files?.include?.length ? config.files.include : defaultIncludePatterns()
  const exclude = config.files?.exclude?.length ? config.files.exclude : defaultExcludePatterns()
  const rel = normalizePath(relative(cwd, filePath))
  return include.some(pattern => createGlobMatcher(pattern)(rel))
    && !exclude.some(pattern => createGlobMatcher(pattern)(rel))
}

function addExistingPath(
  candidates: Set<string>,
  filePath: string,
  cwd: string,
  include: readonly string[],
  exclude: readonly string[],
): void {
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    for (const child of walkQuaScriptFiles(filePath, exclude, cwd)) {
      const rel = normalizePath(relative(cwd, child))
      if (include.some(pattern => createGlobMatcher(pattern)(rel))) {
        candidates.add(child)
      }
    }
    return
  }

  if (stats.isFile() && filePath.endsWith('.qs')) {
    const rel = normalizePath(relative(cwd, filePath))
    if (!exclude.some(pattern => createGlobMatcher(pattern)(rel))) {
      candidates.add(filePath)
    }
  }
}

function walkQuaScriptFiles(root: string, exclude: readonly string[], cwd = root): string[] {
  const files: string[] = []
  if (!existsSync(root)) {
    return files
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name)
    const rel = normalizePath(relative(cwd, entryPath))
    if (exclude.some(pattern => createGlobMatcher(pattern)(rel) || createGlobMatcher(pattern)(`${rel}/`))) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...walkQuaScriptFiles(entryPath, exclude, cwd))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.qs')) {
      files.push(entryPath)
    }
  }
  return files
}

function createGlobMatcher(pattern: string): (value: string) => boolean {
  const normalized = normalizePath(pattern)
  const regex = new RegExp(`^${globToRegexSource(normalized)}$`, 'u')
  return value => regex.test(normalizePath(value))
}

function globToRegexSource(pattern: string): string {
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    const next = pattern[index + 1]
    if (char === '*' && next === '*') {
      const after = pattern[index + 2]
      if (after === '/') {
        source += '(?:.*\\/)?'
        index += 2
      }
      else {
        source += '.*'
        index++
      }
      continue
    }
    if (char === '*') {
      source += '[^/]*'
      continue
    }
    if (char === '?') {
      source += '[^/]'
      continue
    }
    source += escapeRegex(char)
  }
  return source
}

function escapeRegex(char: string): string {
  return /[\\^$.*+?()[\]{}|]/u.test(char) ? `\\${char}` : char
}

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function defaultIncludePatterns(): string[] {
  return DEFAULT_QUASCRIPT_TOOLING_CONFIG.files.include || ['**/*.qs']
}

function defaultExcludePatterns(): string[] {
  return DEFAULT_QUASCRIPT_TOOLING_CONFIG.files.exclude || ['node_modules/**', 'dist/**', '.git/**', '.qua/**', 'coverage/**']
}
