import type { ArtifactRef, NovelProject, WorkflowStage } from '$lib/types'
import { strToU8, zipSync } from 'fflate'
import { listArtifacts, readProject } from './store'

const exportableStatuses = new Set<ArtifactRef['status']>(['approved', 'draft'])

const workflowOrder: WorkflowStage[] = [
  'requirements',
  'worldbuilding',
  'worldbuilding_review',
  'characters',
  'characters_review',
  'story_background',
  'story_background_review',
  'outline',
  'outline_review',
  'scene_writing',
  'editing',
  'supervision',
  'final',
]

export class NoCompletedArtifactsError extends Error {
  constructor(projectId: string) {
    super(`No completed artifacts to export for project: ${projectId}`)
    this.name = 'NoCompletedArtifactsError'
  }
}

export interface ProjectExportArchive {
  bytes: Uint8Array
  filename: string
  artifactCount: number
}

export async function createProjectExport(projectId: string): Promise<ProjectExportArchive> {
  const project = await readProject(projectId)
  const artifacts = (await listArtifacts(projectId))
    .filter(isExportableArtifact)
    .sort(compareArtifactsForExport)

  if (artifacts.length === 0) {
    throw new NoCompletedArtifactsError(projectId)
  }

  const exportedAt = new Date().toISOString()
  const files: Record<string, Uint8Array> = {}
  addTextFile(files, 'README.md', renderReadme(project, artifacts, exportedAt))
  addTextFile(files, 'project.json', JSON.stringify(project, null, 2))
  addTextFile(files, 'combined.md', renderCombinedMarkdown(project, artifacts, exportedAt))
  addTextFile(files, 'manifest.json', JSON.stringify(createManifest(project, artifacts, exportedAt), null, 2))

  artifacts.forEach((artifact, index) => {
    const prefix = artifactExportPrefix(artifact, index)
    addTextFile(files, `artifacts/${prefix}.md`, artifact.markdown)
    addTextFile(files, `artifacts/${prefix}.json`, JSON.stringify(artifact, null, 2))
  })

  return {
    bytes: zipSync(files, { level: 6 }),
    filename: exportFilename(project, exportedAt),
    artifactCount: artifacts.length,
  }
}

function isExportableArtifact(artifact: ArtifactRef): boolean {
  return exportableStatuses.has(artifact.status)
}

function compareArtifactsForExport(left: ArtifactRef, right: ArtifactRef): number {
  const stageDelta = stageIndex(left.stage) - stageIndex(right.stage)
  if (stageDelta !== 0) {
    return stageDelta
  }
  const chapterDelta = (left.chapterIndex ?? Number.MAX_SAFE_INTEGER) - (right.chapterIndex ?? Number.MAX_SAFE_INTEGER)
  if (chapterDelta !== 0) {
    return chapterDelta
  }
  const createdDelta = left.createdAt.localeCompare(right.createdAt)
  return createdDelta || left.id.localeCompare(right.id)
}

function stageIndex(stage: WorkflowStage): number {
  const index = workflowOrder.indexOf(stage)
  return index === -1 ? workflowOrder.length : index
}

function createManifest(project: NovelProject, artifacts: ArtifactRef[], exportedAt: string) {
  return {
    format: 'novel-writer-export',
    version: 1,
    exportedAt,
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      currentStage: project.currentStage,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    includedArtifactStatuses: Array.from(exportableStatuses),
    excludedArtifactStatuses: ['needs_review', 'rejected'],
    artifactCount: artifacts.length,
    artifacts: artifacts.map((artifact, index) => ({
      index: index + 1,
      id: artifact.id,
      stage: artifact.stage,
      title: artifact.title,
      status: artifact.status,
      chapterIndex: artifact.chapterIndex,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
      markdownPath: `artifacts/${artifactExportPrefix(artifact, index)}.md`,
      jsonPath: `artifacts/${artifactExportPrefix(artifact, index)}.json`,
      references: artifact.references.length,
    })),
  }
}

function renderReadme(project: NovelProject, artifacts: ArtifactRef[], exportedAt: string): string {
  return [
    `# ${project.title}`,
    '',
    `Exported at: ${exportedAt}`,
    `Project ID: ${project.id}`,
    `Project status: ${project.status}`,
    '',
    '## Contents',
    '',
    '- `combined.md`: all completed artifact markdown in workflow order.',
    '- `project.json`: project metadata and original brief.',
    '- `manifest.json`: archive index and artifact file paths.',
    '- `artifacts/*.md` and `artifacts/*.json`: each completed artifact in both user-facing formats.',
    '',
    'Only artifacts with status `approved` or `draft` are included. Pending review and rejected artifacts are excluded.',
    '',
    '## Artifacts',
    '',
    ...artifacts.map((artifact, index) => `${index + 1}. ${artifact.title} (${artifact.stage}, ${artifact.status})`),
    '',
  ].join('\n')
}

function renderCombinedMarkdown(project: NovelProject, artifacts: ArtifactRef[], exportedAt: string): string {
  return [
    `# ${project.title}`,
    '',
    `Exported at: ${exportedAt}`,
    '',
    `> ${project.brief}`,
    '',
    ...artifacts.flatMap((artifact, index) => [
      '---',
      '',
      `## ${index + 1}. ${artifact.title}`,
      '',
      `Stage: ${artifact.stage}`,
      `Status: ${artifact.status}`,
      artifact.chapterIndex !== undefined ? `Chapter index: ${artifact.chapterIndex}` : undefined,
      '',
      artifact.markdown.trimEnd(),
      '',
    ].filter((line): line is string => line !== undefined)),
  ].join('\n')
}

function artifactExportPrefix(artifact: ArtifactRef, index: number): string {
  return `${String(index + 1).padStart(3, '0')}-${safePathSegment(artifact.stage)}-${safePathSegment(artifact.id)}`
}

function exportFilename(project: NovelProject, exportedAt: string): string {
  const timestamp = exportedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${safePathSegment(project.id || 'project')}-${timestamp}.zip`
}

function safePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'untitled'
}

function addTextFile(files: Record<string, Uint8Array>, path: string, text: string): void {
  files[path] = strToU8(text.endsWith('\n') ? text : `${text}\n`)
}
