import type { NativeUiSurfaceNodeProjection as Node } from '@quajs/native-ui-compiler'
import { Pipeline } from '@quajs/pipeline'
import { describe, expect, it, vi } from 'vitest'
import { createQuiWebSurface } from '../src/qui'

const bounds = { x: 100, y: 50, width: 300, height: 100 }
const node = (id: string, extra: Partial<Node> = {}): Node => ({ id, kind: 'Panel', visible: true, bounds, ...extra })

describe('optional QUI DOM projection', () => {
  it('keeps node identity and keyboard focus while projecting updated authoritative text', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const pipeline = new Pipeline()
    const surface = createQuiWebSurface({ container, pipeline, elementId: 'menu' })
    const root = node('panel', { children: [node('start', { kind: 'Button', text: 'Start', bounds: { ...bounds, x: 120, y: 70 }, intent: { event: 'ui/intent', action: 'open', metadata: { arg0: 'story', action: 'forged', elementId: 'forged' } } })] })
    const intents: unknown[] = []
    pipeline.on('ui/intent', (context) => {
      intents.push(context.event.payload)
    })
    surface.update(root)
    const button = container.querySelector('button')!
    expect(button.style.left).toBe('20px')
    button.focus()
    surface.update({ ...root, children: [{ ...root.children![0], text: 'Continue' }] })
    expect(document.activeElement).toBe(button)
    expect(button.textContent).toBe('Continue')
    button.click()
    await vi.waitFor(() => expect(intents).toEqual([{ elementId: 'menu', action: 'open', arg0: 'story', choiceId: undefined }]))
    surface.dispose()
    expect(container.children).toHaveLength(0)
    container.remove()
  })

  it('disables inactive buttons, applies hover paint, and removes closed surfaces', () => {
    const container = document.createElement('div')
    const surface = createQuiWebSurface({ container, pipeline: new Pipeline(), elementId: 'menu' })
    surface.update(node('disabled', { kind: 'Button', text: 'Continue' }))
    expect((container.firstChild as HTMLButtonElement).disabled).toBe(true)
    surface.update(node('disabled', { kind: 'Button', text: 'Continue', intent: { event: 'ui/intent', action: 'continue' }, stateStyles: { hover: { bounds, style: { backgroundColor: '#ff0000' } } } }))
    container.firstChild!.dispatchEvent(new Event('pointerenter'))
    expect((container.firstChild as HTMLElement).style.backgroundColor).toBe('#ff0000')
    surface.update(undefined)
    expect(container.children).toHaveLength(0)
    surface.dispose()
  })

  it('commits only the declared control option through the pipeline', async () => {
    const container = document.createElement('div')
    const pipeline = new Pipeline()
    const payloads: unknown[] = []
    pipeline.on('ui/intent', (context) => {
      payloads.push(context.event.payload)
    })
    const surface = createQuiWebSurface({ container, pipeline, elementId: 'settings' })
    const options = ['quiet', 'loud'].map(value => ({ label: value, intent: { event: 'ui/intent' as const, action: 'settings-update', metadata: { value } } }))
    const control = { kind: 'range' as const, selectedIndex: 0, parts: { value: 'value', thumb: 'thumb', progress: 'progress' }, options }
    const root = node('volume', { control })
    surface.update(root)
    const input = container.querySelector('input')!
    input.value = '1'
    input.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(payloads).toEqual([{ elementId: 'settings', action: 'settings-update', value: 'loud', choiceId: undefined }]))
    expect(root.control?.selectedIndex).toBe(0)
    surface.update(root)
    expect(input.value).toBe('0')
    surface.dispose()
  })
  it('hides complete subtrees and keeps DOM reading order aligned after reordering', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const surface = createQuiWebSurface({ container, pipeline: new Pipeline(), elementId: 'menu' })
    const first = node('first', { kind: 'Button', text: 'First', intent: { event: 'ui/intent', action: 'first' } })
    const second = node('second', { kind: 'Button', text: 'Second', intent: { event: 'ui/intent', action: 'second' } })
    surface.update(node('parent', { children: [first, second] }))
    const focused = container.querySelector('button')!
    focused.focus()
    surface.update(node('parent', { children: [second, first] }))
    expect([...container.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Second', 'First'])
    expect(document.activeElement).toBe(focused)
    surface.update(node('parent', { visible: false, children: [second, first] }))
    expect(focused.style.display).toBe('none')
    surface.dispose()
    container.remove()
  })
  it('uses the authored selected-label paint for semantic browser selects', () => {
    const container = document.createElement('div')
    const surface = createQuiWebSurface({ container, pipeline: new Pipeline(), elementId: 'settings' })
    surface.update(node('language', {
      control: { kind: 'select', selectedIndex: 0, parts: { value: 'selected' }, options: [{ label: '中文', intent: { event: 'ui/intent', action: 'language' } }] },
      style: { backgroundColor: '#fffdf6' },
      children: [node('selected', { kind: 'Text', text: '中文', style: { color: '#29453f', fontSize: 22 } })],
    }))
    const select = container.querySelector('select')!
    expect(select.style.color).toBe('#29453f')
    expect(select.style.backgroundColor).toBe('#fffdf6')
    expect(select.options[0]?.text).toBe('中文')
    surface.dispose()
  })
})
