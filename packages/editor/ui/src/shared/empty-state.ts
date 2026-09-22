import type { IconName } from './icons'
import { emptyState } from '@quajs/editor-controls'
import { render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from './icons'

export function workbenchEmpty(name: IconName, title: string, description = '', actions: HTMLElement[] = []) {
  const state = emptyState(title, description, actions)
  render(unsafeHTML(icon(name)), state.symbol)
  return state
}
