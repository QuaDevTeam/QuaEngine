import { Pipeline } from '@quajs/pipeline'
import { expect, it } from 'vitest'
import { createDemoMediaReview } from '../src/game/media-review'

it('bounds media QA observations and detaches listeners on teardown', async () => {
  const pipeline = new Pipeline()
  const review = createDemoMediaReview({
    engine: { getPipeline: () => pipeline },
  } as unknown as Parameters<typeof createDemoMediaReview>[0])
  for (let i = 0; i < 300; i++)
    await pipeline.emit('audio/ended', { id: String(i) })
  expect(review.events()).toHaveLength(256)
  expect(review.events()[0].payload).toEqual({ id: '44' })
  review.dispose()
  await pipeline.emit('audio/ended', { id: 'after-dispose' })
  expect(review.events().at(-1)?.payload).toEqual({ id: '299' })
})
