import type { NovelProject, ProjectInputChange, ProjectInputRevision, WorkflowStage } from '$lib/types'
import { workflowOrder } from './agents'

export type ProjectInputUpdate = {
  title: string
  brief: string
  mode: NovelProject['mode']
  maxRevisionLoops?: number
  seed?: NovelProject['seed']
}

const fieldLabels: Record<string, string> = {
  title: '作品标题',
  brief: '原始需求',
  mode: '运行模式',
  maxRevisionLoops: '最大修复循环',
  'seed.worldbuilding': '已有世界观',
  'seed.characters': '已有角色信息',
  'seed.outline': '已有大纲',
  'seed.allowExpertChanges': '允许专家修改设定',
}

const contentStageByField: Partial<Record<string, WorkflowStage>> = {
  brief: 'requirements',
  'seed.worldbuilding': 'worldbuilding',
  'seed.characters': 'characters',
  'seed.outline': 'outline',
  'seed.allowExpertChanges': 'requirements',
}

export function applyProjectInputUpdate(
  project: NovelProject,
  input: ProjectInputUpdate,
): { project: NovelProject, revision: ProjectInputRevision } {
  const nextProject: NovelProject = {
    ...project,
    title: input.title.trim(),
    brief: input.brief.trim(),
    mode: input.mode,
    maxRevisionLoops: input.maxRevisionLoops ?? project.maxRevisionLoops,
    seed: normalizeProjectSeed(input.seed),
  }
  const changedFields = diffProjectInput(project, nextProject)
  const affectedStages = affectedStagesForChanges(changedFields)
  return {
    project: nextProject,
    revision: {
      changedFields,
      affectedStages,
      feedback: formatProjectRevisionFeedback(changedFields, affectedStages),
    },
  }
}

export function diffProjectInput(previous: NovelProject, next: NovelProject): ProjectInputChange[] {
  const fields: Array<{
    field: string
    before: string | number | boolean | undefined
    after: string | number | boolean | undefined
  }> = [
    { field: 'title', before: previous.title, after: next.title },
    { field: 'brief', before: previous.brief, after: next.brief },
    { field: 'mode', before: previous.mode, after: next.mode },
    { field: 'maxRevisionLoops', before: previous.maxRevisionLoops, after: next.maxRevisionLoops },
    { field: 'seed.worldbuilding', before: normalizeOptional(previous.seed?.worldbuilding), after: normalizeOptional(next.seed?.worldbuilding) },
    { field: 'seed.characters', before: normalizeOptional(previous.seed?.characters), after: normalizeOptional(next.seed?.characters) },
    { field: 'seed.outline', before: normalizeOptional(previous.seed?.outline), after: normalizeOptional(next.seed?.outline) },
    { field: 'seed.allowExpertChanges', before: previous.seed?.allowExpertChanges === true, after: next.seed?.allowExpertChanges === true },
  ]

  return fields
    .filter(field => field.before !== field.after)
    .map(field => ({
      ...field,
      label: fieldLabels[field.field] ?? field.field,
      affectsContent: Boolean(contentStageByField[field.field]),
    }))
}

export function affectedStagesForChanges(changes: ProjectInputChange[]): WorkflowStage[] {
  const stageIndexes = changes
    .map(change => contentStageByField[change.field])
    .filter((stage): stage is WorkflowStage => Boolean(stage))
    .map(stage => workflowOrder.indexOf(stage))
    .filter(index => index >= 0)
  const firstIndex = Math.min(...stageIndexes)
  return Number.isFinite(firstIndex) ? workflowOrder.slice(firstIndex) : []
}

export function hasContentAffectingChanges(revision: ProjectInputRevision): boolean {
  return revision.changedFields.some(change => change.affectsContent)
}

function formatProjectRevisionFeedback(changes: ProjectInputChange[], affectedStages: WorkflowStage[]): string {
  if (!changes.length) {
    return ''
  }
  const lines = [
    'Project input revision request.',
    'Revise existing artifacts instead of discarding them. Preserve compatible generated content, approved canon, references, character voice, and structure wherever possible.',
    'Only change the parts required by the modified input fields below. Do not spend tokens rewriting unaffected sections for style alone.',
    affectedStages.length
      ? `Affected workflow starts at ${affectedStages[0]} and should continue through downstream dependent stages.`
      : 'No creative workflow stage is affected; do not rerun generation.',
    '',
    'Changed input fields:',
    ...changes.map(change => [
      `- ${change.label} (${change.field})`,
      `  Previous: ${formatChangeValue(change.before)}`,
      `  Current: ${formatChangeValue(change.after)}`,
    ].join('\n')),
  ]
  return lines.join('\n')
}

function normalizeProjectSeed(seed: NovelProject['seed']): NovelProject['seed'] {
  const normalized = {
    worldbuilding: seed?.worldbuilding?.trim() || undefined,
    characters: seed?.characters?.trim() || undefined,
    outline: seed?.outline?.trim() || undefined,
    allowExpertChanges: seed?.allowExpertChanges === true,
  }
  return normalized.worldbuilding || normalized.characters || normalized.outline
    ? normalized
    : undefined
}

function normalizeOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

function formatChangeValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') {
    return '(empty)'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}
