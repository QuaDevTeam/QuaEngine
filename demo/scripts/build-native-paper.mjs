/** Rasterize the Web stylesheet's procedural paper at logical stage resolution.
 * Native consumes the checked-in transparent texture through its ordinary QPK.
 * Re-run when the shared SVG noise changes; no screenshot of a product UI is used.
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const css = await readFile(new URL('../src/game/styles/reading-ui.scss', import.meta.url), 'utf8')
const source = css.match(/background-image: url\("(data:image\/svg\+xml,[^"]+)"\)/)?.[1]
if (!source) throw new Error('Shared procedural paper SVG is missing')
const browser = await chromium.launch({ executablePath: process.env.QUA_PARITY_CHROMIUM })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}body{background-image:url("${source}")}</style>`)
  await page.evaluate(async source => { const image = new Image(); image.src = source; await image.decode(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) }, source)
  await page.screenshot({ path: fileURLToPath(new URL('../assets/images/ui/paper-grain.png', import.meta.url)), omitBackground: true })
} finally { await browser.close() }
