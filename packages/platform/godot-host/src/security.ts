export interface GodotRuntimePackageManifest {
  id: string
  integrity?: {
    hash: string
    algorithm?: string
  }
  scripts?: readonly unknown[]
  scenes?: readonly unknown[]
  plugins?: readonly unknown[]
  storeMigrations?: readonly unknown[]
}

export interface GodotBundleManifest {
  merkleRoot?: string
  runtimePackage?: GodotRuntimePackageManifest
}

export interface GodotDynamicBundleRecord {
  manifest: GodotBundleManifest
  hash?: string
}

export interface GodotRuntimePackageTrustContext {
  package: GodotRuntimePackageManifest
  bundle: GodotDynamicBundleRecord
}

export interface GodotRuntimeTrustPolicy {
  requireSignature?: boolean
  allowUnsignedInDevelopment?: boolean
  verifyPackage?: (ctx: GodotRuntimePackageTrustContext) => boolean | Promise<boolean>
}

export interface GodotRuntimeModuleLoader {
  loadScriptModule?: (...args: unknown[]) => Promise<never>
  loadSceneModule?: (...args: unknown[]) => Promise<never>
  loadEnginePluginModule?: (...args: unknown[]) => Promise<never>
  loadStoreMigrationModule?: (...args: unknown[]) => Promise<never>
}

export interface GodotBundleIntegrityInput {
  manifest?: GodotBundleManifest
  merkleRoot?: string
  hash?: string
  expectedHash?: string
  algorithm?: string
}

export interface GodotBundleIntegrityResult {
  valid: boolean
  algorithm: string
  expectedHash?: string
  actualHash?: string
  reason?: string
}

export interface GodotStaticOnlyTrustPolicyOptions {
  requireIntegrity?: boolean
  allowStaticRuntimePackages?: boolean
  /**
   * Verify package bytes/signatures against an application-trusted digest or key.
   * Manifest hash equality alone does not establish integrity.
   */
  verifyIntegrity?: (ctx: GodotRuntimePackageTrustContext) => boolean | Promise<boolean>
}

export function createGodotStaticOnlyTrustPolicy(
  options: GodotStaticOnlyTrustPolicyOptions = {},
): GodotRuntimeTrustPolicy {
  const requireIntegrity = options.requireIntegrity !== false
  const allowStaticRuntimePackages = options.allowStaticRuntimePackages === true
  return {
    requireSignature: false,
    allowUnsignedInDevelopment: false,
    async verifyPackage(ctx: GodotRuntimePackageTrustContext): Promise<boolean> {
      if (!allowStaticRuntimePackages) {
        return false
      }
      if (hasDynamicRuntimeEntrypoints(ctx.package)) {
        return false
      }
      if (!requireIntegrity) {
        return true
      }
      if (!options.verifyIntegrity)
        return false
      return await options.verifyIntegrity(ctx) && verifyGodotBundleIntegrity({
        manifest: ctx.bundle.manifest,
        expectedHash: ctx.package.integrity?.hash,
        algorithm: ctx.package.integrity?.algorithm,
      }).valid
    },
  }
}

export function createUnsupportedGodotRuntimeModuleLoader(): GodotRuntimeModuleLoader {
  return {
    loadEnginePluginModule: unsupportedRuntimeModuleLoader('engine plugin'),
    loadSceneModule: unsupportedRuntimeModuleLoader('scene'),
    loadScriptModule: unsupportedRuntimeModuleLoader('script'),
    loadStoreMigrationModule: unsupportedRuntimeModuleLoader('store migration'),
  }
}

/** Checks manifest metadata consistency only; it does not hash bytes or verify signatures. */
export function verifyGodotBundleIntegrity(input: GodotBundleIntegrityInput | GodotDynamicBundleRecord): GodotBundleIntegrityResult {
  const manifest = input.manifest
  const explicit = isIntegrityInput(input) ? input : {}
  const algorithm = explicit.algorithm
    || manifest?.runtimePackage?.integrity?.algorithm
    || 'sha256'
  if (algorithm !== 'sha256') {
    return {
      valid: false,
      algorithm,
      reason: `Unsupported Godot bundle integrity algorithm "${algorithm}".`,
    }
  }

  const expectedHash = explicit.expectedHash
    || manifest?.runtimePackage?.integrity?.hash
    || explicit.merkleRoot
  const actualHash = manifest?.merkleRoot || input.hash || explicit.merkleRoot
  if (!expectedHash) {
    return {
      valid: false,
      algorithm,
      actualHash,
      reason: 'Godot bundle integrity metadata is missing an expected hash.',
    }
  }
  if (!actualHash) {
    return {
      valid: false,
      algorithm,
      expectedHash,
      reason: 'Godot bundle integrity metadata is missing an actual bundle hash.',
    }
  }
  if (expectedHash !== actualHash) {
    return {
      valid: false,
      algorithm,
      expectedHash,
      actualHash,
      reason: 'Godot bundle integrity hash mismatch.',
    }
  }
  return {
    valid: true,
    algorithm,
    expectedHash,
    actualHash,
  }
}

function unsupportedRuntimeModuleLoader(kind: string) {
  return async (): Promise<never> => {
    throw new Error(`Godot static-only runtime does not support dynamic runtime ${kind} modules.`)
  }
}

function hasDynamicRuntimeEntrypoints(runtimePackage: GodotRuntimePackageManifest): boolean {
  return Boolean(
    runtimePackage.scripts?.length
    || runtimePackage.scenes?.length
    || runtimePackage.plugins?.length
    || runtimePackage.storeMigrations?.length,
  )
}

function isIntegrityInput(input: GodotBundleIntegrityInput | GodotDynamicBundleRecord): input is GodotBundleIntegrityInput {
  return 'expectedHash' in input || 'merkleRoot' in input || 'algorithm' in input
}
