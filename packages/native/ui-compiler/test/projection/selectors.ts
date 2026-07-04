import { describe, expect, it } from 'vitest'
import {
  analyzeQssSource,
  analyzeQuiSource,
  compileNativeUiSurfaceProjection,
} from '../../src'

describe('@quajs/native-ui-compiler projection selectors', () => {
  it('applies native QSS selector specificity and ancestor matching during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button.primary(id: "direct", label: "Direct")
  Column {
    Button.primary(id: "nested", label: "Nested")
  }
}
`)
    const qss = analyzeQssSource(`
Button { color: #aaaaaa; }
.primary { color: #bbbbbb; }
Panel Button.primary { color: #cccccc; }
Panel > Button.primary { color: #dddddd; }
#nested { color: #eeeeee; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const direct = projection.root?.children?.[0]
    const nested = projection.root?.children?.[1]?.children?.[0]

    expect(direct?.style).toEqual({ color: '#dddddd' })
    expect(nested?.style).toEqual({ color: '#eeeeee' })
  })

  it('ignores malformed native QSS selector chains during projection compile', () => {
    const qui = analyzeQuiSource(`
Panel(id: "menu") {
  Button(id: "target", label: "Target")
}
`)
    const qss = analyzeQssSource(`
Panel > { color: #ff0000; }
> Button { color: #00ff00; }
Panel > > Button { color: #0000ff; }
Panel > Button { color: #101010; }
`)

    const projection = compileNativeUiSurfaceProjection(qui, { qss })
    const target = projection.root?.children?.[0]

    expect(target?.style).toEqual({ color: '#101010' })
  })
})
