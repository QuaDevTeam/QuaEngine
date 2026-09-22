import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

// Run against a production build: vite preview --host 127.0.0.1 --port 4178.
const base = process.env.QUA_LOADING_TEST_URL || 'http://127.0.0.1:4178'
const output = new URL('../.generated/review/asset-loading/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-proxy-server'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let downloads = 0
  let fail = true
  await context.route(/\.(?:qpk|zip)(?:\?|$)/, async (route) => {
    downloads++
    if (fail) {
      fail = false
      await route.abort('failed')
    }
    else {
      await route.continue()
    }
  })
  await page.goto(base)
  const scene = page.locator('.qua-asset-loading')
  await scene.locator('button').waitFor({ state: 'visible' })
  assert.equal(await scene.getAttribute('data-state'), 'error')
  assert.equal(await page.locator('#app').evaluate(element => element.inert), true)
  await page.screenshot({ path: new URL('retry.png', output).pathname })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: new URL('retry-phone.png', output).pathname })
  await page.setViewportSize({ width: 1280, height: 800 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 16 * 1024 * 1024, uploadThroughput: -1 })
  await scene.locator('button').click()
  await page.waitForFunction(() => {
    const progress = document.querySelector('.qua-asset-loading progress')
    const scene = document.querySelector('.qua-asset-loading')
    // Vite preview sends gzip/chunked responses without Content-Length.
    return scene?.dataset.phase === 'downloading' && (
      (progress?.value > 0 && progress.value < 0.8)
      || (!progress?.hasAttribute('value') && /[1-9][\d.]* MB/.test(scene.textContent))
    )
  })
  await page.screenshot({ path: new URL('downloading.png', output).pathname })
  await scene.waitFor({ state: 'detached', timeout: 90_000 })
  await page.locator('.qua-renderer').waitFor({ timeout: 30_000 })
  assert.equal(downloads, 2)
  await page.screenshot({ path: new URL('ready.png', output).pathname })
  // A new document and runtime retain IndexedDB; abort any archive fetch to prove
  // the second launch doesn't just happen to use the browser HTTP cache.
  await context.unroute(/\.(?:qpk|zip)(?:\?|$)/)
  await context.route(/\.(?:qpk|zip)(?:\?|$)/, async (route) => {
    downloads++
    await route.abort('failed')
  })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await page.reload()
  await page.locator('.qua-renderer').waitFor({ timeout: 30_000 })
  assert.equal(downloads, 2, 'Warm launch must not request any archive')
  assert.equal(await scene.count(), 0)
  await page.getByRole('button', { name: '从头开始', exact: true }).click()
  await page.waitForFunction(() => [...document.images].some(image => image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0), undefined, { timeout: 30_000 })
  await page.screenshot({ path: new URL('cached-story.png', output).pathname })
  assert.deepEqual(errors, [])
  console.warn(JSON.stringify({ coldDownload: true, retry: true, warmArchiveRequests: 0, pageErrors: errors, output: output.pathname }))
  await context.close()
}
finally {
  await browser.close()
}
