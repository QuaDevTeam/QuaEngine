import { render } from '@quajs/editor-controls'
// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { buildLogTone, buildLogView } from '../src/features/build/log'

afterEach(() => document.body.replaceChildren())

it('recognizes actual tool diagnostics without treating file names or zero counts as failures', () => {
  for (const line of ['error[E0425]: cannot find value', 'Error: build failed', '[ERROR] unavailable', '✗ Build failed', 'thread \'main\' panicked at src/main.rs:4'])
    expect(buildLogTone(line)).toBe('error')
  for (const line of ['warning: unused variable', '[plugin vite:reporter] warning: large chunks', '(!) Some chunks are larger than 500 kB'])
    expect(buildLogTone(line)).toBe('warning')
  expect(buildLogTone('    Finished `release` profile in 2.34s')).toBe('success')
  expect(buildLogTone('✓ built in 531ms')).toBe('success')
  expect(buildLogTone('Compiling quajs_native_app v0.1')).toBe('info')
  expect(buildLogTone('[2026-09-22 16:05:00][ERROR][quack:bundler] Missing input')).toBe('error')
  expect(buildLogTone('[2026-09-22 16:05:00][WARN][quack:bundler] Missing optional metadata')).toBe('warning')
  for (const line of ['dist/error.js  12 kB', '0 errors, 0 warnings', 'src/failed.rs', 'error-page.ts', 'warning.ts', 'finished.rs', 'info.json'])
    expect(buildLogTone(line)).toBe('normal')
})

it('keeps untrusted output literal and preserves exact copyable whitespace', () => {
  const host = document.createElement('pre')
  document.body.append(host)
  const text = 'warning: <img src=x onerror=alert(1)>\n  src/main.rs:4:2  2.34s\nhttps://example.com/build\n'
  render(buildLogView(text), host)
  expect(host.textContent).toBe(text)
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelector('a')).toBeNull()
  expect(host.querySelector('.build-log-file')?.textContent).toBe('src/main.rs:4:2')
  expect(host.querySelector('.build-log-metric')?.textContent).toBe('2.34s')
  const long = 'x'.repeat(64000)
  render(buildLogView(long), host)
  expect(host.textContent).toBe(long)
  expect(host.querySelectorAll('.build-log-line')).toHaveLength(1)
})

it('bounds rendered output and keeps the final diagnostic after a newline flood', () => {
  const host = document.createElement('pre')
  render(buildLogView(`${'\n'.repeat(64000)}error: final diagnostic`), host)
  expect(host.querySelectorAll('.build-log-line')).toHaveLength(1200)
  expect(host.textContent).toContain('仅显示最近 1200 行')
  expect(host.lastElementChild?.textContent).toBe('error: final diagnostic')
})
