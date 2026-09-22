import type { MainServices } from './services.js'
import {
  dialog,
} from 'electron'

export function registerGitIpc(context: Pick<MainServices, 'handle' | 'git' | 'currentProject' | 'documentDirty' | 'window' | 'previews' | 'project'>): void {
  context.handle('editor:git-status', (root: string) => context.git.status(root))
  context.handle('editor:git-diff', (root: string, path: string, staged: boolean) =>
    context.git.diff(root, path, staged))
  context.handle('editor:git-stage', (root: string, path: string, staged: boolean) =>
    context.git.stage(root, path, staged))
  context.handle('editor:git-commit', (root: string, message: string) =>
    context.git.commit(root, message))
  context.handle('editor:git-branches', (root: string) => context.git.branches(root))
  context.handle(
    'editor:git-switch',
    async (root: string, branch: string, create: boolean) => {
      if (root !== context.currentProject?.root)
        return { status: 'cancelled' }
      if (context.documentDirty) {
        const result = await dialog.showMessageBox(context.window, {
          type: 'question',
          message: '切换分支前如何处理未保存的文档？',
          detail:
            '保存后切换会保留磁盘上的本地更改。保留草稿切换会保留所有编辑缓冲区；如果目标分支修改了同一文件，保存时仍会检查版本冲突。',
          buttons: ['保存全部并切换', '保留草稿并切换', '取消'],
          defaultId: 0,
          cancelId: 2,
        })
        if (root !== context.currentProject?.root || result.response === 2)
          return { status: 'cancelled' }
        if (result.response === 0)
          return { status: 'save-required' }
      }
      try {
        await context.previews.stop()
        const state = await context.git.switchBranch(root, branch, create)
        await context.project.request('refresh')
        return { status: 'switched', state }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (
          /would be overwritten|you need to resolve your current index|unmerged|not uptodate/iu.test(
            message,
          )
        ) {
          return {
            status: 'blocked',
            message:
              '切换会覆盖本地更改或遇到未解决的冲突。当前分支和更改已保留；请先在下方查看并提交更改，或在 Git 中贮藏后重试。',
          }
        }
        return { status: 'failed', message }
      }
    },
  )
}
