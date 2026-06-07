import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const appHomeEnv = 'NOVEL_WRITER_HOME'

export function getAppHome(): string {
  return resolve(process.env[appHomeEnv] || join(homedir(), '.quaengine', 'novel-writer'))
}

export function getConfigPath(): string {
  return join(getAppHome(), 'config.json')
}

export function getProjectsRoot(): string {
  return join(getAppHome(), 'projects')
}

export function getTrashRoot(): string {
  return join(getAppHome(), 'trash')
}

export function getProjectRoot(projectId: string): string {
  return join(getProjectsRoot(), sanitizeProjectId(projectId))
}

export function getTrashedProjectRoot(projectId: string): string {
  return join(getTrashRoot(), sanitizeProjectId(projectId))
}

export function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function isPathInside(pathname: string, root: string): boolean {
  const target = resolve(pathname)
  const base = resolve(root)
  return target === base || target.startsWith(`${base}/`)
}
