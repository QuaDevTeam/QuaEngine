export interface CocosRuntimePackageManifest {
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

export interface CocosBundleManifest {
  merkleRoot?: string
  runtimePackage?: CocosRuntimePackageManifest
}

export interface CocosDynamicBundleRecord {
  manifest: CocosBundleManifest
  hash?: string
}

export interface CocosRuntimePackageTrustContext {
  package: CocosRuntimePackageManifest
  bundle: CocosDynamicBundleRecord
}

export interface CocosRuntimeTrustPolicy {
  requireSignature?: boolean
  allowUnsignedInDevelopment?: boolean
  verifyPackage?: (ctx: CocosRuntimePackageTrustContext) => boolean | Promise<boolean>
}

export interface CocosRuntimeModuleLoader {
  loadScriptModule?: (...args: unknown[]) => Promise<never>
  loadSceneModule?: (...args: unknown[]) => Promise<never>
  loadEnginePluginModule?: (...args: unknown[]) => Promise<never>
  loadStoreMigrationModule?: (...args: unknown[]) => Promise<never>
}

export interface CocosBundleIntegrityInput {
  manifest?: CocosBundleManifest
  merkleRoot?: string
  hash?: string
  expectedHash?: string
  algorithm?: string
}

export interface CocosBundleIntegrityResult {
  valid: boolean
  algorithm: string
  expectedHash?: string
  actualHash?: string
  reason?: string
}

export interface CocosStaticOnlyTrustPolicyOptions {
  requireIntegrity?: boolean
  allowStaticRuntimePackages?: boolean
}

export function createCocosStaticOnlyTrustPolicy(
  options: CocosStaticOnlyTrustPolicyOptions = {},
): CocosRuntimeTrustPolicy {
  const requireIntegrity = options.requireIntegrity !== false
  const allowStaticRuntimePackages = options.allowStaticRuntimePackages === true
  return {
    requireSignature: false,
    allowUnsignedInDevelopment: false,
    verifyPackage(ctx: CocosRuntimePackageTrustContext): boolean {
      if (!allowStaticRuntimePackages) {
        return false
      }
      if (hasDynamicRuntimeEntrypoints(ctx.package)) {
        return false
      }
      if (!requireIntegrity) {
        return true
      }
      return verifyCocosBundleIntegrity({
        manifest: ctx.bundle.manifest,
        expectedHash: ctx.package.integrity?.hash,
        algorithm: ctx.package.integrity?.algorithm,
      }).valid
    },
  }
}

export function createUnsupportedCocosRuntimeModuleLoader(): CocosRuntimeModuleLoader {
  return {
    loadEnginePluginModule: unsupportedRuntimeModuleLoader('engine plugin'),
    loadSceneModule: unsupportedRuntimeModuleLoader('scene'),
    loadScriptModule: unsupportedRuntimeModuleLoader('script'),
    loadStoreMigrationModule: unsupportedRuntimeModuleLoader('store migration'),
  }
}

export function verifyCocosBundleIntegrity(input: CocosBundleIntegrityInput | CocosDynamicBundleRecord): CocosBundleIntegrityResult {
  const manifest = input.manifest
  const explicit = isIntegrityInput(input) ? input : {}
  const algorithm = explicit.algorithm
    || manifest?.runtimePackage?.integrity?.algorithm
    || 'sha256'
  if (algorithm !== 'sha256') {
    return {
      valid: false,
      algorithm,
      reason: `Unsupported Cocos bundle integrity algorithm "${algorithm}".`,
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
      reason: 'Cocos bundle integrity metadata is missing an expected hash.',
    }
  }
  if (!actualHash) {
    return {
      valid: false,
      algorithm,
      expectedHash,
      reason: 'Cocos bundle integrity metadata is missing an actual bundle hash.',
    }
  }
  if (expectedHash !== actualHash) {
    return {
      valid: false,
      algorithm,
      expectedHash,
      actualHash,
      reason: 'Cocos bundle integrity hash mismatch.',
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
    throw new Error(`Cocos static-only runtime does not support dynamic runtime ${kind} modules.`)
  }
}

function hasDynamicRuntimeEntrypoints(runtimePackage: CocosRuntimePackageManifest): boolean {
  return Boolean(
    runtimePackage.scripts?.length
    || runtimePackage.scenes?.length
    || runtimePackage.plugins?.length
    || runtimePackage.storeMigrations?.length,
  )
}

function isIntegrityInput(input: CocosBundleIntegrityInput | CocosDynamicBundleRecord): input is CocosBundleIntegrityInput {
  return 'expectedHash' in input || 'merkleRoot' in input || 'algorithm' in input
}
