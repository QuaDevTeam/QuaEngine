/* eslint-disable antfu/no-top-level-await */
import { execFile } from 'node:child_process'
import { createPrivateKey } from 'node:crypto'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { appleIdentity, notarizationMode } from './macos-signing.mjs'

const exec = promisify(execFile)
const env = process.env
const config = appleIdentity(env)
const mode = notarizationMode(env)
if (process.argv.includes('--preflight')) {
  for (const key of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD']) {
    if (!env[key])
      throw new Error(`Missing GitHub Actions secret: ${key}`)
  }
  process.stdout.write(`Apple signing configuration present; notarization mode: ${mode}.\n`)
}
else {
  if (process.platform !== 'darwin' || !env.GITHUB_ENV || !env.RUNNER_TEMP)
    throw new Error('Prepare signing credentials on the macOS GitHub Actions runner.')
  const keychain = join(homedir(), 'Library/Keychains/signing_temp.keychain-db')
  const profile = `qua-editor-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`
  const identities = await exec('security', ['find-identity', '-v', '-p', 'codesigning', keychain])
  if (!identities.stdout.includes(`"${config.identity}"`))
    throw new Error('Configured Developer ID Application identity was not imported into the CI keychain.')
  const temporary = await mkdtemp(join(env.RUNNER_TEMP, 'qua-notary-'))
  try {
    if (mode === 'api-key') {
      const bytes = Buffer.from(env.APPLE_API_KEY_BASE64, 'base64')
      const key = createPrivateKey(bytes)
      if (key.asymmetricKeyType !== 'ec')
        throw new Error('APPLE_API_KEY_BASE64 must contain an App Store Connect EC private key.')
      const path = join(temporary, 'AuthKey.p8')
      await writeFile(path, bytes, { mode: 0o600 })
      await exec('xcrun', ['notarytool', 'store-credentials', profile, '--keychain', keychain, '--key', path, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER, '--validate'], { timeout: 120000 })
    }
    else {
      // Expect disables transcript logging and supplies the password only once.
      await exec('/usr/bin/expect', [fileURLToPath(new URL('./notary-password.exp', import.meta.url))], {
        env: { ...env, QUA_EDITOR_NOTARY_PROFILE: profile, QUA_EDITOR_SIGNING_KEYCHAIN: keychain },
        timeout: 130000,
      })
    }
    await appendFile(env.GITHUB_ENV, `QUA_EDITOR_SIGNING_KEYCHAIN=${keychain}\nQUA_EDITOR_NOTARY_PROFILE=${profile}\n`)
    process.stdout.write('Imported signing identity and validated notarization profile are ready.\n')
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
