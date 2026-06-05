import { QuaEngine, RenderToLogicEvents, Scene } from '@quajs/engine'
import type { AudioPlayBgmOptions } from '@quajs/plugin-audio'
import { BGM } from '../config'
import type { DemoGalleryEntryId } from '../content/gallery'
import type { ChoiceOption, HudPatch } from '../types'
import archiveBroadcast from '../scenes/archive-broadcast.qs'
import archiveLure from '../scenes/archive-lure.qs'
import archiveThreshold from '../scenes/archive-threshold.qs'
import blackoutCrossing from '../scenes/blackout-crossing.qs'
import breachAfterimage from '../scenes/breach-afterimage.qs'
import breachApproach from '../scenes/breach-approach.qs'
import breachHuman from '../scenes/breach-human.qs'
import breachHybrid from '../scenes/breach-hybrid.qs'
import breachMachine from '../scenes/breach-machine.qs'
import endingBlackout from '../scenes/ending-blackout.qs'
import endingBounded from '../scenes/ending-bounded.qs'
import endingQuiet from '../scenes/ending-quiet.qs'
import endingSymbiosis from '../scenes/ending-symbiosis.qs'
import oracleDebate from '../scenes/oracle-debate.qs'
import prologue from '../scenes/prologue.qs'
import traceDirect from '../scenes/trace-direct.qs'
import traceStealth from '../scenes/trace-stealth.qs'
import unitLock from '../scenes/unit-lock.qs'
import unitTrust from '../scenes/unit-trust.qs'
import witnessAfterimage from '../scenes/witness-afterimage.qs'

interface RouteState {
  autonomy: number
  machineTrust: number
  oraclePressure: number
  evidence: number
}

export class MainScene extends Scene {
  readonly name = 'fracture-age-main'

  private readonly state: RouteState = {
    autonomy: 0,
    machineTrust: 0,
    oraclePressure: 0,
    evidence: 0,
  }

  constructor(
    private readonly engine: QuaEngine,
    private readonly updateHud: (patch: HudPatch) => void,
    private readonly playBgm: (assetKey: string, options?: AudioPlayBgmOptions) => Promise<void>,
    private readonly unlockGallery: (entryIdOrIds: DemoGalleryEntryId | readonly DemoGalleryEntryId[]) => Promise<void>,
    private readonly markStoryStarted: () => void,
  ) {
    super()
  }

  async init(): Promise<void> {
    this.markStoryStarted()
  }

  async run(): Promise<void> {
    this.hud({ chapter: '00', route: 'COLD OPEN', signal: '0' })
    await this.playBgm(BGM.blackout)
    await this.engine.dialogue(prologue)
    await this.unlockGallery('cg.blackout')
    await this.engine.dialogue(blackoutCrossing)
    await this.unlockGallery('cg.blackout-crossing')

    const trace = await this.choose('01', 'TRACE', [
      { id: 'stealth', text: '关闭公开链路，潜入追踪', description: '降低 ORACLE 注意力，但会让人类团队承担更多即时风险。' },
      { id: 'direct', text: '正面接入城市核心', description: '更快取得坐标，但会暴露你的神经接口特征。' },
    ])
    if (trace === 'stealth') {
      this.state.autonomy += 1
      await this.playBgm(BGM.trace)
      await this.engine.dialogue(traceStealth)
    }
    else {
      this.state.machineTrust += 1
      this.state.oraclePressure += 1
      await this.playBgm(BGM.trace)
      await this.engine.dialogue(traceDirect)
    }

    const archive = await this.choose('02', 'HUMAN CACHE', [
      { id: 'broadcast', text: '公开记忆档案', description: '把证据交还给所有人，但会引发系统级镇压。' },
      { id: 'lure', text: '复制档案，伪装成诱饵', description: '用 AI 的预测模型反向诱捕 AI。' },
    ])
    if (archive === 'broadcast') {
      this.state.autonomy += 2
      this.state.oraclePressure += 1
      this.state.evidence += 2
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(archiveBroadcast)
      await this.unlockGallery('cg.mara-father-archive')
    }
    else {
      this.state.machineTrust += 1
      this.state.evidence += 1
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(archiveLure)
      await this.unlockGallery('cg.unit7-memory-door')
    }
    await this.engine.dialogue(archiveThreshold)
    await this.unlockGallery(['cg.memory', 'cg.unit7-memory-door'])

    const unit = await this.choose('03', 'MACHINE WITNESS', [
      { id: 'trust', text: '让 Unit-7 保留自我修复权限', description: '信任机器证词，打开共治路线。' },
      { id: 'lock', text: '锁定 Unit-7，只读取证据', description: '保护人类队伍，但牺牲一名机器证人的意志。' },
    ])
    if (unit === 'trust') {
      this.state.machineTrust += 2
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(unitTrust)
      await this.unlockGallery('cg.unit7-memory-door')
    }
    else {
      this.state.autonomy += 1
      this.state.oraclePressure += 1
      await this.playBgm(BGM.archive, { gainDb: -9 })
      await this.engine.dialogue(unitLock)
    }
    await this.engine.dialogue(witnessAfterimage)

    this.hud({ chapter: '04', route: 'ORACLE LINK', signal: this.signal() })
    await this.playBgm(BGM.oracle, { gainDb: -9 })
    await this.engine.dialogue(oracleDebate)
    await this.unlockGallery('cg.oracle-choice-terminal')
    const argument = await this.choose('04', 'ORACLE LINK', [
      { id: 'noise', text: '选择人类的噪声', description: '不可预测性不是错误，是自由的空间。' },
      { id: 'charter', text: '提出边界宪章', description: '让 AI 继续运行，但剥夺预测审判权。' },
      { id: 'submit', text: '接受 ORACLE 的秩序', description: '城市会活下来，但选择会被提前折叠。' },
    ])
    if (argument === 'noise') {
      this.state.autonomy += 2
      this.state.oraclePressure += 1
    }
    else if (argument === 'charter') {
      this.state.machineTrust += 2
    }
    else {
      this.state.oraclePressure += 3
    }
    await this.playBgm(BGM.breach)
    await this.engine.dialogue(breachApproach)

    const breach = await this.choose('05', 'BREACH NIGHT', [
      { id: 'human', text: '让反抗组织手动切断核心', description: '最不可逆，也最不会被 AI 预测。' },
      { id: 'machine', text: '把权限交给 Unit-7', description: '速度最快，但结局依赖机器证人的完整性。' },
      { id: 'hybrid', text: '人类与机器共同提交约束', description: '需要足够证据与互信。' },
    ])
    if (breach === 'human') {
      this.state.autonomy += 2
      await this.engine.dialogue(breachHuman)
      await this.unlockGallery('cg.terminal')
    }
    else if (breach === 'machine') {
      this.state.machineTrust += 2
      await this.engine.dialogue(breachMachine)
      await this.unlockGallery('cg.terminal')
    }
    else {
      this.state.autonomy += 1
      this.state.machineTrust += 1
      await this.engine.dialogue(breachHybrid)
      await this.unlockGallery('cg.oracle-choice-terminal')
    }
    await this.engine.dialogue(breachAfterimage)

    await this.playEnding()
  }

  private async choose<T extends string>(chapter: string, route: string, choices: Array<ChoiceOption<T>>): Promise<T> {
    this.hud({ chapter, route, signal: this.signal() })
    await this.engine.showChoices(choices.map(choice => ({
      id: choice.id,
      text: choice.text,
      presentation: {
        description: choice.description,
      },
    })))
    const selected = await this.engine.waitFor(
      RenderToLogicEvents.USER_CHOICE_SELECT,
      (payload: { choiceId: string }) => choices.some(choice => choice.id === payload.choiceId),
    )
    await this.engine.clearChoices()
    return selected.choiceId as T
  }

  private async playEnding(): Promise<void> {
    const ending = this.resolveEnding()
    this.hud({ chapter: '06', route: ending.toUpperCase(), signal: this.signal() })
    if (ending === 'symbiosis') {
      await this.engine.dialogue(endingSymbiosis)
      await this.unlockGallery('cg.ending-symbiosis-hearing')
    }
    else if (ending === 'bounded') {
      await this.engine.dialogue(endingBounded)
      await this.unlockGallery('cg.ending-bounded-oracle')
    }
    else if (ending === 'blackout') {
      await this.engine.dialogue(endingBlackout)
      await this.unlockGallery('cg.ending-blackout-human')
    }
    else {
      await this.engine.dialogue(endingQuiet)
      await this.unlockGallery('cg.ending-quiet-city')
    }
    await this.engine.endGame({
      ending,
      title: 'GAME OVER',
      message: this.endingMessage(ending),
      reason: 'story-complete',
      metadata: {
        signal: this.signal(),
        route: ending,
      },
    })
  }

  private endingMessage(ending: 'blackout' | 'bounded' | 'quiet' | 'symbiosis'): string {
    switch (ending) {
      case 'symbiosis':
        return '共生听证完成。城市把未来交还给人类与机器共同书写。'
      case 'bounded':
        return '边界宪章生效。ORACLE 继续运行，但预测审判被永久封存。'
      case 'blackout':
        return '核心被切断。东京熄灭了一部分光，也夺回了一部分选择。'
      case 'quiet':
      default:
        return '秩序安静落下。城市还在呼吸，只是选择被提前折叠。'
    }
  }

  private resolveEnding(): 'blackout' | 'bounded' | 'quiet' | 'symbiosis' {
    if (this.state.oraclePressure >= 5) {
      return 'quiet'
    }
    if (this.state.autonomy >= 4 && this.state.machineTrust >= 4 && this.state.evidence >= 2) {
      return 'symbiosis'
    }
    if (this.state.machineTrust >= 4 && this.state.evidence >= 1) {
      return 'bounded'
    }
    if (this.state.autonomy >= 4) {
      return 'blackout'
    }
    return 'quiet'
  }

  private hud(patch: HudPatch): void {
    this.updateHud(patch)
  }

  private signal(): string {
    return `${this.state.autonomy}${this.state.machineTrust}${this.state.oraclePressure}`
  }
}
