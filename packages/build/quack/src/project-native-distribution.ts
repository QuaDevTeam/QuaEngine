export interface QuaProjectNativeDistribution {
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
    throw new Error('Invalid targets.native.distribution: use macos.signing and macos.notarization with Keychain references.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail()
  const { macos } = value as QuaProjectNativeDistribution
  if (macos === undefined)
    return {}
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
  return { macos: { minimumSystemVersion, signing: signing && { mode: signing.mode, identity: signing.identity, entitlements: signing.entitlements }, notarization: notarization && { enabled: notarization.enabled, keychainProfile: notarization.keychainProfile } } }
}
