/** Capture the same demo screens from running Web and native dev apps.
 * Start pnpm --filter demo dev:web and pnpm dev:native first, at the title.
 * PNGs and measured bounds go to demo/dist/native/parity (never a fake parity pass).
 */
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist/native/parity')
const exec = promisify(execFile)
const native = async (...args) => (await exec(process.execPath,
  [resolve(root, 'scripts/native-control.mjs'), ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout
const browser = await chromium.launch({ headless: true, ...(process.env.QUA_PARITY_CHROMIUM
  ? { executablePath: process.env.QUA_PARITY_CHROMIUM }
  : { channel: process.env.QUA_PARITY_BROWSER || 'chrome' }) })
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
const report = { viewport: { width: 960, height: 540, deviceScaleFactor: 2 }, screens: {} }
await mkdir(output, { recursive: true })
async function capture(name, selectors) {
  // Let font loads, presence fades and native atlas uploads settle on both targets.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(output, `web-${name}.png`) })
  await native('capture', resolve(output, `native-${name}.png`))
  const web = await page.evaluate(selectors => Object.fromEntries(selectors.map(selector => [selector,
    [...document.querySelectorAll(selector)].map(element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { text: element.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        font: style.font, color: style.color, background: style.background }
    }),
  ])), selectors)
  const commands = JSON.parse(await native('commands', '--json'))
  const pairs = {
    settings: [['.qua-settings-panel', 'ui:settings:settings-panel']],
    gallery: [['.qua-gallery-panel', 'ui:gallery:gallery-panel'], ['.qua-gallery-entry-card', 'ui:gallery:gallery-entry-0']],
    dialogue: [['.qua-dialogue-box', 'dialogue:panel']],
  }[name] || []
  const geometry = pairs.map(([selector, id]) => {
    const actual = commands.find(command => command.id === id)?.bounds
    const expected = web[selector]?.[0]
    if (!actual || !expected) throw new Error(`Missing parity geometry: ${selector} / ${id}`)
    const differences = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key,
      Math.abs(actual[key] / 2 - expected[key]),
    ]))
    return { selector, id, differences, passed: Object.values(differences).every(value => value <= 2) }
  })
  report.screens[name] = { web, native: commands, geometry }
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(report, null, 2))
}
try {
  await native('ping')
  await page.goto(process.env.QUA_PARITY_WEB_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: 'CONFIG', exact: true }).waitFor()
  await page.locator('.vn-main-menu__title').waitFor()
  await capture('title', ['.vn-main-menu__title', '.vn-main-menu__actions button'])
  await page.getByRole('button', { name: 'CONFIG', exact: true }).click()
  await native('clickCommand', 'ui:native-app-shell:native-main-menu-config')
  await native('wait', 'ui:settings:settings-close')
  await capture('settings', ['.qua-settings-panel', '.vn-settings-title', '.qua-settings-field', '.vn-settings-select'])
  await page.locator('.vn-settings-close').click()
  await native('clickCommand', 'ui:settings:settings-close')
  await native('wait', 'ui:native-app-shell:native-main-menu-gallery')
  await page.getByRole('button', { name: 'GALLERY', exact: true }).click()
  await native('clickCommand', 'ui:native-app-shell:native-main-menu-gallery')
  await native('wait', 'ui:gallery:gallery-close')
  await capture('gallery', ['.qua-gallery-panel', '.qua-gallery-entry-card', '.qua-gallery-entry-title'])
  await page.locator('.qua-gallery-entry-card').first().click()
  await native('clickCommand', 'ui:gallery:gallery-entry-0')
  await native('wait', 'ui:gallery:gallery-lightbox-close')
  await capture('gallery-preview', ['.qua-gallery-lightbox-media', '.qua-gallery-lightbox-close'])
  await page.locator('.qua-gallery-lightbox-close').click()
  await native('clickCommand', 'ui:gallery:gallery-lightbox-close')
  await page.locator('.qua-gallery-close').click()
  await native('clickCommand', 'ui:gallery:gallery-close')
  await native('wait', 'ui:native-app-shell:native-main-menu-start')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'START', exact: true }).click()
  await native('clickCommand', 'ui:native-app-shell:native-main-menu-start')
  await page.locator('.qua-dialogue-text').waitFor()
  await native('wait', 'dialogue:text')
  await page.waitForTimeout(2000)
  await capture('dialogue', ['.qua-dialogue-box', '.qua-dialogue-speaker', '.qua-dialogue-text'])
  await writeFile(resolve(output, 'review.html'), `<!doctype html><meta charset="utf-8">
<title>Web / Native render comparison</title>
<style>body{font:16px system-ui;background:#101218;color:#eee;margin:24px}section{margin:28px 0}.compare{position:relative;width:min(100%,1200px)}img{display:block;width:100%}.native{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}input{width:min(100%,1200px)}a{color:#9ce}</style>
<h1>Web / Native</h1><p>Drag each divider to compare the same screen. Native is on the left; Web is on the right. Geometry checks cover panel bounds, not pixel equality.</p>
${Object.keys(report.screens).map(name => `<section><h2>${name}</h2><div class="compare"><img src="web-${name}.png" alt="Web ${name}"><img class="native" src="native-${name}.png" alt="Native ${name}"></div><input aria-label="Compare ${name}" type="range" min="0" max="100" value="50" oninput="this.previousElementSibling.lastElementChild.style.clipPath='inset(0 '+(100-this.value)+'% 0 0)' "></section>`).join('')}`)
  const failures = Object.values(report.screens).flatMap(screen => screen.geometry).filter(check => !check.passed)
  if (failures.length) throw new Error(`Panel geometry differs by over 2 CSS pixels: ${JSON.stringify(failures)}`)
  console.log(`Captured Web/native visual review artifacts; panel geometry checks passed: ${output}`)
}
finally {
  await browser.close()
}
