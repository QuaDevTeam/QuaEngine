import type { EditorWritingContext, EditorWritingDocument, EditorWritingPlan } from '@quajs/editor-core'
import type { createWorkspaceController } from './workspace-controller.svelte'
import { toast } from 'svelte-sonner'
import { untrack } from 'svelte'
import { agentRequestTimeoutMs, requestJson } from './api'

/** Persistent session state; closing the writeback dialog keeps the draft intact. */
export function createEditorWriting(workspace: ReturnType<typeof createWorkspaceController>) {
  let context = $state<EditorWritingContext>()
  let base = $state<EditorWritingDocument>()
  let prose = $state('')
  let appliedProse = $state('')
  let otherDraftsDirty = $state(false)
  $effect(() => { workspace.integrationDirty = otherDraftsDirty || prose !== appliedProse })
  let path = $state('')
  let preview = $state('')
  let plan = $state<EditorWritingPlan>()
  let plannedProse = ''
  let plannedSource = ''
  let sourceGeneration = 0
  let selectedSourceProject = ''
  let busy = $state(false)
  let message = $state('')
  let error = $state('')
  let mode = $state<'create' | 'append' | 'rewrite'>('rewrite')
  let generation = 0
  type Draft = { base?: EditorWritingDocument, prose: string, appliedProse: string, path: string, mode: typeof mode }
  const drafts = new Map<string, Draft>()
  $effect(() => {
    const id = workspace.selectedProjectId
    const root = workspace.editorRoot
    const key = JSON.stringify([root, id])
    untrack(() => {
      if (key === selectedSourceProject) return
      if (selectedSourceProject) drafts.set(selectedSourceProject, { base: $state.snapshot(base), prose, appliedProse, path, mode })
      selectedSourceProject = key
      const epoch = ++sourceGeneration
      const draft = drafts.get(key)
      base = draft?.base
      prose = draft?.prose ?? ''
      appliedProse = draft?.appliedProse ?? ''
      path = draft?.path ?? ''
      mode = draft?.mode ?? 'rewrite'
      otherDraftsDirty = [...drafts].some(([id, value]) => id !== key && value.prose !== value.appliedProse)
      invalidate()
      if (!draft?.base && id && root) void requestJson<{ document: EditorWritingDocument | null }>(`/api/projects/${encodeURIComponent(id)}/editor-source`).then(result => {
        if (epoch !== sourceGeneration || workspace.selectedProjectId !== id || workspace.editorRoot !== root) return
        if (result.document && result.document.root === root) {
          base = result.document
          if (!draft || draft.mode !== 'create') {
            path = result.document.path
            mode = 'rewrite'
          }
        }
      }).catch(error => { if (epoch === sourceGeneration) toast.error(String(error)) })
    })
  })
  async function saveSource(document: EditorWritingDocument, projectId: string) {
    await requestJson(`/api/projects/${encodeURIComponent(projectId)}/editor-source`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document),
    })
  }

  const action = async (run: () => Promise<void>) => {
    if (busy) return false
    busy = true
    const scope = selectedSourceProject
    error = ''
    try { await run(); return true }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      if (scope === selectedSourceProject) error = detail
      toast.error(detail)
      return false
    }
    finally { busy = false }
  }
  async function refresh() {
    const epoch = ++generation
    try {
      const next = await window.quaNovelWriter!.context()
      if (epoch !== generation) return
      context = next
      workspace.setEditorRoot(next.root)
      if (!busy) message = ''
    }
    catch (cause) {
      if (epoch === generation) error = cause instanceof Error ? cause.message : String(cause)
      throw cause
    }
  }
  function init() {
    void refresh().catch(() => {})
    // A watched refresh must not discard a captured unsaved buffer. Host guards
    // reject stale-root writes while refresh resolves; a changed root clears base.
    return window.quaNovelWriter!.onProjectChange(() => { void refresh().catch(() => {}) })
  }
  async function link() {
    const selected = workspace.selectedProject
    if (!context || !selected) return
    const root = context.root
    await requestJson(`/api/projects/${encodeURIComponent(selected.id)}/editor-context`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, seed: { worldbuilding: context.worldbuilding, characters: context.characters, outline: context.outline } }),
    })
    if (context?.root !== root || workspace.selectedProjectId !== selected.id) return
    await workspace.selectProject(selected.id)
    toast.success('已关联当前项目并补齐缺失设定；已有设定保留。')
  }
  function prepareRevision() {
    if (!context || !prose.trim()) return
    if (workspace.hasProjectDraft) {
      workspace.openProjectDialog()
      toast.error('请先处理已有的新建任务草稿，再导入当前 QS。')
      return
    }
    const brief = `请改写以下 QS 正文，改善行文、对白与衔接。可按需要增删和拆分段落，输出“人物：正文”格式。保留原有故事节点、选择前后关系、运行时变量占位符及事实约束。不要生成代码；回写时由专门的适配器匹配原源码位置。\n\n${prose}`
    if (brief.length > 20000) {
      toast.error('取稿超过单次任务上限，请在 QS 中选择较短的完整对白后重试。')
      return
    }
    workspace.openProjectDialog()
    workspace.editorSourceDraft = base ? $state.snapshot(base) : undefined
    workspace.projectTitle = `${context.name}：QS 改写`.slice(0, 120)
    workspace.projectBrief = brief
    workspace.seedWorldbuilding = context.worldbuilding
    workspace.seedCharacters = context.characters
    workspace.seedOutline = context.outline
    toast.success('已填入改写任务，可补充要求后启动 AI 工作流。')
  }
  async function capture() {
    const epoch = ++sourceGeneration
    const projectId = workspace.selectedProjectId
    const result = await window.quaNovelWriter!.capture()
    if (epoch !== sourceGeneration || projectId !== workspace.selectedProjectId || context?.root !== result.document.root) throw new Error('项目已切换。')
    if (workspace.selectedProject?.editorRoot === result.document.root) await saveSource(result.document, projectId)
    if (epoch !== sourceGeneration || projectId !== workspace.selectedProjectId) throw new Error('项目已切换。')
    base = result.document
    plan = undefined
    prose = result.prose
    path = base.path
    mode = 'rewrite'
    preview = ''
    toast.success('已读取当前 QS；选区为空时读取全文对白。')
  }
  async function adapt() {
    if (!base || !context) throw new Error('请先从 QS 取稿。')
    const projectId = workspace.selectedProjectId
    const epoch = sourceGeneration
    const draft = prose
    const current = await window.quaNovelWriter!.validate({ base: $state.snapshot(base) })
    if (epoch !== sourceGeneration || projectId !== workspace.selectedProjectId || context.root !== current.root) throw new Error('项目已切换。')
    base = current
    message = 'AI 正在匹配源码位置并适配变量与逻辑…'
    let feedback = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await requestJson<{ text: string, plan: EditorWritingPlan }>('/api/editor/adapt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: current, prose: draft, context: $state.snapshot(context), feedback }),
      }, agentRequestTimeoutMs)
      if (epoch !== sourceGeneration || projectId !== workspace.selectedProjectId || context?.root !== current.root || prose !== draft)
        throw new Error('项目或稿件已变化，请重新适配。')
      try {
        const validated = await window.quaNovelWriter!.validate({ base: current, text: result.text })
        if (epoch !== sourceGeneration || projectId !== workspace.selectedProjectId || context?.root !== current.root)
          throw new Error('项目已切换。')
        base = validated
      }
      catch (error) {
        feedback = error instanceof Error ? error.message : String(error)
        if (attempt === 0 && feedback.includes('QS 校验失败')) {
          message = '项目编译检查发现问题，AI 正在修正适配方案…'
          continue
        }
        throw error
      }
      preview = result.text
      plan = result.plan
      plannedProse = draft
      plannedSource = base.text
      message = result.plan.summary
      return
    }
  }
  async function apply(writeMode: 'create' | 'append' | 'rewrite') {
    if (!context) return
    const projectId = workspace.selectedProjectId
    const epoch = sourceGeneration
    const linkedRoot = workspace.selectedProject?.editorRoot
    const draft = prose
    const key = selectedSourceProject
    if (!preview) throw new Error('请先预览本次修改。')
    if (writeMode === 'rewrite' && (!plan || plannedProse !== prose || plannedSource !== base?.text)) throw new Error('稿件已变化，请重新预览。')
    if (workspace.selectedProjectId !== projectId) throw new Error('写作任务已切换。')
    const result = await window.quaNovelWriter!.apply({ root: context.root, path, prose, mode: writeMode,
      base: writeMode === 'create' ? undefined : $state.snapshot(base), plan: writeMode === 'rewrite' ? $state.snapshot(plan) : undefined })
    if (epoch === sourceGeneration && workspace.selectedProjectId === projectId) {
      base = result
      path = result.path
      plan = undefined
      appliedProse = prose
      if (writeMode === 'create') mode = 'rewrite'
      preview = ''
      message = ''
    }
    else {
      const saved = drafts.get(key)
      if (saved) drafts.set(key, { ...saved, base: result, path: result.path, appliedProse: draft, mode: 'rewrite' })
      otherDraftsDirty = [...drafts].some(([id, value]) => id !== selectedSourceProject && value.prose !== value.appliedProse)
    }
    if (linkedRoot === result.root) {
      try { await saveSource(result, projectId) }
      catch { toast.error('QS 草稿已更新，但源稿关联保存失败；下次请重新取稿。') }
    }
    toast.success('已应用到对应 QS 位置，可在编辑器中撤销和保存。')
  }
  function invalidate() { preview = ''; plan = undefined; message = ''; error = '' }
  async function previewChanges() {
    if (!context || !prose.trim()) throw new Error('请先准备稿件。')
    if (mode === 'rewrite') return adapt()
    const root = context.root
    const epoch = sourceGeneration
    const draft = prose
    const writeMode = mode
    const converted = await window.quaNovelWriter!.convert(prose)
    if (epoch !== sourceGeneration || context?.root !== root || draft !== prose || writeMode !== mode) throw new Error('项目已切换。')
    if (mode === 'append') {
      if (!base) throw new Error('请先从当前 QS 取稿。')
      const text = `${base.text}${base.text.endsWith('\n') ? '\n' : '\n\n'}${converted}`
      const checked = await window.quaNovelWriter!.validate({ base: $state.snapshot(base), text })
      if (epoch !== sourceGeneration || context?.root !== root || draft !== prose || writeMode !== mode) throw new Error('项目已切换。')
      base = checked
      preview = text
    }
    else preview = converted
    message = mode === 'create' ? '将在项目中创建新的 QS 文件。' : '新增内容将放在原文件末尾。'
  }
  function useArtifact() {
    prose = workspace.artifactMarkdownEdit || workspace.selectedArtifact?.markdown || ''
    mode = base ? 'rewrite' : 'create'
    if (!base) path = ''
    invalidate()
  }
  return {
    init, action, refresh, capture, link, prepareRevision, previewChanges, useArtifact,
    apply: () => apply(mode),
    get context() { return context },
    get base() { return base },
    get busy() { return busy },
    get message() { return message },
    get error() { return error },
    get preview() { return preview },
    get prose() { return prose },
    set prose(value: string) { prose = value; invalidate() },
    get path() { return path },
    set path(value: string) { path = value; invalidate() },
    get mode() { return mode },
    set mode(value: 'create' | 'append' | 'rewrite') {
      mode = value
      path = value === 'create' ? '' : base?.path ?? ''
      invalidate()
    },
    get mismatch() { return Boolean(workspace.selectedProject?.editorRoot && workspace.selectedProject.editorRoot !== context?.root) },
    get dirty() { return prose !== appliedProse },
    get relativePath() { return path.startsWith(`${context?.root}/`) ? path.slice(context!.root.length + 1) : path },
    get canPreview() { return Boolean(context && prose.trim() && (mode === 'create' ? path.trim().endsWith('.qs') : base && base.root === context.root && path === base.path)) },
  }
}
export type EditorWritingController = ReturnType<typeof createEditorWriting>
