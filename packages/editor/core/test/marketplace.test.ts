import { describe, expect, it } from 'vitest'
import {
  isExactPackageVersion,
  isNpmPackageName,
  parsePluginMetadata,
} from '../src/plugins/marketplace'

describe('plugin package metadata', () => {
  const metadata = (extension: unknown) =>
    parsePluginMetadata('@acme/qua-plugin', { quajs: { extension } })
  const base = { schemaVersion: 1, id: 'acme.plugin', title: 'Plugin' }
  it('accepts runtime, devtools and combined packages without importing source', () => {
    for (const features of [
      { runtime: { entry: '.' } },
      { devtools: { apiVersion: 1, entry: './dist/editor.js' } },
      {
        runtime: { entry: './dist/runtime.js' },
        devtools: {
          apiVersion: 1,
          entry: './dist/editor.js',
          indexer: './dist/indexer.mjs',
          style: './dist/style.css',
        },
      },
    ]) {
      expect(metadata({ ...base, ...features })).toMatchObject(features)
    }
    expect(
      parsePluginMetadata('@quajs/character', { quajs: { type: 'feature' } })
        ?.runtime
        ?.entry,
    ).toBe('.')
    expect(
      parsePluginMetadata('@quajs/web-core', { quajs: { type: 'core' } }),
    ).toBeUndefined()
  })
  it('rejects traversal, URLs, unsupported schema, malformed capabilities and empty plugins', () => {
    for (const entry of [
      '../editor.js',
      './dist/../editor.js',
      '/tmp/editor.js',
      'https://example.com/x.js',
      './node_modules/link/../../x.js',
    ]) {
      expect(() =>
        metadata({ ...base, devtools: { apiVersion: 1, entry } }),
      ).toThrow()
    }
    for (const extension of [
      true,
      {},
      base,
      { ...base, schemaVersion: 2, runtime: { entry: '.' } },
      { ...base, runtime: { entry: '.' }, devtools: 'invalid' },
    ])
      expect(() => metadata(extension)).toThrow()
  })
  it('only permits a package identity and exact version, never install flags or URLs', () => {
    for (const name of [
      '--global',
      'https://example.com/x',
      'file:../../x',
      '@acme/plugin@latest',
      'a;touch x',
      'a$(whoami)',
    ])
      expect(isNpmPackageName(name)).toBe(false)
    for (const version of ['latest', '^1.0.0', '1.0', '1.0.0 --global'])
      expect(isExactPackageVersion(version)).toBe(false)
    expect(isExactPackageVersion('1.0.0-beta.1+build.1')).toBe(true)
  })
})
