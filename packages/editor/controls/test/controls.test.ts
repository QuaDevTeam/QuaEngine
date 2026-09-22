import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, checkbox, field, input, section, select } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

describe('editor native controls', () => {
  it('commits only valid numeric values, preserving unfinished drafts', () => {
    const changed = vi.fn()
    const control = input(20, changed, { type: 'number', min: 1, max: 100, step: 1 })
    for (const value of ['', '101', '-1', '1.5']) {
      control.value = value
      control.dispatchEvent(new Event('change'))
    }
    expect(changed).not.toHaveBeenCalled()
    expect(control.value).toBe('1.5')
    control.value = '24'
    control.dispatchEvent(new Event('change'))
    expect(changed).toHaveBeenCalledExactlyOnceWith('24')
    expect(control.defaultValue).toBe('20')
  })

  it('keeps native labeling and unique IDs when labels repeat or have units', () => {
    const first = input(500)
    const second = input(1000)
    document.body.append(field('时间', first, { unit: 'ms', accessibleName: '时间 ms' }), field('时间', second))
    expect(first.id).not.toBe(second.id)
    expect(first.labels?.[0]?.htmlFor).toBe(first.id)
    expect(first.getAttribute('aria-label')).toBe('时间 ms')
    expect(document.querySelector('.editor-unit')?.getAttribute('aria-hidden')).toBe('true')
    const actions = button('应用', () => {})
    first.closest('.editor-field')!.append(actions)
    expect(actions.closest('label')).toBeNull()
  })

  it('retains booleans, option values and button semantics', () => {
    const toggled = vi.fn()
    const choice = vi.fn()
    const check = checkbox(false, toggled)
    document.body.append(check)
    check.click()
    expect(toggled).toHaveBeenCalledExactlyOnceWith(true)
    const menu = select([{ value: 'number', title: '连续插值' }, { value: 'step', title: '阶梯' }], 'number', choice)
    menu.value = 'step'
    menu.dispatchEvent(new Event('change'))
    expect(choice).toHaveBeenCalledExactlyOnceWith('step')
    const clicked = vi.fn()
    const action = button('应用', clicked)
    expect(action.type).toBe('button')
    action.disabled = true
    action.click()
    expect(clicked).not.toHaveBeenCalled()
  })

  it('renders project text literally and leaves source/state ownership with the caller', () => {
    const value = '<img src=x onerror=alert(1)>'
    const control = input(value)
    const group = section(value, field(value, control))
    expect(group.querySelector('img')).toBeNull()
    expect(control.value).toBe(value)
    expect(group.querySelector('h3')?.textContent).toBe(value)
    const label = group.querySelector('h3')!.id
    expect(group.getAttribute('aria-labelledby')).toBe(label)
  })
})
