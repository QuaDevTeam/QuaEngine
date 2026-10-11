import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const out = new URL('../.generated/qa/sidebar/', import.meta.url);
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
const checks = [];
const errors = [];
await mkdir(out, { recursive: true });

const routePath = href => new URL(href, base).pathname.replace(/\/$/, '');

async function open(page, route) {
  const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, route);
  await page.waitForFunction(path => document.documentElement.dataset.svedocsRoute === path, routePath(route));
}

async function visible(page, selector, path) {
  return page.evaluate(({ selector, path }) => {
    const container = document.querySelector(selector);
    const active = [...container.querySelectorAll('a')].find(link => new URL(link.href).pathname.replace(/\/$/, '') === path);
    if (!active?.getClientRects().length) return false;
    const bounds = container.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    return target.top >= bounds.top + container.clientTop - 1
      && target.bottom <= bounds.top + container.clientTop + container.clientHeight + 1
      && target.top >= 0 && target.bottom <= innerHeight;
  }, { selector, path });
}

async function expectActiveVisible(page, selector, path) {
  const active = page.locator(`${selector} a[aria-current="page"]`);
  await active.waitFor({ state: 'visible' });
  assert.equal(await active.count(), 1);
  assert.equal(routePath(await active.getAttribute('href')), path);
  const deadline = Date.now() + 5000;
  while (!await visible(page, selector, path)) {
    assert.ok(Date.now() < deadline, `Active page ${path} stays outside ${selector}`);
    await page.waitForTimeout(50);
  }
}

try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 650 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await open(page, '/docs/plugins/background/');
    const selector = '.qua-docs-sidebar';
    const sidebar = page.locator(selector);
    const next = page.locator('.sd-prev-next[data-direction="next"]');
    const nextPath = routePath(await next.getAttribute('href'));
    await sidebar.evaluate(node => { node.scrollTop = 0; });
    assert.equal(await visible(page, selector, nextPath), false, 'Next child begins outside the sidebar viewport');
    await next.click();
    await page.waitForURL(url => routePath(url.href) === nextPath);
    await page.waitForFunction(() => scrollY <= 1);
    await expectActiveVisible(page, selector, nextPath);
    assert.ok(await sidebar.evaluate(node => node.scrollTop) > 0);
    assert.ok(await page.evaluate(() => scrollY) <= 1, 'Next navigation keeps the document at the top');
    await page.screenshot({ path: new URL(`next-${theme}.png`, out).pathname });
    checks.push(`Next page reveals the selected child in ${theme} mode`);

    const previous = page.locator('.sd-prev-next[data-direction="prev"]');
    const previousPath = routePath(await previous.getAttribute('href'));
    await sidebar.evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.equal(await visible(page, selector, previousPath), false, 'Previous child begins above the sidebar viewport');
    await previous.click();
    await page.waitForURL(url => routePath(url.href) === previousPath);
    await page.waitForFunction(() => scrollY <= 1);
    await expectActiveVisible(page, selector, previousPath);
    assert.ok(await page.evaluate(() => scrollY) <= 1, 'Previous navigation keeps the document at the top');
    await page.screenshot({ path: new URL(`previous-${theme}.png`, out).pathname });
    checks.push(`Previous page reveals the selected child in ${theme} mode`);

    await page.goBack();
    await expectActiveVisible(page, selector, nextPath);
    await page.goForward();
    await expectActiveVisible(page, selector, previousPath);
    checks.push(`History navigation follows the selected child in ${theme} mode`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await open(page, '/docs/reference/quack/');
  await page.getByRole('button', { name: '打开导航' }).click();
  await expectActiveVisible(page, '.qua-mobile-menu', '/docs/reference/quack');
  assert.ok(await page.locator('.qua-mobile-menu').evaluate(node => node.scrollTop) > 0);
  assert.ok(await page.evaluate(() => scrollY) <= 1);
  await page.screenshot({ path: new URL('mobile-dark.png', out).pathname });
  checks.push('Opening the mobile menu reveals its active child with reduced motion');
  await context.close();

  assert.deepEqual(errors, [], 'No browser runtime errors');
  const pkg = JSON.parse(await readFile(new URL('../node_modules/svedocs/package.json', import.meta.url), 'utf8'));
  await writeFile(new URL('summary.json', out), JSON.stringify({ base, svedocs: pkg.version, checks, errors }, null, 2) + '\n');
  for (const name of checks) console.log(`PASS ${name}`);
} finally {
  await browser.close();
}
