import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { access, chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type {
  ArtifactRef,
  NovelProject,
  NovelWriterConfig,
  ProjectInputChange,
  PublicNovelWriterConfig,
  ResumeCheckpoint,
  RunMode,
  WorkflowEvent,
  WorkflowStage,
} from '$lib/types'
import { getAppHome, getConfigPath, getProjectRoot, getProjectsRoot, getTrashRoot, getTrashedProjectRoot } from './paths'
import { appendJsonl, readJsonl } from './jsonl'
import { redactSecrets } from './redaction'
import { broadcastWorkflowEvent } from './realtime.js'

const eventBus = new EventEmitter()
eventBus.setMaxListeners(200)

const defaultConfig: NovelWriterConfig = {
  deepSeekBaseUrl: 'https://api.deepseek.com',
  deepSeekModel: 'deepseek-v4-pro',
  defaultReasoningEffort: 'high',
  tavilyBaseUrl: 'https://api.tavily.com',
  defaultMaxRevisionLoops: 50,
}

export function toPublicConfig(config: NovelWriterConfig): PublicNovelWriterConfig {
  return {
    deepSeekBaseUrl: config.deepSeekBaseUrl,
    deepSeekModel: config.deepSeekModel,
    defaultReasoningEffort: config.defaultReasoningEffort,
    hasDeepSeekApiKey: Boolean(config.deepSeekApiKey),
    hasTavilyApiKey: Boolean(config.tavilyApiKey),
    tavilyBaseUrl: config.tavilyBaseUrl,
    defaultMaxRevisionLoops: config.defaultMaxRevisionLoops,
  }
}

export async function ensureAppHome(): Promise<void> {
  await mkdir(getProjectsRoot(), { recursive: true })
  await mkdir(getTrashRoot(), { recursive: true })
}

export async function readConfig(): Promise<NovelWriterConfig> {
  await ensureAppHome()
  try {
    const parsed = JSON.parse(await readFile(getConfigPath(), 'utf8')) as Partial<NovelWriterConfig>
    return normalizeConfig({ ...defaultConfig, ...parsed })
  }
  catch (error) {
    if (isNotFound(error)) {
      await writeConfig(defaultConfig)
      return defaultConfig
    }
    throw error
  }
}

export async function writeConfig(config: NovelWriterConfig): Promise<NovelWriterConfig> {
  await mkdir(getAppHome(), { recursive: true })
  const normalized = normalizeConfig(config)
  await writeFile(getConfigPath(), `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(getConfigPath(), 0o600).catch(() => undefined)
  return normalized
}

export async function updateConfig(update: Partial<NovelWriterConfig>): Promise<NovelWriterConfig> {
  const current = await readConfig()
  return writeConfig({ ...current, ...update })
}

export async function listProjects(): Promise<NovelProject[]> {
  await ensureAppHome()
  const entries = await readdir(getProjectsRoot(), { withFileTypes: true }).catch(() => [])
  const projects = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(entry => readProject(entry.name).catch(() => undefined)),
  )
  return projects
    .filter((project): project is NovelProject => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listTrashedProjects(): Promise<NovelProject[]> {
  await ensureAppHome()
  const entries = await readdir(getTrashRoot(), { withFileTypes: true }).catch(() => [])
  const projects = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(entry => readProjectFromRoot(join(getTrashRoot(), entry.name)).catch(() => undefined)),
  )
  return projects
    .filter((project): project is NovelProject => Boolean(project))
    .sort((a, b) => (b.trashedAt || b.updatedAt).localeCompare(a.trashedAt || a.updatedAt))
}

export async function createProject(input: {
  title: string
  brief: string
  mode: RunMode
  maxRevisionLoops?: number
  seed?: NovelProject['seed']
}): Promise<NovelProject> {
  const now = new Date().toISOString()
  const id = `${slugify(input.title)}-${Date.now().toString(36)}`
  const config = await readConfig()
  const project: NovelProject = {
    id,
    title: input.title,
    brief: input.brief,
    mode: input.mode,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    maxRevisionLoops: input.maxRevisionLoops ?? config.defaultMaxRevisionLoops,
    seed: normalizeProjectSeed(input.seed),
  }

  await writeProject(project)
  const createdProject = await readProject(id)
  await appendEvent({
    projectId: id,
    type: 'project.created',
    message: `Project "${project.title}" created.`,
    payload: { title: project.title, mode: project.mode, seedFields: Object.keys(createdProject.seed || {}) },
  })
  return createdProject
}

export async function readProject(projectId: string): Promise<NovelProject> {
  return readProjectFromRoot(getProjectRoot(projectId))
}

export async function updateProjectInput(project: NovelProject, changes: ProjectInputChange[]): Promise<NovelProject> {
  await writeProject(project)
  await appendEvent({
    projectId: project.id,
    type: 'project.updated',
    message: changes.some(change => change.affectsContent)
      ? 'Project input updated; content revision may be required.'
      : 'Project input updated.',
    payload: {
      changedFields: changes.map(change => ({
        field: change.field,
        label: change.label,
        affectsContent: change.affectsContent,
      })),
    },
  })
  return readProject(project.id)
}

export async function resetProjectRuntimeData(projectId: string): Promise<NovelProject> {
  const project = await readProject(projectId)
  const root = getProjectRoot(projectId)
  await Promise.all([
    rm(join(root, 'artifacts'), { recursive: true, force: true }),
    rm(join(root, 'conversations'), { recursive: true, force: true }),
    rm(join(root, 'snapshots'), { recursive: true, force: true }),
    rm(join(root, 'events.jsonl'), { force: true }),
  ])
  await writeProject({
    ...project,
    status: 'idle',
    currentStage: undefined,
    trashedAt: undefined,
  })
  return readProject(projectId)
}

export async function trashProject(projectId: string): Promise<NovelProject> {
  await ensureAppHome()
  const activeRoot = getProjectRoot(projectId)
  const trashRoot = getTrashedProjectRoot(projectId)
  const project = await readProject(projectId)
  if (await pathExists(trashRoot)) {
    throw new Error(`Project already exists in trash: ${projectId}`)
  }

  const now = new Date().toISOString()
  const trashedProject = { ...project, trashedAt: now, updatedAt: now }
  await writeProjectToRoot(activeRoot, trashedProject)
  await rename(activeRoot, trashRoot)
  return trashedProject
}

export async function restoreTrashedProject(projectId: string): Promise<NovelProject> {
  await ensureAppHome()
  const activeRoot = getProjectRoot(projectId)
  const trashRoot = getTrashedProjectRoot(projectId)
  if (await pathExists(activeRoot)) {
    throw new Error(`Project already exists: ${projectId}`)
  }

  const project = await readProjectFromRoot(trashRoot)
  const now = new Date().toISOString()
  const restoredProject = { ...project, trashedAt: undefined, updatedAt: now }
  await writeProjectToRoot(trashRoot, restoredProject)
  await rename(trashRoot, activeRoot)
  return restoredProject
}

export async function deleteTrashedProject(projectId: string): Promise<void> {
  await rm(getTrashedProjectRoot(projectId), { recursive: true, force: true })
}

export async function emptyTrash(): Promise<void> {
  await rm(getTrashRoot(), { recursive: true, force: true })
  await mkdir(getTrashRoot(), { recursive: true })
}

export async function writeProject(project: NovelProject): Promise<void> {
  const root = getProjectRoot(project.id)
  const stamped = { ...project, updatedAt: new Date().toISOString() }
  await writeProjectToRoot(root, stamped)
}

async function writeProjectToRoot(root: string, project: NovelProject): Promise<void> {
  await mkdir(join(root, 'artifacts'), { recursive: true })
  await mkdir(join(root, 'conversations'), { recursive: true })
  await mkdir(join(root, 'snapshots'), { recursive: true })
  await writeFile(join(root, 'project.json'), `${JSON.stringify(project, null, 2)}\n`, 'utf8')
}

export async function appendEvent(input: Omit<WorkflowEvent, 'id' | 'timestamp'>): Promise<WorkflowEvent> {
  const event: WorkflowEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
    payload: redactSecrets(input.payload),
  }
  await appendJsonl(join(getProjectRoot(event.projectId), 'events.jsonl'), event)
  eventBus.emit(`project:${event.projectId}`, event)
  broadcastWorkflowEvent(event)
  return event
}

export function subscribeProjectEvents(projectId: string, listener: (event: WorkflowEvent) => void): () => void {
  const channel = `project:${projectId}`
  eventBus.on(channel, listener)
  return () => eventBus.off(channel, listener)
}

export async function readEvents(projectId: string): Promise<WorkflowEvent[]> {
  return readJsonl<WorkflowEvent>(join(getProjectRoot(projectId), 'events.jsonl'))
}

export async function writeArtifact(artifact: ArtifactRef): Promise<ArtifactRef> {
  const root = join(getProjectRoot(artifact.projectId), 'artifacts')
  await mkdir(root, { recursive: true })
  const safeId = artifact.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const stamped = { ...artifact, updatedAt: new Date().toISOString() }
  await writeFile(join(root, `${safeId}.json`), `${JSON.stringify(stamped, null, 2)}\n`, 'utf8')
  await writeFile(join(root, `${safeId}.md`), stamped.markdown, 'utf8')
  return stamped
}

export async function listArtifacts(projectId: string): Promise<ArtifactRef[]> {
  const artifactRoot = join(getProjectRoot(projectId), 'artifacts')
  const entries = await readdir(artifactRoot, { withFileTypes: true }).catch(() => [])
  const artifacts = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => readFile(join(artifactRoot, entry.name), 'utf8').then(text => JSON.parse(text) as ArtifactRef)),
  )
  return artifacts.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function updateArtifactMarkdown(projectId: string, artifactId: string, markdown: string, status: ArtifactRef['status']): Promise<ArtifactRef> {
  const artifacts = await listArtifacts(projectId)
  const artifact = artifacts.find(item => item.id === artifactId)
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactId}`)
  }
  return writeArtifact({ ...artifact, markdown, status })
}

export async function updateArtifactStatus(projectId: string, artifactId: string, status: ArtifactRef['status']): Promise<ArtifactRef> {
  const artifacts = await listArtifacts(projectId)
  const artifact = artifacts.find(item => item.id === artifactId)
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactId}`)
  }
  return writeArtifact({ ...artifact, status })
}

export async function writeCheckpoint(checkpoint: ResumeCheckpoint): Promise<void> {
  await mkdir(join(getProjectRoot(checkpoint.projectId), 'snapshots'), { recursive: true })
  await writeFile(
    join(getProjectRoot(checkpoint.projectId), 'snapshots', 'run-state.json'),
    `${JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

export async function readCheckpoint(projectId: string): Promise<ResumeCheckpoint | undefined> {
  try {
    return JSON.parse(await readFile(join(getProjectRoot(projectId), 'snapshots', 'run-state.json'), 'utf8')) as ResumeCheckpoint
  }
  catch (error) {
    if (isNotFound(error)) {
      return undefined
    }
    throw error
  }
}

export async function appendConversation(projectId: string, agentId: string, record: unknown): Promise<void> {
  await appendJsonl(join(getProjectRoot(projectId), 'conversations', `${agentId}.jsonl`), redactSecrets(record))
}

export function resolveSandboxRoots(project: NovelProject): string[] {
  return [getProjectRoot(project.id)].map(pathname => resolve(pathname))
}

export function artifactIdFor(stage: WorkflowStage): string {
  return `${stage}-${Date.now().toString(36)}`
}

async function readProjectFromRoot(root: string): Promise<NovelProject> {
  return JSON.parse(await readFile(join(root, 'project.json'), 'utf8')) as NovelProject
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname)
    return true
  }
  catch (error) {
    if (isNotFound(error)) {
      return false
    }
    throw error
  }
}

function normalizeConfig(config: NovelWriterConfig): NovelWriterConfig {
  return {
    ...defaultConfig,
    deepSeekApiKey: config.deepSeekApiKey,
    deepSeekBaseUrl: config.deepSeekBaseUrl || defaultConfig.deepSeekBaseUrl,
    deepSeekModel: config.deepSeekModel || defaultConfig.deepSeekModel,
    defaultReasoningEffort: config.defaultReasoningEffort || defaultConfig.defaultReasoningEffort,
    tavilyApiKey: config.tavilyApiKey,
    tavilyBaseUrl: config.tavilyBaseUrl || defaultConfig.tavilyBaseUrl,
    defaultMaxRevisionLoops: config.defaultMaxRevisionLoops || defaultConfig.defaultMaxRevisionLoops,
  }
}

function normalizeProjectSeed(seed: NovelProject['seed']): NovelProject['seed'] {
  const normalized = {
    worldbuilding: seed?.worldbuilding?.trim() || undefined,
    worldbuildingModificationInstructions: seed?.worldbuildingModificationInstructions?.trim() || undefined,
    characters: seed?.characters?.trim() || undefined,
    charactersModificationInstructions: seed?.charactersModificationInstructions?.trim() || undefined,
    outline: seed?.outline?.trim() || undefined,
    outlineModificationInstructions: seed?.outlineModificationInstructions?.trim() || undefined,
    modificationInstructions: seed?.modificationInstructions?.trim() || undefined,
    allowExpertChanges: seed?.allowExpertChanges === true,
  }
  return hasSeedContent(normalized)
    ? normalized
    : undefined
}

function hasSeedContent(seed: NonNullable<NovelProject['seed']>): boolean {
  return Boolean(
    seed.worldbuilding
    || seed.worldbuildingModificationInstructions
    || seed.characters
    || seed.charactersModificationInstructions
    || seed.outline
    || seed.outlineModificationInstructions
    || seed.modificationInstructions,
  )
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4E00-\u9FFF]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return basename(slug || 'project').slice(0, 60)
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
