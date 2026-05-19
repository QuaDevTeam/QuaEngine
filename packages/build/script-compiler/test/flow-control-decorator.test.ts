import { describe, expect, it } from 'vitest'
import { createPluginAwareTransformerAsync } from '../src'

describe('flow control decorator compilation', () => {
  it('compiles flow control policy decorators and disable shorthands', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const result = transformer.transformSource(`
const steps = qs\`
@Skippable(false)
Alice: This line blocks skip.

@NoSkip
Alice: This line uses the no-skip shorthand.

@Forwardable(false)
Alice: This line blocks fast-forward.

@NoForward
Alice: This line uses the no-forward shorthand.

@ResetFlowControlPolicy
Alice: This line resets the flow control policy.
\`
`)

    expect(result).toContain('ctx.engine.setFlowControlPolicy')
    expect(result).toContain('ctx.engine.resetFlowControlPolicy')
    expect(result.match(/skippable: false/g)).toHaveLength(2)
    expect(result.match(/fastForwardable: false/g)).toHaveLength(2)
  })

  it('preserves non-identifier policy metadata keys', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const result = transformer.transformSource(`
const steps = qs\`
@FlowControl({ metadata: { "skip-reason": "opening-credits" } })
Alice: This line carries flow metadata.
\`
`)

    expect(result).toContain('"skip-reason": "opening-credits"')
  })

  it('compiles rollback navigation decorators through engine APIs', async () => {
    const transformer = await createPluginAwareTransformerAsync()
    const result = transformer.transformSource(`
const steps = qs\`
@RollbackAnchor("branch")
Alice: This line is an anchor.

@RollbackBoundary("chapter-end")
Alice: This line closes a rollback segment.

@FixRollback
Alice: This line fixes previous rollback history.

@NoRollback
Alice: This line blocks rollback across itself.
\`
`)

    expect(result).toContain('ctx.engine.createRollbackAnchor("branch")')
    expect(result).toContain('ctx.engine.markRollbackBoundary("chapter-end")')
    expect(result).toContain('ctx.engine.fixRollback()')
    expect(result).toContain('ctx.engine.markRollbackBoundary("no-rollback")')
  })
})
