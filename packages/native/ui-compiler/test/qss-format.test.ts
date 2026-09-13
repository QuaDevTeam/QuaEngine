import type { NativeQssDocument, NativeQssResolvedNodeStyle } from '../src'
import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  formatQssSource,
  resolveNativeQssDeclarations,
} from '../src'

describe('@quajs/native-ui-compiler QSS formatting', () => {
  it('formats native QSS idempotently without changing resolved style IR', () => {
    const source = `
Panel.card,Button.primary:hover{background-color:#10141f;background-image:asset("ui/panel.png","images");background-position:right bottom;background-size:contain;border-color:#31415f;border-radius:8px;border-style:solid;border-width:1px;color:#f6f8ff;font-family:"Inter",system-ui;font-size:18px;font-style:italic;font-weight:600;letter-spacing:1.5px;line-height:1.25;object-fit:cover;object-position:right top;opacity:0.85;overflow:hidden;padding:12px 20px;text-align:center;text-decoration:underline;text-overflow:ellipsis;text-transform:uppercase;white-space:pre-wrap;z-index:12;}
Row.menu > Button.item{position:absolute;left:8px;top:16px;width:180px;height:48px;margin:2px 4px;gap:8px 12px;justify-content:space-between;align-items:center;pointer-events:auto;visibility:visible;}
`

    const before = analyzeQssSource(source)
    const formatted = formatQssSource(source)
    const formattedAgain = formatQssSource(formatted)
    const after = analyzeQssSource(formatted)

    expect(before.diagnostics).toEqual([])
    expect(after.diagnostics).toEqual([])
    expect(formattedAgain).toBe(formatted)
    expect(ruleSelectors(after)).toEqual(ruleSelectors(before))
    expect(resolvedRules(after)).toEqual(resolvedRules(before))
  })

  it('preserves QSS formatter options for final newline handling', () => {
    const source = 'Panel { color: white; }'

    expect(formatQssSource(source)).toMatch(/\n$/)
    expect(formatQssSource(source, {
      format: {
        insertFinalNewline: false,
      },
    })).not.toMatch(/\n$/)
  })
})

function ruleSelectors(document: NativeQssDocument): string[] {
  return document.rules.map(rule => rule.selector.trim())
}

function resolvedRules(document: NativeQssDocument): NativeQssResolvedNodeStyle[] {
  return document.rules.map(rule => resolveNativeQssDeclarations(rule.declarations))
}
