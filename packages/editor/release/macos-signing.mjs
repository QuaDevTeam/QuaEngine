import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const entitlements = fileURLToPath(new URL('./entitlements.mac.plist', import.meta.url))

export function appleIdentity(env) {
  const identity = env.APPLE_SIGNING_IDENTITY?.trim()
  const teamId = env.APPLE_TEAM_ID?.trim()
  if (!identity?.startsWith('Developer ID Application: ') || !/^[A-Z0-9]{10}$/u.test(teamId ?? '') || !identity.endsWith(`(${teamId})`))
    throw new Error('Configure a Developer ID Application identity and its matching APPLE_TEAM_ID.')
  return { identity, teamId }
}

export function notarizationMode(env) {
  const api = ['APPLE_API_KEY_BASE64', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'].map(key => !!env[key])
  const account = ['APPLE_ID', 'APPLE_PASSWORD'].map(key => !!env[key])
  if (api.some(Boolean) && !api.every(Boolean))
    throw new Error('Configure APPLE_API_KEY_BASE64, APPLE_API_KEY_ID and APPLE_API_ISSUER together.')
  if (api.every(Boolean))
    return 'api-key'
  if (!account.every(Boolean))
    throw new Error('Configure APPLE_ID and APPLE_PASSWORD, or a complete App Store Connect API key.')
  return 'apple-id'
}

export function macSigningConfiguration(env, platform) {
  if (platform !== 'darwin')
    return undefined
  if (env.GITHUB_ACTIONS !== 'true' && env.QUA_EDITOR_REQUIRE_SIGNING !== '1' && !env.APPLE_SIGNING_IDENTITY)
    return undefined // Local development archives cannot pass the publication gate.
  const identity = appleIdentity(env)
  if (!env.QUA_EDITOR_SIGNING_KEYCHAIN || !env.QUA_EDITOR_NOTARY_PROFILE)
    throw new Error('Prepare the CI signing keychain and notarization profile before packaging.')
  return { ...identity, keychain: env.QUA_EDITOR_SIGNING_KEYCHAIN, keychainProfile: env.QUA_EDITOR_NOTARY_PROFILE }
}

export function electronSigningOptions(config) {
  return {
    identity: config.identity,
    keychain: config.keychain,
    identityValidation: true,
    strictVerify: true,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile: () => ({ hardenedRuntime: true, entitlements }),
  }
}

/** Run again on the extracted download archive, so stapling must survive packaging. */
export async function verifyMacApplication(app, config, channel) {
  await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  const { stderr } = await exec('/usr/bin/codesign', ['--display', '--verbose=4', app])
  const bundleId = channel === 'beta' ? 'com.quadevteam.quaengine.editor.beta' : 'com.quadevteam.quaengine.editor'
  if (!stderr.split('\n').includes(`TeamIdentifier=${config.teamId}`)
    || !stderr.split('\n').includes(`Authority=${config.identity}`)
    || !stderr.split('\n').includes(`Identifier=${bundleId}`)
    || !/flags=.*\bruntime\b/u.test(stderr)) {
    throw new Error('Signed editor identity, team, bundle ID or hardened runtime does not match the release.')
  }
  await exec('xcrun', ['stapler', 'validate', app])
  await exec('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app])
  return { teamId: config.teamId, identity: config.identity, hardenedRuntime: true, notarized: true, stapled: true, gatekeeper: true }
}
