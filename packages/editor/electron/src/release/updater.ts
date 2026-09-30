import type {
  EditorAppUpdateState,
  EditorComponentRelease,
  EditorReleaseArtifact,
  EditorReleaseChannel,
  EditorReleaseComponentId,
  EditorReleaseSnapshot,
  EditorReleaseUpdateResult,
} from '@quajs/editor-core'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  editorComponentCatalogUrl,
  editorReleaseManifestUrl,
  parseEditorComponentCatalog,
  parseEditorReleaseManifest,
} from '@quajs/editor-core'
import { gt, lt, prerelease, satisfies, valid } from 'semver'
import { fetchHttps } from '../network/fetch.js'

const exec = promisify(execFile)
const MAX_CATALOG_BYTES = 2 * 1024 * 1024
const MAX_COMPONENT_BYTES = 512 * 1024 * 1024
const MAX_EDITOR_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024

export interface EditorComponentDirectories {
  boilerplateDirectory: string
  runtimeDirectory: string
}

export interface EditorReleaseUpdate {
  id: EditorReleaseComponentId
  version: string
  directory: string
}

export interface EditorUpdateInstallRequest {
  archivePath: string
  format: EditorReleaseArtifact['format']
  installRoot: string
  executablePath: string
  sha256: string
  size: number
  version: string
  channel: EditorReleaseChannel
  platform: EditorReleaseArtifact['platform']
  arch: EditorReleaseArtifact['arch']
  signingTeamId?: string
}

interface InstalledComponent {
  id: EditorReleaseComponentId
  version: string
  editorRange: string
}

interface EditorReleaseManagerOptions {
  profileDirectory: string
  embeddedDirectory: string
  channel: EditorReleaseChannel
  editorVersion: string
  signingTeamId?: string
  platform?: EditorReleaseArtifact['platform']
  arch?: EditorReleaseArtifact['arch']
  acceptedComponentRange?: string
  catalogUrl?: (id: EditorReleaseComponentId) => string
  manifestUrl?: string
  fetchBytes?: (url: string, signal: AbortSignal, limit: number) => Promise<Uint8Array>
  changed?: (result: EditorReleaseUpdateResult) => void
  stateChanged?: (state: EditorReleaseSnapshot) => void
  editorInstallRoot?: string
  editorExecutablePath?: string
  prepareEditorInstall?: (request: EditorUpdateInstallRequest) => Promise<() => Promise<void>>
}

/** Checks and stages editor binaries, and updates the editor-owned component caches. */
export class EditorReleaseManager {
  private readonly options: EditorReleaseManagerOptions
  private readonly active = new Map<EditorReleaseComponentId, string>()
  private readonly appState: EditorAppUpdateState
  private appArtifact?: { version: string, artifact: EditorReleaseArtifact }
  private pending?: Promise<EditorReleaseUpdateResult>
  private downloadPending?: Promise<EditorReleaseSnapshot>
  private installing = false

  constructor(options: EditorReleaseManagerOptions) {
    if (!valid(options.editorVersion))
      throw new Error(`Invalid editor version: ${options.editorVersion}`)
    this.options = options
    this.appState = {
      phase: 'idle',
      channel: options.channel,
      currentVersion: options.editorVersion,
      installSupported: !!options.prepareEditorInstall,
      platform: options.platform ?? hostPlatform(),
      arch: options.arch ?? hostArch(),
    }
  }

  snapshot(): EditorReleaseSnapshot {
    return { app: structuredClone(this.appState) }
  }

  directories(): EditorComponentDirectories {
    return {
      boilerplateDirectory: this.directory('boilerplate'),
      runtimeDirectory: this.directory('runtime'),
    }
  }

  check(signal = AbortSignal.timeout(10 * 60_000)): Promise<EditorReleaseUpdateResult> {
    if (this.installing)
      return Promise.resolve({ checked: false, updated: [], app: this.snapshot().app })
    if (this.pending)
      return this.pending
    if (this.downloadPending)
      return this.downloadPending.then(() => this.check(signal))
    this.pending = this.performCheck(signal)
      .catch((error) => {
        this.setAppState({ phase: 'error', error: String(error).replace(/^Error: /, '') })
        return { checked: false, updated: [], app: this.snapshot().app, error: String(error).replace(/^Error: /, '') }
      })
      .finally(() => { this.pending = undefined })
    return this.pending
  }

  private async performCheck(signal: AbortSignal): Promise<EditorReleaseUpdateResult> {
    const fetchBytes = this.options.fetchBytes ?? defaultFetchBytes
    const result: EditorReleaseUpdateResult = { checked: false, updated: [], app: this.snapshot().app }
    // A component outage must never prevent the shell from receiving a fix.
    this.appArtifact = undefined
    this.setAppState({ phase: 'checking', error: undefined })
    try {
      await this.checkEditorManifest(signal, fetchBytes)
      result.checked = true
    }
    catch (error) {
      this.setAppState({ phase: 'error', error: String(error).replace(/^Error: /u, '') })
    }
    result.app = this.snapshot().app
    for (const id of ['boilerplate', 'runtime'] as const) {
      try {
        const url = this.options.catalogUrl?.(id) ?? editorComponentCatalogUrl(this.options.channel, id)
        if (!url.startsWith('https://'))
          throw new Error('Editor component catalogs require HTTPS.')
        const catalog = parseEditorComponentCatalog(JSON.parse(Buffer.from(await fetchBytes(url, signal, MAX_CATALOG_BYTES)).toString('utf8')))
        if (catalog.channel !== this.options.channel || catalog.component !== id)
          throw new Error(`Editor ${id} update channel mismatch.`)
        const candidate = catalog.releases
          .filter(release => this.compatible({ id, ...release }))
          .sort((a, b) => gt(a.version, b.version) ? -1 : 1)[0]
        if (!candidate)
          continue
        const installed = await this.installed(id)
        if (installed && !gt(candidate.version, installed.version))
          continue
        const directory = await this.install(id, candidate, signal, fetchBytes)
        const update = { id, version: candidate.version, directory }
        await this.activate(update)
        this.active.set(id, directory)
        result.updated.push(update)
      }
      catch (error) {
        result.error = [result.error, `${id}: ${String(error).replace(/^Error: /u, '')}`].filter(Boolean).join('\n')
      }
    }
    this.options.changed?.(result)
    return result
  }

  downloadEditorUpdate(signal = AbortSignal.timeout(10 * 60_000)): Promise<EditorReleaseSnapshot> {
    if (this.installing)
      return Promise.resolve(this.snapshot())
    if (this.downloadPending)
      return this.downloadPending
    this.downloadPending = this.performEditorDownload(signal)
      .catch((error) => {
        this.setAppState({ phase: 'error', error: String(error).replace(/^Error: /, '') })
        return this.snapshot()
      })
      .finally(() => { this.downloadPending = undefined })
    return this.downloadPending
  }

  async installEditorUpdate(): Promise<void> {
    if (this.appState.phase !== 'ready' || !this.appState.downloadedPath || !this.appArtifact)
      throw new Error('Editor update is not ready to install.')
    const prepare = this.options.prepareEditorInstall
    if (!prepare || !this.options.editorInstallRoot || !this.options.editorExecutablePath)
      throw new Error('This editor build does not provide an update installer.')
    if (this.installing)
      throw new Error('Editor update installation is already in progress.')
    const archivePath = this.appState.downloadedPath
    const { artifact, version } = this.appArtifact
    this.installing = true
    try {
      if (!await verifiedFile(archivePath, artifact))
        throw new Error('Editor update cache checksum mismatch. Download again.')
      const finish = await prepare({
        archivePath,
        format: artifact.format,
        installRoot: this.options.editorInstallRoot,
        executablePath: this.options.editorExecutablePath,
        sha256: artifact.sha256,
        size: artifact.size,
        version,
        channel: this.options.channel,
        signingTeamId: this.options.signingTeamId,
        platform: this.appState.platform,
        arch: this.appState.arch,
      })
      await finish()
    }
    finally { this.installing = false }
  }

  private async checkEditorManifest(
    signal: AbortSignal,
    fetchBytes: NonNullable<EditorReleaseManagerOptions['fetchBytes']> | typeof defaultFetchBytes,
  ): Promise<void> {
    const url = this.options.manifestUrl ?? editorReleaseManifestUrl(this.options.channel)
    if (!url.startsWith('https://'))
      throw new Error('Editor release manifests require HTTPS.')
    const manifest = parseEditorReleaseManifest(JSON.parse(Buffer.from(await fetchBytes(url, signal, MAX_CATALOG_BYTES)).toString('utf8')))
    if (manifest.channel !== this.options.channel)
      throw new Error('Editor update channel mismatch.')
    if (this.options.channel === 'stable' && prerelease(manifest.version))
      throw new Error('Stable editor releases cannot use prerelease versions.')
    const artifact = manifest.artifacts.find(item => item.platform === this.appState.platform && item.arch === this.appState.arch)
    if (!artifact)
      throw new Error(`No editor update is published for ${this.appState.platform}/${this.appState.arch}.`)
    if (!gt(manifest.version, this.options.editorVersion)) {
      this.appArtifact = undefined
      this.setAppState({ phase: 'idle', availableVersion: undefined, size: undefined, downloadedPath: undefined, url: undefined, error: undefined })
      return
    }
    this.appArtifact = { version: manifest.version, artifact }
    const cached = this.editorArchivePath(manifest.version, artifact)
    if (await verifiedFile(cached, artifact)) {
      this.setAppState({ phase: 'ready', availableVersion: manifest.version, downloadedPath: cached, size: artifact.size, url: artifact.url, error: undefined })
    }
    else {
      this.setAppState({ phase: 'available', availableVersion: manifest.version, size: artifact.size, url: artifact.url, downloadedPath: undefined, error: undefined })
    }
  }

  private async performEditorDownload(signal: AbortSignal): Promise<EditorReleaseSnapshot> {
    if (this.pending)
      await this.pending
    if (!this.appArtifact)
      throw new Error('Check for an editor update before downloading it.')
    const { version, artifact } = this.appArtifact
    this.setAppState({ phase: 'downloading', availableVersion: version, size: artifact.size, url: artifact.url, error: undefined })
    const root = join(this.options.profileDirectory, this.options.channel, 'editor')
    const destination = this.editorArchivePath(version, artifact)
    const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
    await mkdir(root, { recursive: true })
    try {
      if (artifact.size > MAX_EDITOR_ARTIFACT_BYTES)
        throw new Error('Editor update exceeds its size limit.')
      if (this.options.fetchBytes) {
        const bytes = await this.options.fetchBytes(artifact.url, signal, MAX_EDITOR_ARTIFACT_BYTES)
        if (bytes.byteLength !== artifact.size || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
          throw new Error('Editor update size or checksum mismatch.')
        await writeFile(temporary, bytes, { flag: 'wx' })
      }
      else {
        await downloadArtifact(artifact, temporary, signal)
      }
      await rename(temporary, destination)
    }
    finally {
      await rm(temporary, { force: true })
    }
    this.setAppState({ phase: 'ready', availableVersion: version, size: artifact.size, downloadedPath: destination, url: artifact.url, error: undefined })
    return this.snapshot()
  }

  private editorArchivePath(version: string, artifact: EditorReleaseArtifact): string {
    return join(this.options.profileDirectory, this.options.channel, 'editor', `${version}-${this.appState.platform}-${this.appState.arch}-${artifact.sha256}.${artifact.format}`)
  }

  private setAppState(update: Partial<EditorAppUpdateState>): void {
    Object.assign(this.appState, update)
    this.options.stateChanged?.(this.snapshot())
  }

  private directory(id: EditorReleaseComponentId): string {
    return this.active.get(id) ?? this.readActive(id) ?? (id === 'runtime'
      ? join(this.options.embeddedDirectory, 'sdk')
      : join(this.options.embeddedDirectory, 'components', 'boilerplate'))
  }

  private readActive(id: EditorReleaseComponentId): string | undefined {
    try {
      const marker = JSON.parse(readFileSync(join(this.options.profileDirectory, this.options.channel, `${id}.json`), 'utf8')) as { version?: unknown }
      if (typeof marker.version !== 'string' || !valid(marker.version))
        return undefined
      const directory = join(this.options.profileDirectory, this.options.channel, id, marker.version)
      const metadata = JSON.parse(readFileSync(join(directory, 'component.json'), 'utf8')) as InstalledComponent
      const embedded = (() => {
        try {
          return JSON.parse(readFileSync(join(this.options.embeddedDirectory, id === 'runtime' ? 'sdk' : join('components', 'boilerplate'), 'component.json'), 'utf8')) as Partial<InstalledComponent>
        }
        catch {
          return {} as Partial<InstalledComponent>
        }
      })()
      if (metadata.id !== id || metadata.version !== marker.version || !this.compatible(metadata)
        || (typeof embedded.version === 'string' && valid(embedded.version) && lt(metadata.version, embedded.version))) {
        return undefined
      }
      this.active.set(id, directory)
      return directory
    }
    catch {
      return undefined
    }
  }

  private async installed(id: EditorReleaseComponentId): Promise<InstalledComponent | undefined> {
    return readComponentMetadata(this.directory(id)).catch(() => undefined)
  }

  private compatible(metadata: InstalledComponent): boolean {
    return !!valid(metadata.version) && typeof metadata.editorRange === 'string'
      && (this.options.channel === 'beta' || !prerelease(metadata.version))
      && satisfies(this.options.editorVersion, metadata.editorRange, { includePrerelease: this.options.channel === 'beta' })
      && (!this.options.acceptedComponentRange || satisfies(metadata.version, this.options.acceptedComponentRange, { includePrerelease: this.options.channel === 'beta' }))
  }

  private async install(
    id: EditorReleaseComponentId,
    release: EditorComponentRelease,
    signal: AbortSignal,
    fetchBytes: NonNullable<EditorReleaseManagerOptions['fetchBytes']> | typeof defaultFetchBytes,
  ): Promise<string> {
    if (release.component !== id || !valid(release.version) || !/^https:\/\//iu.test(release.url))
      throw new Error(`Invalid ${id} component update.`)
    const bytes = await fetchBytes(release.url, signal, MAX_COMPONENT_BYTES)
    if (bytes.byteLength !== release.size || bytes.byteLength > MAX_COMPONENT_BYTES)
      throw new Error(`${id} component size mismatch.`)
    if (createHash('sha256').update(bytes).digest('hex') !== release.sha256.toLowerCase())
      throw new Error(`${id} component checksum mismatch.`)
    const root = join(this.options.profileDirectory, this.options.channel, id)
    const staging = join(root, `.staging-${process.pid}-${Date.now()}`)
    const destination = join(root, release.version)
    await mkdir(staging, { recursive: true })
    try {
      const archive = join(staging, 'component.tar.gz')
      await writeFile(archive, bytes, { flag: 'wx' })
      const listing = await exec('tar', ['-tzf', archive], { cwd: staging, maxBuffer: 4 * 1024 * 1024 })
      for (const item of listing.stdout.split('\n').map(value => value.trim()).filter(Boolean)) {
        const escaped = relative(staging, resolve(staging, item))
        if (item.includes('\\') || item.startsWith('/') || /^[a-z]:/iu.test(item) || isAbsolute(escaped) || escaped === '..' || escaped.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
          throw new Error(`Unsafe ${id} component archive path.`)
      }
      const verbose = await exec('tar', ['-tvzf', archive], { cwd: staging, maxBuffer: 8 * 1024 * 1024 })
      if (verbose.stdout.split('\n').filter(Boolean).some(line => !['-', 'd'].includes(line[0])))
        throw new Error(`Unsafe ${id} component archive entry.`)
      await exec('tar', ['-xzf', archive, '--no-same-owner'], { cwd: staging, maxBuffer: 4 * 1024 * 1024 })
      const metadata = await readComponentMetadata(staging)
      if (!metadata || metadata.id !== id || metadata.version !== release.version || metadata.editorRange !== release.editorRange || !this.compatible(metadata))
        throw new Error(`Incompatible ${id} component update.`)
      if (id === 'runtime') {
        const index = JSON.parse(await readFile(join(staging, 'index.json'), 'utf8')) as Record<string, { archive: string }>
        if (!index || !Object.keys(index).length)
          throw new Error('Empty editor SDK index.')
        for (const entry of Object.values(index)) {
          if (!entry || !/^[\w.-]+\.tgz$/u.test(entry.archive))
            throw new Error('Invalid editor SDK archive.')
          await readFile(join(staging, entry.archive))
        }
      }
      else {
        for (const template of ['visual-novel-vue', 'plugin'])
          JSON.parse(await readFile(join(staging, template, 'package.json'), 'utf8'))
      }
      await rm(archive)
      await mkdir(dirname(destination), { recursive: true })
      await rm(destination, { recursive: true, force: true })
      await rename(staging, destination)
      return destination
    }
    finally {
      await rm(staging, { recursive: true, force: true })
    }
  }

  private async activate(update: EditorReleaseUpdate): Promise<void> {
    const marker = join(this.options.profileDirectory, this.options.channel, `${update.id}.json`)
    const markerTemp = `${marker}.tmp-${process.pid}-${Date.now()}`
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(markerTemp, `${JSON.stringify({ version: update.version })}\n`, { flag: 'wx' })
    try {
      await replaceFile(markerTemp, marker)
    }
    catch (error) {
      await rm(markerTemp, { force: true })
      throw error
    }
  }
}

async function readComponentMetadata(directory: string): Promise<InstalledComponent | undefined> {
  const item = JSON.parse(await readFile(join(directory, 'component.json'), 'utf8')) as Partial<InstalledComponent>
  if ((item.id !== 'boilerplate' && item.id !== 'runtime') || typeof item.version !== 'string' || !valid(item.version) || typeof item.editorRange !== 'string')
    return undefined
  return { id: item.id, version: item.version, editorRange: item.editorRange }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM')
      throw error
    await rm(destination, { force: true })
    await rename(source, destination)
  }
}

function hostPlatform(): EditorReleaseArtifact['platform'] {
  if (process.platform === 'darwin')
    return 'macos'
  if (process.platform === 'win32')
    return 'windows'
  return 'linux'
}

function hostArch(): EditorReleaseArtifact['arch'] {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

async function defaultFetchBytes(url: string, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  const response = await fetchHttps(url, signal)
  if (!response.ok || !response.body)
    throw new Error(`Editor update download failed (HTTP ${response.status}).`)
  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.length
      if (size > limit)
        throw new Error('Editor update download exceeds its size limit.')
      chunks.push(value)
    }
  }
  finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}

async function verifiedFile(path: string, artifact: EditorReleaseArtifact): Promise<boolean> {
  try {
    if ((await stat(path)).size !== artifact.size)
      return false
    const hash = createHash('sha256')
    for await (const bytes of createReadStream(path)) hash.update(bytes)
    return hash.digest('hex') === artifact.sha256
  }
  catch { return false }
}

async function downloadArtifact(artifact: EditorReleaseArtifact, destination: string, signal: AbortSignal): Promise<void> {
  const response = await fetchHttps(artifact.url, signal)
  if (!response.ok || !response.body)
    throw new Error(`Editor update download failed (HTTP ${response.status}).`)
  const handle = await open(destination, 'wx')
  const hash = createHash('sha256')
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.length
      if (size > artifact.size)
        throw new Error('Editor update size mismatch.')
      hash.update(value)
      // FileHandle.write may complete partially; writeFile consumes the complete chunk.
      await handle.writeFile(value)
    }
    if (size !== artifact.size || hash.digest('hex') !== artifact.sha256)
      throw new Error('Editor update checksum mismatch.')
  }
  finally {
    await reader.cancel().catch(() => {})
    await handle.close()
  }
}
