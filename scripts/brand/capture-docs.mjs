// Capture the real production docs UI for README; never substitute a mockup.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireDocs = createRequire(new URL('../../docs/package.json', import.meta.url));
const { chromium } = requireDocs('playwright');
const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(new URL('/docs/getting-started/first-story/', base).href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => !!document.documentElement.dataset.svedocsRoute);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('heading', { level: 1, name: '写下第一幕' }).waitFor();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: '切换为深色主题' }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    }
    await page.screenshot({ path: new URL(`../../assets/brand/quaengine-docs-${theme}.png`, import.meta.url).pathname });
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('../../assets/brand/readme-previews.json', import.meta.url), JSON.stringify({
    capturedAt: new Date().toISOString(), route: '/docs/getting-started/first-story/',
    source: 'Local production build of docs/', viewport: { width: 1440, height: 980 },
    themes: ['light', 'dark'], browser: await browser.version(),
    note: 'Real documentation UI. These screenshots do not represent editor or game renderer validation.'
  }, null, 2) + '\n');
  console.log('Captured real docs screenshots in light and dark themes.');
} finally {
  await browser.close();
}
