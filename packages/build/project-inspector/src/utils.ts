import type { SourceRange } from '@quajs/script-compiler'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createLineStarts, rangeFromOffsets } from '@quajs/script-compiler'

export const PROJECT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.quack-logs'])
export const STORY_ASSET_TYPES = new Set(['images', 'audio', 'video', 'sprites', 'backgrounds', 'data'])

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

export function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : []
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) {
      return items[index]
    }
  }
  return undefined
}

export function isSameFile(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right) && resolve(left!) === resolve(right!)
}

export function listProjectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (PROJECT_SKIP_DIRS.has(entry.name)) {
        return []
      }
      return listProjectFiles(join(root, entry.name))
    }
    return entry.isFile() ? [join(root, entry.name)] : []
  })
}

export function moduleIdFromFilePath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined
  }
  return relative(dirname(filePath), filePath).replace(/\\/g, '/')
}

export function rangeForLineSubstring(source: string, lineStarts: readonly number[], lineIndex: number, value: string): SourceRange {
  const line = source.split(/\r?\n/)[lineIndex] || ''
  const localStart = Math.max(0, line.indexOf(value))
  const start = (lineStarts[lineIndex] || 0) + localStart
  return rangeFromOffsets(lineStarts, start, start + value.length)
}

export function runtimePackageFromJson(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value)
  return asRecord(record?.runtimePackage)
    || asRecord(asRecord(record?.manifest)?.runtimePackage)
}

export function safeParseJson(source: string): unknown {
  try {
    return JSON.parse(source)
  }
  catch {
    return undefined
  }
}

export function sourceRangeForDecorator(source: string, decorator: string, value: string): SourceRange | undefined {
  const lineStarts = createLineStarts(source)
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].includes(`@${decorator}`) && lines[index].includes(value)) {
      return rangeForLineSubstring(source, lineStarts, index, value)
    }
  }
  return undefined
}

export function storyAssetExists(options: { filePath?: string, projectRoot?: string }, type: string, name: string): boolean {
  if (!options.projectRoot) {
    return true
  }
  const projectRoot = resolve(options.projectRoot)
  const candidates = [
    join(projectRoot, 'assets', type, name),
    join(projectRoot, 'assets', name),
    join(projectRoot, name),
    options.filePath ? join(dirname(options.filePath), name) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.some(candidate => existsSync(candidate))
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
