import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectForbiddenTargetCoreManifestDependencyViolations,
  collectForbiddenTargetCoreImportViolations,
  importSpecifiers,
  sourceFiles,
} from './target-isolation-helpers'

describe('@quajs/native-ui-compiler target isolation', () => {
  it('does not import Web, Cocos, or native bootstrap core packages from compiler tooling', () => {
    const roots = [
      fileURLToPath(new URL('..', import.meta.url)),
    ]

    expect(collectForbiddenTargetCoreImportViolations(roots)).toEqual([])
  })

  it('does not depend on Web, Cocos, or native bootstrap core packages from compiler tooling', () => {
    expect(collectForbiddenTargetCoreManifestDependencyViolations([
      fileURLToPath(new URL('../package.json', import.meta.url)),
    ])).toEqual([])
  })

  it('collects forbidden target-core package manifest dependencies', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'qua-native-target-isolation-'))
    const manifestPath = join(fixtureDir, 'package.json')
    try {
      writeFileSync(manifestPath, JSON.stringify({
        dependencies: {
          '@quajs/renderer-web': 'workspace:*',
          '@quajs/native-ui-compiler': 'workspace:*',
        },
        devDependencies: {
          '@quajs/engine-native': 'workspace:*',
        },
        peerDependencies: {
          '@quajs/renderer-cocos': 'workspace:*',
        },
        optionalDependencies: {
          '@quajs/store-native': 'workspace:*',
        },
      }))

      expect(collectForbiddenTargetCoreManifestDependencyViolations([manifestPath])).toEqual([
        `${manifestPath} dependencies: @quajs/renderer-web`,
        `${manifestPath} devDependencies: @quajs/engine-native`,
        `${manifestPath} peerDependencies: @quajs/renderer-cocos`,
        `${manifestPath} optionalDependencies: @quajs/store-native`,
      ])
    }
    finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('collects static, side-effect, re-export, dynamic import, and CommonJS require specifiers', () => {
    expect(importSpecifiers(`
      import type { Thing } from '@example/types'
      import { value } from '@example/static'
      import '@example/side-effect'
      export * from '@example/export-star'
      export { value } from '@example/export-named'
      await import('@example/dynamic')
      await import(/* vite-ignore */ '@example/commented-dynamic')
      const commonjs = require('@example/commonjs')
    `)).toEqual([
      '@example/types',
      '@example/static',
      '@example/side-effect',
      '@example/export-star',
      '@example/export-named',
      '@example/dynamic',
      '@example/commented-dynamic',
      '@example/commonjs',
    ])
  })

  it('collects authoring source entry extensions and skips generated directories', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'qua-native-target-isolation-sources-'))
    try {
      for (const dir of ['bin', 'scripts', 'src', 'dist', 'node_modules'])
        mkdirSync(join(fixtureDir, dir), { recursive: true })

      for (const file of [
        'bin/cli.cjs',
        'scripts/package.mjs',
        'src/component.tsx',
        'src/config.mts',
        'src/legacy.cts',
        'src/runtime.js',
        'src/server.ts',
        'vite.config.ts',
      ])
        writeFileSync(join(fixtureDir, file), '')

      writeFileSync(join(fixtureDir, 'dist/generated.js'), '')
      writeFileSync(join(fixtureDir, 'node_modules/dependency.js'), '')

      expect(sourceFiles(fixtureDir).map(filePath => filePath.slice(fixtureDir.length + 1))).toEqual([
        'bin/cli.cjs',
        'scripts/package.mjs',
        'src/component.tsx',
        'src/config.mts',
        'src/legacy.cts',
        'src/runtime.js',
        'src/server.ts',
        'vite.config.ts',
      ])
    }
    finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
