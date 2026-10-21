import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { chromium } from 'playwright';

// Versioned content hashes keep shared cards cache-safe and make repeat checks cheap.
const template = await readFile(new URL('./social-template.html', import.meta.url), 'utf8');
const mascot = await readFile(new URL('../../assets/brand/mascot.webp', import.meta.url));
const font = await readFile(new URL(import.meta.resolve('@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2')));
const signature = createHash('sha256').update(template).update(mascot).update(font).digest('hex');
const output = new URL('../static/og/', import.meta.url);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function socialImagePath({ title, description, route }) {
  const digest = createHash('sha256').update(JSON.stringify([signature, title, description, route])).digest('hex').slice(0, 20);
  return `/og/${digest}.png`;
}

export async function pruneSocialImages(referencedPaths) {
  const keep = new Set(referencedPaths);
  for (const name of await readdir(output)) {
    // This generator owns only hashed PNG names; retain authored/custom assets.
    if (/^[a-f0-9]{20}\.png$/.test(name) && !keep.has(`/og/${name}`)) await unlink(new URL(name, output));
  }
}

export async function createSocialImages(entries) {
  await mkdir(output, { recursive: true });
  const pending = entries.filter(entry => !existsSync(new URL(entry.image.split('/').pop(), output)));
  if (!pending.length) return;
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // No network requests: shared artwork and the Latin font are embedded; CJK uses host fonts.
    await page.route('**/*', route => route.abort());
    for (const entry of pending) {
      const values = { ...entry, font: font.toString('base64'), mascot: mascot.toString('base64') };
      await page.setContent(template.replace(/\{\{(\w+)\}\}/g, (_, key) => escape(values[key] ?? '')), { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode()));
        const heading = document.querySelector('h1');
        let size = 58;
        while (heading.scrollHeight > 215 && size > 28) heading.style.fontSize = `${--size}px`;
      });
      await page.screenshot({ path: new URL(entry.image.split('/').pop(), output).pathname });
    }
  } finally {
    await browser.close();
  }
  console.log(`Prepared ${pending.length} page-specific social images (1200×630 PNG).`);
}
