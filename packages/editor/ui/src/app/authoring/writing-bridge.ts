import type { AppContext, OpenTab } from '../bootstrap'

export function connectWritingBridge(context: Pick<AppContext, 'activeGitTab' | 'activeTab' | 'bridge' | 'editor' | 'openDocument' | 'project' | 'projectRelativePath' | 'saving' | 'status' | 'tabs' | 'workbench' | 'workspaceBusy'>): void {
  context.bridge.onAuthoringRequest((request) => {
    void (async () => {
      try {
        if (Date.now() >= request.deadline)
          throw new Error('回写请求已超时，请重试。')
        if (request.kind === 'capture') {
          if (!context.project || context.activeGitTab || !context.activeTab || !context.activeTab.document.path.endsWith('.qs') || context.workspaceBusy || context.saving)
            throw new Error('请先打开当前项目的 QS 文件，再从写作工作区取稿。')
          const selection = context.editor.getSelection()!
          context.bridge.replyAuthoring(request.id, {
            ...context.activeTab.document,
            root: context.project.root,
            text: context.activeTab.model.getValue(),
            start: context.activeTab.model.getOffsetAt(selection.getStartPosition()),
            end: context.activeTab.model.getOffsetAt(selection.getEndPosition()),
          })
          return
        }
        const value = request.value
        if (!context.project || value.root !== context.project.root || context.workspaceBusy || context.saving)
          throw new Error('项目已切换或编辑器正忙。')
        const root = context.project.root
        let tab: OpenTab | undefined
        let baseRevision = value.base?.revision
        if (value.base) {
          tab = context.tabs.find(item => item.document.path === value.path)
          if (tab && (tab.unavailable || tab.model.getValue() !== value.base.text))
            throw new Error('QS 在取稿后发生修改，请重新取稿后回写。')
          const disk = await context.bridge.readDocument(value.path)
          if ((!tab && disk.text !== value.base.text) || (disk.revision !== value.base.revision && disk.text !== value.base.text))
            throw new Error('QS 磁盘版本已变化，请先处理冲突。')
          baseRevision = disk.revision
          // Use the project's real compiler/type service; compare diagnostics by
          // code/message so shifted line numbers do not turn old errors into new ones.
          if (value.text !== value.base.text) {
            const before = await context.bridge.analyzeDocument(value.path, value.base.text)
            const after = await context.bridge.analyzeDocument(value.path, value.text)
            const errors = new Map<string, number>()
            for (const item of before.diagnostics.filter(item => item.severity === 'error')) {
              const key = `${item.code}:${item.message}`
              errors.set(key, (errors.get(key) ?? 0) + 1)
            }
            const introduced = after.diagnostics.filter((item) => {
              if (item.severity !== 'error')
                return false
              const key = `${item.code}:${item.message}`
              const count = errors.get(key) ?? 0
              if (!count)
                return true
              errors.set(key, count - 1)
              return false
            })
            if (introduced.length)
              throw new Error(`QS 校验失败：${introduced.slice(0, 5).map(item => `${item.line ?? '?'}: ${item.message}`).join('；')}`)
          }
          if (context.project?.root !== root || (tab && (!context.tabs.includes(tab) || tab.model.getValue() !== value.base.text)))
            throw new Error('源文件或项目在校验期间发生修改。')
          if ((await context.bridge.readDocument(value.path)).revision !== baseRevision)
            throw new Error('QS 磁盘版本在校验期间发生修改。')
          if (request.kind === 'validate') {
            context.bridge.replyAuthoring(request.id, { ...value.base, revision: baseRevision })
            return
          }
        }
        else {
          if (request.kind === 'validate')
            throw new Error('缺少源稿。')
          if (Date.now() >= request.deadline)
            throw new Error('回写请求已超时，请重试。')
          const result = await context.bridge.fileOperation(root, { kind: 'create-file', destination: value.path })
          if (!result.applied)
            throw new Error('未创建 QS 文件。')
        }
        if (context.project?.root !== root)
          throw new Error('项目已切换。')
        await context.openDocument(value.path)
        if (context.project?.root !== root || !context.activeTab || context.projectRelativePath(context.activeTab.document.path) !== context.projectRelativePath(value.path)
          || (tab && (context.activeTab !== tab || tab.model.getValue() !== value.base!.text))
          || (!tab && (context.activeTab.dirty || context.activeTab.model.getValue() !== (value.base?.text ?? '')))) {
          throw new Error('源文件已变化，请重新取稿。')
        }
        if (Date.now() >= request.deadline)
          throw new Error('回写校验超时，请重试。')
        context.editor.pushUndoStop()
        context.editor.executeEdits('novel-writer', [{ range: context.activeTab.model.getFullModelRange(), text: value.text }])
        context.editor.pushUndoStop()
        context.workbench.dock.close('writer')
        context.workbench.dock.open('source')
        context.status('写作结果已进入 QS 草稿，可撤销。保存后更新项目')
        context.bridge.replyAuthoring(request.id, {
          ...context.activeTab.document,
          root,
          text: value.text,
          revision: baseRevision ?? context.activeTab.document.revision,
          start: value.selection?.start ?? 0,
          end: value.selection?.end ?? 0,
        })
      }
      catch (error) {
        context.bridge.replyAuthoring(request.id, undefined, error instanceof Error ? error.message : String(error))
      }
    })()
  })
}
