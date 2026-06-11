export type RunMode = 'yolo' | 'step'
export type ProjectStatus = 'idle' | 'running' | 'awaiting_review' | 'completed' | 'failed'
export type ArtifactStatus = 'draft' | 'needs_review' | 'approved' | 'rejected'
export type WorkflowEventType =
  | 'project.created'
  | 'project.updated'
  | 'message.received'
  | 'message.sent'
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'stage.started'
  | 'stage.completed'
  | 'stage.awaiting_review'
  | 'approval.recorded'
  | 'tool.called'
  | 'sandbox.exec'

export type WorkflowStage =
  | 'requirements'
  | 'worldbuilding'
  | 'worldbuilding_review'
  | 'characters'
  | 'characters_review'
  | 'story_background'
  | 'story_background_review'
  | 'outline'
  | 'outline_review'
  | 'scene_writing'
  | 'chapter_editing'
  | 'chapter_supervision'
  | 'supervision'
  | 'editing'
  | 'final'

export interface NovelWriterConfig {
  deepSeekApiKey?: string
  deepSeekBaseUrl: string
  deepSeekModel: 'deepseek-v4-pro' | 'deepseek-v4-flash'
  defaultReasoningEffort: 'high' | 'max'
  tavilyApiKey?: string
  tavilyBaseUrl: string
  defaultMaxRevisionLoops: number
}

export interface PublicNovelWriterConfig {
  deepSeekBaseUrl: string
  deepSeekModel: NovelWriterConfig['deepSeekModel']
  defaultReasoningEffort: NovelWriterConfig['defaultReasoningEffort']
  hasDeepSeekApiKey: boolean
  hasTavilyApiKey: boolean
  tavilyBaseUrl: string
  defaultMaxRevisionLoops: number
}

export interface NovelProject {
  id: string
  title: string
  brief: string
  mode: RunMode
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  trashedAt?: string
  currentStage?: WorkflowStage
  maxRevisionLoops: number
  seed?: ProjectSeed
}

export interface ProjectSeed {
  worldbuilding?: string
  worldbuildingModificationInstructions?: string
  characters?: string
  charactersModificationInstructions?: string
  outline?: string
  outlineModificationInstructions?: string
  /** Legacy global instruction; new UI should prefer per-section instruction fields. */
  modificationInstructions?: string
  allowExpertChanges?: boolean
}

export interface ProjectInputChange {
  field: string
  label: string
  before: string | number | boolean | undefined
  after: string | number | boolean | undefined
  affectsContent: boolean
}

export interface ProjectInputRevision {
  changedFields: ProjectInputChange[]
  affectedStages: WorkflowStage[]
  feedback: string
}

export interface SearchReference {
  title: string
  url: string
  content?: string
  rawContent?: string
  score?: number
  publishedDate?: string
  query: string
  source: 'tavily'
}

export interface ArtifactRef {
  id: string
  projectId: string
  stage: WorkflowStage
  agentId: string
  title: string
  status: ArtifactStatus
  createdAt: string
  updatedAt: string
  json: unknown
  markdown: string
  references: SearchReference[]
  /** Set for per-chapter artifacts (scene_writing, chapter_editing, chapter_supervision). */
  chapterIndex?: number
}

export interface ReviewFinding {
  severity: 'info' | 'warning' | 'blocker'
  message: string
  suggestion: string
}

export interface ReviewReport {
  passed: boolean
  findings: ReviewFinding[]
  revisionLoop: number
}

export interface WorkflowEvent {
  id: string
  projectId: string
  runId?: string
  timestamp: string
  type: WorkflowEventType
  stage?: WorkflowStage
  agentId?: string
  status?: ProjectStatus | ArtifactStatus
  message: string
  payload?: unknown
}

export interface RealtimeWorkflowEventMessage {
  type: 'workflow.event'
  projectId: string
  event: WorkflowEvent
  timestamp: string
}

export interface RealtimeStageContentDeltaMessage {
  type: 'stage.content.delta'
  projectId: string
  runId?: string
  stage?: WorkflowStage
  agentId?: string
  sequence: number
  delta: string
  markdownPreview?: string
  timestamp: string
}

export interface RealtimeStageContentDoneMessage {
  type: 'stage.content.done'
  projectId: string
  runId?: string
  stage?: WorkflowStage
  agentId?: string
  markdown: string
  timestamp: string
}

export interface RealtimeStageContentErrorMessage {
  type: 'stage.content.error'
  projectId: string
  runId?: string
  stage?: WorkflowStage
  agentId?: string
  message: string
  timestamp: string
}

export interface RealtimeErrorMessage {
  type: 'realtime.error'
  projectId: string
  message: string
  timestamp: string
}

export type RealtimeMessage =
  | RealtimeWorkflowEventMessage
  | RealtimeStageContentDeltaMessage
  | RealtimeStageContentDoneMessage
  | RealtimeStageContentErrorMessage
  | RealtimeErrorMessage

export interface ToolCallRecord {
  id: string
  projectId: string
  agentId: string
  toolName: string
  input: unknown
  output?: unknown
  error?: string
  startedAt: string
  endedAt?: string
}

export interface ResumeCheckpoint {
  projectId: string
  runId?: string
  currentStage?: WorkflowStage
  completedStages: WorkflowStage[]
  /** Tracks which per-chapter stages are complete: { stage, chapterIndex }[] */
  completedChapterStages?: Array<{ stage: WorkflowStage; chapterIndex: number }>
  totalChapters?: number
  awaitingApprovalArtifactId?: string
  updatedAt: string
}

export interface AgentDefinition {
  id: string
  title: string
  stage: WorkflowStage
  skillFiles: string[]
  searchDepth: 'basic' | 'advanced'
  reasoningEffort?: 'high' | 'max'
}

export interface AgentRunContext {
  project: NovelProject
  config: NovelWriterConfig
  runId: string
  previousArtifacts: ArtifactRef[]
}
