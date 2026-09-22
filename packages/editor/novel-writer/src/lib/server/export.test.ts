import type { ArtifactRef } from '$lib/types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectExport, NoCompletedArtifactsError } from './export'
import { createProject, writeArtifact } from './store'

let previousHome: string | undefined
let tempHome: string | undefined

beforeEach(async () => {
  previousHome = process.env.NOVEL_WRITER_HOME
  tempHome = await mkdtemp(join(tmpdir(), 'novel-writer-export-'))
  process.env.NOVEL_WRITER_HOME = tempHome
})

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.NOVEL_WRITER_HOME
  }
  else {
    process.env.NOVEL_WRITER_HOME = previousHome
  }
  if (tempHome) {
    await rm(tempHome, { recursive: true, force: true })
  }
})

describe('project export archives', () => {
  it('packages approved and draft artifacts in markdown and JSON forms', async () => {
    const project = await createProject({
      title: 'Exportable Story',
      brief: 'Write a compact visual novel.',
      mode: 'step',
      maxRevisionLoops: 3,
    })

    await writeArtifact(artifact(project.id, 'requirements-approved', 'requirements', 'approved', '# Requirements'))
    await writeArtifact(artifact(project.id, 'outline-pending', 'outline', 'needs_review', '# Pending outline'))
    await writeArtifact(artifact(project.id, 'scene-rejected', 'scene_writing', 'rejected', '# Rejected scene'))
    await writeArtifact(artifact(project.id, 'final-draft', 'final', 'draft', '# Final draft'))

    const archive = await createProjectExport(project.id)
    const files = unzipSync(archive.bytes)
    const fileNames = Object.keys(files).sort()

    expect(archive.filename).toMatch(/exportable-story-.+\.zip/)
    expect(archive.artifactCount).toBe(2)
    expect(fileNames).toContain('README.md')
    expect(fileNames).toContain('combined.md')
    expect(fileNames).toContain('manifest.json')
    expect(fileNames).toContain('project.json')
    expect(fileNames).toContain('artifacts/001-requirements-requirements-approved.md')
    expect(fileNames).toContain('artifacts/001-requirements-requirements-approved.json')
    expect(fileNames).toContain('artifacts/002-final-final-draft.md')
    expect(fileNames).not.toContain('artifacts/003-outline-outline-pending.md')

    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as { artifactCount: number, artifacts: Array<{ id: string }> }
    expect(manifest.artifactCount).toBe(2)
    expect(manifest.artifacts.map(item => item.id)).toEqual(['requirements-approved', 'final-draft'])
    expect(strFromU8(files['combined.md']!)).toContain('# Final draft')
    expect(strFromU8(files['combined.md']!)).not.toContain('Pending outline')
    expect(strFromU8(files['combined.md']!)).not.toContain('Rejected scene')
  })

  it('fails when a project has no completed artifacts', async () => {
    const project = await createProject({
      title: 'No Export Yet',
      brief: 'Only pending work exists.',
      mode: 'step',
    })
    await writeArtifact(artifact(project.id, 'requirements-pending', 'requirements', 'needs_review', '# Pending'))

    await expect(createProjectExport(project.id)).rejects.toBeInstanceOf(NoCompletedArtifactsError)
  })
})

function artifact(
  projectId: string,
  id: string,
  stage: ArtifactRef['stage'],
  status: ArtifactRef['status'],
  markdown: string,
): ArtifactRef {
  const now = new Date().toISOString()
  return {
    id,
    projectId,
    stage,
    agentId: `${stage}_agent`,
    title: stage,
    status,
    createdAt: now,
    updatedAt: now,
    json: { id },
    markdown,
    references: [],
  }
}
