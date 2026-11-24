import type { NativeTextureOptions } from './core/types'

export interface QuaProjectNativeDistribution {
  /** Override the common texture settings for desktop release packages. */
  desktopTextures?: NativeTextureOptions
  macos?: {
    minimumSystemVersion?: string
    /** Keychain identity name or SHA-1. No private key is stored in the project. */
    signing?: { mode: 'adhoc' | 'developer-id', identity?: string, entitlements?: string }
    /** A profile previously stored with xcrun notarytool store-credentials. */
    notarization?: { enabled: boolean, keychainProfile?: string }
  }
}

export function normalizeNativeDistribution(value: unknown): QuaProjectNativeDistribution {
  if (value === undefined)
    return {}
  const fail = (): never => {
    throw new Error('Invalid targets.native.distribution: use desktopTextures or macos with signing and notarization settings.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail()
  const { macos, desktopTextures } = value as QuaProjectNativeDistribution
  if (desktopTextures !== undefined && (!desktopTextures || !['auto', 'astc', 'bc7'].includes(desktopTextures.format)
    || (desktopTextures.ktx !== undefined && (typeof desktopTextures.ktx !== 'string' || !desktopTextures.ktx.trim()))
    || (desktopTextures.paths !== undefined && (!Array.isArray(desktopTextures.paths) || desktopTextures.paths.some(path => typeof path !== 'string' || !path))))) {
    throw new Error('Invalid targets.native.distribution.desktopTextures. Use format auto, astc or bc7 and optional paths or ktx.')
  }
  const desktop = desktopTextures ? { desktopTextures } : {}
  if (macos === undefined)
    return desktop
  if (!macos || typeof macos !== 'object' || Array.isArray(macos))
    return fail()
  const { signing, notarization, minimumSystemVersion } = macos
  for (const text of [minimumSystemVersion, signing?.identity, signing?.entitlements, notarization?.keychainProfile]) {
    if (text !== undefined && (typeof text !== 'string' || !text.trim() || [...text].some(character => character.charCodeAt(0) < 32)))
      return fail()
  }
  if (minimumSystemVersion && !/^\d+\.\d+(?:\.\d+)?$/u.test(minimumSystemVersion))
    return fail()
  if (signing && (!['adhoc', 'developer-id'].includes(signing.mode) || (signing.mode === 'developer-id' && (!signing.identity || signing.identity === '-'))))
    return fail()
  if (notarization && typeof notarization.enabled !== 'boolean')
    return fail()
  if (notarization?.enabled && (signing?.mode !== 'developer-id' || !notarization.keychainProfile))
    throw new Error('macOS notarization requires developer-id signing and a Keychain profile.')
  return { ...desktop, macos: { minimumSystemVersion, signing: signing && { mode: signing.mode, identity: signing.identity, entitlements: signing.entitlements }, notarization: notarization && { enabled: notarization.enabled, keychainProfile: notarization.keychainProfile } } }
}
