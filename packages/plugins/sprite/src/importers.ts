import type { AssetInfo } from '@quajs/quack'
import type { Layer, PixelData } from 'ag-psd'
import type {
  SpriteSkinDefinition,
  SpriteSkinManifest,
  SpriteSkinStateDefinition,
  SpriteSkinStateName,
} from './contracts'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { initializeCanvas, readPsd } from 'ag-psd'
import sharp from 'sharp'
import {
  createSpriteManifestFromAssets,
  getSpriteManifestPath,
  getSpriteSkinManifestPath,
  isSpriteImagePath,
  isSpriteSkinStateName,
  normalizeSpritePath,
  normalizeSpriteSkinManifest,
  resolveSpriteAssetPath,
  serializeSpriteManifest,
  serializeSpriteSkinManifest,
  SPRITE_CHARACTERS_DIR,
  SPRITE_UI_SKIN_SOURCE_FILE,
  SPRITE_UI_SKINS_DIR,
} from './contracts'

interface SpriteSourceFile {
  absPath: string
  relativePath: string
}

const psdInitialized = { value: false }

function initializePsdShim(): void {
  if (psdInitialized.value) {
    return
  }

  initializeCanvas(
    (width: number, height: number) => createCanvasShim(width, height) as any,
    (width: number, height: number) => createImageDataShim(width, height) as any,
  )
  psdInitialized.value = true
}

export async function createDerivedSpriteAssets(sourceRoot: string, assets: readonly AssetInfo[]): Promise<AssetInfo[]> {
  initializePsdShim()

  const generated: AssetInfo[] = []
  const psdFiles = await findSourceFiles(sourceRoot, relativePath =>
    isCharacterSpritePsdSource(relativePath))

  for (const file of psdFiles) {
    const family = resolveCharacterPsdFamily(file.relativePath)
    if (!family) {
      continue
    }
    const sourceAssets = await createCharacterPsdAssets(sourceRoot, file, assets)
    generated.push(...sourceAssets)
  }

  const uiPsdFiles = await findSourceFiles(sourceRoot, isUiSkinPsdSource)
  for (const file of uiPsdFiles) {
    const sourceAssets = await createUiSkinPsdAssets(sourceRoot, file, [...assets, ...generated])
    generated.push(...sourceAssets)
  }

  const uiSkinFiles = await findSourceFiles(sourceRoot, isUiSkinSource)
  for (const file of uiSkinFiles) {
    const source = resolveUiSkinSource(file.relativePath)
    if (!source) {
      continue
    }

    const manifest = await createUiSkinManifest(sourceRoot, file, [...assets, ...generated], source)
    if (manifest) {
      generated.push(manifest)
    }
  }

  return generated
}

export async function createDerivedSpriteDevAssets(sourceRoot: string, records: readonly DevAssetLike[]): Promise<DevAssetLike[]> {
  const files = await createDerivedSpriteAssets(sourceRoot, records.map(record => ({
    name: record.name,
    path: record.path,
    relativePath: record.path,
    size: record.size,
    hash: record.hash,
    type: record.type as any,
    locales: [record.locale],
    mimeType: record.mimeType,
    mtime: record.mtime,
  } satisfies AssetInfo)))

  return files.map(asset => ({
    id: createDevAssetId(asset.type, asset.relativePath, asset.locales?.[0] || 'default'),
    bundleName: 'dev-vfs',
    name: asset.name,
    type: asset.type,
    locale: asset.locales?.[0] || 'default',
    path: asset.relativePath,
    hash: asset.hash,
    size: asset.size,
    version: asset.mtime ?? Date.now(),
    mtime: asset.mtime ?? Date.now(),
    mimeType: asset.mimeType || inferGeneratedMimeType(asset.relativePath),
  }))
}

export async function createCharacterPsdAssets(sourceRoot: string, file: SpriteSourceFile, existingAssets: readonly AssetInfo[]): Promise<AssetInfo[]> {
  const family = resolveCharacterPsdFamily(file.relativePath)
  if (!family) {
    return []
  }

  const buffer = await readFile(file.absPath)
  const psd = readPsd(buffer, {
    skipCompositeImageData: true,
    skipThumbnail: true,
    useImageData: true,
  })

  const exportedNodes = collectCharacterPsdExportNodes(psd.children || [])
  if (exportedNodes.length === 0) {
    return []
  }

  const generatedAssets: AssetInfo[] = []
  const existingRelativePaths = new Set(existingAssets.map(asset => normalizeSpritePath(asset.relativePath) || asset.relativePath))
  for (const node of exportedNodes) {
    const rendered = await renderPsdNode(node.node)
    if (!rendered) {
      continue
    }

    const relativePath = `${SPRITE_CHARACTERS_DIR}/${family}/${node.path}.png`.replace(/\/+/g, '/')
    if (existingRelativePaths.has(relativePath)) {
      continue
    }
    const size = rendered.byteLength
    generatedAssets.push({
      name: stripAssetTypeRoot(relativePath, 'characters'),
      path: resolve(sourceRoot, relativePath),
      relativePath,
      size,
      hash: createHash('sha256').update(rendered).digest('hex'),
      type: 'characters',
      locales: ['default'],
      mimeType: 'image/png',
      mtime: await sourceMtime(file.absPath),
      content: rendered,
    })
  }

  if (!hasPhysicalManifest(existingAssets, family)) {
    const spriteSourceAssets = [
      ...existingAssets,
      ...generatedAssets,
    ].map(asset => ({
      relativePath: asset.relativePath,
      size: asset.size,
      hash: asset.hash,
      mimeType: asset.mimeType,
      mtime: asset.mtime,
    }))
    const manifest = createSpriteManifestFromAssets(spriteSourceAssets, family)
    if (manifest) {
      const manifestContent = Buffer.from(`${serializeSpriteManifest(manifest)}\n`, 'utf8')
      const relativePath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`.replace(/\/+/g, '/')
      generatedAssets.push({
        name: getSpriteManifestPath(family),
        path: resolve(sourceRoot, relativePath),
        relativePath,
        size: manifestContent.byteLength,
        hash: createHash('sha256').update(manifestContent).digest('hex'),
        type: 'characters',
        locales: ['default'],
        mimeType: 'application/json',
        mtime: await sourceMtime(file.absPath),
        content: manifestContent,
      })
    }
  }

  return generatedAssets
}

export async function createUiSkinPsdAssets(sourceRoot: string, file: SpriteSourceFile, existingAssets: readonly AssetInfo[]): Promise<AssetInfo[]> {
  const source = resolveUiSkinPsdSource(file.relativePath)
  if (!source) {
    return []
  }

  const buffer = await readFile(file.absPath)
  const psd = readPsd(buffer, {
    skipCompositeImageData: true,
    skipThumbnail: true,
    useImageData: true,
  })

  const exportedNodes = collectUiSkinPsdExportNodes(psd.children || [])
  if (exportedNodes.length === 0) {
    return []
  }

  const generatedAssets: AssetInfo[] = []
  const existingRelativePaths = new Set(existingAssets.map(asset => normalizeSpritePath(asset.relativePath) || asset.relativePath))
  for (const node of exportedNodes) {
    const rendered = await renderPsdNode(node.node)
    if (!rendered) {
      continue
    }

    const relativePath = `${SPRITE_UI_SKINS_DIR}/${source.family}/${source.skin}/${node.path}.png`.replace(/\/+/g, '/')
    if (existingRelativePaths.has(relativePath)) {
      continue
    }

    generatedAssets.push({
      name: relativePath,
      path: resolve(sourceRoot, relativePath),
      relativePath,
      size: rendered.byteLength,
      hash: createHash('sha256').update(rendered).digest('hex'),
      type: 'images',
      locales: ['default'],
      mimeType: 'image/png',
      mtime: await sourceMtime(file.absPath),
      content: rendered,
    })
  }

  return generatedAssets
}

export async function createUiSkinManifest(
  sourceRoot: string,
  file: SpriteSourceFile,
  assets: readonly AssetInfo[],
  source = resolveUiSkinSource(file.relativePath),
): Promise<AssetInfo | undefined> {
  if (!source) {
    return undefined
  }

  const raw = await readFile(file.absPath, 'utf8')
  const parsed = JSON.parse(raw) as Partial<SpriteSkinManifest> & {
    family?: string
    skins?: Record<string, {
      base?: SpriteSkinStateDefinition | string
      states?: Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition | string>>
      slice?: SpriteSkinDefinition['slice']
      mode?: SpriteSkinDefinition['mode']
      fill?: boolean
      contentInsets?: SpriteSkinDefinition['contentInsets']
      metadata?: Readonly<Record<string, unknown>>
    }>
  }

  const normalized = normalizeUiSkinSourceManifest(parsed, source.family, assets)
  if (!normalized) {
    return undefined
  }

  const family = stripUiSkinFamily(normalized.family)
  if (hasPhysicalUiSkinManifest(assets, family)) {
    return undefined
  }

  const content = Buffer.from(`${serializeSpriteSkinManifest(normalized)}\n`, 'utf8')
  return {
    name: `${SPRITE_UI_SKINS_DIR}/${getSpriteSkinManifestPath(family)}`.replace(/\/+/g, '/'),
    path: resolve(sourceRoot, SPRITE_UI_SKINS_DIR, getSpriteSkinManifestPath(family)),
    relativePath: `${SPRITE_UI_SKINS_DIR}/${getSpriteSkinManifestPath(family)}`.replace(/\/+/g, '/'),
    size: content.byteLength,
    hash: createHash('sha256').update(content).digest('hex'),
    type: 'data',
    locales: ['default'],
    mimeType: 'application/json',
    mtime: await sourceMtime(file.absPath),
    content,
  }
}

function normalizeUiSkinSourceManifest(
  manifest: Partial<SpriteSkinManifest> & { family?: string },
  family: string,
  assets: readonly AssetInfo[],
): SpriteSkinManifest | undefined {
  const uiFamily = normalizeUiSkinFamily(manifest.family || family)
  const skins = manifest.skins || {}
  const entries: Array<readonly [string, SpriteSkinDefinition]> = []
  for (const [skinName, skin] of Object.entries(skins)) {
    const explicitBase = normalizeSkinStateDefinition(resolveSkinStateDefinition(skin.base), uiFamily)
    const inferred = inferUiSkinStateAssets(family, skinName, assets)
    const base = explicitBase || inferred.base
    if (!base) {
      continue
    }

    const resolvedStates = Object.fromEntries(
      Object.entries(skin.states || {}).flatMap(([stateName, state]) => {
        if (!isSpriteSkinStateName(stateName)) {
          return []
        }
        const resolved = normalizeSkinStateDefinition(resolveSkinStateDefinition(state), uiFamily)
        return resolved ? [[stateName, resolved]] : []
      }),
    ) as Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition>>
    const mergedStates = {
      ...inferred.states,
      ...resolvedStates,
    }
    entries.push([
      skinName,
      {
        base,
        slice: skin.slice || { top: 0, right: 0, bottom: 0, left: 0 },
        mode: skin.mode,
        fill: skin.fill,
        contentInsets: skin.contentInsets,
        states: Object.keys(mergedStates).length > 0 ? mergedStates : undefined,
        metadata: skin.metadata,
      },
    ])
  }

  if (entries.length === 0) {
    return undefined
  }

  return normalizeSpriteSkinManifest({
    version: 1,
    family: uiFamily,
    skins: Object.fromEntries(entries),
    metadata: manifest.metadata,
  })
}

function inferUiSkinStateAssets(
  family: string,
  skinName: string,
  assets: readonly AssetInfo[],
): {
  base?: SpriteSkinStateDefinition
  states?: Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition>>
} {
  const skinRoot = `${SPRITE_UI_SKINS_DIR}/${family}/${skinName}/`
  const baseCandidates = assets.filter((asset) => {
    const relativePath = normalizeSpritePath(asset.relativePath) || asset.relativePath
    if (!relativePath.startsWith(skinRoot)) {
      return false
    }
    const fileName = basename(relativePath, extname(relativePath)).toLowerCase()
    return ['base', 'default'].includes(fileName) && isSpriteImagePath(relativePath, asset.mimeType)
  })

  const baseAsset = baseCandidates[0]
  if (!baseAsset) {
    return {}
  }

  const states: Partial<Record<SpriteSkinStateName, SpriteSkinStateDefinition>> = {
    default: {
      asset: baseAsset.relativePath.replace(/\\/g, '/'),
      hash: baseAsset.hash,
      size: baseAsset.size,
      mimeType: baseAsset.mimeType,
    },
  }

  for (const asset of assets) {
    const relativePath = normalizeSpritePath(asset.relativePath) || asset.relativePath
    if (!relativePath.startsWith(skinRoot)) {
      continue
    }
    const stateName = basename(relativePath, extname(relativePath)).toLowerCase()
    if (!isSpriteSkinStateName(stateName)) {
      continue
    }
    states[stateName] = {
      asset: asset.relativePath.replace(/\\/g, '/'),
      hash: asset.hash,
      size: asset.size,
      mimeType: asset.mimeType,
    }
  }

  return {
    base: {
      asset: baseAsset.relativePath.replace(/\\/g, '/'),
      hash: baseAsset.hash,
      size: baseAsset.size,
      mimeType: baseAsset.mimeType,
    },
    states,
  }
}

function resolveSkinStateDefinition(value: SpriteSkinStateDefinition | string | undefined): SpriteSkinStateDefinition | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    return { asset: value }
  }
  return value
}

function normalizeSkinStateDefinition(definition: SpriteSkinStateDefinition | undefined, family: string): SpriteSkinStateDefinition | undefined {
  if (!definition) {
    return undefined
  }

  return {
    ...definition,
    asset: resolveSpriteAssetPath(family, definition.asset),
  }
}

function collectUiSkinPsdExportNodes(children: readonly Layer[], path: string[] = []): Array<{ path: string, node: Layer }> {
  const exported: Array<{ path: string, node: Layer }> = []
  for (const child of children) {
    if (child.hidden) {
      continue
    }

    const name = safeLayerName(child.name)
    const nextPath = name ? [...path, name] : path
    const hasNamedChildren = Boolean(child.children?.some(grand => !grand.hidden && Boolean(safeLayerName(grand.name))))

    if (name && (isSpriteSkinStateName(name) || !hasNamedChildren)) {
      exported.push({ path: nextPath.join('/'), node: child })
    }

    if (child.children?.length) {
      exported.push(...collectUiSkinPsdExportNodes(child.children, nextPath))
    }
  }
  return dedupeExportNodes(exported)
}

function collectCharacterPsdExportNodes(children: readonly Layer[], path: string[] = []): Array<{ path: string, node: Layer }> {
  const exported: Array<{ path: string, node: Layer }> = []
  for (const child of children) {
    if (child.hidden) {
      continue
    }

    const name = safeLayerName(child.name)
    const nextPath = name ? [...path, name] : path
    const hasNamedChildren = Boolean(child.children?.some(grand => !grand.hidden && Boolean(safeLayerName(grand.name))))

    if (name && (isCharacterSpriteOutputName(name) || !hasNamedChildren)) {
      const exportPath = nextPath.join('/')
      exported.push({ path: exportPath, node: child })
    }

    if (child.children?.length) {
      exported.push(...collectCharacterPsdExportNodes(child.children, nextPath))
    }
  }
  return dedupeExportNodes(exported)
}

function dedupeExportNodes(nodes: Array<{ path: string, node: Layer }>): Array<{ path: string, node: Layer }> {
  const map = new Map<string, { path: string, node: Layer }>()
  for (const node of nodes) {
    map.set(node.path, node)
  }
  return [...map.values()]
}

async function renderPsdNode(node: Layer, inheritedOpacity = 1): Promise<Buffer | undefined> {
  const measured = measurePsdNode(node)
  if (!measured) {
    return undefined
  }

  const opacity = inheritedOpacity * normalizeOpacity(node.opacity)
  const overlayBuffers: sharp.OverlayOptions[] = []

  if (node.children?.length) {
    for (const child of node.children) {
      if (child.hidden) {
        continue
      }
      const childBuffer = await renderPsdNode(child, opacity)
      const childBounds = measurePsdNode(child)
      if (!childBuffer || !childBounds) {
        continue
      }
      overlayBuffers.push({
        input: childBuffer,
        left: Math.max(0, Math.round((child.left || 0) - measured.left)),
        top: Math.max(0, Math.round((child.top || 0) - measured.top)),
        blend: mapBlendMode(child.blendMode),
      })
    }
  }
  else if (node.imageData) {
    const leaf = await imageDataToPng(node.imageData, node.mask?.imageData, opacity)
    if (!leaf) {
      return undefined
    }
    overlayBuffers.push({
      input: leaf,
      left: Math.max(0, Math.round((node.left || 0) - measured.left)),
      top: Math.max(0, Math.round((node.top || 0) - measured.top)),
      blend: mapBlendMode(node.blendMode),
    })
  }

  if (overlayBuffers.length === 0) {
    return undefined
  }

  const canvas = sharp({
    create: {
      width: measured.width,
      height: measured.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(overlayBuffers)

  return await canvas.png().toBuffer()
}

function measurePsdNode(node: Layer): { left: number, top: number, width: number, height: number } | undefined {
  const children = node.children?.filter(child => !child.hidden) || []
  const bounds: Array<{ left: number, top: number, right: number, bottom: number }> = []

  if (node.imageData && node.left !== undefined && node.top !== undefined) {
    bounds.push({
      left: node.left,
      top: node.top,
      right: node.left + node.imageData.width,
      bottom: node.top + node.imageData.height,
    })
  }

  for (const child of children) {
    const childBounds = measurePsdNode(child)
    if (childBounds) {
      bounds.push({
        left: (child.left || 0),
        top: (child.top || 0),
        right: (child.left || 0) + childBounds.width,
        bottom: (child.top || 0) + childBounds.height,
      })
    }
  }

  if (bounds.length === 0) {
    return undefined
  }

  const left = Math.floor(Math.min(...bounds.map(bound => bound.left)))
  const top = Math.floor(Math.min(...bounds.map(bound => bound.top)))
  const right = Math.ceil(Math.max(...bounds.map(bound => bound.right)))
  const bottom = Math.ceil(Math.max(...bounds.map(bound => bound.bottom)))

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

async function imageDataToPng(imageData: PixelData, maskImageData: PixelData | undefined, opacity: number): Promise<Buffer> {
  const data = new Uint8ClampedArray(imageData.data)
  if (maskImageData && maskImageData.width === imageData.width && maskImageData.height === imageData.height) {
    applyMask(data, maskImageData.data)
  }

  if (opacity !== 1) {
    for (let index = 3; index < data.length; index += 4) {
      data[index] = Math.max(0, Math.min(255, Math.round(data[index] * opacity)))
    }
  }

  return await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: {
      width: imageData.width,
      height: imageData.height,
      channels: 4,
    },
  }).png().toBuffer()
}

function applyMask(imageData: Uint8ClampedArray, maskData: PixelData['data']): void {
  for (let index = 0; index < imageData.length; index += 4) {
    const maskIndex = index
    const maskAlpha = maskData[maskIndex] ?? 255
    imageData[index + 3] = Math.round(imageData[index + 3] * (maskAlpha / 255))
  }
}

function mapBlendMode(blendMode: Layer['blendMode']): sharp.Blend {
  switch (blendMode) {
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'darken':
      return 'darken'
    case 'lighten':
      return 'lighten'
    case 'difference':
      return 'difference'
    case 'exclusion':
      return 'exclusion'
    case 'soft light':
      return 'soft-light'
    case 'hard light':
      return 'hard-light'
    default:
      return 'over'
  }
}

function normalizeOpacity(value: number | undefined): number {
  if (value === undefined) {
    return 1
  }
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
}

function safeLayerName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined
  }
  const normalized = normalizeSpritePath(name) || name
  return normalized.replace(/[^\w/-]/g, '-').trim().replace(/\/+/g, '/')
}

function isCharacterSpriteOutputName(name: string): boolean {
  return ['base', 'sprite', 'default'].includes(name.toLowerCase())
}

function hasPhysicalManifest(assets: readonly AssetInfo[], family: string): boolean {
  const manifestRelativePath = `${SPRITE_CHARACTERS_DIR}/${getSpriteManifestPath(family)}`
  return assets.some(asset => normalizeSpritePath(asset.relativePath) === manifestRelativePath)
}

function hasPhysicalUiSkinManifest(assets: readonly AssetInfo[], family: string): boolean {
  const manifestRelativePath = `${SPRITE_UI_SKINS_DIR}/${getSpriteSkinManifestPath(family)}`
  return assets.some(asset => normalizeSpritePath(asset.relativePath) === manifestRelativePath)
}

function resolveCharacterPsdFamily(relativePath: string): string | undefined {
  const normalized = normalizeSpritePath(relativePath)
  if (!normalized) {
    return undefined
  }
  const segments = normalized.split('/').filter(Boolean)
  const charactersIndex = segments.indexOf(SPRITE_CHARACTERS_DIR)
  if (charactersIndex < 0 || charactersIndex + 1 >= segments.length) {
    return undefined
  }
  return segments.slice(charactersIndex + 1, -1).join('/') || basename(segments[segments.length - 1], extname(segments[segments.length - 1]))
}

interface UiSkinSourcePath {
  family: string
  skin?: string
}

function resolveUiSkinSource(relativePath: string): UiSkinSourcePath | undefined {
  const normalized = normalizeSpritePath(relativePath)
  if (!normalized) {
    return undefined
  }
  const segments = normalized.split('/').filter(Boolean)
  const uiIndex = segments.indexOf(SPRITE_UI_SKINS_DIR)
  if (uiIndex < 0 || uiIndex + 1 >= segments.length) {
    return undefined
  }

  const tail = segments.slice(uiIndex + 1, -1)
  if (tail.length === 0) {
    return undefined
  }
  if (tail.length === 1) {
    return { family: tail[0] }
  }

  return {
    family: tail.slice(0, -1).join('/'),
    skin: tail[tail.length - 1],
  }
}

function resolveUiSkinPsdSource(relativePath: string): { family: string, skin: string } | undefined {
  const normalized = normalizeSpritePath(relativePath)
  if (!normalized) {
    return undefined
  }

  const segments = normalized.split('/').filter(Boolean)
  const uiIndex = segments.indexOf(SPRITE_UI_SKINS_DIR)
  const extension = extname(segments[segments.length - 1] || '').toLowerCase()
  if (uiIndex < 0 || !['.psd', '.psb'].includes(extension)) {
    return undefined
  }

  const tail = segments.slice(uiIndex + 1)
  if (tail.length < 2) {
    return undefined
  }

  const fileBase = basename(tail[tail.length - 1], extension)
  const sourceNames = new Set(['source', 'skin', 'sprite', 'states'])
  if (sourceNames.has(fileBase.toLowerCase()) && tail.length >= 3) {
    return {
      family: tail.slice(0, -2).join('/'),
      skin: tail[tail.length - 2],
    }
  }

  return {
    family: tail.slice(0, -1).join('/'),
    skin: fileBase,
  }
}

function isCharacterSpritePsdSource(relativePath: string): boolean {
  const normalized = normalizeSpritePath(relativePath) || relativePath
  return normalized.startsWith(`${SPRITE_CHARACTERS_DIR}/`) && ['.psd', '.psb'].includes(extname(normalized).toLowerCase())
}

function isUiSkinSource(relativePath: string): boolean {
  const normalized = normalizeSpritePath(relativePath) || relativePath
  return normalized.startsWith(`${SPRITE_UI_SKINS_DIR}/`) && basename(normalized) === SPRITE_UI_SKIN_SOURCE_FILE
}

function isUiSkinPsdSource(relativePath: string): boolean {
  const normalized = normalizeSpritePath(relativePath) || relativePath
  return normalized.startsWith(`${SPRITE_UI_SKINS_DIR}/`) && ['.psd', '.psb'].includes(extname(normalized).toLowerCase())
}

function normalizeUiSkinFamily(family: string): string {
  const normalized = normalizeSpritePath(family) || family
  return normalized.startsWith(`${SPRITE_UI_SKINS_DIR}/`) ? normalized : `${SPRITE_UI_SKINS_DIR}/${normalized}`
}

function stripUiSkinFamily(family: string): string {
  const normalized = normalizeSpritePath(family) || family
  return normalized.startsWith(`${SPRITE_UI_SKINS_DIR}/`)
    ? normalized.slice(SPRITE_UI_SKINS_DIR.length + 1)
    : normalized
}

function stripAssetTypeRoot(relativePath: string, type: string): string {
  const normalized = normalizeSpritePath(relativePath) || relativePath
  return normalized.startsWith(`${type}/`) ? normalized.slice(type.length + 1) : normalized
}

async function findSourceFiles(sourceRoot: string, predicate: (relativePath: string) => boolean): Promise<SpriteSourceFile[]> {
  const files = await walkFiles(sourceRoot)
  return files
    .filter(file => predicate(file.relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

async function walkFiles(root: string, base = root): Promise<SpriteSourceFile[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: SpriteSourceFile[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }
    const absPath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absPath, base))
    }
    else if (entry.isFile()) {
      files.push({
        absPath,
        relativePath: relative(base, absPath).replace(/\\/g, '/'),
      })
    }
  }
  return files
}

async function sourceMtime(path: string): Promise<number> {
  const stat = await import('node:fs/promises').then(m => m.stat(path))
  return stat.mtimeMs
}

interface CanvasShim {
  width: number
  height: number
  getContext: (kind: string) => CanvasContextShim | null
}

interface CanvasContextShim {
  createImageData: (nextWidth: number, nextHeight: number) => ImageDataShim
  putImageData: () => void
}

interface ImageDataShim {
  width: number
  height: number
  data: Uint8ClampedArray
}

function createCanvasShim(width: number, height: number): CanvasShim {
  const context = {
    createImageData: (nextWidth: number, nextHeight: number) => createImageDataShim(nextWidth, nextHeight),
    putImageData: () => {},
  }

  return {
    width,
    height,
    getContext: (kind: string) => kind === '2d' ? context : null,
  }
}

function createImageDataShim(width: number, height: number): ImageDataShim {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }
}

function createDevAssetId(type: string, name: string, locale: string): string {
  return `dev-vfs:${locale}:${type}:${name}`
}

function inferGeneratedMimeType(relativePath: string): string {
  return relativePath.toLowerCase().endsWith('.json') ? 'application/json' : 'image/png'
}

interface DevAssetLike {
  id: string
  bundleName: string
  name: string
  type: string
  locale: string
  path: string
  hash: string
  size: number
  version: number
  mtime: number
  mimeType?: string
}
