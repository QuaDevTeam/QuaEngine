import type { EditorProject } from '@quajs/editor-core'
import { describe, expect, it } from 'vitest'
import { extractWritingContext } from './project.js'

const project: EditorProject = { root: '/project', name: '故事', bundleId: 'story', directories: [], files: [], entries: [], diagnostics: [], targets: { web: { enabled: true }, native: { enabled: false } }, story: [{ key: 'k', kind: 'scene', title: '车站', id: 'station', filePath: 'scene.qs', line: 4, children: [] }] }
describe('editor project context', () => {
  it('uses Story Tree and explicit setting documents before prose', async () => {
    const result = await extractWritingContext({ ...project, entries: [{ path: 'docs/worldbuilding.md', kind: 'document', size: 20, modified: 0 }, { path: 'docs/characters.md', kind: 'document', size: 20, modified: 0 }] }, async path => ({ path, text: path.includes('world') ? '既定世界' : '角色生平', revision: '1' }))
    expect(result.outline).toContain('station')
    expect(result.worldbuilding).toContain('既定世界')
    expect(result.characters).toContain('角色生平')
    expect(result.sources).toContainEqual({ path: 'scene.qs', line: 4, kind: 'story' })
  })
  it('marks absent setting inference as evidence and reports parse failures', async () => {
    const result = await extractWritingContext({ ...project, entries: ['scene.qs', 'broken.qs'].map(path => ({ path, kind: 'document', size: 30, modified: 0 })) }, async path => ({ path, text: path === 'scene.qs' ? '凛: 雨停了\n车站仍然空着。' : '<script>broken', revision: '1' }))
    expect(result.worldbuilding).toContain('有限的 QS 正文证据')
    expect(result.characters).toContain('凛')
    expect(result.warnings.join('')).toContain('无法解析')
  })
})
