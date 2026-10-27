import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.DOCS_TEST_URL ?? 'http://127.0.0.1:4173';
const sources = JSON.parse(await readFile(new URL('../.generated/sources.json', import.meta.url), 'utf8'));
const images = JSON.parse(await readFile(new URL('../.generated/social-images.json', import.meta.url), 'utf8'));
const generatedImages = new Map(images.map(entry => [entry.route, entry.image]));
const out = new URL('../.generated/qa/seo/', import.meta.url);
await mkdir(out, { recursive: true });
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
const context = await browser.newContext({ javaScriptEnabled: false });
const page = await context.newPage();
const titles = new Set();
const descriptions = new Set();
const cardUrls = new Set();

try {
  for (const route of ['/', '/docs/getting-started/first-story/', '/docs/platforms/godot/', '/docs/en/getting-started/first-story/']) {
    assert.equal((await page.goto(new URL(route, base).href)).status(), 200);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok((await page.locator('main').innerText()).length > 100, `No-JS body: ${route}`);
  }
  for (let i = 0; i < sources.length; i += 8) {
    const documents = await Promise.all(sources.slice(i, i + 8).map(async ({ route }) => {
      const response = await fetch(new URL(route, base));
      assert.equal(response.status, 200, route);
      return { route, html: await response.text() };
    }));
    const extracted = await page.evaluate(documents => documents.map(({ route, html }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = key => [...doc.querySelectorAll('meta')].filter(node => node.name === key || node.getAttribute('property') === key).map(node => node.content);
      return {
        alternates: [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => ({ lang: node.hreflang, href: node.href })),
        route, lang: doc.documentElement.lang, title: doc.title, titleCount: doc.querySelectorAll('title').length,
        description: meta('description'), canonical: [...doc.querySelectorAll('link[rel="canonical"]')].map(node => node.href),
        ogTitle: meta('og:title'), ogUrl: meta('og:url'), ogDescription: meta('og:description'), ogLocale: meta('og:locale'), image: meta('og:image'),
        width: meta('og:image:width'), height: meta('og:image:height'), type: meta('og:image:type'), alt: meta('og:image:alt'),
        twitter: meta('twitter:card'), twitterImage: meta('twitter:image'),
        structured: [...doc.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent))
      };
    }), documents);
    for (const data of extracted) {
      const english = data.route.startsWith('/docs/en');
      const language = english ? 'en' : 'zh-CN';
      assert.equal(data.lang, language);
      if (data.route.endsWith('/getting-started/first-story')) {
        for (const [lang, path] of [['zh-CN', '/docs/getting-started/first-story'], ['en', '/docs/en/getting-started/first-story']]) {
          assert.ok(data.alternates.some(item => item.lang === lang && new URL(item.href).pathname.replace(/\/$/, '') === path), `Reciprocal translation: ${data.route} -> ${lang}`);
        }
      }
      assert.equal(data.titleCount, 1);
      assert.ok(!titles.has(data.title), `Unique title: ${data.route}`);
      titles.add(data.title);
      assert.equal(data.description.length, 1);
      assert.ok(data.description[0].length > 10);
      assert.ok(!descriptions.has(data.description[0]), `Unique description: ${data.route}`);
      descriptions.add(data.description[0]);
      assert.equal(data.canonical.length, 1);
      const canonical = new URL(data.canonical[0]);
      assert.equal(canonical.origin, process.env.DOCS_SITE_URL ?? 'https://quaengine.com');
      assert.equal(canonical.pathname.replace(/\/$/, ''), data.route.replace(/\/$/, ''));
      assert.deepEqual(data.ogTitle, [data.title]);
      assert.deepEqual(data.ogUrl, data.canonical);
      assert.deepEqual(data.ogDescription, data.description);
      assert.deepEqual(data.ogLocale, [english ? 'en_US' : 'zh_CN']);
      assert.equal(data.image.length, 1);
      assert.equal(new URL(data.image[0]).origin, canonical.origin);
      assert.deepEqual(data.twitter, ['summary_large_image']);
      assert.deepEqual(data.twitterImage, data.image);
      if (generatedImages.has(data.route)) {
        assert.equal(new URL(data.image[0]).pathname, generatedImages.get(data.route));
        assert.deepEqual(data.width, ['1200']);
        assert.deepEqual(data.height, ['630']);
        assert.deepEqual(data.type, ['image/png']);
      }
      assert.ok(data.alt[0]?.length > 5);
      const nodes = data.structured.flatMap(node => node['@graph'] ?? [node]);
      const article = nodes.find(node => node['@type'] === (data.route.startsWith('/docs') ? 'TechArticle' : 'WebPage'));
      assert.equal(article?.url, data.canonical[0]);
      assert.equal(article?.inLanguage, language);
      assert.ok(nodes.some(node => node['@type'] === 'WebSite'));
      assert.ok(nodes.some(node => node['@type'] === 'Organization' && node.name === 'QuaDevTeam' && node.logo));
      const scopePath = english ? data.route.replace(/^\/docs\/en(?=\/|$)/, '/docs') : data.route;
      if (scopePath.startsWith('/docs/')) assert.ok(nodes.some(node => node['@type'] === 'BreadcrumbList'), `Breadcrumbs: ${data.route}`);
      cardUrls.add(data.image[0]);
    }
  }
  assert.ok(cardUrls.size >= images.length, 'Generated page cards are distinct; authored images may be shared');
  for (const { image } of images) {
    const response = await fetch(new URL(image, base));
    assert.equal(response.status, 200, image);
    assert.match(response.headers.get('content-type'), /image\/png/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
  }
  for (const route of ['/not-a-real-qua-page/', '/docs/not-a-real-qua-page/deep/']) {
    assert.equal((await page.goto(new URL(route, base).href)).status(), 404);
    assert.equal(await page.locator('main#content').count(), 1);
    assert.equal(await page.locator('h1').count(), 1);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
    assert.equal(await page.locator('main a[href="/docs"], main a[href="/docs/"]').count(), 1, 'No-JS recovery link');
    const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.href));
    assert.ok(stylesheets.length > 0, '404 has a stylesheet');
    for (const href of stylesheets) {
      const stylesheet = await fetch(href);
      assert.equal(stylesheet.status, 200, `404 stylesheet resolves at any route depth: ${href}`);
      assert.match(stylesheet.headers.get('content-type'), /text\/css/);
    }
  }
  const sitemap = await (await fetch(new URL('/sitemap.xml', base))).text();
  assert.ok(!sitemap.includes('/404'));
  const sitemapPaths = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => new URL(value).pathname.replace(/\/$/, '')));
  for (const { route } of sources) assert.ok(sitemapPaths.has(route.replace(/\/$/, '')), `Sitemap: ${route}`);
  const robots = await (await fetch(new URL('/robots.txt', base))).text();
  assert.match(robots, /Sitemap: https:\/\/quaengine.com\/sitemap.xml/);
  await writeFile(new URL('summary.json', out), JSON.stringify({ base, pages: titles.size, pngImages: images.length, noJavaScript: true }, null, 2) + '\n');
  console.log(`PASS SEO: ${titles.size} unique pages, ${images.length} PNG cards, no-JS content and genuine noindex 404s.`);
} finally {
  await browser.close();
}
