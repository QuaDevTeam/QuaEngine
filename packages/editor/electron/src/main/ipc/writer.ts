import type {
  EditorBounds,
} from '@quajs/editor-core'

import type { MainServices } from './services.js'

export function registerWriterIpc(context: Pick<MainServices, 'handle' | 'closing' | 'closePending' | 'writer' | 'writerBounds'>): void {
  context.handle(
    'editor:novel-writer-present',
    (active: boolean, next: EditorBounds) => {
      if (typeof active !== 'boolean' || context.closing || context.closePending)
        throw new Error('写作工作区无法切换。')
      return context.writer.present(active, context.writerBounds(next))
    },
  )
  context.handle('editor:novel-writer-bounds', (next: EditorBounds) =>
    context.writer.resize(context.writerBounds(next)))
}
