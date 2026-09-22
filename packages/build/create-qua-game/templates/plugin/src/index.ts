import type { EnginePlugin } from '@quajs/engine'

/** Register one instance per engine with engine.use(createPlugin()). */
export function createPlugin(): EnginePlugin {
  return {
    name: '__PROJECT_NAME__',
    version: '0.1.0',
    init(context) {
      // Use engine/store for game state and pipeline for communication.
      // Release any subscriptions in destroy().
      void context
    },
  }
}
