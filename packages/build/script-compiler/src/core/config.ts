import type { QuaScriptToolingConfig } from './types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export const DEFAULT_QUASCRIPT_TOOLING_CONFIG: Required<QuaScriptToolingConfig> = {
  decorators: {
    autoCollect: true,
    mappings: {},
  },
  files: {
    exclude: ['node_modules/**', 'dist/**', '.git/**', '.qua/**', 'coverage/**'],
    include: ['**/*.qs'],
  },
  format: {
    enable: true,
    insertFinalNewline: true,
    maxBlankLines: 1,
  },
  lint: {
    enable: true,
    rules: {},
  },
}

export function loadQuaScriptToolingConfig(projectRoot = process.cwd()): QuaScriptToolingConfig {
  const directConfig = readJson(join(projectRoot, 'quascript.config.json'))
  if (directConfig) {
    return mergeQuaScriptToolingConfig(DEFAULT_QUASCRIPT_TOOLING_CONFIG, asToolingConfig(directConfig))
  }

  const quaConfig = readJson(join(projectRoot, 'qua.config.json'))
  if (isRecord(quaConfig) && isRecord(quaConfig.quascript)) {
    return mergeQuaScriptToolingConfig(DEFAULT_QUASCRIPT_TOOLING_CONFIG, asToolingConfig(quaConfig.quascript))
  }

  const packageJson = readJson(join(projectRoot, 'package.json'))
  if (isRecord(packageJson) && isRecord(packageJson.quascript)) {
    return mergeQuaScriptToolingConfig(DEFAULT_QUASCRIPT_TOOLING_CONFIG, asToolingConfig(packageJson.quascript))
  }

  return DEFAULT_QUASCRIPT_TOOLING_CONFIG
}

export function mergeQuaScriptToolingConfig(
  base: QuaScriptToolingConfig,
  override: QuaScriptToolingConfig = {},
): QuaScriptToolingConfig {
  return {
    decorators: {
      autoCollect: override.decorators?.autoCollect ?? base.decorators?.autoCollect,
      mappings: {
        ...(base.decorators?.mappings || {}),
        ...(override.decorators?.mappings || {}),
      },
    },
    files: {
      exclude: override.files?.exclude ?? base.files?.exclude,
      include: override.files?.include ?? base.files?.include,
    },
    format: {
      ...base.format,
      ...override.format,
    },
    lint: {
      enable: override.lint?.enable ?? base.lint?.enable,
      rules: {
        ...(base.lint?.rules || {}),
        ...(override.lint?.rules || {}),
      },
    },
  }
}

function readJson(filePath: string): unknown {
  if (!existsSync(filePath)) {
    return undefined
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
}

function asToolingConfig(value: unknown): QuaScriptToolingConfig {
  return isRecord(value) ? value as QuaScriptToolingConfig : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
