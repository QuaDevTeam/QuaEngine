import type { BuildRunner } from './process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

/** Development/ad-hoc exports use only the specified installed certificate and device profile. */
export async function exportIosDeviceIpa(stage: string, relativeApp: string, bundleId: string, env: NodeJS.ProcessEnv, run: BuildRunner): Promise<boolean> {
  const profile = env.QUA_IOS_PROVISIONING_PROFILE
  const identity = env.QUA_IOS_SIGNING_IDENTITY?.toUpperCase()
  if (!profile && !identity)
    return false
  if (!profile || !identity || !/^[0-9A-F]{40}$/u.test(identity))
    throw new Error('IPA export requires QUA_IOS_PROVISIONING_PROFILE and the 40-digit SHA-1 of QUA_IOS_SIGNING_IDENTITY.')
  const work = join(stage, 'ipa-export')
  await mkdir(work)
  const profilePlist = join(work, 'profile.plist')
  await run('security', ['cms', '-D', '-i', resolve(profile), '-o', profilePlist])
  // Write to files to keep device lists, certificate bytes and full profile out of build logs.
  const field = async (key: string): Promise<string> => {
    const value = join(work, 'field')
    await run('plutil', ['-extract', key, 'raw', '-o', value, profilePlist])
    return (await readFile(value, 'utf8')).trim()
  }
  const platforms = join(work, 'platforms.json')
  await run('plutil', ['-extract', 'Platform', 'json', '-o', platforms, profilePlist])
  if (!JSON.parse(await readFile(platforms, 'utf8')).includes('iOS'))
    throw new Error('IPA export requires an iOS device provisioning profile.')
  const expiry = Date.parse(await field('ExpirationDate'))
  if (!Number.isFinite(expiry) || expiry <= Date.now())
    throw new Error('The iOS provisioning profile is expired or has no valid expiration date.')
  const team = await field('TeamIdentifier.0')
  const prefix = await field('ApplicationIdentifierPrefix.0')
  const allowed = await field('Entitlements.application-identifier')
  const appId = `${prefix}.${bundleId}`
  if (!team || !prefix || (allowed !== appId && !(allowed.endsWith('*') && appId.startsWith(allowed.slice(0, -1)))))
    throw new Error('The provisioning profile does not authorize the application identifier.')
  const provisionedDevices = Number(await field('ProvisionedDevices'))
  if (!Number.isInteger(provisionedDevices) || provisionedDevices < 1)
    throw new Error('Installable development and ad-hoc IPA export requires a profile with registered devices.')
  const certificates = Number(await field('DeveloperCertificates'))
  let matches = false
  for (let i = 0; i < certificates; i++) {
    const der = Buffer.from(await field(`DeveloperCertificates.${i}`), 'base64')
    matches ||= createHash('sha1').update(der).digest('hex').toUpperCase() === identity
  }
  if (!matches)
    throw new Error('The selected signing certificate is absent from the provisioning profile.')
  const managed = await field('IsXcodeManaged').catch(() => 'false') === 'true'
  const debugging = (await field('Entitlements.get-task-allow')) === 'true'
  const uuid = await field('UUID')
  const app = join(stage, relativeApp)
  await copyFile(resolve(profile), join(app, 'embedded.mobileprovision'))
  const entitlements = join(work, 'Entitlements.plist')
  await writeFile(entitlements, JSON.stringify({ 'application-identifier': appId, 'com.apple.developer.team-identifier': team, 'get-task-allow': debugging }))
  await run('plutil', ['-convert', 'xml1', entitlements])
  await run('codesign', ['--force', '--sign', identity, '--entitlements', entitlements, '--generate-entitlement-der', app])
  await run('codesign', ['--verify', '--strict', app])
  const archive = join(stage, 'Game.xcarchive')
  await run('plutil', ['-insert', 'ApplicationProperties.Team', '-string', team, join(archive, 'Info.plist')])
  await run('plutil', ['-insert', 'ApplicationProperties.SigningIdentity', '-string', identity, join(archive, 'Info.plist')])
  if (managed) {
    // Xcode's manual export rejects Xcode-managed profiles, and automatic export
    // is free to select another identity. Preserve the explicitly signed device
    // app verbatim in the IPA's standard Payload/ layout instead.
    const payload = join(work, 'Payload')
    await mkdir(payload)
    const packaged = join(payload, basename(app))
    await run('ditto', ['--norsrc', app, packaged])
    await run('codesign', ['--verify', '--strict', packaged])
    await run('ditto', ['-c', '-k', '--norsrc', '--keepParent', payload, join(stage, 'Game.ipa')])
    await rm(work, { recursive: true })
    return true
  }
  const options = join(work, 'ExportOptions.plist')
  await writeFile(options, JSON.stringify({
    method: debugging ? 'debugging' : 'release-testing',
    destination: 'export',
    signingStyle: 'manual',
    teamID: team,
    signingCertificate: identity,
    provisioningProfiles: { [bundleId]: uuid },
    manageAppVersionAndBuildNumber: false,
  }))
  await run('plutil', ['-convert', 'xml1', options])
  const output = join(work, 'output')
  await run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', output, '-exportOptionsPlist', options])
  const files = (await readdir(output)).filter(file => file.endsWith('.ipa'))
  if (files.length !== 1)
    throw new Error('Xcode did not export exactly one IPA.')
  await rename(join(output, files[0]), join(stage, 'Game.ipa'))
  await rm(work, { recursive: true })
  return true
}
