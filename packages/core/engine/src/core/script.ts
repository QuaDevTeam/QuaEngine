import type { GameStep, GameStepScope, GameStepSource } from './types'

export function resolveGameSteps<TScope = GameStepScope>(source: GameStepSource<TScope>, scope?: TScope): GameStep[] {
  if (typeof source === 'function') {
    const steps = source(scope as TScope)
    if (!Array.isArray(steps)) {
      throw new TypeError('QuaScript factory must return a GameStep array.')
    }
    return steps
  }

  return source
}
