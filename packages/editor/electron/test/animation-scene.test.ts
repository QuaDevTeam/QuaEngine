// @vitest-environment happy-dom
import type { EditorBridge, EditorProject, PreviewCommand, PreviewState } from '@quajs/editor-core'
import { expect, it, vi } from 'vitest'
import { AnimationScenePreviewHost } from '../../ui/src/features/preview/animation-scene.js'

function setup() {
  let project = { root: '/game' } as EditorProject
  let state: PreviewState = { phase: 'idle' }
  const commands: PreviewCommand[] = []
  const bridge = {
    previewState: vi.fn(async () => state),
    startPreview: vi.fn(async () => { state = { phase: 'running', identity: { sessionId: 'one', target: 'web', buildRevision: 'build' } } }),
    presentPreview: vi.fn(async () => {}),
    previewCommand: vi.fn(async (_id: string, command: PreviewCommand) => {
      commands.push(command)
      return { message: 'ready', path: 'story.qs', stepIndex: command.action === 'seek' ? command.stepIndex : 0, animationScene: { characters: [{ id: 'hero', name: 'Hero' }], self: 'hero' } }
    }),
  }
  const save = vi.fn(async () => {})
  const host = new AnimationScenePreviewHost(bridge as unknown as EditorBridge, () => project, save, vi.fn())
  return { bridge, commands, save, host, setProject: (next: EditorProject) => {
    project = next
  } }
}
const scene = { path: 'story.qs', stepIndex: 2 }
const sample = { duration: 1000, time: 200, playbackRate: 1, tracks: [], hideDialogue: true }

it('uses one Web session, serializes sampling and releases its borrowed surface and engine projection', async () => {
  const { host, bridge, commands, save } = setup()
  const lease = host.create()
  expect(await lease.open('/game', scene)).toMatchObject({ self: 'hero' })
  expect(save).toHaveBeenCalledOnce()
  expect(bridge.startPreview).toHaveBeenCalledWith('web')
  expect(bridge.presentPreview).toHaveBeenCalledWith('embedded')
  const surface = document.createElement('div')
  lease.attach(surface)
  expect(host.surface).toBe(surface)
  await lease.sample(sample)
  lease.release()
  expect(host.surface).toBeUndefined()
  await vi.waitFor(() => expect(commands.at(-1)).toEqual({ action: 'animation-release' }))
  expect(commands.map(command => command.action)).toEqual(['seek', 'animation-scene', 'animation-sample', 'animation-release'])
  await expect(lease.sample(sample)).rejects.toThrow('已切换')
})

it('rejects late startup after project replacement and never attaches the old project', async () => {
  const { host, save, bridge, setProject } = setup()
  let finish!: () => void
  save.mockImplementationOnce(() => new Promise<void>((resolve) => {
    finish = resolve
  }))
  const lease = host.create()
  const opening = lease.open('/game', scene)
  const rejection = expect(opening).rejects.toThrow('已切换')
  await vi.waitFor(() => expect(save).toHaveBeenCalled())
  lease.release()
  setProject({ root: '/other' } as EditorProject)
  finish()
  await rejection
  expect(bridge.startPreview).not.toHaveBeenCalled()
  expect(host.surface).toBeUndefined()
})

it('cannot release a new owner and refuses an unresolved choice before animation sampling', async () => {
  const { host, bridge, commands } = setup()
  const first = host.create()
  const second = host.create()
  await first.open('/game', scene)
  await second.open('/game', scene)
  const surface = document.createElement('div')
  second.attach(surface)
  first.release()
  await second.sample(sample)
  expect(host.surface).toBe(surface)
  expect(commands.filter(command => command.action === 'animation-release')).toHaveLength(0)
  second.release()
  await vi.waitFor(() => expect(commands.at(-1)?.action).toBe('animation-release'))
  bridge.previewCommand.mockResolvedValueOnce({ message: '遇到选择', path: 'story.qs', stepIndex: 1, animationScene: { characters: [], self: 'hero' } })
  await expect(second.open('/game', scene)).rejects.toThrow('遇到选择')
  second.release()
})
