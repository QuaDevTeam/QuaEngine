import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  detectPackageManager,
  getInstallCommand,
  getRunScriptCommand,
  getTemplate,
  inferProjectName,
  normalizeProjectName,
  scaffoldProject,
} from '../src'

describe('create-qua-game scaffold', () => {
  it('creates a visual-novel-vue project', async () => {
    const cwd = await createTempDir()
    const logs = createLogger()

    const result = await scaffoldProject({
      projectName: 'My Game',
      targetDirectory: 'my-game',
      cwd,
      install: false,
      stdout: logs,
    })

    const projectRoot = join(cwd, 'my-game')
    expect(result.projectName).toBe('my-game')
    expect(result.targetDirectory).toBe(projectRoot)
    await expectFile(projectRoot, 'package.json')
    await expectFile(projectRoot, 'vite.config.ts')
    await expectFile(projectRoot, 'qua.project.yaml')
    await expectFile(projectRoot, 'src/main.ts')
    await expectFile(projectRoot, 'src/env.d.ts')
    await expectFile(projectRoot, 'src/game/bootstrap.ts')
    await expectFile(projectRoot, 'src/game/scenes/opening.qs')
    await expectFile(projectRoot, 'assets/app/icon.svg')
    await expectFile(projectRoot, 'assets/app/favicon.svg')
    await expectFile(projectRoot, 'assets/images/backgrounds/classroom.svg')
    await expectFile(projectRoot, 'assets/characters/alice/base.svg')
    await expectFile(projectRoot, 'assets/audio/.gitkeep')
    await expectFile(projectRoot, 'assets/fonts/.gitkeep')
    await expectFile(projectRoot, 'public/.gitkeep')
    await expectFile(projectRoot, 'quack.workspace.ts')
    await expectFile(projectRoot, '.gitignore')

    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
      name: string
      scripts: Record<string, string>
    }
    expect(packageJson.name).toBe('my-game')
    expect(packageJson.scripts['project:validate']).toBe('quack project validate')
    expect(packageJson.scripts['project:doctor']).toBe('quack project doctor')
    expect(packageJson.scripts['build:web']).toBe('vite build')
    expect(packageJson.devDependencies['sass-embedded']).toBe('^1.70.0')
    expect(await readFile(join(projectRoot, 'qua.project.yaml'), 'utf8')).toContain('bundleId: com.example.my.game')
    expect(await readFile(join(projectRoot, 'src/env.d.ts'), 'utf8')).toContain('declare module \'virtual:qua-project\'')
    expect(await readFile(join(projectRoot, 'src/main.ts'), 'utf8')).toContain('evaluateWebPlatformSupport(quaWebRuntime)')
    expect(await readFile(join(projectRoot, 'src/game/bootstrap.ts'), 'utf8')).toContain('project: {')
    expect(await readFile(join(projectRoot, 'vite.config.ts'), 'utf8')).toContain('projectConfig')
    expect(await readFile(join(projectRoot, 'README.md'), 'utf8')).toContain('# My Game')
    expect(logs.lines.join('\n')).toContain('pnpm dev')
    expect(logs.lines.join('\n')).toContain('pnpm run assets:build')
  })

  it('normalizes and rejects project names', () => {
    expect(normalizeProjectName('My VN Game!')).toBe('my-vn-game')
    expect(inferProjectName('/tmp/Qua Starter')).toBe('qua-starter')
    expect(inferProjectName('@studio/Star Story')).toBe('@studio/star-story')
    expect(() => normalizeProjectName('!!!')).toThrow('Project name must contain')
  })

  it('refuses a non-empty target directory without force', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'keep.txt'), 'keep me', 'utf8')

    await expect(scaffoldProject({
      projectName: 'blocked-game',
      targetDirectory: '.',
      cwd,
      install: false,
      stdout: createLogger(),
    })).rejects.toThrow('Target directory is not empty')
  })

  it('force writes template files while preserving unknown files', async () => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'keep.txt'), 'keep me', 'utf8')
    await writeFile(join(cwd, 'package.json'), '{"name":"old"}', 'utf8')

    await scaffoldProject({
      projectName: 'Forced Game',
      targetDirectory: '.',
      cwd,
      force: true,
      install: false,
      stdout: createLogger(),
    })

    expect(await readFile(join(cwd, 'keep.txt'), 'utf8')).toBe('keep me')
    const packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as { name: string }
    expect(packageJson.name).toBe('forced-game')
  })

  it('dry-run prints files without writing project files', async () => {
    const cwd = await createTempDir()
    const logs = createLogger()

    const result = await scaffoldProject({
      projectName: 'dry-game',
      targetDirectory: 'dry-game',
      cwd,
      dryRun: true,
      install: true,
      stdout: logs,
    })

    await expect(stat(join(cwd, 'dry-game'))).rejects.toThrow()
    expect(result.dryRun).toBe(true)
    expect(result.installed).toBe(false)
    expect(logs.lines.join('\n')).toContain('create package.json')
  })

  it('detects package managers and formats commands', () => {
    expect(detectPackageManager('pnpm/11.0.9 npm/? node/v25')).toBe('pnpm')
    expect(detectPackageManager('npm/11.0.0 node/v25')).toBe('npm')
    expect(detectPackageManager('yarn/1.22.22 npm/? node/v25')).toBe('yarn')
    expect(detectPackageManager('bun/1.3.0')).toBe('pnpm')
    expect(detectPackageManager(undefined)).toBe('pnpm')
    expect(getInstallCommand('pnpm')).toEqual(['pnpm', 'install'])
    expect(getInstallCommand('yarn')).toEqual(['yarn'])
    expect(getRunScriptCommand('npm', 'dev')).toEqual(['npm', 'run', 'dev'])
    expect(getRunScriptCommand('pnpm', 'dev')).toEqual(['pnpm', 'dev'])
  })

  it('skips install command when install is false', async () => {
    const runCommand = vi.fn(async () => {})

    await scaffoldProject({
      projectName: 'no-install-game',
      cwd: await createTempDir(),
      install: false,
      stdout: createLogger(),
      runCommand,
    })

    expect(runCommand).not.toHaveBeenCalled()
  })

  it('rejects unknown templates', async () => {
    await expect(scaffoldProject({
      projectName: 'bad-template',
      cwd: await createTempDir(),
      template: 'react',
      install: false,
      stdout: createLogger(),
    })).rejects.toThrow('Unknown template "react"')

    expect(() => getTemplate('react')).toThrow('Available templates: visual-novel-vue')
  })
})

async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'create-qua-game-'))
}

async function expectFile(root: string, relativePath: string): Promise<void> {
  await expect(stat(join(root, relativePath))).resolves.toMatchObject({ isFile: expect.any(Function) })
}

function createLogger() {
  return {
    lines: [] as string[],
    log(...args: unknown[]) {
      this.lines.push(args.map(String).join(' '))
    },
  }
}
