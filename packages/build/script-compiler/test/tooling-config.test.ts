import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backgroundDecoratorMappings } from '@quajs/plugin-background'
import { describe, expect, it } from 'vitest'
import { loadQuaScriptToolingConfig, mergeQuaScriptToolingConfig, resolveQuaScriptFiles } from '../src'

describe('quaScript tooling config', () => {
  it('loads quascript.config.json before other config sources', () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-config-'))
    writeFileSync(join(root, 'quascript.config.json'), JSON.stringify({
      format: { maxBlankLines: 2 },
      lint: { rules: { QS_STYLE_FINAL_NEWLINE: 'error' } },
    }), 'utf-8')
    writeFileSync(join(root, 'qua.config.json'), JSON.stringify({
      quascript: {
        format: { maxBlankLines: 0 },
      },
    }), 'utf-8')

    const config = loadQuaScriptToolingConfig(root)

    expect(config.format?.maxBlankLines).toBe(2)
    expect(config.lint?.rules?.QS_STYLE_FINAL_NEWLINE).toBe('error')
  })

  it('loads qua.config.json and package.json quascript sections', () => {
    const quaRoot = mkdtempSync(join(tmpdir(), 'quascript-config-'))
    writeFileSync(join(quaRoot, 'qua.config.json'), JSON.stringify({
      quascript: {
        files: { include: ['story/**/*.qs'] },
      },
    }), 'utf-8')

    expect(loadQuaScriptToolingConfig(quaRoot).files?.include).toEqual(['story/**/*.qs'])

    const packageRoot = mkdtempSync(join(tmpdir(), 'quascript-config-'))
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
      quascript: {
        format: { insertFinalNewline: false },
      },
    }), 'utf-8')

    expect(loadQuaScriptToolingConfig(packageRoot).format?.insertFinalNewline).toBe(false)
  })

  it('preserves project config when editor settings only provide sparse overrides', () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-config-'))
    writeFileSync(join(root, 'quascript.config.json'), JSON.stringify({
      files: { include: ['story/**/*.qs'] },
      format: { insertFinalNewline: false, maxBlankLines: 3 },
      lint: { rules: { QS_STYLE_FINAL_NEWLINE: 'off' } },
    }), 'utf-8')

    const merged = mergeQuaScriptToolingConfig(loadQuaScriptToolingConfig(root), {
      decorators: {
        autoCollect: false,
        mappings: backgroundDecoratorMappings,
      },
      format: { enable: false },
    })

    expect(merged.files?.include).toEqual(['story/**/*.qs'])
    expect(merged.decorators?.autoCollect).toBe(false)
    expect(merged.decorators?.mappings?.SetBackground).toEqual(backgroundDecoratorMappings.SetBackground)
    expect(merged.format).toMatchObject({
      enable: false,
      insertFinalNewline: false,
      maxBlankLines: 3,
    })
    expect(merged.lint?.rules?.QS_STYLE_FINAL_NEWLINE).toBe('off')
  })
})

describe('quaScript file matching', () => {
  it('resolves files, directories, globs, include patterns, and excludes', () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-files-'))
    mkdirSync(join(root, 'src/story'), { recursive: true })
    mkdirSync(join(root, 'dist'), { recursive: true })
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true })
    writeFileSync(join(root, 'src/story/opening.qs'), 'Yuki: Hi\n', 'utf-8')
    writeFileSync(join(root, 'src/story/ending.qs'), 'Yuki: Bye\n', 'utf-8')
    writeFileSync(join(root, 'dist/generated.qs'), 'Yuki: Skip\n', 'utf-8')
    writeFileSync(join(root, 'node_modules/pkg/ignored.qs'), 'Yuki: Skip\n', 'utf-8')

    expect(resolveQuaScriptFiles([], { cwd: root }).map(path => path.replace(root, '')))
      .toEqual([
        '/src/story/ending.qs',
        '/src/story/opening.qs',
      ])
    expect(resolveQuaScriptFiles(['src/story'], { cwd: root }).map(path => path.replace(root, '')))
      .toEqual([
        '/src/story/ending.qs',
        '/src/story/opening.qs',
      ])
    expect(resolveQuaScriptFiles(['src/**/*.qs'], { cwd: root }).map(path => path.replace(root, '')))
      .toEqual([
        '/src/story/ending.qs',
        '/src/story/opening.qs',
      ])
    expect(resolveQuaScriptFiles([], {
      cwd: root,
      exclude: ['**/ending.qs'],
      include: ['src/story/*.qs'],
    }).map(path => path.replace(root, ''))).toEqual(['/src/story/opening.qs'])
  })
})
