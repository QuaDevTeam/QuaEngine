import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { workflowOrder } from '../src/lib/server/agents'
import { createProject, listArtifacts, readCheckpoint, readProject, writeArtifact, writeCheckpoint } from '../src/lib/server/store'
import { recordApproval, settleWorkflows, startProjectRevision, startWorkflow } from '../src/lib/server/workflow'
import type { WorkflowStage } from '../src/lib/types'

let home: string
let projectId: string
const chapterStages: WorkflowStage[] = ['scene_writing', 'chapter_editing', 'chapter_supervision']
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'writer-chapters-'))
  process.env.NOVEL_WRITER_HOME = home
  projectId = (await createProject({ title: '章节恢复', brief: '两章故事', mode: 'step' })).id
  for (const [id, stage, chapterIndex, markdown] of [
    ['outline', 'outline', undefined, '## 第一章：车站\n## 第二章：归途'],
    ['chapter-0', 'scene_writing', 0, '凛：第一章。'],
    ['chapter-1', 'scene_writing', 1, '凛：第二章。'],
  ] as const) {
    await writeArtifact({ id, stage, chapterIndex, projectId, agentId: 'fixture', title: id, status: 'approved', markdown, json: {}, references: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  }
  await writeCheckpoint({ projectId, completedStages: workflowOrder, totalChapters: 2, completedChapterStages: [0, 1].flatMap(chapterIndex => chapterStages.map(stage => ({ stage, chapterIndex }))), updatedAt: new Date().toISOString() })
})
afterEach(async () => {
  await settleWorkflows()
  delete process.env.NOVEL_WRITER_HOME
  await rm(home, { recursive: true, force: true })
})

it('manual chapter edits preserve other chapters and rerun only dependent work', async () => {
  await recordApproval(projectId, { artifactId: 'chapter-1', action: 'manual_edit', markdown: '凛：第二章的新稿。' })
  const checkpoint = await readCheckpoint(projectId)
  expect(checkpoint?.totalChapters).toBe(2)
  expect(checkpoint?.completedChapterStages).toEqual(chapterStages.map(stage => ({ stage, chapterIndex: 0 })))
  expect(checkpoint?.completedStages).not.toContain('final')
  await recordApproval(projectId, { artifactId: 'chapter-1', action: 'approve' })
  await startWorkflow(projectId, 'step')
  await settleWorkflows()
  const added = (await listArtifacts(projectId)).filter(artifact => !['outline', 'chapter-0', 'chapter-1'].includes(artifact.id))
  expect(added.map(artifact => [artifact.stage, artifact.chapterIndex])).toEqual([['chapter_editing', 1], ['chapter_supervision', 1]])
  expect((await readCheckpoint(projectId))?.completedStages).toContain('scene_writing')
})

it('regeneration keeps the chapter binding and unrelated progress through approval', async () => {
  const approval = recordApproval(projectId, { artifactId: 'chapter-1', action: 'regenerate', note: '只重写第二章' })
  await settleWorkflows()
  await approval
  const artifacts = await listArtifacts(projectId)
  const regenerated = artifacts.find(artifact => artifact.id !== 'chapter-1' && artifact.chapterIndex === 1)!
  expect(regenerated).toMatchObject({ stage: 'scene_writing', chapterIndex: 1, status: 'needs_review' })
  expect(artifacts.find(artifact => artifact.id === 'chapter-1')?.status).toBe('rejected')
  expect((await readCheckpoint(projectId))?.completedChapterStages).toEqual(chapterStages.map(stage => ({ stage, chapterIndex: 0 })))
  await startWorkflow(projectId, 'yolo')
  await settleWorkflows()
  expect((await listArtifacts(projectId)).filter(artifact => artifact.stage === 'scene_writing' && artifact.chapterIndex === 0)).toHaveLength(1)
  expect((await readProject(projectId)).status).toBe('completed')
  expect((await readCheckpoint(projectId))?.completedStages).toEqual(workflowOrder)
})

it('project input revision goes through the chapter loop before declaring completion', async () => {
  await startProjectRevision(projectId, { changedFields: [], affectedStages: workflowOrder.slice(workflowOrder.indexOf('outline')), feedback: '修订大纲后继续逐章写作。' })
  await settleWorkflows()
  const generated = (await listArtifacts(projectId)).filter(artifact => chapterStages.includes(artifact.stage) && !artifact.id.startsWith('chapter-'))
  expect(generated.length).toBeGreaterThanOrEqual(3)
  expect(generated.every(artifact => artifact.chapterIndex !== undefined)).toBe(true)
  expect((await readCheckpoint(projectId))?.completedStages).toEqual(workflowOrder)
  expect((await readProject(projectId)).status).toBe('completed')
})
