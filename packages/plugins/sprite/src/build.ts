import type { AssetCollectionContext, AssetInfo } from '@quajs/quack'
import { createLogger } from '@quajs/logger'
import { QuackPlugin } from '@quajs/quack'
import { createDerivedSpriteAssets } from './importers'

const logger = createLogger('plugin-sprite:quack')

export interface SpriteQuackPluginOptions {
  generateMissingManifests?: boolean
}

export class SpriteQuackPlugin extends QuackPlugin {
  readonly name = '@quajs/plugin-sprite'
  readonly version = '0.1.0'

  constructor(private readonly options: SpriteQuackPluginOptions = {}) {
    super()
  }

  async collectAssets(context: AssetCollectionContext): Promise<AssetInfo[]> {
    if (this.options.generateMissingManifests === false) {
      return []
    }

    const generated = await createDerivedSpriteAssets(context.source, context.assets)
    if (generated.length > 0) {
      logger.info(`Generated ${generated.length} sprite derived asset${generated.length === 1 ? '' : 's'}`)
    }
    return generated
  }
}

export function createSpriteQuackPlugin(options?: SpriteQuackPluginOptions): SpriteQuackPlugin {
  return new SpriteQuackPlugin(options)
}
