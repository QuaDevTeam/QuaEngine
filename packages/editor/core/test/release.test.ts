import { describe, expect, it } from 'vitest'
import { editorComponentCatalogUrl, editorReleaseManifestUrl, parseEditorComponentCatalog, parseEditorReleaseManifest } from '../src/release.js'

const hash = 'a'.repeat(64)

describe('editor release metadata', () => {
  it('validates the release artifact contract', () => {
    const manifest = {
      schemaVersion: 1,
      product: 'quaengine-editor',
      channel: 'stable',
      version: '1.2.3',
      publishedAt: '2026-09-22T00:00:00.000Z',
      artifacts: [{ platform: 'macos', arch: 'arm64', format: 'tar.gz', url: 'https://example.test/editor.tar.gz', sha256: hash, size: 10 }],
    }
    expect(parseEditorReleaseManifest(manifest)).toMatchObject(manifest)
    expect(() => parseEditorReleaseManifest({ ...manifest, artifacts: [] })).toThrow()
    expect(() => parseEditorReleaseManifest({ ...manifest, version: 'latest' })).toThrow()
  })

  it('validates component catalogs and channel endpoints', () => {
    const catalog = {
      schemaVersion: 1,
      product: 'quaengine-editor-components',
      channel: 'stable',
      component: 'runtime',
      releases: [{ component: 'runtime', version: '1.2.0', editorRange: '^1.2.0', url: 'https://example.test/runtime.tar.gz', sha256: hash, size: 10 }],
    }
    expect(parseEditorComponentCatalog(catalog)).toMatchObject(catalog)
    expect(() => parseEditorComponentCatalog({ ...catalog, releases: [{ ...catalog.releases[0], url: 'http://example.test/runtime.tar.gz' }] })).toThrow()
    expect(editorReleaseManifestUrl('stable')).toContain('/editor-stable-latest/')
    expect(editorComponentCatalogUrl('beta', 'boilerplate')).toContain('/editor-components-beta-latest/boilerplate.json')
  })
})
