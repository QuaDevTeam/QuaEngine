import type { EditorPluginContext, EditorProject } from '@quajs/editor-core'
import { afterEach, expect, it, vi } from 'vitest'
import { AnimationSceneControls } from '../src/editor/scene-controls.js'
import { animationEditorIndexer } from '../src/indexing/indexer.js'
import { newTimeline, serializeTimeline } from '../src/model/timeline.js'

const story = `@Scene('room')
@PlayAnimation('enter', ' self = character:hero ')
hero: Hello

@Scene('street')
@PlayAnimation('enter')
hero: Again
`
async function catalog() {
  const documents: Record<string, string> = {
    'enter.animation.json': serializeTimeline(newTimeline('enter')),
    'story.qs': story,
  }
  return animationEditorIndexer.index({
    root: '/game',
    entries: Object.entries(documents).map(([path, text]) => ({
      path,
      size: text.length,
      modified: 0,
      kind: 'document' as const,
    })),
    readDocument: async path => ({
      path,
      text: documents[path],
      revision: 'original',
    }),
  })
}
afterEach(() => {
  document.body.replaceChildren()
})

it('indexes scene calls and manual waiting steps using compiler indices without executing scripts', async () => {
  const result = await catalog()
  expect(result.issues).toEqual([])
  expect(result.scenes?.[0].steps).toHaveLength(2)
  expect(result.animations[0].bindings).toEqual([
    { path: 'story.qs', stepIndex: 0, sceneId: 'room', self: 'hero' },
    { path: 'story.qs', stepIndex: 1, sceneId: 'street', self: undefined },
  ])
  expect(result.scenes?.[0].steps[0]).toMatchObject({
    index: 0,
    line: 3,
    sceneId: 'room',
  })
})

it('opens an associated scene only while visible, applies scrubbing and dialogue visibility, switches calls', async () => {
  const result = await catalog()
  const lease = {
    open: vi.fn(async () => ({
      characters: [{ id: 'hero', name: 'Hero' }],
      self: 'hero',
    })),
    attach: vi.fn(),
    sample: vi.fn(async () => {}),
    release: vi.fn(),
  }
  const context = {
    createScenePreview: () => lease,
  } as unknown as EditorPluginContext
  const stage = document.createElement('div')
  const controls = new AnimationSceneControls(
    context,
    stage,
    () => controls.sample(result.animations[0].timeline, 500, false),
    vi.fn(),
  )
  document.body.append(controls.element, stage)
  controls.update(
    { root: '/game' } as EditorProject,
    result,
    result.animations[0],
  )
  expect(lease.open).not.toHaveBeenCalled()
  controls.setVisible(true)
  await vi.waitFor(() => expect(lease.attach).toHaveBeenCalledWith(stage))
  expect(lease.open).toHaveBeenCalledWith(
    '/game',
    expect.objectContaining({ path: 'story.qs', stepIndex: 0 }),
  )
  expect(lease.sample).toHaveBeenLastCalledWith(
    expect.objectContaining({
      time: 500,
      self: 'hero',
      hideDialogue: false,
      fill: 'both',
    }),
  )
  const toggle = controls.element.querySelector<HTMLInputElement>(
    '[aria-label="显示对话框"]',
  )!
  toggle.checked = false
  toggle.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(lease.sample).toHaveBeenLastCalledWith(
      expect.objectContaining({ hideDialogue: true }),
    ),
  )
  const calls = controls.element.querySelector<HTMLSelectElement>(
    '[aria-label="动画调用位置"]',
  )!
  calls.value = '1'
  calls.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(lease.open).toHaveBeenLastCalledWith(
      '/game',
      expect.objectContaining({ stepIndex: 1 }),
    ),
  )
  const releases = lease.release.mock.calls.length
  const unbound = { ...result.animations[0], bindings: [] }
  controls.update({ root: '/game' } as EditorProject, { ...result, animations: [unbound] }, unbound)
  expect(controls.usesScene).toBe(false)
  expect(lease.release.mock.calls.length).toBeGreaterThan(releases)
  controls.setVisible(false)
  expect(lease.release).toHaveBeenCalled()
  controls.dispose()
})

it('supports unbound character and manual scene selection, ignores late scene startup after hiding', async () => {
  const result = await catalog()
  result.animations[0].bindings = []
  let resolve!: (value: { characters: [] }) => void
  const lease = {
    open: vi.fn(
      () =>
        new Promise<{ characters: [] }>((done) => {
          resolve = done
        }),
    ),
    attach: vi.fn(),
    sample: vi.fn(),
    release: vi.fn(),
  }
  const image = vi.fn()
  const controls = new AnimationSceneControls(
    { createScenePreview: () => lease } as unknown as EditorPluginContext,
    document.createElement('div'),
    vi.fn(),
    image,
  )
  document.body.append(controls.element)
  controls.update(
    {
      root: '/game',
      plugins: {
        'qua.character': {
          data: {
            characters: [
              {
                key: 'hero-key',
                id: { value: 'hero' },
                displayName: { value: 'Hero' },
                expressions: [],
                base: [{ path: 'hero.png' }],
              },
            ],
          },
        },
      },
    } as unknown as EditorProject,
    result,
    result.animations[0],
  )
  controls.setVisible(true)
  expect(lease.open).not.toHaveBeenCalled()
  const change = (label: string, value: string) => {
    const select = controls.element.querySelector<HTMLSelectElement>(
      `[aria-label="${label}"]`,
    )!
    select.value = value
    select.dispatchEvent(new Event('change'))
  }
  change('预览角色', 'hero-key')
  expect(image).toHaveBeenCalledWith('hero.png')
  change('预览上下文', 'scene')
  expect(lease.open).toHaveBeenCalledWith('/game', {
    path: 'story.qs',
    stepIndex: 0,
  })
  controls.setVisible(false)
  resolve({ characters: [] })
  await new Promise(done => setTimeout(done, 0))
  expect(lease.attach).not.toHaveBeenCalled()
  controls.dispose()
})
