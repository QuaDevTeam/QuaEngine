import type { BuildRunner } from './process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Use the project's Vite and config. The emitted graph records actual runtime imports. */
export async function buildProductionVite(root: string, config: string | undefined, outDir: string | undefined, graphFile: string, run: BuildRunner): Promise<void> {
  const require = createRequire(join(root, 'package.json'))
  const vite = pathToFileURL(require.resolve('vite')).href
  const code = `
import { build } from ${JSON.stringify(vite)};
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
const packages = new Set();
const cache = new Map();
async function packageName(id) {
  if (!isAbsolute(id)) return;
  let dir = dirname(id.split('?')[0]);
  const visited = [];
  let name;
  while (dir !== dirname(dir)) {
    if (cache.has(dir)) { name = cache.get(dir); break; }
    visited.push(dir);
    try { name = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).name; break; } catch {}
    dir = dirname(dir);
  }
  for (const path of visited) cache.set(path, name);
  return name;
}
await build({ root: ${JSON.stringify(root)}, mode: 'production', configFile: ${JSON.stringify(config)},
  define: { 'import.meta.env.VITE_QUA_EDITOR_PREVIEW': '"0"' },
  build: { ${outDir ? `outDir: ${JSON.stringify(outDir)},` : ''} sourcemap: false },
  plugins: [{ name: 'qua-production-graph',
    async generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [id, info] of Object.entries(chunk.modules)) {
          if (info.renderedLength === 0) continue;
          const name = await packageName(id); if (name) packages.add(name);
        }
        for (const id of [...chunk.imports, ...chunk.dynamicImports]) { if (id.startsWith('@quajs/')) packages.add(id); }
      }
      await writeFile(${JSON.stringify(graphFile)}, JSON.stringify([...packages].sort()));
    }
  }]
});`
  await run('node', ['--input-type=module', '-e', code])
}
