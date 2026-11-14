import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertStandaloneRuntimeCode } from './standalone-runtime-validation'

/** Bundles only the supplied active-target entry. It never constructs an all-target preset. */
export async function buildSceneScriptBundle(options: {
  root: string
  artifactDir: string
  outputDir: string
  target: 'godot' | 'unity' | 'web' | 'native'
  entry: string
  viteConfig?: string
}): Promise<string[]> {
  const { root, target } = options
  const resolver = `${target}-core-resolver`
  const require = createRequire(join(root, 'package.json'))
  const vite = await import(pathToFileURL(require.resolve('vite')).href)
  const projectName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
  const dependencies = new Set<string>()
  const retained: { specifier: string, packageName?: string, renderedLength: number }[] = []
  const packageNames = new Map<string, string | undefined>()
  async function packageName(id: string): Promise<string | undefined> {
    let dir = dirname(id.split('?')[0])
    if (!isAbsolute(dir))
      return undefined
    const visited: string[] = []
    let name: string | undefined
    while (dir !== dirname(dir)) {
      if (packageNames.has(dir)) {
        name = packageNames.get(dir)
        break
      }
      visited.push(dir)
      try {
        name = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).name
        break
      }
      catch { dir = dirname(dir) }
    }
    for (const path of visited) packageNames.set(path, name)
    return name
  }
  await vite.build({
    root,
    configFile: options.viteConfig || false,
    publicDir: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.SSR': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.VITE_QUA_EDITOR_PREVIEW': '"0"' },
    plugins: [{
      name: resolver,
      resolveId: (id: string) => id === `virtual:${resolver}` ? `\0${resolver}` : undefined,
      load: (id: string) => id === `\0${resolver}` ? options.entry : undefined,
      async generateBundle(_options: unknown, output: Record<string, any>) {
        for (const chunk of Object.values(output)) {
          if (chunk.type !== 'chunk')
            continue
          for (const [id, info] of Object.entries(chunk.modules) as [string, { renderedLength: number }][]) {
            if (!info.renderedLength)
              continue
            const name = await packageName(id)
            if (name && name !== projectName)
              dependencies.add(name)
            const normalized = id.replace(/\\/g, '/')
            if (name?.startsWith('@quajs/') && !normalized.includes('/dist/'))
              throw new Error(`${target} must consume built package entries: ${name}`)
            const dist = normalized.lastIndexOf('/dist/')
            retained.push({ specifier: name && dist >= 0 ? `${name}${normalized.slice(dist)}` : isAbsolute(id) ? relative(root, id).replace(/\\/g, '/') : id.replace(/^\0/, ''), packageName: name, renderedLength: info.renderedLength })
          }
          if ([...chunk.imports, ...chunk.dynamicImports].some(id => id !== chunk.fileName))
            throw new Error(`${target} runtime must be a self-contained JavaScript bundle; retained imports: ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`)
          if (target !== 'web')
            assertStandaloneRuntimeCode(chunk.code, target)
        }
      },
    }],
    build: { outDir: options.outputDir, emptyOutDir: false, minify: false, target: 'es2022', lib: { entry: `virtual:${resolver}`, formats: [target === 'native' ? 'es' : 'iife'], name: 'QuaSceneTarget', fileName: () => target === 'native' ? 'runtime.mjs' : 'runtime.js' }, rollupOptions: { experimental: { attachDebugInfo: 'none' }, input: `virtual:${resolver}`, external: [], output: { codeSplitting: false } } },
  })
  await writeFile(join(options.artifactDir, 'retained-module-graph.json'), `${JSON.stringify({ schemaVersion: 1, target, modules: retained }, null, 2)}\n`)
  return [...dependencies].sort()
}
