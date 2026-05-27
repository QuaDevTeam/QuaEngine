import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyQuaScriptLocaleOverlay,
  compileLocalizedQuaScriptModuleToTs,
  compileQuaScriptModuleToTs,
  createQuaScriptLocaleSkeleton,
  extractQuaScriptLocalizableUnits,
  syncQuaScriptLocale,
} from '../src'

describe('quaScript localization helpers', () => {
  it('extracts localizable units with anchors and expression signatures', () => {
    const units = extractQuaScriptLocalizableUnits(`
      @LineId('intro.opening')
      Yuki: Hello \${scope.playerName}
      - \${$t('choice.leave')} -> leave
    `)

    expect(units).toHaveLength(2)
    expect(units[0]).toEqual(expect.objectContaining({
      kind: 'dialogue',
      character: 'Yuki',
      anchors: ['intro.opening'],
      expressionSignature: ['scope.playerName'],
    }))
    expect(units[1]).toEqual(expect.objectContaining({
      kind: 'choice',
      target: 'leave',
      textKeys: ['choice.leave'],
    }))
  })

  it('applies locale overlays without taking locale decorators as runtime structure', () => {
    const base = `
      @LineId('intro.opening')
      @PlayVoice('voice/en.ogg')
      Yuki: Hello \${scope.playerName}

      - Leave -> leave
    `
    const localized = `
      @LineId('intro.opening')
      @PlayVoice('voice/zh.ogg')
      Yuki: 你好 \${scope.playerName}

      - 离开 -> leave
    `

    const overlay = applyQuaScriptLocaleOverlay(base, localized)

    expect(overlay).toContain('@PlayVoice(\'voice/en.ogg\')')
    expect(overlay).not.toContain('@PlayVoice(\'voice/zh.ogg\')')
    expect(overlay).toContain('Yuki: 你好 $' + '{scope.playerName}')
    expect(overlay).toContain('- 离开 -> leave')
  })

  it('compiles localized modules with base structure and localized text expressions', () => {
    const baseSource = `
        @LineId('intro.opening')
        Yuki: Hello \${scope.playerName}
      `
    const runtimeModule = {
      moduleId: 'intro',
      version: '1',
      stableSeed: 'test',
    }
    const baseResult = compileQuaScriptModuleToTs(baseSource, {
      hotReload: false,
      runtimeModule,
    })
    const result = compileLocalizedQuaScriptModuleToTs({
      baseSource,
      localizedSource: `
        @LineId('intro.opening')
        Yuki: \${$t('intro.opening', { name: scope.playerName })}!!!
      `,
      locale: 'zh-cn',
      runtimeModule,
    })
    const ids = (code: string) => Array.from(code.matchAll(/uuid: "(qs:intro:[^"]+)"/g), match => match[1])

    expect(ids(result)).toEqual(ids(baseResult))
    expect(result).toContain('$t(\'intro.opening\'')
    expect(result).toContain('resolveQuaText')
  })

  it('applies project tooling config during localized module compilation', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'quascript-localized-config-'))
    writeFileSync(join(projectRoot, 'quascript.config.json'), JSON.stringify({
      decorators: {
        autoCollect: false,
      },
    }), 'utf-8')
    writeFileSync(join(projectRoot, 'qua.plugins.json'), JSON.stringify({
      plugins: [
        {
          name: '@quajs/plugin-background',
          decorators: {
            SetBackground: {
              function: 'setBackgroundWithEngine',
              module: '@quajs/plugin-background',
            },
          },
        },
      ],
    }), 'utf-8')

    expect(() => compileLocalizedQuaScriptModuleToTs({
      baseSource: `
        @SetBackground('classroom.png')
        Yuki: Hello
      `,
      localizedSource: `
        @SetBackground('classroom.png')
        Yuki: 你好
      `,
      locale: 'zh-cn',
      projectRoot,
    })).toThrow('Unknown QuaScript decorator @SetBackground')
  })

  it('creates skeletons and reports sync statuses', () => {
    const base = `
      Yuki: Hello
      - Continue -> next if scope.canContinue
    `
    const skeleton = createQuaScriptLocaleSkeleton(base, 'zh-cn')
    const synced = syncQuaScriptLocale(base, skeleton)

    expect(skeleton).toContain('// locale: zh-cn')
    expect(synced.units.map(unit => unit.status)).toEqual(['needs-review', 'needs-review'])
    expect(synced.source).toContain('// NEEDS-REVIEW: base text or matching context changed\nYuki: Hello')
    expect(synced.source).toContain('Yuki: Hello')
    expect(synced.source).toContain('- Continue -> next if scope.canContinue')
  })

  it('syncs locale overlay files without copying base runtime decorators', () => {
    const base = `
      @LineId('intro.opening')
      @QuickSave()
      Yuki: Hello
    `
    const localized = `
      // locale: zh-cn
      @LineId('intro.opening')
      Yuki: 你好
    `
    const synced = syncQuaScriptLocale(base, localized)

    expect(synced.source).toContain('// locale: zh-cn')
    expect(synced.source).toContain('@LineId(\'intro.opening\')')
    expect(synced.source).toContain('Yuki: 你好')
    expect(synced.source).not.toContain('@QuickSave')
  })

  it('uses previous sync state to keep translations aligned after base insertions', () => {
    const firstBase = `
      Yuki: First line
      Yuki: Second line
    `
    const firstLocale = `
      Yuki: 第一行
      Yuki: 第二行
    `
    const firstSync = syncQuaScriptLocale(firstBase, firstLocale)
    const nextBase = `
      Yuki: First line
      Yuki: Newly inserted line
      Yuki: Second line
    `
    const nextSync = syncQuaScriptLocale(nextBase, firstSync.source, {
      previousState: firstSync.state,
    })

    expect(nextSync.units.map(unit => unit.status)).toEqual(['matched', 'todo', 'matched'])
    expect(nextSync.source).toContain('Yuki: 第一行')
    expect(nextSync.source).toContain('// TRANSLATION-REQUIRED\nYuki: Newly inserted line')
    expect(nextSync.source).toContain('Yuki: Newly inserted line')
    expect(nextSync.source).toContain('Yuki: 第二行')
  })

  it('keeps obsolete locale entries as comments during sync', () => {
    const base = `
      Yuki: Kept line
    `
    const localized = `
      Yuki: 保留
      Yuki: 删除的旧译文
    `
    const synced = syncQuaScriptLocale(base, localized)

    expect(synced.obsolete).toHaveLength(1)
    expect(synced.source).toContain('// OBSOLETE: no matching base unit')
    expect(synced.source).toContain('// Yuki: 删除的旧译文')
  })
})
