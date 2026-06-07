import type {
  ArtifactRef,
  NovelProject,
  ProjectInputChange,
  ProjectSeed,
  PublicNovelWriterConfig,
  RunMode,
  WorkflowEvent,
  WorkflowStage,
} from '$lib/types'
import type { ApprovalAction } from './workspace'

export type ProjectDetail = {
  project: NovelProject
  artifacts: ArtifactRef[]
  events: WorkflowEvent[]
}

export type ConfigUpdate = {
  deepSeekApiKey?: string
  deepSeekBaseUrl: string
  deepSeekModel: string
  defaultReasoningEffort: string
  tavilyApiKey?: string
  tavilyBaseUrl: string
  defaultMaxRevisionLoops: number
}

export type NewProjectInput = {
  title: string
  brief: string
  mode: RunMode
  maxRevisionLoops: number
  seed?: ProjectSeed
}

export type ProjectInputUpdate = NewProjectInput

export type ProjectUpdateResult = ProjectDetail & {
  changedFields: ProjectInputChange[]
  affectedStages?: WorkflowStage[]
  revisionStarted: boolean
}

export const defaultRequestTimeoutMs = 20_000
export const agentRequestTimeoutMs = 60 * 60 * 1000

export async function listProjects(): Promise<NovelProject[]> {
  const payload = await requestJson<{ projects: NovelProject[] }>('/api/projects')
  return payload.projects
}

export async function updateConfig(input: ConfigUpdate): Promise<PublicNovelWriterConfig> {
  return requestJson('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function createProject(input: NewProjectInput): Promise<NovelProject> {
  const payload = await requestJson<{ project: NovelProject }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return payload.project
}

export async function readProject(projectId: string): Promise<ProjectDetail> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`)
}

export async function updateProjectInput(projectId: string, input: ProjectInputUpdate): Promise<ProjectUpdateResult> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, agentRequestTimeoutMs)
}

export async function deleteProject(projectId: string): Promise<NovelProject> {
  const payload = await requestJson<{ project: NovelProject }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
  return payload.project
}

export async function listTrashedProjects(): Promise<NovelProject[]> {
  const payload = await requestJson<{ projects: NovelProject[] }>('/api/trash')
  return payload.projects
}

export async function restoreProject(projectId: string): Promise<NovelProject> {
  const payload = await requestJson<{ project: NovelProject }>(`/api/trash/${encodeURIComponent(projectId)}/restore`, {
    method: 'POST',
  })
  return payload.project
}

export async function permanentlyDeleteProject(projectId: string): Promise<void> {
  await request(`/api/trash/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  })
}

export async function emptyTrash(): Promise<void> {
  await request('/api/trash', {
    method: 'DELETE',
  })
}

export async function startRun(projectId: string, mode: RunMode, chapterIndex?: number): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(projectId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, chapterIndex }),
  })
}

export async function appendPlannerMessage(projectId: string, content: string): Promise<{ reply?: string }> {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }, agentRequestTimeoutMs)
}

export async function recordApproval(projectId: string, input: {
  artifactId: string
  action: ApprovalAction
  note?: string
  markdown?: string
}): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(projectId)}/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, agentRequestTimeoutMs)
}

async function requestJson<T>(url: string, init?: RequestInit, timeoutMs = defaultRequestTimeoutMs): Promise<T> {
  const response = await request(url, init, timeoutMs)
  return response.json() as Promise<T>
}

async function request(url: string, init?: RequestInit, timeoutMs = defaultRequestTimeoutMs): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    await assertOk(response)
    return response
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时，请稍后重试。最长等待 ${formatTimeout(timeoutMs)}。`)
    }
    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message || response.statusText)
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) {
    return response.statusText
  }

  try {
    const parsed = JSON.parse(text) as { error?: unknown, message?: unknown }
    if (typeof parsed.error === 'string') {
      return parsed.error
    }
    if (typeof parsed.message === 'string') {
      return parsed.message
    }
  }
  catch {
    // Plain text errors are expected from some SvelteKit failures.
  }

  return text
}

function formatTimeout(timeoutMs: number): string {
  if (timeoutMs >= 60 * 60 * 1000) {
    return `${Math.round(timeoutMs / 60 / 60 / 1000)} 小时`
  }
  if (timeoutMs >= 60 * 1000) {
    return `${Math.round(timeoutMs / 60 / 1000)} 分钟`
  }
  return `${Math.round(timeoutMs / 1000)} 秒`
}
