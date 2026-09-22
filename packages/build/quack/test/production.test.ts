import type { QuaProductionBuildProgress } from '../src/production/progress'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { macosInfoPlist, signMacos } from '../src/production/macos'
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
