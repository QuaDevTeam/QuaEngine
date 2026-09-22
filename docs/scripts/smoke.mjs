import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const out = new URL('../.generated/qa/', import.meta.url);
await mkdir(out, { recursive: true });
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function open(route) {
  const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, `HTTP status for ${route}`);
  await page.waitForFunction(() => !!document.documentElement.dataset.svedocsRoute);
  assert.equal(await page.locator('main').count(), 1, 'One main landmark');
  assert.equal(await page.locator('h1').count(), 1, 'One page heading');
}
async function noOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${page.url()}`);
}
async function shot(name) {
  await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true });
}

try {
  // CI may have just started the preview process.
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await pause(250);
  }
  assert.ok(ready, 'Preview server is available');
  await open('/');
  assert.match(await page.title(), /QuaEngine/);
  await noOverflow();
  await page.getByRole('button', { name: '复制安装命令', exact: true }).click();
  await page.getByRole('button', { name: '已复制安装命令', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'pnpm create qua-game my-story');
  await page.getByRole('button', { name: '做出选择', exact: true }).click();
  assert.match(await page.locator('.example-code').innerText(), /seaside/);
  await page.getByRole('button', { name: '编排演出', exact: true }).click();
  assert.match(await page.locator('.example-code').innerText(), /PlayBGM/);
  await page.getByRole('button', { name: '写下对白', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await shot('home-desktop');
  check('Home, live examples and clipboard');

  await page.getByRole('button', { name: '切换为深色主题' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await shot('home-dark');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('button', { name: '切换为浅色主题' }).click();
  check('Dark mode and persisted preference');

  const focusBeforeSearch = await page.evaluate(() => document.activeElement?.className);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '搜索文档' });
  await dialog.waitFor();
  await dialog.locator('input').fill('存档');
  await dialog.locator('a[href^="/docs"]').first().waitFor();
  assert.ok(await dialog.locator('a').count() > 0);
  await shot('search-desktop');
  await dialog.locator('input').fill('zxq92741qqqqzzz');
  await dialog.getByText('没有找到相关内容，试试其他关键词。').waitFor();
  await dialog.locator('input').fill('JavaScriptCore');
  await dialog.locator('a[href*="native-jsc"]').first().waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(previous => document.activeElement?.className === previous, focusBeforeSearch);
  check('Keyboard search, Chinese and API terms, empty results and focus return');

  await open('/docs/getting-started/first-story/');
  const qsBlock = page.locator('pre.sd-code[data-language="qs"]').first();
  assert.equal(await qsBlock.locator('.sd-code-language').innerText(), 'QuaScript');
  const qsTokens = qsBlock.locator('code span[style*="--shiki-light"]');
  assert.ok(await qsTokens.count() > 10, 'QuaScript and embedded TypeScript are highlighted');
  const lightTokenColor = await qsTokens.first().evaluate(node => getComputedStyle(node).color);
  const qsSource = await qsBlock.getAttribute('data-copy');
  assert.equal((await qsBlock.locator('.line').allTextContents()).join('\n'), qsSource.replace(/\n$/, ''), 'Highlighting preserves text and blank lines');
  await qsBlock.screenshot({ path: new URL('quascript-light.png', out).pathname });
  await qsBlock.locator('button.sd-code-copy').click();
  await page.waitForFunction(() => navigator.clipboard.readText().then(text => text.includes('export interface Scope')));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes('${playerName}'));
  assert.ok(!copied.includes('复制代码'));
  await page.locator('.sd-toc a').first().click();
  assert.ok(new URL(page.url()).hash.length > 1);
  const anchorTop = await page.evaluate(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.getBoundingClientRect().top);
  const headerBounds = await page.locator('.qua-header').boundingBox();
  assert.ok(headerBounds.y > 0 && headerBounds.y < 40, 'Scrolled navbar retains its floating inset');
  assert.ok(anchorTop > headerBounds.y + headerBounds.height && anchorTop < 250, 'Anchor remains below floating navigation');
  await page.evaluate(() => scrollTo(0, 0));
  await shot('docs-desktop');
  await noOverflow();
  await page.getByRole('button', { name: '切换为深色主题' }).click();
  assert.notEqual(await qsTokens.first().evaluate(node => getComputedStyle(node).color), lightTokenColor, 'Token colors follow the theme');
  await qsBlock.screenshot({ path: new URL('quascript-dark.png', out).pathname });
  await page.evaluate(() => scrollTo(0, 0));
  await shot('docs-desktop-dark');
  await page.getByRole('button', { name: '切换为浅色主题' }).click();
  check('QuaScript copy, content anchors and reading layout');

  await open('/docs/');
  const entryTable = page.getByRole('table').first();
  assert.equal(await entryTable.getByRole('columnheader').count(), 2);
  const tableBounds = await entryTable.boundingBox();
  const rowBounds = await entryTable.getByRole('row').first().boundingBox();
  assert.ok(Math.abs(tableBounds.width - rowBounds.width) < 2, 'Columns fill the table without an empty right-hand panel');
  await shot('docs-index-desktop');
  check('Entry table retains semantic columns and fills its frame');

  await open('/docs/reference/quack/');
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await page.locator('h1').innerText(), /Quack/);
  await noOverflow();
  check('Long reference direct refresh');

  await page.setViewportSize({ width: 390, height: 844 });
  await open('/');
  await noOverflow();
  await shot('home-mobile');
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.locator('.qua-mobile-menu').waitFor();
  await page.locator('.qua-mobile-menu .mobile-top-link').filter({ hasText: '文档' }).click();
  await page.waitForURL(url => /^\/docs\/?$/.test(url.pathname));
  await page.locator('.qua-mobile-menu').waitFor({ state: 'hidden' });
  await noOverflow();
  await shot('docs-mobile');
  await page.getByRole('button', { name: '打开导航' }).click();
  const menuBounds = await page.locator('.qua-mobile-menu').boundingBox();
  const mobileHeader = await page.locator('.qua-header').boundingBox();
  assert.ok(menuBounds.y > mobileHeader.y + mobileHeader.height, 'Menu floats below the navbar');
  assert.ok(menuBounds.y + menuBounds.height < 844, 'Open navigation fits in the mobile viewport');
  await shot('docs-mobile-menu');
  await page.keyboard.press('Escape');
  await page.locator('.qua-mobile-menu').waitFor({ state: 'hidden' });
  check('Floating mobile menu fits the viewport and dismisses with Escape');
  await page.locator('.sd-search-trigger').click();
  await dialog.locator('input').fill('角色');
  await dialog.locator('a[href^="/docs"]').first().waitFor();
  await noOverflow();
  await shot('search-mobile');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '切换为深色主题' }).click();
  await shot('docs-mobile-dark');
  await page.getByRole('button', { name: '切换为浅色主题' }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await open('/');
  await noOverflow();
  await open('/docs/getting-started/first-story/');
  await noOverflow();
  const mobileQs = page.locator('pre.sd-code[data-language="qs"]').first();
  await mobileQs.scrollIntoViewIfNeeded();
  const mobileCodeBounds = await mobileQs.boundingBox();
  const copyButton = mobileQs.locator('.sd-code-copy');
  const copyBounds = await copyButton.boundingBox();
  assert.ok(copyBounds.x + copyBounds.width < mobileCodeBounds.x + mobileCodeBounds.width, 'Copy button remains inside the code block at 320px');
  await copyButton.click();
  const mobileSource = await mobileQs.getAttribute('data-copy');
  await page.waitForFunction(source => navigator.clipboard.readText().then(text => text === source), mobileSource);
  await mobileQs.screenshot({ path: new URL('quascript-mobile.png', out).pathname });
  check('QuaScript mobile copy control is visible and copies exact source');
  await open('/docs/reference/quack/');
  await noOverflow();
  await open('/docs/platforms/native/');
  await noOverflow();
  const wideTableIndex = await page.locator('.qua-table-scroll').evaluateAll(nodes => nodes.findIndex(node => node.scrollWidth > node.clientWidth + 1));
  assert.ok(wideTableIndex >= 0, 'Wide reference tables scroll within their own container');
  const wideTable = page.locator('.qua-table-scroll').nth(wideTableIndex);
  await wideTable.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(index => document.querySelectorAll('.qua-table-scroll')[index].scrollLeft > 0, wideTableIndex);
  check('Wide tables remain keyboard-scrollable at 320px');
  check('Mobile navigation, search, light/dark and 320px layout');

  await page.setViewportSize({ width: 1440, height: 1050 });
  await open('/brand/');
  for (const anchor of await page.locator('main a[href^="/brand/"]').all()) {
    const href = await anchor.getAttribute('href');
    assert.equal((await fetch(new URL(href, base))).status, 200, href);
  }
  await shot('brand-desktop');
  const missing = await page.goto(new URL('/not-a-real-qua-page/', base).href, { waitUntil: 'networkidle' });
  assert.equal(missing.status(), 404);
  assert.match(await page.locator('h1').innerText(), /这一页/);
  await shot('not-found');
  check('Brand downloads and 404 recovery');

  const sources = JSON.parse(await readFile(new URL('../.generated/sources.json', import.meta.url), 'utf8'));
  for (let i = 0; i < sources.length; i += 8) {
    await Promise.all(sources.slice(i, i + 8).map(async ({ route }) => {
      const response = await fetch(new URL(route, base));
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.ok(html.includes('<h1'), `Prerendered content: ${route}`);
    }));
  }
  for (const [route, needle] of [['/llms.txt', 'QuaEngine'], ['/llms-full.txt', 'QuaScript'], ['/docs/getting-started/first-story/index.md', 'playerName'], ['/sitemap.xml', 'quaengine.com'], ['/robots.txt', 'Sitemap']]) {
    const response = await fetch(new URL(route, base));
    assert.equal(response.status, 200, route);
    assert.ok((await response.text()).includes(needle), route);
  }
  check(`All ${sources.length} content routes, markdown twins, llms and SEO endpoints`);
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await writeFile(new URL('summary.json', out), JSON.stringify({ base, pages: sources.length, checks, errors }, null, 2) + '\n');
  console.log(`Completed ${checks.length} browser checks across ${sources.length} pages.`);
} finally {
  await browser.close();
}
