import type { NormalizedQuaProjectConfig } from '../project'
import type { BuildRunner } from './process'
import type { QuaProductionProgressListener } from './progress'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { productionProgress } from './progress'

export const xml = (value: string): string => value.replace(/[<>&"']/gu, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' })[character]!)

export function macosInfoPlist(project: NormalizedQuaProjectConfig): string {
  const native = project.targets.native!
  const strings = {
    CFBundleName: project.name,
    CFBundleDisplayName: project.name,
    CFBundleExecutable: 'game',
    CFBundleIdentifier: native.app.bundleId,
    CFBundleShortVersionString: native.app.version,
    CFBundleVersion: native.app.buildNumber,
    CFBundlePackageType: 'APPL',
    CFBundleIconFile: 'AppIcon.icns',
    LSMinimumSystemVersion: native.distribution.macos?.minimumSystemVersion ?? '11.0',
    NSHighResolutionCapable: undefined,
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${Object.entries(strings).filter(([, value]) => value !== undefined).map(([key, value]) => `<key>${key}</key><string>${xml(value!)}</string>`).join('')}<key>NSHighResolutionCapable</key><true/></dict></plist>\n`
}

export async function macosIcon(source: string, resources: string, run: BuildRunner): Promise<void> {
  const destination = join(resources, 'AppIcon.icns')
  if (/\.icns$/iu.test(source)) {
    await copyFile(source, destination)
    return
  }
  const iconset = join(resources, 'AppIcon.iconset')
  await mkdir(iconset)
  try {
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await sharp(source).resize(size * scale, size * scale, { fit: 'contain', background: '#00000000' }).png().toFile(join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`))
      }
    }
    await run('iconutil', ['-c', 'icns', iconset, '-o', destination])
  }
  finally { await rm(iconset, { recursive: true, force: true }) }
}

export async function signMacos(project: NormalizedQuaProjectConfig, root: string, app: string, run: BuildRunner, onProgress?: QuaProductionProgressListener): Promise<{ signing: 'adhoc' | 'developer-id', notarized: boolean }> {
  const progress = productionProgress(onProgress)
  progress('sign', 'running')
  const config = project.targets.native!.distribution.macos
  const signing = config?.signing?.mode ?? 'adhoc'
  const identity = signing === 'adhoc' ? '-' : config!.signing!.identity!
  const args = ['--force', '--sign', identity]
  if (signing === 'developer-id') {
    args.push('--options', 'runtime', '--timestamp')
    // System JavaScriptCore's JIT requires this under hardened runtime.
    const entitlements = config?.signing?.entitlements ? resolve(root, config.signing.entitlements) : join(app, '..', 'entitlements.plist')
    if (!config?.signing?.entitlements)
      await writeFile(entitlements, '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>')
    args.push('--entitlements', entitlements)
  }
  await run('codesign', [...args, app])
  await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  progress('sign', 'completed')
  const notarized = config?.notarization?.enabled === true
  if (notarized) {
    progress('notarize', 'running')
    const archive = join(app, '..', 'notarization.zip')
    try {
      await run('ditto', ['-c', '-k', '--keepParent', app, archive])
      const output = await run('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', config!.notarization!.keychainProfile!, '--wait', '--output-format', 'json'])
      if (JSON.parse(output).status !== 'Accepted')
        throw new Error(`Apple notarization was not accepted: ${output}`)
      await run('xcrun', ['stapler', 'staple', app])
      await run('xcrun', ['stapler', 'validate', app])
      await run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app])
      progress('notarize', 'completed')
    }
    finally { await rm(archive, { force: true }) }
  }
  else { progress('notarize', 'skipped') }
  return { signing, notarized }
}
