/* eslint-disable no-template-curly-in-string -- QuaScript interpolation fixture. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchEditor } from './smoke-profile.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const editorRoot = resolve(root, 'packages/editor/electron')
const require = createRequire(join(editorRoot, 'package.json'))
const project = await realpath(await mkdtemp(join(tmpdir(), 'qua-authoring-')))
const artifacts = resolve(root, '.codex-tmp/editor-authoring-smoke')
await mkdir(artifacts, { recursive: true })
await writeFile(join(project, 'qua.project.json'), JSON.stringify({ schemaVersion: 1, name: '角色对白与静态检查', bundleId: 'dev.qua.authoring', icons: { favicon: 'icon.png' }, targets: { web: { enabled: true } } }))
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'authoring', scripts: { 'dev:web': 'vite' } }))
await writeFile(join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, types: [] }, include: ['*.ts'] }))
await writeFile(join(project, 'scene.qs'), '<script setup lang="ts">\nconst message = "雨停了"\n</script>\n\n神代凛: ${message}。我们走吧。\nMara: 等一下，我去拿伞。\n神代凛: 已经不下雨了。\nMara: 回来的时候说不定还会下。\n她把伞从门边拿起来。\n')
await writeFile(join(project, 'second.qs'), 'Mara: 颜色应当保持一致。\n神代凛: 对。\n')
await writeFile(join(project, 'broken.qs'), 'Narrator: ${doesNotExist}\n')
await writeFile(join(project, 'helper.ts'), 'export const number: number = "wrong"\n')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await launchEditor({ executablePath: require('electron'), args: [editorRoot, '--project', project], env, timeout: 60000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (error) => {
  errors.push(error.message)
  process.stderr.write(`${error.stack}\n`)
})
try {
  await page.locator('#files[data-project-name="角色对白与静态检查"]').waitFor()
  await page.locator('#files [data-path="scene.qs"]').click()
  await page.locator('#dialogue-legend').filter({ hasText: 'Mara' }).waitFor()
  const colors = await speakerColors()
  assert.equal(colors['神代凛'].length, 2)
  assert.equal(new Set(colors['神代凛']).size, 1)
  assert.equal(new Set(colors.Mara).size, 1)
  assert.notEqual(colors.Mara[0], colors['神代凛'][0])
  await page.locator('#check-indicator[data-phase="complete"]').waitFor({ timeout: 60000 })
  await page.locator('#tab-problems').click()
  await page.locator('.problem-row').filter({ hasText: 'TS_2304' }).waitFor()
  await page.locator('.problem-row').filter({ hasText: 'TS_2322' }).waitFor()
  assert.equal(await page.locator('#diagnostic-count').textContent(), '2')
  await page.screenshot({ path: join(artifacts, 'dialogue-problems.png') })
  await page.locator('.problem-row').filter({ hasText: 'TS_2322' }).click()
  await page.locator('#document-name').filter({ hasText: 'helper.ts' }).waitFor()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.problem-row').filter({ hasText: 'TS_2322' }).count(), 1)
  await page.locator('.problem-row').filter({ hasText: 'TS_2304' }).click()
  await page.locator('#document-name').filter({ hasText: 'broken.qs' }).waitFor()
  await page.locator('#cursor-position').filter({ hasText: '行 1，列 13' }).waitFor()
  await page.locator('#files [data-path="second.qs"]').click()
  await page.locator('#dialogue-legend').filter({ hasText: '神代凛' }).waitFor()
  const second = await speakerColors()
  assert.equal(second.Mara[0], colors.Mara[0])
  assert.equal(second['神代凛'][0], colors['神代凛'][0])
  await writeFile(join(project, 'broken.qs'), 'Narrator: fixed\n')
  await writeFile(join(project, 'helper.ts'), 'export const number: number = 3\n')
  await page.locator('#diagnostic-count').filter({ hasText: /^0$/ }).waitFor({ timeout: 60000 })
  await page.locator('#check-indicator[data-phase="complete"]').waitFor()
  await page.locator('#tab-problems').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#tab-console').getAttribute('aria-selected'), 'true')
  await page.locator('#panel-console').waitFor()
  await page.screenshot({ path: join(artifacts, 'console-tabs.png') })
  assert.deepEqual(errors, [])
  process.stdout.write('Authoring: AST-driven character colors, cross-document identity, unopened QS/TS errors, exact navigation, live recovery and panel keyboard switching passed\n')
}
catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {})
  throw error
}
finally {
  await app.close()
  await rm(project, { recursive: true, force: true })
}

async function speakerColors() {
  await page.waitForFunction(() => document.querySelectorAll('#editor .view-lines span[class*="qua-speaker-"][class*="-name"]').length >= 2)
  return page.locator('#editor .view-lines span[class*="qua-speaker-"][class*="-name"]').evaluateAll((spans) => {
    const colors = {}
    for (const span of spans) (colors[span.textContent] ||= []).push(getComputedStyle(span).color)
    return colors
  })
}
