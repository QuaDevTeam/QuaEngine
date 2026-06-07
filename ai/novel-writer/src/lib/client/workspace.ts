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
  'editing',
  'supervision',
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
  editing: '编辑润色',
  supervision: '写作监督',
  final: '最终成品',
}

export type StageTimelineItem = {
  stage: WorkflowStage
  label: string
  artifact?: ArtifactRef
  /** All historical artifacts for this stage, newest-first. */
  history: ArtifactRef[]
  state: 'pending' | 'running' | 'needs_review' | 'approved' | 'rejected' | 'draft'
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

export function computeProgress(project: NovelProject | undefined, currentArtifacts: ArtifactRef[]): number {
  if (!project) {
    return 0
  }
  if (project.status === 'completed') {
    return 100
  }
  return Math.min(95, Math.round((currentArtifacts.length / 10) * 100))
}

export function buildStageTimeline(project: NovelProject | undefined, artifacts: ArtifactRef[]): StageTimelineItem[] {
  return workflowStages.map(stage => {
    const history = [...artifacts].reverse().filter(item => item.stage === stage)
    const artifact = history[0]
    let state: StageTimelineItem['state'] = 'pending'
    if (project?.currentStage === stage && project.status === 'running') {
      state = 'running'
    }
    else if (artifact?.status === 'needs_review') { state = 'needs_review' }
    else if (artifact?.status === 'approved') { state = 'approved' }
    else if (artifact?.status === 'rejected') { state = 'rejected' }
    else if (artifact?.status === 'draft') { state = 'draft' }
    return { stage, label: workflowStageLabels[stage], artifact, history, state }
  })
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
