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
  type ApprovalAction,
  type PlannerMessage,
} from '$lib/client/workspace'
import type {
  ArtifactRef,
  NovelProject,
  ProjectInputChange,
  PublicNovelWriterConfig,
  RunMode,
  WorkflowEvent,
} from '$lib/types'

export type NovelWriterPageData = {
  config: PublicNovelWriterConfig
  projects: NovelProject[]
  trashedProjects: NovelProject[]
}

type NewProjectDraft = {
  title: string
  brief: string
  mode: RunMode
  maxRevisionLoops: string
  seedWorldbuilding: string
  seedCharacters: string
  seedOutline: string
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

  projectTitle = $state('')
  projectBrief = $state('')
  projectMode = $state<RunMode>('step')
  projectMaxRevisionLoops = $state('50')
  seedWorldbuilding = $state('')
  seedCharacters = $state('')
  seedOutline = $state('')
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
  visibleEvents = $derived.by(() => this.events.filter(event => event.type !== 'sandbox.exec'))
  confirmBusy = $derived.by(() => Boolean(
    this.deletingProjectId || this.deletingTrashedProjectId || this.emptyingTrash,
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
  editSeedCharacters = $state('')
  editSeedOutline = $state('')
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
    this.selectedProjectId = this.projects[0]?.id || ''
    this.selectedProject = this.projects[0]

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
          characters: this.seedCharacters,
          outline: this.seedOutline,
          allowExpertChanges: this.allowExpertSeedChanges,
        },
      })
      this.projects = [project, ...this.projects]
      this.projectDialog?.close()
      this.resetProjectDraft()
      toast.success('项目已创建。')
      await this.selectProject(project.id)
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
    this.seedCharacters = ''
    this.seedOutline = ''
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
          characters: this.editSeedCharacters,
          outline: this.editSeedOutline,
          allowExpertChanges: this.editAllowExpertSeedChanges,
        },
      })

      this.projectEditChangedFields = result.changedFields
      this.projectEditRevisionStarted = result.revisionStarted
      this.projects = [result.project, ...this.projects.filter(project => project.id !== result.project.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

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

    this.running = true
    try {
      await startRun(this.selectedProjectId, mode, chapterIndex)
      this.subscribeEvents(this.selectedProjectId)
      toast.success(mode === 'yolo' ? 'YOLO 运行已启动。' : '单步运行已启动。')
    }
    catch (error) {
      toast.error('启动运行失败', { description: readableError(error) })
    }
    finally {
      setTimeout(() => {
        this.running = false
        void this.refreshSelectedProject()
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
      await recordApproval(this.selectedProjectId, {
        artifactId: this.selectedArtifact.id,
        action,
        note: this.reviewNote.trim() || undefined,
        markdown: action === 'manual_edit' ? this.artifactMarkdownEdit : undefined,
      })
      await this.refreshSelectedProject()
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

  private async loadProject(projectId: string, preserveArtifactSelection: boolean) {
    const previousArtifactId = this.selectedArtifactId
    this.selectedProjectId = projectId
    const payload = await readProject(projectId)
    this.selectedProject = payload.project
    this.artifacts = payload.artifacts
    this.events = payload.events
    this.plannerMessages = buildPlannerMessages(this.events)
    this.selectedArtifactId = preserveArtifactSelection && this.artifacts.some(artifact => artifact.id === previousArtifactId)
      ? previousArtifactId
      : this.artifacts.at(-1)?.id || ''
  }

  private async refreshSelectedProject() {
    if (this.selectedProjectId) {
      try {
        await this.loadProject(this.selectedProjectId, true)
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

  private subscribeEvents(projectId: string) {
    if (this.eventSource && this.subscribedProjectId === projectId) {
      return
    }

    this.closeEventSource()

    this.subscribedProjectId = projectId
    const lastEventId = this.events.at(-1)?.id
    const query = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : ''
    const source = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events${query}`)
    this.eventSource = source

    source.onmessage = event => {
      let parsed: WorkflowEvent
      try {
        parsed = JSON.parse(event.data) as WorkflowEvent
      }
      catch {
        return
      }

      if (projectId !== this.selectedProjectId) {
        return
      }

      this.events = dedupeEvents([...this.events, parsed])
      if (parsed.type === 'message.received' || parsed.type === 'message.sent') {
        this.plannerMessages = buildPlannerMessages(this.events)
      }
      if (
        parsed.type === 'stage.completed'
        || parsed.type === 'run.completed'
        || parsed.type === 'stage.awaiting_review'
        || parsed.type === 'approval.recorded'
        || parsed.type === 'tool.called'
      ) {
        void this.refreshSelectedProject()
      }
    }

    source.onerror = () => {
      if (this.eventSource !== source) {
        return
      }
      this.closeEventSource()
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
  }

  private populateProjectEdit(project: NovelProject) {
    this.editProjectTitle = project.title
    this.editProjectBrief = project.brief
    this.editProjectMode = project.mode
    this.editProjectMaxRevisionLoops = String(project.maxRevisionLoops)
    this.editSeedWorldbuilding = project.seed?.worldbuilding || ''
    this.editSeedCharacters = project.seed?.characters || ''
    this.editSeedOutline = project.seed?.outline || ''
    this.editAllowExpertSeedChanges = project.seed?.allowExpertChanges === true
  }

  private getProjectDraft(): NewProjectDraft {
    return {
      title: this.projectTitle,
      brief: this.projectBrief,
      mode: this.projectMode,
      maxRevisionLoops: this.projectMaxRevisionLoops,
      seedWorldbuilding: this.seedWorldbuilding,
      seedCharacters: this.seedCharacters,
      seedOutline: this.seedOutline,
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
    this.seedCharacters = draft.seedCharacters
    this.seedOutline = draft.seedOutline
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
      || draft.seedCharacters.trim()
      || draft.seedOutline.trim()
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
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      brief: typeof parsed.brief === 'string' ? parsed.brief : '',
      mode: parsed.mode === 'yolo' ? 'yolo' : 'step',
      maxRevisionLoops: typeof parsed.maxRevisionLoops === 'string' ? parsed.maxRevisionLoops : '',
      seedWorldbuilding: typeof parsed.seedWorldbuilding === 'string' ? parsed.seedWorldbuilding : '',
      seedCharacters: typeof parsed.seedCharacters === 'string' ? parsed.seedCharacters : '',
      seedOutline: typeof parsed.seedOutline === 'string' ? parsed.seedOutline : '',
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
