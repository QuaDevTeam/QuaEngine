import type { EditorPluginIndexContext } from '@quajs/editor-core'
import type {
  QuaScriptAction,
  QuaScriptDialogue,
} from '@quajs/script-compiler'
import type { AnimationCatalog } from '../contracts.js'
import {
  parseQuaScriptDocument,
  QuaScriptParser,
} from '@quajs/script-compiler'

/** Source navigation and explicit animation calls only; never evaluates a scene. */
export async function indexAnimationScenes(
  context: EditorPluginIndexContext,
  catalog: AnimationCatalog,
): Promise<void> {
  const sources = context.entries.filter(
    entry => entry.kind === 'document' && entry.path.endsWith('.qs'),
  )
  catalog.scenes = []
  let bytes = 0
  let count = 0
  for (const entry of sources.slice(0, 256)) {
    try {
      if (bytes + entry.size > 8 * 1024 * 1024 || count >= 10000)
        throw new Error('场景索引达到 8 MiB 或 10000 个步骤上限。')
      const document = await context.readDocument(entry.path)
      bytes += new TextEncoder().encode(document.text).byteLength
      if (bytes > 8 * 1024 * 1024)
        throw new Error('场景索引达到 8 MiB 上限。')
      const source = parseQuaScriptDocument(document.text)
      const parsed = new QuaScriptParser().parse(source.dslBody)
      if (
        [...source.diagnostics, ...parsed.diagnostics].some(
          item => item.severity === 'error',
        )
      ) {
        throw new Error('剧本存在语法错误，请在源码中修复后预览。')
      }
      const steps: NonNullable<AnimationCatalog['scenes']>[number]['steps']
        = []
      let sceneId: string | undefined
      let pending: { id: string, self?: string }[] = []
      for (const [index, step] of parsed.steps.entries()) {
        if (++count > 10000)
          break
        const decorators
          = step.type === 'dialogue'
            ? (step.content as QuaScriptDialogue).decorators
            : step.type === 'action'
              ? (step.content as QuaScriptAction).decorators
              : []
        for (const decorator of decorators) {
          if (
            decorator.name === 'Scene'
            && typeof decorator.args[0] === 'string'
          ) {
            sceneId = decorator.args[0]
          }
          if (
            decorator.name === 'PlayAnimation'
            && typeof decorator.args[0] === 'string'
          ) {
            const binding = decorator.args
              .slice(1)
              .find(
                value =>
                  typeof value === 'string' && /^\s*self\s*=/u.test(value),
              )
            const target
              = typeof binding === 'string'
                ? binding.slice(binding.indexOf('=') + 1).trim()
                : undefined
            pending.push({
              id: decorator.args[0],
              self: target?.startsWith('character:')
                ? target.slice(10)
                : undefined,
            })
          }
        }
        if (step.type === 'action' || !step.range)
          continue
        const dialogue
          = step.type === 'dialogue'
            ? (step.content as QuaScriptDialogue)
            : undefined
        const label
          = `${sceneId ? `${sceneId}，` : ''}${dialogue?.character ? `${dialogue.character}: ` : ''}${dialogue?.text ?? '选择分支'}`.slice(
            0,
            160,
          )
        steps.push({ index, line: step.range.start.line + 1, label, sceneId })
        for (const binding of pending) {
          const matches = catalog.animations.filter(
            animation => animation.timeline.id === binding.id,
          )
          if (matches.length === 1) {
            const animation = matches[0];
            (animation.bindings ??= []).push({
              path: entry.path,
              stepIndex: index,
              sceneId,
              self: binding.self,
            })
          }
        }
        pending = []
      }
      if (steps.length)
        catalog.scenes.push({ path: entry.path, steps })
    }
    catch (error) {
      catalog.issues.push(
        `${entry.path}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  if (sources.length > 256 || count > 10000)
    catalog.issues.push('场景索引达到 256 个剧本或 10000 个步骤上限。')
}
