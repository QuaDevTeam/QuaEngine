import type { EngineContext } from '../core/types'
import { defineAPIFunction, defineDecorator, PluginFramework } from '../framework/base'

/**
 * Example Achievement Plugin demonstrating developer freedom
 * Shows how to manage own state and communication patterns
 */
export class AchievementPlugin extends PluginFramework {
  readonly name = 'achievement'
  readonly version = '1.0.0'
  readonly description = 'Achievement system with custom state management'

  private achievements = new Map<string, {
    id: string
    name: string
    description: string
    unlocked: boolean
    progress: number
    maxProgress: number
  }>()

  /**
   * Define plugin APIs - TypeScript will auto-infer all types
   */
  protected getPluginAPIs() {
    return [
      // Context-aware API - developer handles ctx directly
      this.createContextAPI(
        'unlock',
        async (ctx: EngineContext, achievementId: string) => {
          const result = await this.unlockAchievement(achievementId)
          
          // Developer manages pipeline communication directly
          if (result) {
            await ctx.pipeline.emit('achievement.unlocked', {
              pluginName: this.name,
              achievementId,
              timestamp: Date.now()
            })
          }
          
          return result
        }
      ),

      defineAPIFunction(
        'isUnlocked',
        (achievementId: string): boolean => {
          const achievement = this.achievements.get(achievementId)
          return achievement ? achievement.unlocked : false
        }
      ),

      defineAPIFunction(
        'getProgress',
        (achievementId: string) => {
          const achievement = this.achievements.get(achievementId)
          if (!achievement) return null
          return {
            current: achievement.progress,
            max: achievement.maxProgress,
            percentage: Math.round((achievement.progress / achievement.maxProgress) * 100)
          }
        }
      ),

      this.createContextAPI(
        'addProgress',
        async (ctx: EngineContext, achievementId: string, amount: number = 1) => {
          const result = await this.addAchievementProgress(ctx, achievementId, amount)
          return result
        }
      )
    ]
  }

  protected getPluginDecorators() {
    return {
      ...defineDecorator('UnlockAchievement', {
        function: 'unlock',
        module: this.name
      }),
      ...defineDecorator('AchievementProgress', {
        function: 'addProgress',
        module: this.name
      })
    }
  }

  /**
   * Developer manages their own initialization and state loading
   */
  protected async setup(ctx: EngineContext): Promise<void> {
    // Developer uses ctx.store directly - no predefined helpers
    const storeState = (ctx.store as any).state || {}
    const pluginState = storeState[`plugin_${this.name}`] || {}
    const savedAchievements = pluginState.achievements || {}
    
    if (Object.keys(savedAchievements).length === 0) {
      this.createAchievement('first_dialogue', 'First Words', 'Complete your first dialogue', 1)
      this.createAchievement('story_progress', 'Story Explorer', 'Progress through the story', 100)
      this.createAchievement('choice_maker', 'Decision Maker', 'Make 10 choices', 10)
    } else {
      for (const [id, data] of Object.entries(savedAchievements)) {
        this.achievements.set(id, data as any)
      }
    }

    // Developer manages pipeline communication directly
    await ctx.pipeline.emit('plugin.initialized', {
      pluginName: this.name,
      achievementCount: this.achievements.size
    })
  }

  async onStep(ctx: EngineContext): Promise<void> {
    if (ctx.stepId) {
      // Auto-track achievements
      if (!this.achievements.get('first_dialogue')?.unlocked) {
        await this.unlockAchievement('first_dialogue')
        await ctx.pipeline.emit('achievement.unlocked', {
          pluginName: this.name,
          achievementId: 'first_dialogue'
        })
      }
      
      await this.addAchievementProgress(ctx, 'story_progress', 1)
    }
  }

  /**
   * Developer manages their own cleanup and state saving
   */
  async destroy(): Promise<void> {
    if (this.ctx) {
      // Developer uses ctx.store directly for state persistence
      const achievementData: Record<string, any> = {}
      for (const [id, achievement] of this.achievements.entries()) {
        achievementData[id] = achievement
      }

      // Direct store mutation - developer choice of how to structure state
      const store = this.ctx.store as any
      if (store.commit) {
        store.commit('SET_PLUGIN_STATE', {
          pluginName: this.name,
          key: 'achievements',
          value: achievementData
        })
      }

      // Developer manages pipeline communication
      await this.ctx.pipeline.emit('plugin.destroyed', {
        pluginName: this.name
      })
    }

    await super.destroy?.()
  }

  // Private methods - developer implements own patterns
  
  private createAchievement(
    id: string,
    name: string,
    description: string,
    maxProgress: number = 1
  ): void {
    this.achievements.set(id, {
      id,
      name,
      description,
      unlocked: false,
      progress: 0,
      maxProgress
    })
  }

  private async unlockAchievement(achievementId: string): Promise<boolean> {
    const achievement = this.achievements.get(achievementId)
    if (!achievement || achievement.unlocked) {
      return false
    }

    achievement.unlocked = true
    achievement.progress = achievement.maxProgress
    return true
  }

  private async addAchievementProgress(
    ctx: EngineContext,
    achievementId: string,
    amount: number
  ): Promise<boolean> {
    const achievement = this.achievements.get(achievementId)
    if (!achievement || achievement.unlocked) {
      return false
    }

    const oldProgress = achievement.progress
    achievement.progress = Math.min(achievement.progress + amount, achievement.maxProgress)

    // Developer manages event emission directly
    if (achievement.progress >= achievement.maxProgress) {
      achievement.unlocked = true
      await ctx.pipeline.emit('achievement.unlocked', {
        pluginName: this.name,
        achievementId,
        fromProgress: true
      })
      return true
    }

    // Developer decides what events to emit and when
    if (oldProgress !== achievement.progress) {
      await ctx.pipeline.emit('achievement.progress', {
        pluginName: this.name,
        achievementId,
        oldProgress,
        newProgress: achievement.progress,
        maxProgress: achievement.maxProgress
      })
    }

    return true
  }
}