/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { appleIdentity, electronSigningOptions, macSigningConfiguration, notarizationMode } from './macos-signing.mjs'

const identity = { APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example (ABCD123456)', APPLE_TEAM_ID: 'ABCD123456' }
test('CI macOS builds require Developer ID, a matching team, and a prepared notary profile', async () => {
  assert.equal(macSigningConfiguration({}, 'darwin'), undefined)
  assert.equal(macSigningConfiguration({ GITHUB_ACTIONS: 'true' }, 'win32'), undefined)
  assert.throws(() => macSigningConfiguration({ GITHUB_ACTIONS: 'true' }, 'darwin'), /Developer ID/u)
  assert.throws(() => appleIdentity({ ...identity, APPLE_TEAM_ID: 'WRONG12345' }), /matching/u)
  assert.throws(() => macSigningConfiguration({ ...identity, GITHUB_ACTIONS: 'true' }, 'darwin'), /keychain/u)
  const config = macSigningConfiguration({ ...identity, GITHUB_ACTIONS: 'true', QUA_EDITOR_SIGNING_KEYCHAIN: '/tmp/signing.keychain-db', QUA_EDITOR_NOTARY_PROFILE: 'editor-notary' }, 'darwin')
  const options = electronSigningOptions(config)
  assert.equal(options.identityValidation, true)
  assert.equal(options.strictVerify, true)
  assert.equal(options.optionsForFile().hardenedRuntime, true)
  const entitlements = await readFile(options.optionsForFile().entitlements, 'utf8')
  assert.match(entitlements, /com.apple.security.cs.allow-jit/u)
  assert.doesNotMatch(entitlements, /get-task-allow|disable-library-validation|allow-unsigned-executable-memory/u)
})

test('notarization accepts the Mixless Apple ID pair or a complete API key without partial fallback', () => {
  assert.equal(notarizationMode({ APPLE_ID: 'ci@example.test', APPLE_PASSWORD: 'fixture' }), 'apple-id')
  assert.equal(notarizationMode({ APPLE_API_KEY_BASE64: 'fixture', APPLE_API_KEY_ID: 'key', APPLE_API_ISSUER: 'issuer' }), 'api-key')
  assert.throws(() => notarizationMode({ APPLE_ID: 'ci@example.test' }), /APPLE_PASSWORD/u)
  assert.throws(() => notarizationMode({ APPLE_ID: 'ci@example.test', APPLE_PASSWORD: 'fixture', APPLE_API_KEY_ID: 'partial' }), /together/u)
})

test('Apple ID credentials enter the secure prompt, never the process arguments or transcript', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'editor-notary-test-'))
  try {
    const fake = join(root, 'xcrun')
    await writeFile(fake, '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGUMENTS_FILE"\nprintf "App-specific password: "\nread -r supplied\n[ "$supplied" = "$APPLE_PASSWORD" ] || exit 1\n')
    await chmod(fake, 0o755)
    const argumentsFile = join(root, 'arguments.txt')
    const result = await promisify(execFile)('/usr/bin/expect', [fileURLToPath(new URL('./notary-password.exp', import.meta.url))], { env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, APPLE_ID: 'ci@example.test', APPLE_PASSWORD: 'secret-fixture-only', APPLE_TEAM_ID: identity.APPLE_TEAM_ID, QUA_EDITOR_NOTARY_PROFILE: 'test-profile', QUA_EDITOR_SIGNING_KEYCHAIN: '/tmp/test.keychain-db', ARGUMENTS_FILE: argumentsFile }, timeout: 10000 })
    const args = await readFile(argumentsFile, 'utf8')
    assert.match(args, /store-credentials/u)
    assert.doesNotMatch(args, /secret-fixture-only|--password/u)
    assert.doesNotMatch(result.stdout + result.stderr, /secret-fixture-only/u)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
