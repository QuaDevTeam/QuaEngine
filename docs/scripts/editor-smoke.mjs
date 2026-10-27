import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const sources = JSON.parse(await readFile(new URL('../.generated/sources.json', import.meta.url), 'utf8'));
const normalize = path => path.replace(/\/$/, '');
const chinese = sources.filter(({ route }) => /^\/docs\/editor(?:\/|$)/.test(route));
const english = sources.filter(({ route }) => /^\/docs\/en\/editor(?:\/|$)/.test(route));
assert.deepEqual(english.map(({ route }) => route.replace('/docs/en/', '/docs/')).sort(), chinese.map(({ route }) => route).sort(), 'Every Editor page has an English counterpart');
const editorRoutes = new Set([...chinese, ...english].map(({ route }) => route));
const out = new URL('../.generated/qa/editor/', import.meta.url);
await mkdir(out, { recursive: true });
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
const errors = [];
const checks = [];
const documents = new Map();

try {
  const parser = await browser.newPage();
  for (let i = 0; i < sources.length; i += 8) {
    const batch = await Promise.all(sources.slice(i, i + 8).map(async ({ route }) => {
      const response = await fetch(new URL(route, base));
      assert.equal(response.status, 200, route);
      return { route, html: await response.text() };
    }));
    for (const entry of await parser.evaluate(batch => batch.map(({ route, html }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { route, lang: doc.documentElement.lang, text: doc.querySelector('main')?.textContent,
        ids: [...doc.querySelectorAll('[id]')].map(node => node.id),
        links: [...doc.querySelectorAll('main a[href]')].map(node => node.getAttribute('href')),
        alternates: [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => ({ lang: node.hreflang, href: node.getAttribute('href') })) };
    }), batch)) documents.set(entry.route, entry);
  }
  await parser.close();
  let links = 0;
  const broken = [];
  for (const route of editorRoutes) {
    const document = documents.get(route);
    const englishPage = route.startsWith('/docs/en/');
    assert.equal(document.lang, englishPage ? 'en' : 'zh-CN');
    assert.ok(document.text.length > 250, `Prerendered content: ${route}`);
    const counterpart = englishPage ? route.replace('/docs/en/', '/docs/') : route.replace('/docs/', '/docs/en/');
    assert.ok(document.alternates.some(item => normalize(new URL(item.href).pathname) === counterpart && item.lang === (englishPage ? 'zh-CN' : 'en')), `Translation alternate: ${route}`);
    for (const href of document.links) {
      const target = new URL(href, new URL(route, base));
      if (target.origin !== new URL(base).origin || !target.pathname.startsWith('/docs')) continue;
      links++;
      const destination = documents.get(normalize(target.pathname));
      if (!destination) broken.push(`${route} -> ${href}: missing route`);
      else if (target.hash && !destination.ids.includes(decodeURIComponent(target.hash.slice(1)))) broken.push(`${route} -> ${href}: missing anchor`);
    }
  }
  assert.deepEqual(broken, [], 'Editor links and anchors resolve');
  checks.push(`${chinese.length} pairs have real localized HTML, alternate metadata, and ${links} valid internal links/anchors`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  async function open(route) {
    assert.equal((await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' })).status(), 200);
    await page.waitForFunction(route => document.documentElement.dataset.svedocsRoute === route, normalize(route));
  }
  async function noOverflow() {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow: ${page.url()}`);
  }
  for (const slug of ['projects', 'character', 'animation', 'workbench', 'registry', 'novel-writer']) {
    await open(`/docs/en/editor/${slug}`);
    await page.getByRole('button', { name: 'Locale', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
    await page.waitForURL(url => normalize(url.pathname) === `/docs/editor/${slug}`);
    await page.getByRole('button', { name: '语言', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await page.waitForURL(url => normalize(url.pathname) === `/docs/en/editor/${slug}`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  }
  await open('/docs/en/editor');
  const navigationOrder = await page.locator('.qua-docs-sidebar a[href^="/docs/en/editor/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('/').pop()));
  assert.deepEqual(navigationOrder, ['downloads', 'projects', 'workspace', 'authoring', 'character', 'animation', 'novel-writer', 'preview', 'marketplace', 'builds', 'troubleshooting', 'registry', 'workbench']);
  checks.push('Language switching works for authored guides and imported references; sidebar follows the authoring workflow');

  for (const [locale, route, term, name] of [
    ['en', '/docs/en/editor', 'production builds', 'Search documentation'],
    ['zh-CN', '/docs/editor', '生产打包', '搜索文档']
  ]) {
    await open(route);
    await page.locator('.sd-search-trigger').click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await dialog.locator('input').fill(term);
    await dialog.locator('a[href*="/editor/builds"]').first().waitFor();
    for (const href of await dialog.locator('a[href^="/docs"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) {
      assert.equal(href.startsWith('/docs/en'), locale === 'en', `Scoped search: ${href}`);
    }
    await page.keyboard.press('Escape');
  }
  checks.push('Editor builds are discoverable through language-scoped search');

  for (const prefix of ['/docs/editor', '/docs/en/editor']) {
    for (const slug of ['', '/preview', '/builds']) {
      await open(prefix + slug);
      for (const theme of ['light', 'dark']) {
        if (theme !== await page.locator('html').getAttribute('data-theme')) await page.locator('.sd-theme-toggle').click();
        for (const width of [1440, 1024, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await noOverflow();
          if ([1440, 390].includes(width)) await page.screenshot({ path: new URL(`${prefix.includes('/en/') ? 'en' : 'zh'}${slug.replace('/', '-') || '-index'}-${theme}-${width}.png`, out).pathname });
        }
      }
    }
    await page.getByRole('button', { name: prefix.includes('/en/') ? 'Open menu' : '打开导航', exact: true }).click();
    await page.locator('.qua-mobile-menu').waitFor();
    await noOverflow();
    const target = page.locator(`.qua-mobile-menu a[href="${prefix}/builds"]`);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.locator('.qua-mobile-menu').waitFor({ state: 'hidden' });
  }
  checks.push('English and Chinese guides fit desktop, tablet and narrow mobile screens in both themes; deep mobile navigation works');
  assert.deepEqual(errors, []);
  const summary = { pairs: chinese.length, pages: editorRoutes.size, links, checks, errors };
  await writeFile(new URL('summary.json', out), JSON.stringify(summary, null, 2) + '\n');
  checks.forEach(check => console.log(`PASS ${check}`));
} finally {
  await browser.close();
}
