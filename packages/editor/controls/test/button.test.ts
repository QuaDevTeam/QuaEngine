import { afterEach, expect, it, vi } from 'vitest'
import { button, buttonView, html, iconButtonView, render } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

it('retains the focused native button as busy state and actions change', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const start = vi.fn()
  const cancel = vi.fn()
  render(buttonView('开始打包', start), host)
  const control = host.querySelector('button')!
  control.focus()
  control.click()
  expect(start).toHaveBeenCalledOnce()
  render(buttonView('取消打包', cancel), host)
  expect(document.activeElement).toBe(control)
  render(buttonView('正在取消…', cancel, { busy: true }), host)
  expect(host.querySelector('button')).toBe(control)
  expect(control.disabled).toBe(true)
  expect(control.getAttribute('aria-busy')).toBe('true')
  control.click()
  expect(cancel).not.toHaveBeenCalled()
  render(buttonView('重新打包', start), host)
  expect(control.disabled).toBe(false)
  expect(control.hasAttribute('aria-busy')).toBe(false)
  control.click()
  expect(start).toHaveBeenCalledTimes(2)
})

it('exposes icon-only names and keeps project text literal', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const label = '<img src=x onerror=alert(1)>'
  render(iconButtonView(label, html`<svg></svg>`, vi.fn()), host)
  const control = host.querySelector('button')!
  expect(control.type).toBe('button')
  expect(control.getAttribute('aria-label')).toBe(label)
  expect(control.title).toBe(label)
  expect(control.querySelector('.editor-button-icon')?.getAttribute('aria-hidden')).toBe('true')
  expect(control.querySelector('img')).toBeNull()
  render(buttonView(label), host)
  expect(control.textContent?.trim()).toBe(label)
  expect(control.hasAttribute('aria-label')).toBe(false)
})

it('preserves native submit behavior and imperative caller control', () => {
  const host = document.createElement('form')
  const submitted = vi.fn((event: Event) => event.preventDefault())
  host.addEventListener('submit', submitted)
  document.body.append(host)
  render(buttonView('创建项目', undefined, { type: 'submit', variant: 'primary' }), host)
  host.querySelector('button')!.click()
  expect(submitted).toHaveBeenCalledOnce()
  const clicked = vi.fn()
  const native = button('应用', clicked, 'primary')
  host.append(native)
  native.disabled = true
  native.click()
  expect(clicked).not.toHaveBeenCalled()
  native.disabled = false
  native.click()
  expect(clicked).toHaveBeenCalledOnce()
  expect(submitted).toHaveBeenCalledOnce()
})
