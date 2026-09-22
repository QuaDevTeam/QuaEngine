import { describe, expect, it } from 'vitest'
import { writingDiff } from './writing-diff'

describe('writing change preview', () => {
  it('shows actual old and new source for repeated dialogue and separated changes', () => {
    const before = '相同\n旧句\n相同\n继续\n最后一句'
    const after = '相同\n新句\n相同\n插入\n继续\n尾声'
    const diff = writingDiff(before, after)
    expect(diff.rows.filter(row => row.kind !== 'added').map(row => row.text).join('\n')).toBe(before)
    expect(diff.rows.filter(row => row.kind !== 'removed').map(row => row.text).join('\n')).toBe(after)
    expect(diff.added).toBe(3)
    expect(diff.removed).toBe(2)
    expect(diff.rows.filter(row => row.before).map(row => row.before)).toEqual([1, 2, 3, 4, 5])
  })
  it('bounds large previews, keeps the real change counts and marks the omitted tail', () => {
    const before = Array.from({ length: 3000 }, (_, index) => `old-${index}`).join('\n')
    const after = Array.from({ length: 3000 }, (_, index) => `new-${index}`).join('\n')
    const result = writingDiff(before, after)
    expect(result.rows.length).toBeLessThanOrEqual(2000)
    expect(result.added).toBe(3000)
    expect(result.removed).toBe(3000)
    expect(result.truncated).toBe(true)
  })
})
