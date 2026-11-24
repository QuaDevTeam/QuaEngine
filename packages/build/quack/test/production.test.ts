import type { QuaProductionBuildProgress } from '../src/production/progress'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { exportIosDeviceIpa } from '../src/production/ios-export'
import { macosInfoPlist, signMacos } from '../src/production/macos'
import { buildIosApp } from '../src/production/mobile'
import { buildRunner, productionEnvironment } from '../src/production/process'
import { normalizeQuaProjectConfig } from '../src/project'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const project = (distribution: unknown = {}) => normalizeQuaProjectConfig({ schemaVersion: 1, name: '游戏 <Tomorrow> & Friends', bundleId: 'dev.qua.game', version: '1.2.3', targets: { web: false, native: { platforms: ['macos'], app: { buildNumber: '42' }, distribution } } })

describe('native distribution configuration and signing', () => {
  it('rejects notarization without a Developer ID and Keychain profile', () => {
    expect(() => project({ macos: { notarization: { enabled: true } } })).toThrow('requires')
    expect(() => project({ macos: { signing: { mode: 'developer-id' } } })).toThrow('Invalid')
    expect(() => project({ macos: { signing: { mode: 'adhoc' }, notarization: { enabled: 'false' } } })).toThrow('Invalid')
  })
  it('escapes application names and preserves native version metadata', () => {
    const plist = macosInfoPlist(project())
    expect(plist).toContain('游戏 &lt;Tomorrow&gt; &amp; Friends')
    expect(plist).toContain('<key>CFBundleVersion</key><string>42</string>')
    expect(plist).toContain('<key>CFBundleExecutable</key><string>game</string>')
  })
  it('does not staple or assess a rejected notarization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qua-sign-test-'))
    temporary.push(root)
    const calls: string[][] = []
    const progress: QuaProductionBuildProgress[] = []
    const run = async (command: string, args: string[]) => {
      calls.push([command, ...args])
      return command === 'xcrun' ? '{"status":"Invalid"}' : ''
    }
    await expect(signMacos(project({ macos: { signing: { mode: 'developer-id', identity: 'Developer ID Application: Test' }, notarization: { enabled: true, keychainProfile: 'test-profile' } } }), root, join(root, 'Game.app'), run, event => progress.push(event))).rejects.toThrow('not accepted')
    expect(calls.some(call => call.includes('runtime') && call.includes('--timestamp'))).toBe(true)
    expect(calls.some(call => call.includes('--keychain-profile'))).toBe(true)
    expect(calls.some(call => call.includes('staple') || call[0] === 'spctl')).toBe(false)
    expect(progress.map(event => [event.step, event.status])).toEqual([['sign', 'running'], ['sign', 'completed'], ['notarize', 'running']])
  })
  it('verifies the ad-hoc signature without attempting notarization', async () => {
    const calls: string[][] = []
    const progress: QuaProductionBuildProgress[] = []
    const result = await signMacos(project(), '/tmp', '/tmp/Game.app', async (command, args) => {
      calls.push([command, ...args])
      return ''
    }, event => progress.push(event))
    expect(result).toEqual({ signing: 'adhoc', notarized: false })
    expect(calls).toEqual([['codesign', '--force', '--sign', '-', '/tmp/Game.app'], ['codesign', '--verify', '--deep', '--strict', '--verbose=2', '/tmp/Game.app']])
    expect(progress.map(event => [event.step, event.status])).toEqual([['sign', 'running'], ['sign', 'completed'], ['notarize', 'skipped']])
  })
  it('removes preview/debug injection from production children', () => {
    expect(productionEnvironment({ PATH: '/tools', QUA_NATIVE_RENDERER_CONTROL: '127.0.0.1:4789', QUA_NATIVE_DISTRIBUTION_SHA256: 'old', QUA_EDITOR_TOKEN: 'token', VITE_QUA_EDITOR_PREVIEW: '1', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' })).toEqual({ PATH: '/tools', NODE_ENV: 'production' })
  })
  it('reaps a real child process on cancellation', async () => {
    const controller = new AbortController()
    let pid = 0
    const run = buildRunner(process.cwd(), process.env, controller.signal, (line) => {
      if (line.startsWith('ready:')) {
        pid = Number(line.slice(6))
        controller.abort()
      }
    })
    await expect(run(process.execPath, ['-e', 'console.log("ready:" + process.pid); setInterval(() => {}, 1000)'])).rejects.toThrow()
    expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

describe('iOS app metadata', () => {
  it('uses the system JavaScriptCore deployment floor for both the app and compiled assets', async () => {
    const stage = await mkdtemp(join(tmpdir(), 'qua-ios-assets-'))
    temporary.push(stage)
    const app = 'Game.app'
    await mkdir(join(stage, app))
    const icon = join(stage, 'icon.svg')
    await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>')
    const calls: string[][] = []
    await buildIosApp(project(), stage, app, icon, true, async (command, args) => {
      calls.push([command, ...args])
      if (args[0] === 'actool')
        await writeFile(join(stage, 'asset-info.plist'), '{}')
      return args.includes('json') ? '{}' : ''
    })
    const info = JSON.parse(await readFile(join(stage, app, 'Info.plist'), 'utf8'))
    expect(info.MinimumOSVersion).toBe('15.4')
    const actool = calls.find(call => call[1] === 'actool')!
    expect(actool[actool.indexOf('--minimum-deployment-target') + 1]).toBe(info.MinimumOSVersion)
  })
})

describe('local iOS device export', () => {
  async function fixture(overrides: Record<string, string> = {}) {
    const stage = await mkdtemp(join(tmpdir(), 'qua-ios-export-'))
    temporary.push(stage)
    const app = 'Game.xcarchive/Products/Applications/Game.app'
    await mkdir(join(stage, app), { recursive: true })
    const profile = join(stage, 'selected.mobileprovision')
    await writeFile(profile, 'selected profile')
    const cert = Buffer.from('selected certificate')
    const identity = createHash('sha1').update(cert).digest('hex').toUpperCase()
    const fields: Record<string, string> = {
      'Platform': '["iOS"]',
      'IsXcodeManaged': 'false',
      'ExpirationDate': '2099-01-01T00:00:00Z',
      'TeamIdentifier.0': 'TEAM',
      'ApplicationIdentifierPrefix.0': 'TEAM',
      'Entitlements.application-identifier': 'TEAM.dev.qua.*',
      'ProvisionedDevices': '1',
      'DeveloperCertificates': '1',
      'DeveloperCertificates.0': cert.toString('base64'),
      'Entitlements.get-task-allow': 'true',
      'UUID': 'profile-uuid',
      ...overrides,
    }
    const calls: string[][] = []
    let options: Record<string, unknown> | undefined
    const run = async (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (command === 'plutil' && args[0] === '-extract')
        await writeFile(args[4], fields[args[1]])
      if (command === 'ditto' && args.includes('--keepParent'))
        await writeFile(args.at(-1)!, 'managed export')
      if (command === 'xcodebuild') {
        options = JSON.parse(await readFile(args[args.indexOf('-exportOptionsPlist') + 1], 'utf8'))
        const output = args[args.indexOf('-exportPath') + 1]
        await mkdir(output)
        await writeFile(join(output, 'Game.ipa'), 'export')
      }
      return ''
    }
    const exportIpa = () => exportIosDeviceIpa(stage, app, 'dev.qua.game', { QUA_IOS_SIGNING_IDENTITY: identity, QUA_IOS_PROVISIONING_PROFILE: profile }, run)
    return { stage, calls, exportIpa, options: () => options }
  }
  it('requests a local, manually provisioned device export', async () => {
    const test = await fixture()
    expect(await test.exportIpa()).toBe(true)
    expect(test.options()).toMatchObject({ destination: 'export', method: 'debugging', signingStyle: 'manual', provisioningProfiles: { 'dev.qua.game': 'profile-uuid' } })
    expect(await readFile(join(test.stage, 'Game.ipa'), 'utf8')).toBe('export')
    expect(test.calls.flat()).not.toContain('-allowProvisioningUpdates')
  })
  it('retains a specifically signed app for Xcode-managed device profiles', async () => {
    const test = await fixture({ IsXcodeManaged: 'true' })
    expect(await test.exportIpa()).toBe(true)
    expect(test.calls.some(call => call[0] === 'xcodebuild')).toBe(false)
    expect(test.calls.some(call => call[0] === 'ditto' && call.includes('--keepParent'))).toBe(true)
    expect(await readFile(join(test.stage, 'Game.ipa'), 'utf8')).toBe('managed export')
  })
  it.each([
    [{ Platform: '["tvOS"]' }, 'iOS device'],
    [{ ExpirationDate: '2000-01-01T00:00:00Z' }, 'expired'],
    [{ 'Entitlements.application-identifier': 'TEAM.dev.other' }, 'application identifier'],
    [{ ProvisionedDevices: '0' }, 'registered devices'],
    [{ 'DeveloperCertificates.0': 'YQ==' }, 'certificate'],
  ] as const)('checks profile constraints before signing', async (fields, expected) => {
    const test = await fixture(fields)
    await expect(test.exportIpa()).rejects.toThrow(expected)
    expect(test.calls.map(call => call[0])).not.toContain('codesign')
  })
})
