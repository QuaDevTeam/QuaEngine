import { describe, expect, it } from 'vitest'
import { Button, Column, Panel } from '@quajs/native-ui'
import { analyzeQssSource, compileQuiTsxProjection } from '../../src'

describe('@quajs/native-ui-compiler projection selectors', () => {
  it('applies native QSS selector specificity and ancestor matching during projection compile', () => {
    const root = Panel({ id: 'menu', x: 0, y: 0, width: 0, height: 0, children: [
      Button({ id: 'direct', class: 'primary', x: 0, y: 0, width: 0, height: 0, children: 'Direct' }),
      Column({ x: 0, y: 0, width: 0, height: 0, children: [
        Button({ id: 'nested', class: 'primary', x: 0, y: 0, width: 0, height: 0, children: 'Nested' }),
      ] }),
    ] })

    const qss = analyzeQssSource(`
Button { color: #aaaaaa; }
.primary { color: #bbbbbb; }
Panel Button.primary { color: #cccccc; }
Panel > Button.primary { color: #dddddd; }
#nested { color: #eeeeee; }
`)

    const projection = compileQuiTsxProjection(root, { qss })
    const direct = projection.root?.children?.[0]
    const nested = projection.root?.children?.[1]?.children?.[0]

    expect(direct?.style).toEqual({ color: '#dddddd' })
    expect(nested?.style).toEqual({ color: '#eeeeee' })
  })

  it('ignores malformed native QSS selector chains during projection compile', () => {
    const root = Panel({ id: 'menu', x: 0, y: 0, width: 0, height: 0, children: [
      Button({ id: 'target', x: 0, y: 0, width: 0, height: 0, children: 'Target' }),
    ] })

    const qss = analyzeQssSource(`
Panel > { color: #ff0000; }
> Button { color: #00ff00; }
Panel > > Button { color: #0000ff; }
Panel > Button { color: #101010; }
`)

    const projection = compileQuiTsxProjection(root, { qss })
    const target = projection.root?.children?.[0]

    expect(target?.style).toEqual({ color: '#101010' })
  })
})
