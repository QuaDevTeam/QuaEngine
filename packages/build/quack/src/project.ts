import type {
  AssetBundleTarget,
  CocosAssetTargetMetadata,
  CocosBuildPlatform,
} from './core/types'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

export const QUA_PROJECT_CONFIG_CANDIDATES = [
  'qua.project.yaml',
  'qua.project.yml',
  'qua.project.json',
] as const

export type QuaProjectConfigFileName = typeof QUA_PROJECT_CONFIG_CANDIDATES[number]
export type QuaProjectDeviceClass = 'desktop' | 'pad' | 'phone'
export type QuaProjectLayoutInput = 'landscape' | 'portrait' | (Record<string, unknown> & { preset?: 'landscape' | 'portrait' })
export type QuaProjectWebServiceWorkerMode = 'generated' | 'none' | (string & {})
export type QuaProjectNativePlatform = 'macos' | 'windows' | 'linux'
export type QuaProjectNativeProfile = 'debug' | 'release'

export interface QuaProjectHomeConfig {
  title?: string
  shortName?: string
  description?: string
  lang?: string
  themeColor?: string
  backgroundColor?: string
  startUrl?: string
  scope?: string
}

export interface QuaProjectIconConfig {
  source?: string
  favicon?: string
  web?: Record<string, unknown>
  pwa?: QuaProjectManifestIconInput[]
  cocos?: unknown
}

export interface QuaProjectManifestIconInput {
  src?: string
  sizes?: string
  type?: string
  purpose?: 'any' | 'maskable' | 'monochrome' | (string & {})
}

export interface QuaProjectWebTargetConfig {
  enabled?: boolean
  layout?: QuaProjectLayoutInput
  devices?: Partial<Record<QuaProjectDeviceClass, boolean>>
  pwa?: {
    enabled?: boolean
    serviceWorker?: QuaProjectWebServiceWorkerMode
    display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'
    orientation?: 'any' | 'natural' | 'landscape' | 'portrait' | (string & {})
    id?: string
    icons?: QuaProjectManifestIconInput[]
  }
  blockUi?: {
    title?: string
    message?: string
  }
  assetTarget?: AssetBundleTarget
  build?: Record<string, unknown>
}

export interface QuaProjectCocosTargetConfig {
  enabled?: boolean
  projectDir?: string
  creatorVersion?: string
  platforms?: CocosBuildPlatform[]
  layout?: QuaProjectLayoutInput
  orientation?: 'landscape' | 'portrait' | 'auto' | (string & {})
  assetTarget?: AssetBundleTarget | CocosAssetTargetMetadata
  buildOptions?: Record<string, unknown>
  icons?: unknown
}

export interface QuaProjectNativeTargetConfig {
  enabled?: boolean
  platforms?: QuaProjectNativePlatform[]
  profiles?: QuaProjectNativeProfile[]
  layout?: QuaProjectLayoutInput
  outputDir?: string
  app?: {
    bundleId?: string
    version?: string
    buildNumber?: string
    icon?: string
  }
  assetTarget?: AssetBundleTarget
  build?: Record<string, unknown>
}

export interface QuaProjectTargetsConfig {
  web?: false | QuaProjectWebTargetConfig
  cocos?: false | QuaProjectCocosTargetConfig
  native?: false | QuaProjectNativeTargetConfig
}

export interface QuaProjectConfigV1 {
  schemaVersion: 1
  name: string
  bundleId: string
  version?: string
  home?: QuaProjectHomeConfig
  icons?: QuaProjectIconConfig
  targets?: QuaProjectTargetsConfig
}

export interface NormalizedQuaProjectWebTarget {
  enabled: boolean
  layout: QuaProjectLayoutInput
  devices: Record<QuaProjectDeviceClass, boolean>
  pwa: {
    enabled: boolean
    serviceWorker: QuaProjectWebServiceWorkerMode
    display: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'
    orientation?: string
    id?: string
    icons: QuaProjectManifestIconInput[]
  }
  blockUi: {
    title: string
    message: string
  }
  assetTarget?: AssetBundleTarget
  build?: Record<string, unknown>
}

export interface NormalizedQuaProjectCocosTarget {
  enabled: boolean
  projectDir: string
  creatorVersion?: string
  platforms: CocosBuildPlatform[]
  layout: QuaProjectLayoutInput
  orientation: string
  assetTarget?: AssetBundleTarget | CocosAssetTargetMetadata
  buildOptions: Record<string, unknown>
  icons?: unknown
}

export interface NormalizedQuaProjectNativeTarget {
  enabled: boolean
  platforms: QuaProjectNativePlatform[]
  profiles: QuaProjectNativeProfile[]
  layout: QuaProjectLayoutInput
  outputDir: string
  app: {
    bundleId: string
    version: string
    buildNumber: string
    icon?: string
  }
  assetTarget?: AssetBundleTarget
  build: Record<string, unknown>
}

export interface NormalizedQuaProjectConfig {
  schemaVersion: 1
  name: string
  bundleId: string
  version: string
  home: Required<QuaProjectHomeConfig>
  icons: QuaProjectIconConfig
  targets: {
    web: NormalizedQuaProjectWebTarget
    cocos?: NormalizedQuaProjectCocosTarget
    native?: NormalizedQuaProjectNativeTarget
  }
}

export interface LoadQuaProjectConfigOptions {
  configPath?: string
  cwd?: string
  validateAssets?: boolean
}

export interface NormalizeQuaProjectConfigOptions {
  cwd?: string
  packageVersion?: string
}

export interface QuaProjectWebRuntimeConfig {
  enabled: boolean
  layout: QuaProjectLayoutInput
  devices: Record<QuaProjectDeviceClass, boolean>
  pwa: {
    enabled: boolean
    serviceWorkerUrl?: string
  }
  blockUi: {
    title: string
    message: string
  }
}

export interface QuaProjectWebAsset {
  external?: boolean
  fileName: string
  sourcePath: string
  manifestIcon?: {
    src: string
    sizes: string
    type: string
    purpose?: string
  }
}

export interface SyncQuaProjectCocosOptions {
  cwd?: string
  platform?: CocosBuildPlatform
}

export interface SyncedQuaProjectCocosBuildConfig {
  filePath: string
  platform: CocosBuildPlatform
  config: Record<string, unknown>
}

export interface SyncQuaProjectCocosResult {
  files: string[]
  buildConfigs: SyncedQuaProjectCocosBuildConfig[]
}

export type QuaProjectDoctorSeverity = 'info' | 'warning' | 'error'
export type QuaProjectDoctorTarget = 'project' | 'web' | 'pwa' | 'cocos' | 'native'

export interface QuaProjectDoctorIssue {
  id: string
  severity: QuaProjectDoctorSeverity
  target: QuaProjectDoctorTarget
  message: string
  filePath?: string
  detail?: Record<string, unknown>
}

export interface DoctorQuaProjectConfigOptions {
  cwd?: string
}

export interface QuaProjectDoctorResult {
  ok: boolean
  project: Pick<NormalizedQuaProjectConfig, 'name' | 'bundleId' | 'version'>
  issues: QuaProjectDoctorIssue[]
}

export async function findQuaProjectConfigFile(options: LoadQuaProjectConfigOptions = {}): Promise<string | undefined> {
  const cwd = resolve(options.cwd || process.cwd())
  if (options.configPath) {
    return resolve(cwd, options.configPath)
  }

  const matches: string[] = []
  for (const candidate of QUA_PROJECT_CONFIG_CANDIDATES) {
    const filePath = resolve(cwd, candidate)
    if (await exists(filePath)) {
      matches.push(filePath)
    }
  }
  if (matches.length > 1) {
    throw new Error(`Multiple Qua project config files found: ${matches.map(path => relative(cwd, path)).join(', ')}. Pass an explicit config path.`)
  }
  return matches[0]
}

export async function loadQuaProjectConfig(options: LoadQuaProjectConfigOptions = {}): Promise<NormalizedQuaProjectConfig> {
  const cwd = resolve(options.cwd || process.cwd())
  const configPath = await findQuaProjectConfigFile(options)
  if (!configPath) {
    throw new Error(`No Qua project config file found. Expected one of: ${QUA_PROJECT_CONFIG_CANDIDATES.join(', ')}`)
  }

  const source = await readFile(configPath, 'utf8')
  const raw = parseQuaProjectConfigSource(source, configPath)
  const configRoot = dirname(configPath) || cwd
  const project = normalizeQuaProjectConfig(raw, {
    cwd: configRoot,
    packageVersion: await readPackageVersion(configRoot),
  })
  if (options.validateAssets !== false) {
    await assertQuaProjectIconSources(project, configRoot)
  }
  return project
}

export async function tryLoadQuaProjectConfig(options: LoadQuaProjectConfigOptions = {}): Promise<NormalizedQuaProjectConfig | undefined> {
  const configPath = await findQuaProjectConfigFile(options)
  if (!configPath) {
    return undefined
  }
  return loadQuaProjectConfig({ ...options, configPath })
}

export function validateQuaProjectConfig(input: unknown, options: NormalizeQuaProjectConfigOptions = {}): string[] {
  try {
    normalizeQuaProjectConfig(input, options)
    return []
  }
  catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }
}

export function normalizeQuaProjectConfig(input: unknown, options: NormalizeQuaProjectConfigOptions = {}): NormalizedQuaProjectConfig {
  const issues: string[] = []
  const root = asRecord(input)
  if (!root) {
    throw new Error('Qua project config must be an object.')
  }
  if (root.schemaVersion !== 1) {
    issues.push('Qua project config must declare schemaVersion: 1.')
  }
  const name = requiredString(root, 'name', issues)
  const bundleId = requiredString(root, 'bundleId', issues)
  if (bundleId && !/^[A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+$/i.test(bundleId)) {
    issues.push(`Invalid bundleId "${bundleId}". Expected a reverse-DNS identifier such as com.example.game.`)
  }

  const version = stringValue(root.version) || options.packageVersion || '0.1.0'
  const homeInput = asRecord(root.home) || {}
  const home = {
    title: stringValue(homeInput.title) || name || 'Qua Game',
    shortName: stringValue(homeInput.shortName) || stringValue(homeInput.title) || name || 'Qua Game',
    description: stringValue(homeInput.description) || '',
    lang: stringValue(homeInput.lang) || 'en-US',
    themeColor: stringValue(homeInput.themeColor) || '#111111',
    backgroundColor: stringValue(homeInput.backgroundColor) || '#000000',
    startUrl: stringValue(homeInput.startUrl) || '/',
    scope: stringValue(homeInput.scope) || '/',
  }
  const icons = normalizeIcons(root.icons)
  const targetsInput = asRecord(root.targets) || {}
  const web = normalizeWebTarget(targetsInput.web, issues)
  const cocos = normalizeCocosTarget(targetsInput.cocos, issues)
  const native = normalizeNativeTarget(targetsInput.native, {
    bundleId,
    issues,
    projectVersion: version,
  })
  validateIconReferences(icons, web, issues)

  if (issues.length > 0) {
    throw new Error(issues.join('\n'))
  }

  return {
    schemaVersion: 1,
    name: name!,
    bundleId: bundleId!,
    version,
    home,
    icons,
    targets: {
      web,
      ...(cocos ? { cocos } : {}),
      ...(native ? { native } : {}),
    },
  }
}

export function createQuaProjectWebRuntimeConfig(project: NormalizedQuaProjectConfig): QuaProjectWebRuntimeConfig {
  return {
    enabled: project.targets.web.enabled,
    layout: project.targets.web.layout,
    devices: { ...project.targets.web.devices },
    pwa: {
      enabled: project.targets.web.pwa.enabled,
      serviceWorkerUrl: project.targets.web.pwa.enabled && project.targets.web.pwa.serviceWorker !== 'none'
        ? typeof project.targets.web.pwa.serviceWorker === 'string' && project.targets.web.pwa.serviceWorker !== 'generated'
          ? project.targets.web.pwa.serviceWorker
          : '/qua-service-worker.js'
        : undefined,
    },
    blockUi: { ...project.targets.web.blockUi },
  }
}

export function createQuaProjectWebManifest(project: NormalizedQuaProjectConfig): Record<string, unknown> | undefined {
  const web = project.targets.web
  if (!web.enabled || !web.pwa.enabled) {
    return undefined
  }
  const icons = createQuaProjectWebAssets(project, 'pwa')
    .map(asset => asset.manifestIcon)
    .filter((icon): icon is NonNullable<QuaProjectWebAsset['manifestIcon']> => Boolean(icon))

  return {
    id: web.pwa.id || project.home.scope || project.home.startUrl,
    name: project.home.title,
    short_name: project.home.shortName,
    description: project.home.description,
    lang: project.home.lang,
    start_url: project.home.startUrl,
    scope: project.home.scope,
    display: web.pwa.display,
    orientation: web.pwa.orientation || orientationFromLayout(web.layout),
    theme_color: project.home.themeColor,
    background_color: project.home.backgroundColor,
    icons,
  }
}

export function createQuaProjectWebAssets(
  project: NormalizedQuaProjectConfig,
  mode: 'favicon' | 'pwa',
): QuaProjectWebAsset[] {
  if (mode === 'favicon') {
    const source = project.icons.favicon || project.icons.source
    return source
      ? [{
          external: isExternalAssetPath(source),
          sourcePath: source,
          fileName: `assets/${basename(source)}`,
        }]
      : []
  }

  const icons = project.targets.web.pwa.icons.length > 0
    ? project.targets.web.pwa.icons
    : project.icons.pwa && project.icons.pwa.length > 0
      ? project.icons.pwa
      : [
          { src: project.icons.source, sizes: '192x192', purpose: 'any' },
          { src: project.icons.source, sizes: '512x512', purpose: 'any' },
          { src: project.icons.source, sizes: '192x192', purpose: 'maskable' },
          { src: project.icons.source, sizes: '512x512', purpose: 'maskable' },
        ]

  return icons
    .filter(icon => Boolean(icon.src))
    .map((icon, index) => {
      const sizes = icon.sizes || (index % 2 === 0 ? '192x192' : '512x512')
      const purpose = icon.purpose || 'any'
      const sourcePath = icon.src!
      const external = isExternalAssetPath(sourcePath)
      const extension = extensionFromAssetSource(sourcePath) || '.png'
      const fileName = `icons/icon-${sizes.replace(/[^0-9x]/g, '')}-${purpose.replace(/[^a-z0-9-]/gi, '-')}${extension}`
      return {
        external,
        sourcePath,
        fileName,
        manifestIcon: {
          src: external ? sourcePath : `/${fileName}`,
          sizes,
          type: icon.type || mimeTypeFromAssetSource(sourcePath, extension),
          purpose,
        },
      }
    })
}

export function createQuaProjectAssetTargets(project: NormalizedQuaProjectConfig): AssetBundleTarget[] {
  const targets: AssetBundleTarget[] = []
  const web = project.targets.web
  if (web.enabled) {
    targets.push({
      name: web.assetTarget?.name || 'web',
      platform: web.assetTarget?.platform || 'web',
      suffix: web.assetTarget?.suffix || 'web',
      ...(web.assetTarget || {}),
    })
  }

  const cocos = project.targets.cocos
  if (cocos?.enabled) {
    const configured = normalizeCocosAssetTarget(cocos.assetTarget)
    const source = asRecord(cocos.assetTarget)
    const configuredName = stringValue(source?.name)
    const configuredSuffix = stringValue(source?.suffix)
    const hasMultiplePlatforms = cocos.platforms.length > 1
    for (const platform of cocos.platforms) {
      const name = configuredName
        ? hasMultiplePlatforms ? `${configuredName}-${platform}` : configuredName
        : `cocos-${platform}`
      const suffix = configuredSuffix
        ? hasMultiplePlatforms ? `${configuredSuffix}-${platform}` : configuredSuffix
        : name
      targets.push({
        ...configured,
        name,
        platform: 'cocos',
        suffix,
        cocos: {
          ...(configured.cocos || {}),
          creatorVersion: cocos.creatorVersion || configured.cocos?.creatorVersion,
          buildPlatforms: [platform],
        },
      })
    }
  }
  const native = project.targets.native
  if (native?.enabled) {
    const configuredName = native.assetTarget?.name
    const configuredSuffix = native.assetTarget?.suffix
    const hasMultiplePlatforms = native.platforms.length > 1
    for (const platform of native.platforms) {
      const name = configuredName
        ? hasMultiplePlatforms ? `${configuredName}-${platform}` : configuredName
        : `native-${platform}`
      const suffix = configuredSuffix
        ? hasMultiplePlatforms ? `${configuredSuffix}-${platform}` : configuredSuffix
        : name
      targets.push({
        ...(native.assetTarget || {}),
        name,
        platform: native.assetTarget?.platform || 'native',
        suffix,
      })
    }
  }
  return targets
}

export function mergeQuaProjectAssetTargets(
  bundleTargets: readonly AssetBundleTarget[] | undefined,
  projectTargets: readonly AssetBundleTarget[],
): AssetBundleTarget[] {
  const merged = new Map<string, AssetBundleTarget>()
  for (const target of bundleTargets || []) {
    merged.set(target.name, cloneJson(target))
  }
  for (const target of projectTargets) {
    const existing = merged.get(target.name)
    merged.set(target.name, existing ? mergeAssetTarget(existing, target) : cloneJson(target))
  }
  return [...merged.values()]
}

export async function syncQuaProjectCocos(
  project: NormalizedQuaProjectConfig,
  options: SyncQuaProjectCocosOptions = {},
): Promise<SyncQuaProjectCocosResult> {
  const cocos = project.targets.cocos
  if (!cocos?.enabled) {
    return { files: [], buildConfigs: [] }
  }

  const cwd = resolve(options.cwd || process.cwd())
  const projectDir = resolve(cwd, cocos.projectDir)
  const platforms = options.platform ? [options.platform] : cocos.platforms
  const files: string[] = []
  const buildConfigs: SyncedQuaProjectCocosBuildConfig[] = []

  await mkdir(projectDir, { recursive: true })
  const iconInput = cocos.icons ?? project.icons.cocos ?? (project.icons.source ? { default: project.icons.source } : undefined)
  const syncedIcons = await syncCocosIconValue(iconInput, {
    cwd,
    files,
    projectDir,
  })

  const configDir = join(projectDir, 'qua-build')
  await mkdir(configDir, { recursive: true })
  for (const platform of platforms) {
    const buildOptions = cloneJson(cocos.buildOptions || {})
    const packages = asRecord(buildOptions.packages) || {}
    const native = asRecord(packages.native) || {}
    const config = {
      ...buildOptions,
      name: stringValue(buildOptions.name) || project.name,
      platform,
      buildPath: stringValue(buildOptions.buildPath) || 'build',
      outputName: stringValue(buildOptions.outputName) || project.home.shortName,
      packages: {
        ...packages,
        native: {
          ...native,
          packageName: stringValue(native.packageName) || project.bundleId,
          bundleIdentifier: stringValue(native.bundleIdentifier) || project.bundleId,
          orientation: stringValue(native.orientation) || cocos.orientation,
          icons: syncedIcons,
        },
      },
    }
    const filePath = join(configDir, `${platform}.build.json`)
    await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    files.push(filePath)
    buildConfigs.push({ filePath, platform, config })
  }

  return { files, buildConfigs }
}

export async function doctorQuaProjectConfig(
  project: NormalizedQuaProjectConfig,
  options: DoctorQuaProjectConfigOptions = {},
): Promise<QuaProjectDoctorResult> {
  const cwd = resolve(options.cwd || process.cwd())
  const issues: QuaProjectDoctorIssue[] = []

  issues.push({
    id: 'project.identity',
    severity: 'info',
    target: 'project',
    message: `Project "${project.name}" uses bundleId "${project.bundleId}" and version "${project.version}".`,
  })

  await doctorWebTarget(project, cwd, issues)
  await doctorCocosTarget(project, cwd, issues)
  await doctorNativeTarget(project, cwd, issues)

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    project: {
      name: project.name,
      bundleId: project.bundleId,
      version: project.version,
    },
    issues,
  }
}

function parseQuaProjectConfigSource(source: string, configPath: string): unknown {
  if (configPath.endsWith('.json')) {
    return JSON.parse(source)
  }
  return parseYaml(source)
}

async function readPackageVersion(cwd: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8')) as { version?: unknown }
    return stringValue(pkg.version)
  }
  catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function assertQuaProjectIconSources(project: NormalizedQuaProjectConfig, cwd: string): Promise<void> {
  const missing: string[] = []
  const assets = project.targets.web.pwa.enabled
    ? createQuaProjectWebAssets(project, 'pwa')
    : createQuaProjectWebAssets(project, 'favicon')

  for (const asset of assets) {
    if (isExternalAssetPath(asset.sourcePath)) {
      continue
    }
    const sourcePath = isAbsolute(asset.sourcePath) ? asset.sourcePath : resolve(cwd, asset.sourcePath)
    if (!await exists(sourcePath)) {
      missing.push(asset.sourcePath)
    }
  }

  if (missing.length > 0) {
    throw new Error(`Qua project icon source file not found: ${[...new Set(missing)].join(', ')}`)
  }
}

async function doctorWebTarget(
  project: NormalizedQuaProjectConfig,
  cwd: string,
  issues: QuaProjectDoctorIssue[],
): Promise<void> {
  const web = project.targets.web
  if (!web.enabled) {
    issues.push({
      id: 'web.disabled',
      severity: 'info',
      target: 'web',
      message: 'Web target is disabled. Web builds should block at startup if this manifest is still bundled for Web.',
    })
    return
  }

  const enabledDevices = Object.entries(web.devices)
    .filter(([, enabled]) => enabled)
    .map(([device]) => device)
  if (enabledDevices.length === 0) {
    issues.push({
      id: 'web.devices.none',
      severity: 'error',
      target: 'web',
      message: 'Web target enables no devices. At least one of desktop, pad, or phone must be true.',
    })
  }
  else {
    issues.push({
      id: 'web.devices',
      severity: 'info',
      target: 'web',
      message: `Web target supports: ${enabledDevices.join(', ')}.`,
    })
  }

  const webAssets = createQuaProjectWebAssets(project, web.pwa.enabled ? 'pwa' : 'favicon')
  await doctorLocalAssetSources(webAssets.map(asset => asset.sourcePath), cwd, 'web', issues)

  if (web.pwa.enabled) {
    doctorPwaTarget(project, issues)
  }
}

function doctorPwaTarget(project: NormalizedQuaProjectConfig, issues: QuaProjectDoctorIssue[]): void {
  const manifest = createQuaProjectWebManifest(project)
  const icons = Array.isArray(manifest?.icons) ? manifest.icons as Array<{ purpose?: string }> : []
  const hasAny = icons.some(icon => !icon.purpose || icon.purpose.split(/\s+/).includes('any'))
  const hasMaskable = icons.some(icon => icon.purpose?.split(/\s+/).includes('maskable'))
  if (!hasAny) {
    issues.push({
      id: 'pwa.icons.any',
      severity: 'warning',
      target: 'pwa',
      message: 'PWA manifest has no icon with purpose "any". Some browsers may not install cleanly.',
    })
  }
  if (!hasMaskable) {
    issues.push({
      id: 'pwa.icons.maskable',
      severity: 'warning',
      target: 'pwa',
      message: 'PWA manifest has no maskable icon. Add a maskable icon for install surfaces.',
    })
  }
  if (project.targets.web.pwa.serviceWorker === 'none') {
    issues.push({
      id: 'pwa.service-worker.none',
      severity: 'warning',
      target: 'pwa',
      message: 'PWA is enabled but serviceWorker is "none". Offline/install behavior may be limited.',
    })
  }
  if (!isUrlLike(project.home.startUrl) && !project.home.startUrl.startsWith('/')) {
    issues.push({
      id: 'pwa.start-url.relative',
      severity: 'warning',
      target: 'pwa',
      message: 'home.startUrl should be absolute from the app scope or a full URL for Web App Manifest output.',
    })
  }
  if (!isUrlLike(project.home.scope) && !project.home.scope.startsWith('/')) {
    issues.push({
      id: 'pwa.scope.relative',
      severity: 'warning',
      target: 'pwa',
      message: 'home.scope should be absolute from the origin or a full URL for Web App Manifest output.',
    })
  }
}

async function doctorCocosTarget(
  project: NormalizedQuaProjectConfig,
  cwd: string,
  issues: QuaProjectDoctorIssue[],
): Promise<void> {
  const cocos = project.targets.cocos
  if (!cocos?.enabled) {
    issues.push({
      id: 'cocos.disabled',
      severity: 'info',
      target: 'cocos',
      message: 'Cocos target is not configured.',
    })
    return
  }

  if (cocos.platforms.length === 0) {
    issues.push({
      id: 'cocos.platforms.none',
      severity: 'error',
      target: 'cocos',
      message: 'Cocos target has no platforms.',
    })
  }
  else {
    issues.push({
      id: 'cocos.platforms',
      severity: 'info',
      target: 'cocos',
      message: `Cocos target platforms: ${cocos.platforms.join(', ')}.`,
    })
  }

  if (!await exists(resolve(cwd, cocos.projectDir))) {
    issues.push({
      id: 'cocos.project-dir.missing',
      severity: 'warning',
      target: 'cocos',
      filePath: cocos.projectDir,
      message: `Cocos project directory "${cocos.projectDir}" does not exist yet. project sync will create generated files there.`,
    })
  }

  const iconInput = cocos.icons ?? project.icons.cocos ?? (project.icons.source ? { default: project.icons.source } : undefined)
  await doctorLocalAssetSources(collectStringLeaves(iconInput), cwd, 'cocos', issues)

  const assetTarget = normalizeCocosAssetTarget(cocos.assetTarget)
  if (assetTarget.cocos?.hybrid?.enabled) {
    issues.push({
      id: 'cocos.hybrid.enabled',
      severity: 'info',
      target: 'cocos',
      message: `Cocos hybrid asset output is enabled with resourceRoot "${assetTarget.cocos.hybrid.resourceRoot || assetTarget.cocos.resourceRoot || 'assets/qua-native'}".`,
    })
  }
}

async function doctorNativeTarget(
  project: NormalizedQuaProjectConfig,
  cwd: string,
  issues: QuaProjectDoctorIssue[],
): Promise<void> {
  const native = project.targets.native
  if (!native?.enabled) {
    issues.push({
      id: 'native.disabled',
      severity: 'info',
      target: 'native',
      message: 'Native target is not configured.',
    })
    return
  }

  issues.push({
    id: 'native.platforms',
    severity: 'info',
    target: 'native',
    message: `Native target platforms: ${native.platforms.join(', ')}.`,
  })
  issues.push({
    id: 'native.profiles',
    severity: 'info',
    target: 'native',
    message: `Native target profiles: ${native.profiles.join(', ')}.`,
  })
  issues.push({
    id: 'native.output',
    severity: 'info',
    target: 'native',
    filePath: native.outputDir,
    message: `Native artifacts will be written under "${native.outputDir}" with profile and version isolation.`,
  })

  if (!native.app.bundleId || !native.app.version || !native.app.buildNumber) {
    issues.push({
      id: 'native.app.metadata',
      severity: 'error',
      target: 'native',
      message: 'Native target app metadata must include bundleId, version, and buildNumber.',
    })
  }

  const icon = native.app.icon || project.icons.source
  if (!icon) {
    issues.push({
      id: 'native.icon.missing',
      severity: 'error',
      target: 'native',
      message: 'Native target must declare targets.native.app.icon or icons.source for release packaging.',
    })
    return
  }
  await doctorLocalAssetSources([icon], cwd, 'native', issues)
}

async function doctorLocalAssetSources(
  sources: readonly string[],
  cwd: string,
  target: QuaProjectDoctorTarget,
  issues: QuaProjectDoctorIssue[],
): Promise<void> {
  for (const source of [...new Set(sources)].filter(Boolean)) {
    if (isExternalAssetPath(source)) {
      issues.push({
        id: `${target}.asset.external`,
        severity: 'info',
        target,
        filePath: source,
        message: `External asset source "${source}" will not be copied or emitted by project sync.`,
      })
      continue
    }
    const sourcePath = isAbsolute(source) ? source : resolve(cwd, source)
    if (!await exists(sourcePath)) {
      issues.push({
        id: `${target}.asset.missing`,
        severity: 'error',
        target,
        filePath: source,
        message: `Asset source file not found: ${source}`,
      })
    }
  }
}

function validateIconReferences(
  icons: QuaProjectIconConfig,
  web: NormalizedQuaProjectWebTarget,
  issues: string[],
): void {
  if (!web.enabled) {
    return
  }
  if (web.pwa.enabled) {
    const hasPwaIcon = Boolean(icons.source)
      || web.pwa.icons.some(icon => Boolean(icon.src))
      || Boolean(icons.pwa?.some(icon => Boolean(icon.src)))
    if (!hasPwaIcon) {
      issues.push('icons.source, icons.pwa, or targets.web.pwa.icons must declare at least one icon source when Web PWA is enabled.')
    }
    return
  }

  if (!icons.favicon && !icons.source) {
    issues.push('icons.favicon or icons.source must be declared when Web is enabled and PWA is disabled.')
  }
}

function normalizeIcons(value: unknown): QuaProjectIconConfig {
  const icons = asRecord(value) || {}
  return {
    source: stringValue(icons.source),
    favicon: stringValue(icons.favicon),
    web: asRecord(icons.web),
    pwa: normalizeManifestIcons(icons.pwa),
    cocos: icons.cocos,
  }
}

function normalizeWebTarget(value: unknown, _issues: string[]): NormalizedQuaProjectWebTarget {
  const record = value === false ? {} : asRecord(value) || {}
  const pwa = asRecord(record.pwa) || {}
  return {
    enabled: value === false ? false : booleanValue(record.enabled, true),
    layout: normalizeLayout(record.layout),
    devices: {
      desktop: booleanValue(asRecord(record.devices)?.desktop, true),
      pad: booleanValue(asRecord(record.devices)?.pad, true),
      phone: booleanValue(asRecord(record.devices)?.phone, true),
    },
    pwa: {
      enabled: booleanValue(pwa.enabled, false),
      serviceWorker: stringValue(pwa.serviceWorker) || 'generated',
      display: displayMode(pwa.display),
      orientation: stringValue(pwa.orientation),
      id: stringValue(pwa.id),
      icons: normalizeManifestIcons(pwa.icons),
    },
    blockUi: {
      title: stringValue(asRecord(record.blockUi)?.title) || 'Unsupported device',
      message: stringValue(asRecord(record.blockUi)?.message) || 'This game is not available on this device.',
    },
    assetTarget: asRecord(record.assetTarget) as AssetBundleTarget | undefined,
    build: asRecord(record.build),
  }
}

function normalizeCocosTarget(value: unknown, issues: string[]): NormalizedQuaProjectCocosTarget | undefined {
  if (value === false || value === undefined) {
    return undefined
  }
  const record = asRecord(value)
  if (!record || booleanValue(record.enabled, true) === false) {
    return undefined
  }
  const platforms = Array.isArray(record.platforms)
    ? record.platforms.filter((platform): platform is CocosBuildPlatform => typeof platform === 'string' && platform.length > 0)
    : []
  if (platforms.length === 0) {
    issues.push('targets.cocos.platforms must include at least one Cocos build platform when Cocos is enabled.')
  }
  const layout = normalizeLayout(record.layout)
  return {
    enabled: true,
    projectDir: stringValue(record.projectDir) || 'cocos',
    creatorVersion: stringValue(record.creatorVersion),
    platforms,
    layout,
    orientation: stringValue(record.orientation) || orientationFromLayout(layout),
    assetTarget: asRecord(record.assetTarget) as AssetBundleTarget | CocosAssetTargetMetadata | undefined,
    buildOptions: asRecord(record.buildOptions) || {},
    icons: record.icons,
  }
}

function normalizeNativeTarget(
  value: unknown,
  context: { bundleId?: string, issues: string[], projectVersion: string },
): NormalizedQuaProjectNativeTarget | undefined {
  if (value === false || value === undefined) {
    return undefined
  }
  const record = asRecord(value)
  if (!record || booleanValue(record.enabled, true) === false) {
    return undefined
  }
  const platforms = normalizeNativePlatforms(record.platforms, context.issues)
  const profiles = normalizeNativeProfiles(record.profiles, context.issues)
  const app = asRecord(record.app) || {}
  const layout = normalizeLayout(record.layout)

  return {
    enabled: true,
    platforms,
    profiles,
    layout,
    outputDir: stringValue(record.outputDir) || 'dist/native',
    app: {
      bundleId: stringValue(app.bundleId) || context.bundleId || '',
      version: stringValue(app.version) || context.projectVersion,
      buildNumber: stringValue(app.buildNumber) || '1',
      icon: stringValue(app.icon),
    },
    assetTarget: asRecord(record.assetTarget) as AssetBundleTarget | undefined,
    build: asRecord(record.build) || {},
  }
}

function normalizeNativePlatforms(value: unknown, issues: string[]): QuaProjectNativePlatform[] {
  const rawPlatforms = Array.isArray(value) ? value.filter((platform): platform is string => typeof platform === 'string') : []
  const platforms = rawPlatforms.filter((platform): platform is QuaProjectNativePlatform =>
    platform === 'macos' || platform === 'windows' || platform === 'linux')
  if (platforms.length === 0) {
    issues.push('targets.native.platforms must include at least one of macos, windows, or linux when native is enabled.')
  }
  const invalid = rawPlatforms.filter(platform => platform !== 'macos' && platform !== 'windows' && platform !== 'linux')
  if (invalid.length > 0) {
    issues.push(`targets.native.platforms contains unsupported platform(s): ${[...new Set(invalid)].join(', ')}.`)
  }
  return [...new Set(platforms)]
}

function normalizeNativeProfiles(value: unknown, issues: string[]): QuaProjectNativeProfile[] {
  const rawProfiles = value === undefined
    ? ['debug', 'release']
    : Array.isArray(value)
      ? value.filter((profile): profile is string => typeof profile === 'string')
      : []
  const profiles = value === undefined
    ? ['debug' as const, 'release' as const]
    : rawProfiles.filter((profile): profile is QuaProjectNativeProfile => profile === 'debug' || profile === 'release')
  if (profiles.length === 0) {
    issues.push('targets.native.profiles must include debug or release when native is enabled.')
  }
  const invalid = rawProfiles.filter(profile => profile !== 'debug' && profile !== 'release')
  if (invalid.length > 0) {
    issues.push(`targets.native.profiles contains unsupported profile(s): ${[...new Set(invalid)].join(', ')}.`)
  }
  return [...new Set(profiles)]
}

function normalizeManifestIcons(value: unknown): QuaProjectManifestIconInput[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((icon): icon is Record<string, unknown> => Boolean(icon)).map(icon => ({
        src: stringValue(icon.src),
        sizes: stringValue(icon.sizes),
        type: stringValue(icon.type),
        purpose: stringValue(icon.purpose),
      }))
    : []
}

function normalizeLayout(value: unknown): QuaProjectLayoutInput {
  if (value === 'portrait' || value === 'landscape') {
    return value
  }
  if (asRecord(value)) {
    return cloneJson(value) as QuaProjectLayoutInput
  }
  return 'landscape'
}

function displayMode(value: unknown): NormalizedQuaProjectWebTarget['pwa']['display'] {
  return value === 'fullscreen' || value === 'minimal-ui' || value === 'browser' ? value : 'standalone'
}

function normalizeCocosAssetTarget(value: AssetBundleTarget | CocosAssetTargetMetadata | undefined): AssetBundleTarget {
  const record = asRecord(value) || {}
  if (record.platform || record.name || record.cocos) {
    return cloneJson(record) as unknown as AssetBundleTarget
  }
  return {
    name: 'cocos',
    platform: 'cocos',
    suffix: 'cocos',
    cocos: cloneJson(record) as CocosAssetTargetMetadata,
  }
}

function mergeAssetTarget(bundleTarget: AssetBundleTarget, projectTarget: AssetBundleTarget): AssetBundleTarget {
  return {
    ...bundleTarget,
    ...projectTarget,
    pipeline: bundleTarget.pipeline || projectTarget.pipeline,
    compression: bundleTarget.compression || projectTarget.compression,
    encryption: bundleTarget.encryption || projectTarget.encryption,
    compatibility: {
      ...(bundleTarget.compatibility || {}),
      ...(projectTarget.compatibility || {}),
    },
    cocos: bundleTarget.cocos || projectTarget.cocos
      ? {
          ...(bundleTarget.cocos || {}),
          ...(projectTarget.cocos || {}),
          hybrid: {
            ...(bundleTarget.cocos?.hybrid || {}),
            ...(projectTarget.cocos?.hybrid || {}),
          },
        }
      : undefined,
  }
}

async function syncCocosIconValue(
  value: unknown,
  context: { cwd: string, files: string[], projectDir: string },
): Promise<unknown> {
  if (typeof value === 'string') {
    const sourcePath = isAbsolute(value) ? value : resolve(context.cwd, value)
    const destination = join(context.projectDir, 'assets', 'qua-app-icons', basename(value))
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(sourcePath, destination)
    context.files.push(destination)
    return relative(context.projectDir, destination).replace(/\\/g, '/')
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => syncCocosIconValue(item, context)))
  }
  const record = asRecord(value)
  if (!record) {
    return value
  }
  const entries = await Promise.all(Object.entries(record).map(async ([key, item]) => [key, await syncCocosIconValue(item, context)] as const))
  return Object.fromEntries(entries)
}

function orientationFromLayout(layout: QuaProjectLayoutInput): string {
  if (layout === 'portrait') {
    return 'portrait'
  }
  if (layout === 'landscape') {
    return 'landscape'
  }
  return layout.orientation === 'portrait' ? 'portrait' : 'landscape'
}

function mimeTypeFromExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'image/png'
  }
}

function requiredString(record: Record<string, unknown>, key: string, issues: string[]): string | undefined {
  const value = stringValue(record[key])
  if (!value) {
    issues.push(`Qua project config must declare "${key}".`)
  }
  return value
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function collectStringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringLeaves)
  }
  const record = asRecord(value)
  return record ? Object.values(record).flatMap(collectStringLeaves) : []
}

function isExternalAssetPath(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('data:')
}

function isUrlLike(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
}

function extensionFromAssetSource(source: string): string {
  if (source.startsWith('data:')) {
    return ''
  }
  if (isExternalAssetPath(source) && !source.startsWith('data:')) {
    try {
      return extname(new URL(source).pathname)
    }
    catch {
      return extname(source)
    }
  }
  return extname(source)
}

function mimeTypeFromAssetSource(source: string, extension: string): string {
  if (source.startsWith('data:')) {
    const match = /^data:([^;,]+)/i.exec(source)
    if (match?.[1]) {
      return match[1]
    }
  }
  return mimeTypeFromExtension(extension)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}
