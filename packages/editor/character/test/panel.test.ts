// @vitest-environment happy-dom
import type { EditorPluginContext, EditorProject } from '@quajs/editor-core'
import type { CharacterCatalog } from '../src/contracts'
import { describe, expect, it, vi } from 'vitest'
import { CHARACTER_EDITOR_ID } from '../src/contracts'
import { CharacterBrowser } from '../src/editor/controller'
import { characterForSource } from '../src/model/source'

describe('character panel form lifecycle', () => {
  it('matches definition locations and manifests, preserves form drafts and cancels stale navigation', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const context: EditorPluginContext = { applyEdit: vi.fn(), openSource: vi.fn(), reportError: vi.fn(), assetUrl: vi.fn() }
    const panel = new CharacterBrowser(host, context)
    const catalog: CharacterCatalog = { characters: ['alice', 'bob'].map((id, i) => ({ key: id, id: { value: id }, displayName: { value: id }, aliases: [], source: { path: 'characters.ts', line: 3 + i * 10, column: 2 }, manifest: { path: `${id}.manifest.json`, line: 1, column: 1 }, expressions: [], base: [], warnings: [] })), registrations: [], issues: [] }
    const project = { root: '/project', plugins: { [CHARACTER_EDITOR_ID]: { data: catalog } } } as EditorProject
    panel.update(project)
    panel.setVisible(true)
    const source = { path: 'characters.ts', line: 13, column: 2 }
    expect(characterForSource(catalog, source)?.key).toBe('bob')
    expect(characterForSource(catalog, { ...source, column: 1 })?.key).toBe('bob')
    expect(characterForSource(catalog, { ...source, line: 2 }, 'bob')?.key).toBe('bob')
    expect(characterForSource(catalog, { ...source, path: 'notes.md' })).toBeUndefined()
    panel.revealSource(source)
    expect(host.querySelector('[data-character="bob"]')!.getAttribute('aria-pressed')).toBe('true')
    const name = host.querySelector<HTMLInputElement>('[aria-label="角色名称"]')!
    name.value = 'unfinished'
    panel.revealSource({ path: 'alice.manifest.json', line: 1, column: 1 })
    const stale = [...host.querySelectorAll('button')].find(button => button.textContent === '放弃更改并切换')!
    expect(name.value).toBe('unfinished')
    panel.revealSource(undefined)
    stale.click()
    expect(host.querySelector('[data-character="bob"]')!.getAttribute('aria-pressed')).toBe('true')
    panel.revealSource({ path: 'alice.manifest.json', line: 1, column: 1 })
    panel.update(project)
    ;[...host.querySelectorAll('button')].find(button => button.textContent === '放弃更改并切换')!.click()
    expect(host.querySelector('[data-character="alice"]')!.getAttribute('aria-pressed')).toBe('true')
    panel.dispose()
    panel.revealSource(source)
    expect(host.children).toHaveLength(0)
    host.remove()
  })
  it('preserves a draft and its focus across reindexing and uses the current source revision', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const context: EditorPluginContext = { applyEdit: vi.fn(async () => {}), openSource: vi.fn(), reportError: vi.fn(), assetUrl: vi.fn() }
    const panel = new CharacterBrowser(host, context)
    const project = (revision: string): EditorProject => {
      const catalog: CharacterCatalog = { characters: [{ key: 'a', id: { value: 'a' }, displayName: { value: 'Alice' }, aliases: [], source: { path: 'a.ts', line: 1, column: 1 }, expressions: [], base: [], warnings: [], addExpression: { root: '/project', path: 'sprite.manifest.json', revision, start: 1, end: 1, expectedText: '' } }], registrations: [], issues: [] }
      return { root: '/project', plugins: { [CHARACTER_EDITOR_ID]: { data: catalog } } } as EditorProject
    }
    panel.update(project('old'))
    panel.setVisible(true)
    const click = (text: string) => [...host.querySelectorAll('button')].find(button => button.textContent === text)!.click()
    click('添加差分')
    const field = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
    field('新差分名称').value = 'happy'
    field('新差分资源路径').value = 'a/happy.png'
    field('新差分名称').focus()
    panel.update(project('current'))
    expect(field('新差分名称').value).toBe('happy')
    expect(field('新差分资源路径').value).toBe('a/happy.png')
    expect(document.activeElement).toBe(field('新差分名称'))
    panel.setVisible(false)
    panel.setVisible(true)
    expect(field('新差分名称').value).toBe('happy')
    click('添加到源文件')
    await Promise.resolve()
    expect(context.applyEdit).toHaveBeenCalledWith(expect.objectContaining({ revision: 'current', newText: expect.stringContaining('a/happy.png') }))
    panel.dispose()
    host.remove()
  })
})
