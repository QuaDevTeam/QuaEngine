import { afterEach, expect, it, vi } from 'vitest'
import { disclosure, html, render } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

it('retains native open state, content identity and unfinished input across refreshes', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const content = html`<input aria-label="Draft" value="original">`
  render(disclosure('Advanced', content), host)
  const details = host.querySelector('details')!
  const input = host.querySelector('input')!
  details.open = true
  input.value = 'unfinished draft'
  render(disclosure('Advanced options', content), host)
  expect(host.querySelector('details')).toBe(details)
  expect(details.open).toBe(true)
  expect(host.querySelector('input')).toBe(input)
  expect(input.value).toBe('unfinished draft')
  details.open = false
  render(disclosure('Advanced', content), host)
  expect(details.open).toBe(false)
  expect(input.value).toBe('unfinished draft')
})

it('accepts controlled state and ignores nested toggle events', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const changed = vi.fn()
  const content = html`<details><summary>Nested</summary>Text</details>`
  render(disclosure('Logs', content, { open: false, onToggle: changed }), host)
  const details = host.querySelector('details')!
  render(disclosure('Logs', content, { open: true, onToggle: changed }), host)
  expect(details.open).toBe(true)
  changed.mockClear()
  details.querySelector('details')!.dispatchEvent(new Event('toggle', { bubbles: true }))
  expect(changed).not.toHaveBeenCalled()
  details.dispatchEvent(new Event('toggle'))
  expect(changed).toHaveBeenCalledWith(true)
  render(disclosure('Logs', content, { open: false, onToggle: changed }), host)
  expect(details.open).toBe(false)
})
