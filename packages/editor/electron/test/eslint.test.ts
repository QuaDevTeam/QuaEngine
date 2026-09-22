import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ProjectESLint } from '../src/project-service/eslint.js'
import { ProjectService } from '../src/project-service/project.js'

const require = createRequire(import.meta.url)
const parser = createRequire(require.resolve('@antfu/eslint-config')).resolve('@typescript-eslint/parser')
const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))
async function fixture(installed = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-eslint-')))
  roots.push(root)
  await writeFile(join(root, 'package.json'), '{}')
  await writeFile(join(root, 'app.ts'), 'let unused: number = 1\nconsole.log("hello")\n')
  if (installed) {
    await mkdir(join(root, 'node_modules'))
    await symlink(dirname(require.resolve('eslint/package.json')), join(root, 'node_modules/eslint'), 'dir')
  }
  return root
}
const config = `import parser from ${JSON.stringify(pathToFileURL(parser).href)};
export default [{ ignores: ['ignored.ts'] }, { files: ['**/*.ts'], languageOptions: { parser }, rules: { 'no-unused-vars': 'error', 'no-console': 'warn', 'prefer-const': 'warn' } }];`

it('lints TypeScript drafts with project rules, positions, severity and ignores without rewriting files', async () => {
  const root = await fixture()
  await writeFile(join(root, 'eslint.config.mjs'), config)
  await writeFile(join(root, 'ignored.ts'), 'let unused = 1')
  const linter = new ProjectESLint(root)
  const disk = await readFile(join(root, 'app.ts'), 'utf8')
  const diagnostics = await linter.analyze('app.ts', disk)
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'ESLint/no-unused-vars', severity: 'error', line: 1, column: 5, endColumn: 19 }))
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'ESLint/no-console', severity: 'warning', line: 2 }))
  expect(await linter.analyze('app.ts', 'export const used: number = 1\n')).toEqual([])
  expect(await linter.analyze('ignored.ts', disk)).toEqual([])
  expect(await readFile(join(root, 'app.ts'), 'utf8')).toBe(disk)
  expect((await linter.analyze('app.ts', 'const =\n'))[0]).toMatchObject({ code: 'ESLint/parse', severity: 'error', line: 1 })
})

it('skips unconfigured projects and reports missing dependencies and broken configs', async () => {
  const root = await fixture(false)
  expect(await new ProjectESLint(root).analyze('app.ts', 'debugger')).toEqual([])
  await writeFile(join(root, 'eslint.config.mjs'), 'export default []')
  expect((await new ProjectESLint(root).analyze('app.ts', 'debugger'))[0]).toMatchObject({ code: 'ESLint/config', severity: 'warning', message: expect.stringContaining('未安装 eslint') })
  const installed = await fixture()
  await writeFile(join(installed, 'eslint.config.mjs'), 'throw new Error("broken config")')
  expect((await new ProjectESLint(installed).analyze('app.ts', 'debugger'))[0]?.message).toContain('broken config')
})

it('finds nested configs but does not inherit an unrelated parent config or escape through source/config symlinks', async () => {
  const root = await fixture()
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'eslint.config.mjs'), 'throw new Error("outside project")')
  await writeFile(join(root, 'nested/app.ts'), 'debugger')
  expect(await new ProjectESLint(join(root, 'nested')).analyze('app.ts', 'debugger')).toEqual([])
  await writeFile(join(root, 'nested/eslint.config.mjs'), config)
  expect((await new ProjectESLint(root).analyze('nested/app.ts', 'let unused: number = 1'))[0]?.code).toBe('ESLint/no-unused-vars')
  const outside = await fixture()
  await symlink(join(outside, 'app.ts'), join(root, 'escape.ts'))
  await expect(new ProjectESLint(root).analyze('escape.ts', '')).rejects.toThrow('当前项目')
  await rm(join(root, 'eslint.config.mjs'))
  await writeFile(join(outside, 'eslint.config.mjs'), config)
  await symlink(join(outside, 'eslint.config.mjs'), join(root, 'eslint.config.mjs'))
  expect((await new ProjectESLint(root).analyze('app.ts', ''))[0]?.message).toContain('配置必须位于当前项目')
})

it('adds ESLint to indexed background checking without losing TypeScript diagnostics', async () => {
  const root = await fixture()
  await writeFile(join(root, 'eslint.config.mjs'), config)
  await writeFile(join(root, 'app.ts'), 'export const broken: number = "text"\nconsole.log(broken)\n')
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, types: [] }, include: ['*.ts'] }))
  await writeFile(join(root, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: 'lint', bundleId: 'dev.test.lint', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
  const service = new ProjectService()
  await service.open(root)
  const checks = []
  for await (const check of service.checkProject(root)) checks.push(check)
  const last = checks.at(-1)!
  expect(last.phase).toBe('complete')
  expect(last.completed).toBe(last.total)
  expect(last.diagnostics).toContainEqual(expect.objectContaining({ code: 'TS_2322' }))
  expect(last.diagnostics).toContainEqual(expect.objectContaining({ code: 'ESLint/no-console', line: 2 }))
})
