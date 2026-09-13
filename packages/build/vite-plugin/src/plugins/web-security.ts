import type { Plugin } from 'vite'
import type { QuaEngineVitePluginOptions } from '../core/types'
import { createHash, randomBytes } from 'node:crypto'
import { logPluginMessage } from '../core/utils'

type WebSecurityOptions = NonNullable<QuaEngineVitePluginOptions['webSecurity']>
type CspMode = NonNullable<NonNullable<WebSecurityOptions['csp']>['mode']>
type SriAlgorithm = NonNullable<NonNullable<WebSecurityOptions['sri']>['algorithm']>

interface SecurityAssetHash {
  directive: 'script-src' | 'style-src'
  fileName: string
  integrity: string
  cspHash: string
}

type SecurityOutputBundle = Record<string, SecurityOutputAsset | SecurityOutputChunk>

interface SecurityOutputAsset {
  fileName?: string
  source: string | Uint8Array
  type: 'asset'
}

interface SecurityOutputChunk {
  code: string
  fileName?: string
  type: 'chunk'
}

const NONCE_PLACEHOLDER = '__QUA_CSP_NONCE__'

export function webSecurityPlugin(options: WebSecurityOptions = {}): Plugin {
  const {
    enabled = true,
    csp = {},
    sri = {},
  } = options

  if (!enabled) {
    return {
      name: 'qua-web-security-disabled',
      apply: () => false,
    }
  }

  const cspMode: CspMode = csp.mode || 'hash'
  const sriEnabled = sri.enabled !== false
  const sriAlgorithm: SriAlgorithm = sri.algorithm || 'sha384'
  const assetHashes = new Map<string, SecurityAssetHash>()
  let generatedCsp = ''

  return {
    name: 'qua-web-security',
    apply: 'build',
    enforce: 'post',

    // Vite's import-analysis pass rewrites dynamic-import/preload references in
    // generateBundle. Hash only after those normal hooks and HTML emission.
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        collectSecurityAssetHashes(bundle, assetHashes, sriAlgorithm)

        if (sriEnabled) {
          for (const [fileName, output] of Object.entries(bundle)) {
            if (output.type === 'asset' && fileName.endsWith('.html')) {
              const html = typeof output.source === 'string'
                ? output.source : Buffer.from(output.source).toString('utf8')
              output.source = injectSriAttributes(html, assetHashes)
            }
          }
        }

        generatedCsp = createCspHeader(assetHashes, {
          allowRuntimeBlobModules: csp.allowRuntimeBlobModules === true,
          connectSrc: csp.connectSrc || [],
          mode: cspMode,
          reportUri: csp.reportUri,
          trustedTypes: csp.trustedTypes === true,
        })

        const manifest = createSecurityManifest(assetHashes, {
          allowRuntimeBlobModules: csp.allowRuntimeBlobModules === true,
          csp: generatedCsp,
          mode: cspMode,
          noncePlaceholder: NONCE_PLACEHOLDER,
          sriAlgorithm,
          sriEnabled,
          trustedTypes: csp.trustedTypes === true,
        })

        this.emitFile({
          type: 'asset',
          fileName: 'qua-security/csp.txt',
          source: generatedCsp,
        })
        this.emitFile({
          type: 'asset',
          fileName: 'qua-security/csp-meta.html',
          source: `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(generatedCsp)}">`,
        })
        this.emitFile({
          type: 'asset',
          fileName: 'qua-security/headers.json',
          source: JSON.stringify({ 'Content-Security-Policy': generatedCsp }, null, 2),
        })
        this.emitFile({
          type: 'asset',
          fileName: 'qua-security/nonce-node-middleware.js',
          source: createNonceMiddlewareTemplate(createCspHeader(assetHashes, {
            allowRuntimeBlobModules: csp.allowRuntimeBlobModules === true,
            connectSrc: csp.connectSrc || [],
            mode: cspMode,
            reportUri: csp.reportUri,
            trustedTypes: csp.trustedTypes === true,
          })),
        })
        this.emitFile({
          type: 'asset',
          fileName: 'qua-security/security-manifest.json',
          source: JSON.stringify(manifest, null, 2),
        })

        logPluginMessage(`Web security metadata generated (${assetHashes.size} SRI assets, CSP ${cspMode} mode)`, 'info')
      },
    },
  }
}

function collectSecurityAssetHashes(bundle: SecurityOutputBundle, hashes: Map<string, SecurityAssetHash>, sriAlgorithm: SriAlgorithm): void {
  hashes.clear()
  for (const [fileName, output] of Object.entries(bundle)) {
    if (isScriptChunk(output)) {
      hashes.set(fileName, createSecurityAssetHash(fileName, output.code, 'script-src', sriAlgorithm))
    }
    else if (isCssAsset(fileName, output)) {
      hashes.set(fileName, createSecurityAssetHash(fileName, output.source, 'style-src', sriAlgorithm))
    }
  }
}

function isScriptChunk(output: SecurityOutputAsset | SecurityOutputChunk): output is SecurityOutputChunk {
  return output.type === 'chunk'
}

function isCssAsset(fileName: string, output: SecurityOutputAsset | SecurityOutputChunk): output is SecurityOutputAsset {
  return output.type === 'asset' && fileName.endsWith('.css')
}

function createSecurityAssetHash(
  fileName: string,
  source: string | Uint8Array,
  directive: SecurityAssetHash['directive'],
  algorithm: SriAlgorithm,
): SecurityAssetHash {
  const buffer = typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source)
  const digest = createHash(algorithm).update(buffer).digest('base64')
  return {
    cspHash: `'${algorithm}-${digest}'`,
    directive,
    fileName,
    integrity: `${algorithm}-${digest}`,
  }
}

function createCspHeader(
  hashes: Map<string, SecurityAssetHash>,
  options: {
    allowRuntimeBlobModules: boolean
    connectSrc: readonly string[]
    mode: CspMode
    reportUri?: string
    trustedTypes: boolean
  },
): string {
  const scriptSrc = new Set<string>(['\'self\''])
  const styleSrc = new Set<string>(['\'self\''])
  const connectSrc = new Set<string>(['\'self\'', ...options.connectSrc])

  if (options.mode === 'hash' || options.mode === 'both') {
    for (const hash of hashes.values()) {
      if (hash.directive === 'script-src') {
        scriptSrc.add(hash.cspHash)
      }
      else {
        styleSrc.add(hash.cspHash)
      }
    }
  }

  if (options.mode === 'nonce' || options.mode === 'both') {
    scriptSrc.add(`'nonce-${NONCE_PLACEHOLDER}'`)
    styleSrc.add(`'nonce-${NONCE_PLACEHOLDER}'`)
    scriptSrc.add('\'strict-dynamic\'')
  }

  if (options.allowRuntimeBlobModules) {
    scriptSrc.add('blob:')
  }

  const directives: Array<[string, string[]]> = [
    ['default-src', ['\'none\'']],
    ['base-uri', ['\'self\'']],
    ['object-src', ['\'none\'']],
    ['frame-ancestors', ['\'none\'']],
    ['script-src', [...scriptSrc]],
    ['style-src', [...styleSrc]],
    ['img-src', ['\'self\'', 'blob:', 'data:']],
    ['font-src', ['\'self\'', 'blob:', 'data:']],
    ['media-src', ['\'self\'', 'blob:', 'data:']],
    ['connect-src', [...connectSrc]],
  ]

  if (options.trustedTypes) {
    directives.push(['require-trusted-types-for', ['\'script\'']])
    directives.push(['trusted-types', ['quaengine']])
  }
  if (options.reportUri) {
    directives.push(['report-uri', [options.reportUri]])
  }

  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}

function createSecurityManifest(
  hashes: Map<string, SecurityAssetHash>,
  options: {
    allowRuntimeBlobModules: boolean
    csp: string
    mode: CspMode
    noncePlaceholder: string
    sriAlgorithm: SriAlgorithm
    sriEnabled: boolean
    trustedTypes: boolean
  },
) {
  return {
    csp: {
      allowRuntimeBlobModules: options.allowRuntimeBlobModules,
      header: options.csp,
      mode: options.mode,
      noncePlaceholder: options.noncePlaceholder,
      trustedTypes: options.trustedTypes,
    },
    generatedAt: new Date().toISOString(),
    sri: {
      algorithm: options.sriAlgorithm,
      enabled: options.sriEnabled,
      assets: Array.from(hashes.values()).map(hash => ({
        directive: hash.directive,
        fileName: hash.fileName,
        integrity: hash.integrity,
      })),
    },
  }
}

function injectSriAttributes(html: string, hashes: Map<string, SecurityAssetHash>): string {
  let nextHtml = html
  for (const hash of hashes.values()) {
    const escapedFileName = escapeRegExp(hash.fileName)
    nextHtml = nextHtml.replace(
      new RegExp(`(<script\\b(?=[^>]*\\bsrc=["'][^"']*${escapedFileName}["'])(?![^>]*\\bintegrity=)[^>]*)(>)`, 'g'),
      `$1 integrity="${hash.integrity}" crossorigin="anonymous"$2`,
    )
    nextHtml = nextHtml.replace(
      new RegExp(`(<link\\b(?=[^>]*\\bhref=["'][^"']*${escapedFileName}["'])(?![^>]*\\bintegrity=)[^>]*)(>)`, 'g'),
      `$1 integrity="${hash.integrity}" crossorigin="anonymous"$2`,
    )
  }
  return nextHtml
}

function createNonceMiddlewareTemplate(cspHeader: string): string {
  const nonceInterpolation = '$' + '{nonce}'
  const templateHeader = cspHeader.split(NONCE_PLACEHOLDER).join(nonceInterpolation)
  const previewNonce = randomBytes(16).toString('base64url')
  return `import { randomBytes } from 'node:crypto'

const headerTemplate = ${JSON.stringify(templateHeader)}

export function quaCspNonceMiddleware(_request, response, next) {
  const nonce = randomBytes(16).toString('base64url')
  response.locals = { ...(response.locals || {}), quaCspNonce: nonce }
  response.setHeader('Content-Security-Policy', headerTemplate.replaceAll(${JSON.stringify(nonceInterpolation)}, nonce))
  next()
}

export const quaCspNoncePlaceholder = ${JSON.stringify(NONCE_PLACEHOLDER)}
export const quaCspPreviewNonce = ${JSON.stringify(previewNonce)}
`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
