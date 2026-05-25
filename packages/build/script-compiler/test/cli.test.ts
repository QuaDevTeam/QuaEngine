import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultDeclarationOutputPath, getDefaultOutputPath, runQuaScriptCli } from '../src/cli/cli'

describe('quaScript CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses extension-aware default output paths', () => {
    expect(getDefaultOutputPath('scene.qs')).toBe('scene.compiled.ts')
    expect(getDefaultOutputPath('scene.ts')).toBe('scene.compiled.ts')
    expect(getDefaultOutputPath('scene.tsx')).toBe('scene.compiled.tsx')
    expect(getDefaultOutputPath('scene.js')).toBe('scene.compiled.js')
    expect(getDefaultOutputPath('scene.jsx')).toBe('scene.compiled.jsx')
    expect(getDefaultDeclarationOutputPath('scene.qs')).toBe('scene.d.qs.ts')
    expect(() => getDefaultOutputPath('scene.txt')).toThrow('Unsupported input extension')
    expect(() => getDefaultDeclarationOutputPath('scene.ts')).toThrow('only generated for .qs')
  })

  it('keeps legacy compile invocation working', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    writeFileSync(input, 'Yuki: Hello\n', 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(runQuaScriptCli([input])).resolves.toBe(0)
    expect(readFileSync(join(root, 'scene.compiled.ts'), 'utf-8')).toContain('export default')
  })

  it('uses decorator compiler settings from QuaScript config during compile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    const cwd = process.cwd()
    writeFileSync(join(root, 'quascript.config.json'), JSON.stringify({
      decorators: {
        autoCollect: false,
      },
    }), 'utf-8')
    writeFileSync(join(root, 'qua.plugins.json'), JSON.stringify({
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
    writeFileSync(input, "@SetBackground('classroom.png')\nYuki: Hello\n", 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      process.chdir(root)
      await expect(runQuaScriptCli(['compile', input])).resolves.toBe(1)
    }
    finally {
      process.chdir(cwd)
    }

    expect(existsSync(join(root, 'scene.compiled.ts'))).toBe(false)
  })

  it('checks and writes formatting', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    writeFileSync(input, 'Yuki: Hello  ', 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runQuaScriptCli(['format', input, '--check'])).resolves.toBe(1)
    await expect(runQuaScriptCli(['format', input, '--write'])).resolves.toBe(0)
    expect(readFileSync(input, 'utf-8')).toBe('Yuki: Hello\n')
    await expect(runQuaScriptCli(['format', input, '--check'])).resolves.toBe(0)
  })

  it('prints formatted output for one file by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    const output: string[] = []
    writeFileSync(input, 'Yuki: Hello  ', 'utf-8')
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output.push(String(chunk))
      return true
    })

    await expect(runQuaScriptCli(['format', input])).resolves.toBe(0)
    expect(output.join('')).toBe('Yuki: Hello\n')
    expect(readFileSync(input, 'utf-8')).toBe('Yuki: Hello  ')
  })

  it('emits stable lint JSON and enforces max warnings', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    const logs: string[] = []
    writeFileSync(input, 'Yuki: Hello  ', 'utf-8')
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => {
      logs.push(String(value))
    })

    await expect(runQuaScriptCli(['lint', input, '--json', '--max-warnings', '0'])).resolves.toBe(1)

    const payload = JSON.parse(logs.join('\n')) as {
      files: Array<{ diagnostics: Array<{ code: string, source: string }> }>
      warningCount: number
    }
    expect(payload.warningCount).toBeGreaterThanOrEqual(1)
    expect(payload.files[0]?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'QS_STYLE_TRAILING_WHITESPACE',
        source: 'quascript/style',
      }),
    ]))
  })

  it('exits with an error when lint finds parser errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    writeFileSync(input, '<script>\nconst value = 1\n', 'utf-8')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(runQuaScriptCli(['lint', input])).resolves.toBe(1)
  })

  it('uses project lint when the language server is available', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    const languageServerPackage = join(root, 'node_modules/@quajs/language-server')
    const logs: string[] = []
    const cwd = process.cwd()
    mkdirSync(languageServerPackage, { recursive: true })
    writeFileSync(join(languageServerPackage, 'package.json'), JSON.stringify({
      exports: {
        '.': './index.js',
      },
      main: './index.js',
      type: 'module',
    }), 'utf-8')
    writeFileSync(join(languageServerPackage, 'index.js'), `
export async function lintQuaScript() {
  return {
    diagnostics: [{
      code: 'TS_2339',
      message: 'Property missing does not exist.',
      range: {
        start: { line: 6, column: 20, offset: 84 },
        end: { line: 6, column: 27, offset: 91 }
      },
      severity: 'error',
      source: 'quascript/typescript'
    }],
    errorCount: 1,
    fixableCount: 0,
    infoCount: 0,
    warningCount: 0
  }
}
`, 'utf-8')
    writeFileSync(input, [
      '<script lang="ts">',
      'export interface Scope {',
      '  playerName: string',
      '}',
      '</script>',
      '',
      'Yuki: Hello ${scope.missing}',
      '',
    ].join('\n'), 'utf-8')
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => {
      logs.push(String(value))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      process.chdir(root)
      await expect(runQuaScriptCli(['lint', input, '--json'])).resolves.toBe(1)
    }
    finally {
      process.chdir(cwd)
    }

    const payload = JSON.parse(logs.join('\n')) as {
      files: Array<{ diagnostics: Array<{ code: string, source: string }> }>
    }
    expect(payload.files[0]?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TS_2339',
        source: 'quascript/typescript',
      }),
    ]))
  })

  it('applies only safe style fixes with lint --fix', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quascript-cli-'))
    const input = join(root, 'scene.qs')
    writeFileSync(input, '@SetBackground("classroom.png")\n\nYuki: Hello  ', 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(runQuaScriptCli(['lint', input, '--fix'])).resolves.toBe(0)
    expect(readFileSync(input, 'utf-8')).toBe('@SetBackground("classroom.png")\nYuki: Hello\n')
  })
})
