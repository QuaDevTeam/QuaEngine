import {
  appendPlannerMessage,
  createProject as createProjectRequest,
  deleteProject as deleteProjectRequest,
  emptyTrash as emptyTrashRequest,
  exportProject as exportProjectRequest,
  listProjects as listProjectsRequest,
  listTrashedProjects as listTrashedProjectsRequest,
  permanentlyDeleteProject as permanentlyDeleteProjectRequest,
  readProject,
  recordApproval,
  resetProject as resetProjectRequest,
  restoreProject as restoreProjectRequest,
  startRun,
  updateConfig,
  updateProjectInput as updateProjectInputRequest,
} from '$lib/client/api'
import { toast } from 'svelte-sonner'
import {
  buildPlannerMessages,
  buildStageTimeline,
  computeProgress,
  dedupeEvents,
  extractReviewFindings,
  summarizeRunLogEvents,
  type ApprovalAction,
  type PlannerMessage,
  type StageContentPreview,
} from '$lib/client/workspace'
import type {
  ArtifactRef,
  NovelProject,
  ProjectInputChange,
  PublicNovelWriterConfig,
  RealtimeMessage,
  RunMode,
  WorkflowEvent,
  WorkflowStage,
} from '$lib/types'

export type NovelWriterPageData = {
  config: PublicNovelWriterConfig
  projects: NovelProject[]
  trashedProjects: NovelProject[]
  selectedProjectDetail?: {
    project: NovelProject
    artifacts: ArtifactRef[]
    events: WorkflowEvent[]
  }
}

type NewProjectDraft = {
  title: string
  brief: string
  mode: RunMode
  maxRevisionLoops: string
  seedWorldbuilding: string
  seedWorldbuildingModificationInstructions: string
  seedCharacters: string
  seedCharactersModificationInstructions: string
  seedOutline: string
  seedOutlineModificationInstructions: string
  allowExpertSeedChanges: boolean
}

const newProjectDraftKey = 'novel-writer:new-project-draft:v1'

export function createWorkspaceController(data: NovelWriterPageData): WorkspaceController {
  return new WorkspaceController(data)
}

export class WorkspaceController {
  config = $state<PublicNovelWriterConfig>({
    deepSeekBaseUrl: '',
    deepSeekModel: 'deepseek-v4-pro',
    defaultReasoningEffort: 'high',
    hasDeepSeekApiKey: false,
    hasTavilyApiKey: false,
    tavilyBaseUrl: '',
    defaultMaxRevisionLoops: 50,
  })

  deepSeekApiKey = $state('')
  deepSeekBaseUrl = $state('')
  deepSeekModel = $state<PublicNovelWriterConfig['deepSeekModel']>('deepseek-v4-pro')
  defaultReasoningEffort = $state<PublicNovelWriterConfig['defaultReasoningEffort']>('high')
  tavilyApiKey = $state('')
  tavilyBaseUrl = $state('')
  maxRevisionLoops = $state('50')

  projects = $state<NovelProject[]>([])
  trashedProjects = $state<NovelProject[]>([])
  selectedProjectId = $state('')
  selectedProject = $state<NovelProject | undefined>(undefined)
  artifacts = $state<ArtifactRef[]>([])
  events = $state<WorkflowEvent[]>([])
  selectedArtifactId = $state('')
  liveContent = $state<StageContentPreview | undefined>(undefined)

  projectTitle = $state('')
  projectBrief = $state('')
  projectMode = $state<RunMode>('step')
  projectMaxRevisionLoops = $state('50')
  seedWorldbuilding = $state('')
  seedWorldbuildingModificationInstructions = $state('')
  seedCharacters = $state('')
  seedCharactersModificationInstructions = $state('')
  seedOutline = $state('')
  seedOutlineModificationInstructions = $state('')
  allowExpertSeedChanges = $state(false)
  projectCreateError = $state('')

  plannerMessages = $state<PlannerMessage[]>([])
  plannerInput = $state('')
  sendingMessage = $state(false)
  artifactMarkdownEdit = $state('')
  artifactEditArtifactId = $state('')
  reviewNote = $state('')
  pendingApprovalAction = $state('')

  savingConfig = $state(false)
  running = $state(false)
  creating = $state(false)
  deletingProjectId = $state('')
  deletingTrashedProjectId = $state('')
  restoringProjectId = $state('')
  emptyingTrash = $state(false)
  exportingProjectId = $state('')
  resettingProjectId = $state('')

  configDialog = $state<HTMLDialogElement | undefined>(undefined)
  projectDialog = $state<HTMLDialogElement | undefined>(undefined)
  editProjectDialog = $state<HTMLDialogElement | undefined>(undefined)
  confirmDialogOpen = $state(false)
  confirmTitle = $state('')
  confirmDescription = $state('')
  confirmLabel = $state('确认')
  confirmVariant = $state<'default' | 'destructive'>('default')

  selectedArtifact = $derived.by(() => (
    this.artifacts.find(artifact => artifact.id === this.selectedArtifactId) || this.artifacts.at(-1)
  ))
  reviewFindings = $derived.by(() => extractReviewFindings(this.selectedArtifact?.json))
  progress = $derived.by(() => computeProgress(this.selectedProject, this.artifacts))
  stageTimeline = $derived.by(() => buildStageTimeline(this.selectedProject, this.artifacts))
  visibleEvents = $derived.by(() => summarizeRunLogEvents(this.events))
  confirmBusy = $derived.by(() => Boolean(
    this.deletingProjectId || this.deletingTrashedProjectId || this.emptyingTrash || this.resettingProjectId,
  ))
  hasProjectDraft = $derived.by(() => this.hasNonDefaultProjectDraft(this.getProjectDraft()))

  private eventSource: EventSource | undefined
  private subscribedProjectId = ''
  private pendingConfirm: (() => void | Promise<void>) | undefined
  private projectDraftPersistenceReady = $state(false)

  editingProjectId = $state('')
  editProjectTitle = $state('')
  editProjectBrief = $state('')
  editProjectMode = $state<RunMode>('step')
  editProjectMaxRevisionLoops = $state('50')
  editSeedWorldbuilding = $state('')
  editSeedWorldbuildingModificationInstructions = $state('')
  editSeedCharacters = $state('')
  editSeedCharactersModificationInstructions = $state('')
  editSeedOutline = $state('')
  editSeedOutlineModificationInstructions = $state('')
  editAllowExpertSeedChanges = $state(false)
  savingProjectEdit = $state(false)
  projectEditError = $state('')
  projectEditChangedFields = $state<ProjectInputChange[]>([])
  projectEditRevisionStarted = $state(false)

  constructor(data: NovelWriterPageData) {
    this.config = { ...data.config }
    this.deepSeekBaseUrl = data.config.deepSeekBaseUrl
    this.deepSeekModel = data.config.deepSeekModel
    this.defaultReasoningEffort = data.config.defaultReasoningEffort
    this.tavilyBaseUrl = data.config.tavilyBaseUrl
    this.maxRevisionLoops = String(data.config.defaultMaxRevisionLoops)
    this.projectMaxRevisionLoops = String(data.config.defaultMaxRevisionLoops)
    this.projects = [...data.projects]
    this.trashedProjects = [...data.trashedProjects]
    this.selectedProjectId = data.selectedProjectDetail?.project.id || this.projects[0]?.id || ''
    this.selectedProject = data.selectedProjectDetail?.project || this.projects[0]
    this.artifacts = data.selectedProjectDetail?.artifacts || []
    this.events = data.selectedProjectDetail?.events || []
    this.plannerMessages = buildPlannerMessages(this.events)
    this.selectedArtifactId = this.artifacts.at(-1)?.id || ''

    $effect(() => {
      if (!this.projectDraftPersistenceReady) {
        return
      }
      this.persistProjectDraft()
    })
  }

  init = () => {
    this.restoreProjectDraft()
    this.projectDraftPersistenceReady = true
    if (this.selectedProjectId) {
      void this.selectProject(this.selectedProjectId)
    }
  }

  destroy = () => {
    this.closeEventSource()
  }

  syncSelectedArtifactDraft = () => {
    if (this.selectedArtifact && this.artifactEditArtifactId !== this.selectedArtifact.id) {
      this.artifactEditArtifactId = this.selectedArtifact.id
      this.artifactMarkdownEdit = this.selectedArtifact.markdown
      this.reviewNote = ''
    }
  }

  openConfigDialog = () => {
    this.deepSeekBaseUrl = this.config.deepSeekBaseUrl
    this.deepSeekModel = this.config.deepSeekModel
    this.defaultReasoningEffort = this.config.defaultReasoningEffort
    this.tavilyBaseUrl = this.config.tavilyBaseUrl
    this.maxRevisionLoops = String(this.config.defaultMaxRevisionLoops)
    this.configDialog?.showModal()
  }

  openProjectDialog = () => {
    this.projectCreateError = ''
    this.restoreProjectDraft()
    this.projectDialog?.showModal()
  }

  saveConfig = async () => {
    this.savingConfig = true
    try {
      this.config = await updateConfig({
        deepSeekApiKey: this.deepSeekApiKey,
        deepSeekBaseUrl: this.deepSeekBaseUrl,
        deepSeekModel: this.deepSeekModel,
        defaultReasoningEffort: this.defaultReasoningEffort,
        tavilyApiKey: this.tavilyApiKey,
        tavilyBaseUrl: this.tavilyBaseUrl,
        defaultMaxRevisionLoops: Number(this.maxRevisionLoops) || 50,
      })
      this.deepSeekBaseUrl = this.config.deepSeekBaseUrl
      this.deepSeekModel = this.config.deepSeekModel
      this.defaultReasoningEffort = this.config.defaultReasoningEffort
      this.tavilyBaseUrl = this.config.tavilyBaseUrl
      this.maxRevisionLoops = String(this.config.defaultMaxRevisionLoops)
      this.projectMaxRevisionLoops = String(this.config.defaultMaxRevisionLoops)
      this.deepSeekApiKey = ''
      this.tavilyApiKey = ''
      this.configDialog?.close()
      toast.success('设置已保存。')
    }
    catch (error) {
      toast.error('保存设置失败', { description: readableError(error) })
    }
    finally {
      this.savingConfig = false
    }
  }

  createProject = async () => {
    if (!this.projectTitle.trim() || !this.projectBrief.trim()) {
      return
    }

    this.creating = true
    this.projectCreateError = ''
    try {
      const project = await createProjectRequest({
        title: this.projectTitle,
        brief: this.projectBrief,
        mode: this.projectMode,
        maxRevisionLoops: Number(this.projectMaxRevisionLoops) || this.config.defaultMaxRevisionLoops,
        seed: {
          worldbuilding: this.seedWorldbuilding,
          worldbuildingModificationInstructions: this.seedWorldbuildingModificationInstructions,
          characters: this.seedCharacters,
          charactersModificationInstructions: this.seedCharactersModificationInstructions,
          outline: this.seedOutline,
          outlineModificationInstructions: this.seedOutlineModificationInstructions,
          allowExpertChanges: this.allowExpertSeedChanges,
        },
      })
      this.upsertProject(project)
      this.projectDialog?.close()
      this.resetProjectDraft()
      await this.selectProject(project.id)
      await this.startProjectRun(project.id, project.mode, undefined, {
        successMessage: project.mode === 'yolo' ? '项目已创建，YOLO 运行已启动。' : '项目已创建，单步运行已启动。',
        errorTitle: '项目已创建，但自动启动失败',
      })
    }
    catch (error) {
      this.projectCreateError = readableError(error)
      toast.error('创建项目失败', { description: this.projectCreateError })
    }
    finally {
      this.creating = false
    }
  }

  resetProjectDraft = () => {
    this.projectTitle = ''
    this.projectBrief = ''
    this.projectMode = 'step'
    this.projectMaxRevisionLoops = String(this.config.defaultMaxRevisionLoops)
    this.seedWorldbuilding = ''
    this.seedWorldbuildingModificationInstructions = ''
    this.seedCharacters = ''
    this.seedCharactersModificationInstructions = ''
    this.seedOutline = ''
    this.seedOutlineModificationInstructions = ''
    this.allowExpertSeedChanges = false
    this.projectCreateError = ''
    removeLocalDraft()
  }

  deleteProject = async (projectId: string) => {
    const project = this.projects.find(item => item.id === projectId)
    if (!project || project.status === 'running' || this.deletingProjectId) {
      return
    }

    this.openConfirmDialog({
      title: '移入回收站',
      description: `将项目“${project.title}”移入回收站？项目文件会保留，直到你清空回收站或在回收站中永久删除。`,
      confirmLabel: '移入回收站',
      variant: 'destructive',
      action: () => this.trashProject(projectId),
    })
  }

  openEditProjectDialog = async (projectId: string) => {
    const project = this.projects.find(item => item.id === projectId)
    if (!project || project.status === 'running') {
      return
    }

    this.editingProjectId = projectId
    this.projectEditError = ''
    this.projectEditChangedFields = []
    this.projectEditRevisionStarted = false
    this.populateProjectEdit(project)
    this.editProjectDialog?.showModal()
  }

  saveProjectEdit = async () => {
    if (!this.editingProjectId || !this.editProjectTitle.trim() || !this.editProjectBrief.trim()) {
      return
    }

    this.savingProjectEdit = true
    this.projectEditError = ''
    this.projectEditChangedFields = []
    this.projectEditRevisionStarted = false
    try {
      const result = await updateProjectInputRequest(this.editingProjectId, {
        title: this.editProjectTitle,
        brief: this.editProjectBrief,
        mode: this.editProjectMode,
        maxRevisionLoops: Number(this.editProjectMaxRevisionLoops) || this.config.defaultMaxRevisionLoops,
        seed: {
          worldbuilding: this.editSeedWorldbuilding,
          worldbuildingModificationInstructions: this.editSeedWorldbuildingModificationInstructions,
          characters: this.editSeedCharacters,
          charactersModificationInstructions: this.editSeedCharactersModificationInstructions,
          outline: this.editSeedOutline,
          outlineModificationInstructions: this.editSeedOutlineModificationInstructions,
          allowExpertChanges: this.editAllowExpertSeedChanges,
        },
      })

      this.projectEditChangedFields = result.changedFields
      this.projectEditRevisionStarted = result.revisionStarted
      this.upsertProject(result.project)

      if (this.selectedProjectId === result.project.id) {
        this.selectedProject = result.project
        this.artifacts = result.artifacts
        this.events = result.events
        this.plannerMessages = buildPlannerMessages(this.events)
        this.subscribeEvents(result.project.id)
      }

      if (!result.changedFields.length) {
        this.editProjectDialog?.close()
        toast.info('项目输入没有变化。')
      }
      else if (result.revisionStarted) {
        toast.success('项目已保存，修订流程已启动。')
      }
      else {
        toast.success('项目已保存。')
      }
    }
    catch (error) {
      this.projectEditError = readableError(error)
      toast.error('保存项目失败', { description: this.projectEditError })
    }
    finally {
      this.savingProjectEdit = false
    }
  }

  restoreProject = async (projectId: string) => {
    if (this.restoringProjectId) {
      return
    }

    this.restoringProjectId = projectId
    try {
      const restoredProject = await restoreProjectRequest(projectId)
      this.trashedProjects = this.trashedProjects.filter(project => project.id !== projectId)
      this.projects = [restoredProject, ...this.projects.filter(project => project.id !== projectId)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      if (!this.selectedProjectId) {
        await this.selectProject(restoredProject.id)
      }
      await this.syncProjectListsAfterMutation()
      toast.success(`已恢复“${restoredProject.title}”。`)
    }
    catch (error) {
      toast.error('恢复项目失败', { description: readableError(error) })
    }
    finally {
      this.restoringProjectId = ''
    }
  }

  permanentlyDeleteProject = async (projectId: string) => {
    const project = this.trashedProjects.find(item => item.id === projectId)
    if (!project || this.deletingTrashedProjectId) {
      return
    }

    this.openConfirmDialog({
      title: '永久删除项目',
      description: `永久删除回收站中的“${project.title}”？此操作会真正删除磁盘上的项目文件，且不可撤销。`,
      confirmLabel: '永久删除',
      variant: 'destructive',
      action: () => this.deleteTrashedProject(projectId),
    })
  }

  emptyTrash = async () => {
    if (this.emptyingTrash || this.trashedProjects.length === 0) {
      return
    }

    this.openConfirmDialog({
      title: '清空回收站',
      description: `清空回收站？这会永久删除 ${this.trashedProjects.length} 个项目的磁盘文件，且不可撤销。`,
      confirmLabel: '清空回收站',
      variant: 'destructive',
      action: this.deleteAllTrashedProjects,
    })
  }

  resetProject = async (projectId: string) => {
    const project = this.projects.find(item => item.id === projectId)
    if (!project || project.status === 'running' || this.resettingProjectId) {
      return
    }

    this.openConfirmDialog({
      title: '重置并重新开始',
      description: `清空“${project.title}”的所有已生成产物、对话、运行日志和快照，然后按当前模式重新启动？项目标题、简介和高级输入会保留。`,
      confirmLabel: '重置并重新开始',
      variant: 'destructive',
      action: () => this.resetProjectAndRestart(projectId),
    })
  }

  confirmPendingAction = async () => {
    const action = this.pendingConfirm
    if (!action) {
      this.confirmDialogOpen = false
      return
    }

    try {
      await action()
      this.confirmDialogOpen = false
      this.pendingConfirm = undefined
    }
    catch (error) {
      toast.error(`${this.confirmTitle}失败`, { description: readableError(error) })
    }
  }

  selectProject = async (projectId: string) => {
    try {
      await this.loadProject(projectId, false)
      this.subscribeEvents(projectId)
    }
    catch (error) {
      toast.error('加载项目失败', { description: readableError(error) })
    }
  }

  runProject = async (mode = this.selectedProject?.mode || 'step', chapterIndex?: number) => {
    if (!this.selectedProjectId) {
      return
    }

    await this.startProjectRun(this.selectedProjectId, mode, chapterIndex)
  }

  private startProjectRun = async (
    projectId: string,
    mode: RunMode,
    chapterIndex?: number,
    options: {
      successMessage?: string
      errorTitle?: string
    } = {},
  ) => {
    this.running = true
    this.markProjectRunning(projectId, mode)
    try {
      await startRun(projectId, mode, chapterIndex)
      this.subscribeEvents(projectId)
      toast.success(options.successMessage || (mode === 'yolo' ? 'YOLO 运行已启动。' : '单步运行已启动。'))
    }
    catch (error) {
      toast.error(options.errorTitle || '启动运行失败', { description: readableError(error) })
      await this.refreshSelectedProject()
      await this.syncProjectListsAfterMutation()
    }
    finally {
      setTimeout(() => {
        this.running = false
        void this.refreshSelectedProject()
        void this.refreshProjectLists()
      }, 500)
    }
  }

  exportSelectedProject = async () => {
    if (!this.selectedProjectId || this.exportingProjectId) {
      return
    }

    const projectId = this.selectedProjectId
    this.exportingProjectId = projectId
    try {
      const download = await exportProjectRequest(projectId)
      triggerDownload(download.blob, download.filename)
      toast.success('导出包已生成。')
    }
    catch (error) {
      toast.error('导出失败', { description: readableError(error) })
    }
    finally {
      this.exportingProjectId = ''
    }
  }

  sendPlannerMessage = async () => {
    if (!this.selectedProjectId || !this.plannerInput.trim()) {
      return
    }

    const content = this.plannerInput.trim()
    this.plannerInput = ''
    this.sendingMessage = true
    this.plannerMessages = [
      ...this.plannerMessages,
      { role: 'user', content, timestamp: new Date().toISOString() },
    ]
    try {
      const result = await appendPlannerMessage(this.selectedProjectId, content)
      if (result.reply) {
        this.plannerMessages = [
          ...this.plannerMessages,
          { role: 'assistant', content: result.reply, timestamp: new Date().toISOString() },
        ]
      }
      await this.refreshSelectedProject()
    }
    catch (error) {
      toast.error('发送消息失败', { description: readableError(error) })
    }
    finally {
      this.sendingMessage = false
    }
  }

  submitApproval = async (action: ApprovalAction) => {
    if (!this.selectedArtifact || !this.selectedProjectId) {
      return
    }

    this.pendingApprovalAction = action
    try {
      const artifactId = this.selectedArtifact.id
      const result = await recordApproval(this.selectedProjectId, {
        artifactId,
        action,
        note: this.reviewNote.trim() || undefined,
        markdown: action === 'manual_edit' ? this.artifactMarkdownEdit : undefined,
      })
      this.selectedProject = result.project
      this.upsertProject(result.project)
      this.artifacts = result.artifacts
      this.events = result.events
      this.plannerMessages = buildPlannerMessages(this.events)
      this.selectedArtifactId = this.artifacts.some(artifact => artifact.id === artifactId)
        ? artifactId
        : this.artifacts.at(-1)?.id || ''
      if (result.project.status !== 'running') {
        this.liveContent = undefined
      }
      this.subscribeEvents(this.selectedProjectId, { force: true })
      toast.success(approvalToastMessage(action))
    }
    catch (error) {
      toast.error('提交审批失败', { description: readableError(error) })
    }
    finally {
      this.pendingApprovalAction = ''
    }
  }

  private trashProject = async (projectId: string) => {
    this.deletingProjectId = projectId
    try {
      const trashedProject = await deleteProjectRequest(projectId)
      const remaining = this.projects.filter(item => item.id !== projectId)
      this.projects = remaining
      this.trashedProjects = [trashedProject, ...this.trashedProjects.filter(item => item.id !== projectId)]
      await this.syncProjectListsAfterMutation()
      toast.success(`已将“${trashedProject.title}”移入回收站。`)

      if (this.selectedProjectId !== projectId) {
        return
      }

      this.closeEventSource()
      const nextProjectId = this.projects[0]?.id
      if (nextProjectId) {
        await this.selectProject(nextProjectId)
      }
      else {
        this.clearSelectedProject()
      }
    }
    catch (error) {
      throw error
    }
    finally {
      this.deletingProjectId = ''
    }
  }

  private deleteTrashedProject = async (projectId: string) => {
    this.deletingTrashedProjectId = projectId
    try {
      const projectTitle = this.trashedProjects.find(item => item.id === projectId)?.title
      await permanentlyDeleteProjectRequest(projectId)
      this.trashedProjects = this.trashedProjects.filter(item => item.id !== projectId)
      await this.syncProjectListsAfterMutation()
      toast.success(projectTitle ? `已永久删除“${projectTitle}”。` : '已永久删除项目。')
    }
    catch (error) {
      throw error
    }
    finally {
      this.deletingTrashedProjectId = ''
    }
  }

  private deleteAllTrashedProjects = async () => {
    this.emptyingTrash = true
    try {
      const count = this.trashedProjects.length
      await emptyTrashRequest()
      this.trashedProjects = []
      await this.syncProjectListsAfterMutation()
      toast.success(`已清空回收站，删除 ${count} 个项目。`)
    }
    catch (error) {
      throw error
    }
    finally {
      this.emptyingTrash = false
    }
  }

  private resetProjectAndRestart = async (projectId: string) => {
    this.resettingProjectId = projectId
    this.running = true
    try {
      const result = await resetProjectRequest(projectId)
      this.selectedProjectId = projectId
      this.selectedProject = result.project
      this.upsertProject(result.project)
      this.artifacts = result.artifacts
      this.events = result.events
      this.plannerMessages = []
      this.selectedArtifactId = ''
      this.artifactMarkdownEdit = ''
      this.artifactEditArtifactId = ''
      this.reviewNote = ''
      this.liveContent = undefined
      this.subscribeEvents(projectId, { force: true })
      if (result.project.status === 'idle' || result.project.status === 'running') {
        this.markProjectRunning(projectId, result.project.mode)
      }
      toast.success('项目已重置，新的运行已启动。')
    }
    catch (error) {
      await this.refreshSelectedProject()
      throw error
    }
    finally {
      this.resettingProjectId = ''
      this.running = false
    }
  }

  private openConfirmDialog(input: {
    title: string
    description: string
    confirmLabel: string
    variant: 'default' | 'destructive'
    action: () => void | Promise<void>
  }) {
    this.confirmTitle = input.title
    this.confirmDescription = input.description
    this.confirmLabel = input.confirmLabel
    this.confirmVariant = input.variant
    this.pendingConfirm = input.action
    this.confirmDialogOpen = true
  }

  private async loadProject(projectId: string, preserveArtifactSelection: boolean, preferredArtifactId = '') {
    const previousArtifactId = this.selectedArtifactId
    this.selectedProjectId = projectId
    const payload = await readProject(projectId)
    this.selectedProject = payload.project
    this.upsertProject(payload.project)
    this.artifacts = payload.artifacts
    this.events = payload.events
    this.plannerMessages = buildPlannerMessages(this.events)
    this.liveContent = undefined
    this.selectedArtifactId = preferredArtifactId && this.artifacts.some(artifact => artifact.id === preferredArtifactId)
      ? preferredArtifactId
      : preserveArtifactSelection && this.artifacts.some(artifact => artifact.id === previousArtifactId)
      ? previousArtifactId
      : this.artifacts.at(-1)?.id || ''
  }

  private async refreshSelectedProject(options: {
    preserveArtifactSelection?: boolean
    selectArtifactId?: string
  } = {}) {
    if (this.selectedProjectId) {
      try {
        await this.loadProject(
          this.selectedProjectId,
          options.preserveArtifactSelection ?? true,
          options.selectArtifactId,
        )
      }
      catch (error) {
        toast.error('刷新项目失败', { description: readableError(error) })
      }
    }
  }

  private async refreshProjectLists() {
    const [projects, trashedProjects] = await Promise.all([
      listProjectsRequest(),
      listTrashedProjectsRequest(),
    ])
    this.projects = projects
    this.trashedProjects = trashedProjects
  }

  private upsertProject(project: NovelProject) {
    this.projects = [project, ...this.projects.filter(item => item.id !== project.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private markProjectRunning(projectId: string, mode: RunMode, currentStage?: WorkflowStage) {
    const current = this.projects.find(project => project.id === projectId) || this.selectedProject
    if (!current) {
      return
    }
    const runningProject: NovelProject = {
      ...current,
      mode,
      status: 'running',
      currentStage: currentStage || current.currentStage || 'requirements',
      updatedAt: new Date().toISOString(),
    }
    this.upsertProject(runningProject)
    if (this.selectedProjectId === projectId) {
      this.selectedProject = runningProject
    }
  }

  private async syncProjectListsAfterMutation() {
    try {
      await this.refreshProjectLists()
    }
    catch (error) {
      toast.warning('列表同步失败', {
        description: `${readableError(error)} 请刷新页面确认最新列表。`,
      })
    }
  }

  private subscribeEvents(projectId: string, options: { force?: boolean } = {}) {
    if (!options.force && this.eventSource && this.subscribedProjectId === projectId) {
      return
    }

    this.closeEventSource()

    this.subscribedProjectId = projectId
    const lastEventId = this.events.at(-1)?.id
    const query = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : ''
    const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events${query}`)
    this.eventSource = source

    source.onmessage = event => {
      this.handleRealtimePayload(projectId, event.data)
    }

    source.onerror = () => {
      if (this.eventSource !== source) {
        return
      }
      if (projectId === this.selectedProjectId) {
        void this.refreshSelectedProject()
      }
    }
  }

  private closeEventSource() {
    this.eventSource?.close()
    this.eventSource = undefined
    this.subscribedProjectId = ''
  }

  private handleRealtimePayload(projectId: string, payload: unknown) {
    if (typeof payload !== 'string') {
      return
    }

    let message: RealtimeMessage
    try {
      message = JSON.parse(payload) as RealtimeMessage
    }
    catch {
      return
    }

    if (message.projectId !== projectId || projectId !== this.selectedProjectId) {
      return
    }

    if (message.type === 'workflow.event') {
      this.handleWorkflowEvent(projectId, message.event)
      return
    }

    if (message.type === 'stage.content.delta') {
      this.markProjectRunning(projectId, this.selectedProject?.mode || 'step', message.stage)
      this.liveContent = {
        projectId,
        runId: message.runId,
        stage: message.stage,
        agentId: message.agentId,
        markdown: message.markdownPreview ?? this.liveContent?.markdown ?? '',
        status: 'streaming',
        updatedAt: message.timestamp,
      }
      return
    }

    if (message.type === 'stage.content.done') {
      this.markProjectRunning(projectId, this.selectedProject?.mode || 'step', message.stage)
      this.liveContent = {
        projectId,
        runId: message.runId,
        stage: message.stage,
        agentId: message.agentId,
        markdown: message.markdown,
        status: 'done',
        updatedAt: message.timestamp,
      }
      setTimeout(() => {
        if (projectId === this.selectedProjectId) {
          void this.refreshSelectedProject({ preserveArtifactSelection: false })
        }
      }, 300)
      return
    }

    if (message.type === 'stage.content.error' || message.type === 'realtime.error') {
      this.liveContent = {
        projectId,
        runId: message.type === 'stage.content.error' ? message.runId : undefined,
        stage: message.type === 'stage.content.error' ? message.stage : undefined,
        agentId: message.type === 'stage.content.error' ? message.agentId : undefined,
        markdown: this.liveContent?.markdown || '',
        status: 'error',
        message: message.message,
        updatedAt: message.timestamp,
      }
    }
  }

  private handleWorkflowEvent(projectId: string, event: WorkflowEvent) {
    if (projectId !== this.selectedProjectId) {
      return
    }

    this.events = dedupeEvents([...this.events, event])
    this.applyWorkflowEventToProject(event)
    const artifactId = artifactIdFromEventPayload(event.payload)
    if (event.type === 'message.received' || event.type === 'message.sent') {
      this.plannerMessages = buildPlannerMessages(this.events)
    }
    if (
      event.type === 'project.created'
      || event.type === 'project.updated'
      || event.type === 'run.started'
      || event.type === 'stage.started'
      || event.type === 'stage.completed'
      || event.type === 'run.completed'
      || event.type === 'run.failed'
      || event.type === 'stage.awaiting_review'
      || event.type === 'approval.recorded'
      || event.type === 'tool.called'
    ) {
      void this.refreshSelectedProject(artifactId
        ? { preserveArtifactSelection: false, selectArtifactId: artifactId }
        : {})
    }
  }

  private applyWorkflowEventToProject(event: WorkflowEvent) {
    const current = this.selectedProject
    if (!current || current.id !== event.projectId) {
      return
    }

    let next: NovelProject | undefined
    if (event.type === 'run.started') {
      next = {
        ...current,
        status: 'running',
        currentStage: event.stage || current.currentStage || 'requirements',
        updatedAt: event.timestamp,
      }
    }
    else if (event.type === 'stage.started') {
      next = {
        ...current,
        status: 'running',
        currentStage: event.stage || current.currentStage,
        updatedAt: event.timestamp,
      }
      this.liveContent = undefined
    }
    else if (event.type === 'stage.awaiting_review') {
      next = {
        ...current,
        status: 'awaiting_review',
        currentStage: event.stage || current.currentStage,
        updatedAt: event.timestamp,
      }
    }
    else if (event.type === 'run.completed') {
      next = {
        ...current,
        status: 'completed',
        currentStage: undefined,
        updatedAt: event.timestamp,
      }
      this.liveContent = undefined
    }
    else if (event.type === 'run.failed') {
      next = {
        ...current,
        status: 'failed',
        currentStage: event.stage || current.currentStage,
        updatedAt: event.timestamp,
      }
    }

    if (!next) {
      return
    }

    this.selectedProject = next
    this.upsertProject(next)
  }

  private clearSelectedProject() {
    this.selectedProjectId = ''
    this.selectedProject = undefined
    this.artifacts = []
    this.events = []
    this.plannerMessages = []
    this.selectedArtifactId = ''
    this.artifactMarkdownEdit = ''
    this.artifactEditArtifactId = ''
    this.reviewNote = ''
    this.liveContent = undefined
  }

  private populateProjectEdit(project: NovelProject) {
    this.editProjectTitle = project.title
    this.editProjectBrief = project.brief
    this.editProjectMode = project.mode
    this.editProjectMaxRevisionLoops = String(project.maxRevisionLoops)
    const legacyModificationInstructions = project.seed?.modificationInstructions || ''
    this.editSeedWorldbuilding = project.seed?.worldbuilding || ''
    this.editSeedWorldbuildingModificationInstructions = project.seed?.worldbuildingModificationInstructions || legacyModificationInstructions
    this.editSeedCharacters = project.seed?.characters || ''
    this.editSeedCharactersModificationInstructions = project.seed?.charactersModificationInstructions || legacyModificationInstructions
    this.editSeedOutline = project.seed?.outline || ''
    this.editSeedOutlineModificationInstructions = project.seed?.outlineModificationInstructions || legacyModificationInstructions
    this.editAllowExpertSeedChanges = project.seed?.allowExpertChanges === true
  }

  private getProjectDraft(): NewProjectDraft {
    return {
      title: this.projectTitle,
      brief: this.projectBrief,
      mode: this.projectMode,
      maxRevisionLoops: this.projectMaxRevisionLoops,
      seedWorldbuilding: this.seedWorldbuilding,
      seedWorldbuildingModificationInstructions: this.seedWorldbuildingModificationInstructions,
      seedCharacters: this.seedCharacters,
      seedCharactersModificationInstructions: this.seedCharactersModificationInstructions,
      seedOutline: this.seedOutline,
      seedOutlineModificationInstructions: this.seedOutlineModificationInstructions,
      allowExpertSeedChanges: this.allowExpertSeedChanges,
    }
  }

  private restoreProjectDraft() {
    const draft = readLocalDraft()
    if (!draft) {
      this.resetProjectDraft()
      return
    }

    this.projectTitle = draft.title
    this.projectBrief = draft.brief
    this.projectMode = draft.mode
    this.projectMaxRevisionLoops = draft.maxRevisionLoops || String(this.config.defaultMaxRevisionLoops)
    this.seedWorldbuilding = draft.seedWorldbuilding
    this.seedWorldbuildingModificationInstructions = draft.seedWorldbuildingModificationInstructions
    this.seedCharacters = draft.seedCharacters
    this.seedCharactersModificationInstructions = draft.seedCharactersModificationInstructions
    this.seedOutline = draft.seedOutline
    this.seedOutlineModificationInstructions = draft.seedOutlineModificationInstructions
    this.allowExpertSeedChanges = draft.allowExpertSeedChanges
  }

  private persistProjectDraft() {
    const draft = this.getProjectDraft()
    if (!this.hasNonDefaultProjectDraft(draft)) {
      removeLocalDraft()
      return
    }
    writeLocalDraft(draft)
  }

  private hasNonDefaultProjectDraft(draft: NewProjectDraft): boolean {
    return Boolean(
      draft.title.trim()
      || draft.brief.trim()
      || draft.seedWorldbuilding.trim()
      || draft.seedWorldbuildingModificationInstructions.trim()
      || draft.seedCharacters.trim()
      || draft.seedCharactersModificationInstructions.trim()
      || draft.seedOutline.trim()
      || draft.seedOutlineModificationInstructions.trim()
      || draft.allowExpertSeedChanges
      || draft.mode !== 'step'
      || (draft.maxRevisionLoops && draft.maxRevisionLoops !== String(this.config.defaultMaxRevisionLoops)),
    )
  }
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function readLocalDraft(): NewProjectDraft | undefined {
  if (!canUseLocalStorage()) {
    return undefined
  }
  try {
    const raw = localStorage.getItem(newProjectDraftKey)
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as Partial<NewProjectDraft>
    const legacySeedModificationInstructions = typeof (parsed as { seedModificationInstructions?: unknown }).seedModificationInstructions === 'string'
      ? (parsed as { seedModificationInstructions: string }).seedModificationInstructions
      : ''
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      brief: typeof parsed.brief === 'string' ? parsed.brief : '',
      mode: parsed.mode === 'yolo' ? 'yolo' : 'step',
      maxRevisionLoops: typeof parsed.maxRevisionLoops === 'string' ? parsed.maxRevisionLoops : '',
      seedWorldbuilding: typeof parsed.seedWorldbuilding === 'string' ? parsed.seedWorldbuilding : '',
      seedWorldbuildingModificationInstructions: typeof parsed.seedWorldbuildingModificationInstructions === 'string' ? parsed.seedWorldbuildingModificationInstructions : legacySeedModificationInstructions,
      seedCharacters: typeof parsed.seedCharacters === 'string' ? parsed.seedCharacters : '',
      seedCharactersModificationInstructions: typeof parsed.seedCharactersModificationInstructions === 'string' ? parsed.seedCharactersModificationInstructions : legacySeedModificationInstructions,
      seedOutline: typeof parsed.seedOutline === 'string' ? parsed.seedOutline : '',
      seedOutlineModificationInstructions: typeof parsed.seedOutlineModificationInstructions === 'string' ? parsed.seedOutlineModificationInstructions : legacySeedModificationInstructions,
      allowExpertSeedChanges: Boolean(parsed.allowExpertSeedChanges),
    }
  }
  catch {
    return undefined
  }
}

function writeLocalDraft(draft: NewProjectDraft): void {
  if (!canUseLocalStorage()) {
    return
  }
  localStorage.setItem(newProjectDraftKey, JSON.stringify(draft))
}

function removeLocalDraft(): void {
  if (!canUseLocalStorage()) {
    return
  }
  localStorage.removeItem(newProjectDraftKey)
}

function artifactIdFromEventPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('artifactId' in payload)) {
    return undefined
  }
  return typeof payload.artifactId === 'string' ? payload.artifactId : undefined
}

function readableError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error || '创建项目失败。')
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function approvalToastMessage(action: ApprovalAction): string {
  if (action === 'approve') {
    return '已通过当前产物。'
  }
  if (action === 'request_changes') {
    return '已记录修改意见。'
  }
  if (action === 'manual_edit') {
    return '已保存手动编辑。'
  }
  return '已请求重新生成。'
}
