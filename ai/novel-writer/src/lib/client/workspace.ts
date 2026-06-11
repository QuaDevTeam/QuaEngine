import type { ArtifactRef, NovelProject, ReviewFinding, WorkflowEvent, WorkflowStage } from '$lib/types'

export type PlannerMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ApprovalAction = 'approve' | 'request_changes' | 'manual_edit' | 'regenerate'
export type ArtifactViewMode = 'preview' | 'edit'
export type InspectorTabId = 'chat' | 'review' | 'refs' | 'log'

export type Tone = 'neutral' | 'running' | 'success' | 'warning' | 'danger'

export type StageContentPreview = {
  projectId: string
  runId?: string
  stage?: WorkflowStage
  agentId?: string
  markdown: string
  status: 'streaming' | 'done' | 'error'
  message?: string
  updatedAt: string
}

export const workflowStages: WorkflowStage[] = [
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
  'chapter_editing',
  'chapter_supervision',
  'supervision',
  'editing',
  'final',
]

export const workflowStageLabels: Record<WorkflowStage, string> = {
  requirements: '需求确认',
  worldbuilding: '世界观',
  worldbuilding_review: '世界观评审',
  characters: '角色设定',
  characters_review: '角色评审',
  story_background: '故事背景',
  story_background_review: '故事背景评审',
  outline: '大纲',
  outline_review: '大纲评审',
  scene_writing: '正文写作',
  chapter_editing: '章节润色',
  chapter_supervision: '章节监督',
  supervision: '全文监督',
  editing: '全文润色',
  final: '最终成品',
}

export type ChapterTimelineItem = {
  chapterIndex: number
  title: string
  sceneArtifact?: ArtifactRef
  editingArtifact?: ArtifactRef
  supervisionArtifact?: ArtifactRef
  state: 'pending' | 'running' | 'needs_review' | 'done'
  currentSubStage?: 'scene_writing' | 'chapter_editing' | 'chapter_supervision'
}

export type StageTimelineItem = {
  stage: WorkflowStage
  label: string
  artifact?: ArtifactRef
  /** All historical artifacts for this stage, newest-first. */
  history: ArtifactRef[]
  state: 'pending' | 'running' | 'needs_review' | 'approved' | 'rejected' | 'draft'
  loopTargetStage?: WorkflowStage
  loopTargetLabel?: string
  dependencyLoopTargetStage?: WorkflowStage
  dependencyLoopTargetLabel?: string
  dependencyLoopSpan?: number
  revisionLoop?: number
  maxRevisionLoops?: number
  /** Populated for scene_writing when chapters are available. */
  chapterItems?: ChapterTimelineItem[]
}

const reviewLoopTargets: Partial<Record<WorkflowStage, WorkflowStage>> = {
  worldbuilding_review: 'worldbuilding',
  characters_review: 'characters',
  story_background_review: 'story_background',
  outline_review: 'outline',
}

const dependencyLoopTargets: Partial<Record<WorkflowStage, WorkflowStage>> = {
  outline: 'characters',
}

export function dedupeEvents(items: WorkflowEvent[]): WorkflowEvent[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function summarizeRunLogEvents(items: WorkflowEvent[]): WorkflowEvent[] {
  return items.filter((event, index) => {
    if (event.type === 'sandbox.exec') {
      return false
    }
    if (event.type === 'approval.recorded' && eventPayloadAction(event.payload) === 'approve') {
      return false
    }
    if (event.type === 'stage.completed') {
      const next = items[index + 1]
      if (
        next?.type === 'stage.awaiting_review'
        && next.projectId === event.projectId
        && next.runId === event.runId
        && next.stage === event.stage
      ) {
        return false
      }
    }
    return true
  })
}

export function computeProgress(project: NovelProject | undefined, currentArtifacts: ArtifactRef[]): number {
  if (!project) {
    return 0
  }
  if (project.status === 'completed') {
    return 100
  }
  return Math.min(95, Math.round((currentArtifacts.length / 10) * 100))
}

/** Stages rendered as sub-items under scene_writing, not top-level nodes. */
const chapterSubStages = new Set<WorkflowStage>(['chapter_editing', 'chapter_supervision'])

export function buildStageTimeline(project: NovelProject | undefined, artifacts: ArtifactRef[]): StageTimelineItem[] {
  return workflowStages
    .filter(stage => !chapterSubStages.has(stage))
    .map(stage => {
      const history = [...artifacts].reverse().filter(item => item.stage === stage && item.chapterIndex === undefined)
      const artifact = history[0]
      const loopTargetStage = reviewLoopTargets[stage]
      const dependencyLoopTargetStage = dependencyLoopTargets[stage]
      const dependencyLoopSpan = dependencyLoopTargetStage
        ? workflowStages.indexOf(stage) - workflowStages.indexOf(dependencyLoopTargetStage)
        : undefined
      let state: StageTimelineItem['state'] = 'pending'
      if (project?.currentStage === stage && project.status === 'running') {
        state = 'running'
      }
      else if (artifact?.status === 'needs_review') { state = 'needs_review' }
      else if (artifact?.status === 'approved') { state = 'approved' }
      else if (artifact?.status === 'rejected') { state = 'rejected' }
      else if (artifact?.status === 'draft') { state = 'draft' }

      let chapterItems: ChapterTimelineItem[] | undefined
      if (stage === 'scene_writing') {
        chapterItems = buildChapterItems(project, artifacts)
        // scene_writing node is running if any chapter is running/pending
        if (chapterItems.length > 0) {
          const hasRunning = chapterItems.some(c => c.state === 'running')
          const hasNeedsReview = chapterItems.some(c => c.state === 'needs_review')
          const allDone = chapterItems.every(c => c.state === 'done')
          if (hasRunning || (project?.currentStage === 'scene_writing' && project.status === 'running')) {
            state = 'running'
          }
          else if (hasNeedsReview) { state = 'needs_review' }
          else if (allDone) { state = 'draft' }
        }
      }

      return {
        stage,
        label: workflowStageLabels[stage],
        artifact,
        history,
        state,
        loopTargetStage,
        loopTargetLabel: loopTargetStage ? workflowStageLabels[loopTargetStage] : undefined,
        dependencyLoopTargetStage,
        dependencyLoopTargetLabel: dependencyLoopTargetStage ? workflowStageLabels[dependencyLoopTargetStage] : undefined,
        dependencyLoopSpan,
        revisionLoop: revisionLoopFromArtifact(artifact),
        maxRevisionLoops: loopTargetStage ? project?.maxRevisionLoops : undefined,
        chapterItems,
      }
    })
}

function buildChapterItems(project: NovelProject | undefined, artifacts: ArtifactRef[]): ChapterTimelineItem[] {
  // Collect all chapter artifacts grouped by chapterIndex
  const chapterArtifacts = artifacts.filter(a => a.chapterIndex !== undefined)
  if (chapterArtifacts.length === 0) return []

  const maxIndex = Math.max(...chapterArtifacts.map(a => a.chapterIndex!))
  const items: ChapterTimelineItem[] = []

  for (let i = 0; i <= maxIndex; i += 1) {
    const forChapter = chapterArtifacts.filter(a => a.chapterIndex === i)
    const scene = [...forChapter].reverse().find(a => a.stage === 'scene_writing')
    const editing = [...forChapter].reverse().find(a => a.stage === 'chapter_editing')
    const supervision = [...forChapter].reverse().find(a => a.stage === 'chapter_supervision')

    let state: ChapterTimelineItem['state'] = 'pending'
    let currentSubStage: ChapterTimelineItem['currentSubStage']

    const isCurrentChapter = project?.currentStage === 'scene_writing'
      || project?.currentStage === 'chapter_editing'
      || project?.currentStage === 'chapter_supervision'

    if (supervision?.status === 'draft' || supervision?.status === 'approved') {
      state = 'done'
    }
    else if (scene?.status === 'needs_review') {
      state = 'needs_review'
      currentSubStage = 'scene_writing'
    }
    else if (isCurrentChapter && project?.status === 'running') {
      if (editing && !supervision) {
        state = 'running'; currentSubStage = 'chapter_supervision'
      }
      else if (scene && !editing) {
        state = 'running'; currentSubStage = 'chapter_editing'
      }
      else if (!scene) {
        state = 'running'; currentSubStage = 'scene_writing'
      }
    }
    else if (scene) {
      state = 'pending' // scene done but not yet post-processed
    }

    const title = scene?.title?.replace(/^正文场景\s*·\s*/, '') ?? `第 ${i + 1} 章`
    items.push({ chapterIndex: i, title, sceneArtifact: scene, editingArtifact: editing, supervisionArtifact: supervision, state, currentSubStage })
  }

  return items
}

function revisionLoopFromArtifact(artifact: ArtifactRef | undefined): number | undefined {
  if (!artifact?.json || typeof artifact.json !== 'object' || !('revisionLoop' in artifact.json)) {
    return undefined
  }
  const value = artifact.json.revisionLoop
  return typeof value === 'number' ? value : undefined
}

export function formatEventTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function buildPlannerMessages(projectEvents: WorkflowEvent[]): PlannerMessage[] {
  return projectEvents
    .filter(event => event.agentId === 'requirements_planner' && (event.type === 'message.received' || event.type === 'message.sent'))
    .map(event => ({
      role: (event.type === 'message.received' ? 'user' : 'assistant') as PlannerMessage['role'],
      content: payloadContent(event.payload),
      timestamp: event.timestamp,
    }))
    .filter(message => message.content.length > 0)
}

export function extractReviewFindings(json: unknown): ReviewFinding[] {
  if (!json || typeof json !== 'object' || !('findings' in json) || !Array.isArray(json.findings)) {
    return []
  }
  return json.findings.filter((finding): finding is ReviewFinding => Boolean(
    finding
    && typeof finding === 'object'
    && 'severity' in finding
    && 'message' in finding
    && 'suggestion' in finding,
  ))
}

export function eventLabel(event: WorkflowEvent): string {
  const labels: Record<WorkflowEvent['type'], string> = {
    'project.created': '项目创建',
    'project.updated': '项目更新',
    'message.received': '用户消息',
    'message.sent': 'Agent 回复',
    'run.started': '运行开始',
    'run.completed': '运行完成',
    'run.failed': '运行失败',
    'stage.started': '阶段开始',
    'stage.completed': '阶段完成',
    'stage.awaiting_review': '等待确认',
    'approval.recorded': '人工确认',
    'tool.called': '工具调用',
    'sandbox.exec': '工具命令',
  }
  return labels[event.type]
}

export function eventTone(event: WorkflowEvent): Tone {
  if (event.type.includes('failed')) {
    return 'danger'
  }
  if (event.type.includes('completed')) {
    return 'success'
  }
  if (event.type.includes('awaiting') || event.type.includes('approval')) {
    return 'warning'
  }
  if (event.type.includes('started') || event.type === 'tool.called') {
    return 'running'
  }
  return 'neutral'
}

export type StatusDescriptor = { label: string, tone: Tone }

export function projectStatusInfo(status: NovelProject['status']): StatusDescriptor {
  const map: Record<NovelProject['status'], StatusDescriptor> = {
    idle: { label: '空闲', tone: 'neutral' },
    running: { label: '运行中', tone: 'running' },
    awaiting_review: { label: '待确认', tone: 'warning' },
    completed: { label: '已完成', tone: 'success' },
    failed: { label: '失败', tone: 'danger' },
  }
  return map[status]
}

export function artifactStatusInfo(status: ArtifactRef['status']): StatusDescriptor {
  const map: Record<ArtifactRef['status'], StatusDescriptor> = {
    draft: { label: '已生成', tone: 'success' },
    needs_review: { label: '待确认', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '需修改', tone: 'danger' },
  }
  return map[status]
}

export function findingInfo(severity: ReviewFinding['severity']): StatusDescriptor {
  const map: Record<ReviewFinding['severity'], StatusDescriptor> = {
    info: { label: '提示', tone: 'neutral' },
    warning: { label: '建议', tone: 'warning' },
    blocker: { label: '阻断', tone: 'danger' },
  }
  return map[severity]
}

function payloadContent(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'content' in payload && typeof payload.content === 'string') {
    return payload.content
  }
  return ''
}

function eventPayloadAction(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'action' in payload && typeof payload.action === 'string') {
    return payload.action
  }
  return ''
}

export type OutlineChapter = {
  index: number
  title: string
  line: number
}

/**
 * Extract chapter list from outline markdown.
 * Looks for headings like "## 第1章：..." or "## 第一章 ..."
 */
export function extractOutlineChapters(markdown: string): OutlineChapter[] {
  const chapters: OutlineChapter[] = []
  const lines = markdown.split('\n')
  const chapterPattern = /^##\s*第\s*[一二三四五六七八九十\d]+\s*章[\s：:]/i

  lines.forEach((line, lineIndex) => {
    if (chapterPattern.test(line)) {
      const title = line.replace(/^##\s*/, '').trim()
      chapters.push({ index: chapters.length, title, line: lineIndex + 1 })
    }
  })

  return chapters
}
