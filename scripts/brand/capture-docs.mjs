import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireDocs = createRequire(new URL('../../docs/package.json', import.meta.url));
const { chromium } = requireDocs('playwright');
const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewport = { width: 1440, height: 1100 };
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
const captures = [];
try {
  for (const { locale, route, title, darkButton } of [
    { locale: 'zh-CN', route: '/docs/getting-started/first-story/', title: '写下第一幕', darkButton: '切换为深色主题' },
    { locale: 'en', route: '/docs/en/getting-started/first-story/', title: 'Write your first scene', darkButton: 'Switch to dark theme' }
  ]) {
    const context = await browser.newContext({ viewport, locale, colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => !!document.documentElement.dataset.svedocsRoute);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.ok(await page.locator('pre.sd-code[data-language="qs"] .sd-line-content span[style*="--shiki-light"]').count(), 'QuaScript syntax highlighting is present');
    if (locale === 'en') assert.doesNotMatch(await page.locator('body').innerText(), /[\u4e00-\u9fff]/, 'English capture has English content and interface');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.getByRole('button', { name: darkButton, exact: true }).click();
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      }
      const filename = `quaengine-docs-${locale === 'en' ? 'en-' : ''}${theme}.png`;
      const bytes = await page.screenshot({ path: new URL(`../../assets/brand/${filename}`, import.meta.url).pathname, animations: 'disabled' });
      captures.push({ locale, route, title, theme, filename, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const version = JSON.parse(await readFile(new URL('../../docs/build/_app/version.json', import.meta.url), 'utf8'));
  await writeFile(new URL('../../assets/brand/readme-previews.json', import.meta.url), JSON.stringify({
    capturedAt: new Date().toISOString(), source: 'Local production build of docs/',
    buildVersion: version.version, viewport, deviceScaleFactor: 1,
    browser: await browser.version(), captures,
    note: 'Real localized documentation UI. These screenshots do not represent editor or game renderer validation.'
  }, null, 2) + '\n');
  console.log('Captured Chinese and English docs screenshots in light and dark themes.');
} finally {
  await browser.close();
}
