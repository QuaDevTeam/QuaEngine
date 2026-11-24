import type { Pipeline } from '@quajs/pipeline'
import type { RendererInputCommandDispatch } from '../input'

// DOM ownership follows the same pipeline as the projection and its intents.
// Multiple renderer instances in one document must keep their controls separate.
const hosts = new WeakMap<Pipeline, Set<HTMLElement>>()

export function registerQuiGamepadHost(pipeline: Pipeline, host: HTMLElement) {
  let owned = hosts.get(pipeline)
  if (!owned) {
    owned = new Set()
    hosts.set(pipeline, owned)
  }
  owned.add(host)
  return () => owned.delete(host)
}

const controls = 'button, [role="button"][tabindex], [role="switch"], input[type="range"], select'

function hitVisible(element: HTMLElement): boolean {
  if (element.matches(':disabled, [aria-disabled="true"]') || (typeof element.checkVisibility === 'function' && !element.checkVisibility()))
    return false
  // Hit the *painted* result. A second modal in the same authored surface
  // can cover controls that are still connected, enabled and laid out.
  const rect = element.getBoundingClientRect()
  const hit = element.ownerDocument.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)
  return hit !== null && element.contains(hit)
}

export function navigateQuiGamepad(pipeline: Pipeline, input: RendererInputCommandDispatch, storyChoices: boolean): boolean {
  if (!['choice:next', 'choice:previous', 'choice:confirm'].includes(input.command))
    return false
  const owned = hosts.get(pipeline)
  if (!owned)
    return false
  let current: HTMLElement | undefined
  for (const host of owned) {
    for (const layer of host.querySelectorAll<HTMLElement>(':scope > [data-qui-surface]')) {
      if (layer.isConnected && (!current || Number(layer.style.zIndex) >= Number(current.style.zIndex)))
        current = layer
    }
  }
  if (!current)
    return false
  const modal = current.hasAttribute('data-qui-gamepad-modal')
  if (!modal && storyChoices)
    return false
  const buttons = Array.from(current.querySelectorAll<HTMLElement>(controls)).filter(hitVisible)
  const active = current.ownerDocument.activeElement
  const index = buttons.findIndex(element => element === active)
  const confirm = input.command === 'choice:confirm'
  if (!modal && confirm && index < 0)
    return false
  if (!buttons.length || input.repeat || input.pressed === false)
    return modal || index >= 0
  const delta = input.command === 'choice:previous' ? -1 : 1
  const focused = buttons[index]
  const horizontal = input.metadata?.button === 14 || input.metadata?.button === 15
  if (focused instanceof HTMLInputElement || focused instanceof HTMLSelectElement) {
    if (horizontal) {
      const previous = focused.value
      if (focused instanceof HTMLSelectElement) {
        focused.selectedIndex = Math.min(focused.options.length - 1, Math.max(0, focused.selectedIndex + delta))
      }
      else if (delta > 0) {
        focused.stepUp()
      }
      else {
        focused.stepDown()
      }
      if (previous !== focused.value)
        focused.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    if (confirm)
      return true
  }
  if (confirm) {
    const target = focused ?? buttons[0]!
    target.focus({ preventScroll: true })
    if (!target.matches('select,input'))
      target.click()
  }
  else {
    const next = index < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (index + delta + buttons.length) % buttons.length
    buttons[next]!.focus({ preventScroll: true })
  }
  return true
}
