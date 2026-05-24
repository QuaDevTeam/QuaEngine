# QuaEngine Web Security

QuaEngine Web builds should ship with a narrow CSP, static asset SRI, and signed QPK Runtime Packages. The engine stays platform-neutral: WebCrypto, Blob module URLs, dynamic `import()`, CSP, and Trusted Types live in `@quajs/security-web` and Vite/build adapters.

## Runtime QPK Trust

Runtime packages are trusted as a package unit. The default signature algorithm is `ecdsa-p256-sha256`; the signature value is a base64url encoded 64-byte WebCrypto/IEEE-P1363 ECDSA signature.

The signed payload is canonical JSON containing:

- `schema: "quajs.runtime-package-signature.v1"`
- `runtimePackage` with `signature` removed
- `bundle.format`, `bundle.bundleVersion`, and `bundle.merkleRoot`

That means runtime scripts, scenes, plugins, migrations, story graph deltas, and runtime metadata are covered directly by the package signature; all asset and script bytes are covered through the manifest hashes and `merkleRoot`.

```bash
quack bundle assets --format qpk --sign-key ./keys/runtime-private.pem --sign-key-id release-2026-01
quack verify ./dist/runtime.qpk --public-key ./keys/runtime-public.pem --require-signature --key-id release-2026-01
```

`quack verify` checks unsafe paths, duplicate paths, manifest bounds, asset and variant hashes, manifest `merkleRoot`, runtime integrity metadata, signature algorithm, keyId, and ECDSA signature validity.

## Web Runtime Wiring

Use the Web trust policy and runtime loaders in browser apps:

```ts
import {
  createWebRuntimeModuleLoader,
  createWebRuntimeRendererPluginLoader,
  createWebRuntimeTrustPolicy,
} from '@quajs/security-web'

const trustPolicy = createWebRuntimeTrustPolicy({
  keys: [{ id: 'release-2026-01', key: publicJwkOrSpkiPem }],
  requireSignature: import.meta.env.PROD,
  allowUnsignedInDevelopment: true,
})

const runtimeModuleLoader = createWebRuntimeModuleLoader({
  assets,
  moduleUrlMode: 'same-origin-with-blob-fallback',
  allowBlobFallback: false,
})
```

Blob fallback is intentionally explicit. If runtime JS modules do not have same-origin URLs and must be imported from verified bytes, set `allowBlobFallback: true` and also set Vite `webSecurity.csp.allowRuntimeBlobModules: true`. This adds `blob:` to `script-src`.

## Vite Web Security

Enable static CSP/SRI generation in `@quajs/vite-plugin`:

```ts
quaEngine({
  webSecurity: {
    enabled: true,
    csp: {
      mode: 'hash',
      allowRuntimeBlobModules: false,
      trustedTypes: false,
    },
    sri: {
      enabled: true,
      algorithm: 'sha384',
    },
  },
})
```

Build output includes:

- `qua-security/csp.txt`
- `qua-security/csp-meta.html`
- `qua-security/headers.json`
- `qua-security/nonce-node-middleware.js`
- `qua-security/security-manifest.json`

Hash mode is the default for static CDN deployment. Nonce mode is for SSR, edge functions, or a custom server that can replace `__QUA_CSP_NONCE__` per request.

Trusted Types are opt-in through `trustedTypes: true`, which adds `require-trusted-types-for 'script'` and `trusted-types quaengine`. Current official renderers avoid HTML string sinks by default, so this is a deployment hardening option rather than a runtime requirement.

## Deployment Notes

Static CDN:
Use `qua-security/csp.txt` as the `Content-Security-Policy` response header. Prefer headers over meta tags when your host supports them.

Cloudflare Pages:
Create `_headers` with:

```txt
/*
  Content-Security-Policy: <contents of qua-security/csp.txt>
```

Cloudflare Workers:
Read or inline the generated CSP string and set `response.headers.set('Content-Security-Policy', csp)`.

Netlify:
Create `_headers` with the same `Content-Security-Policy` header. Netlify also supports a `netlify.toml` headers block.

Node/self-hosted:
Use the generated nonce middleware for nonce/both mode, or set the static hash CSP string directly for hash mode.

Avoid `unsafe-eval` and `unsafe-inline` in production. Runtime QPK JavaScript should be accepted only after QPK integrity and signature verification.
