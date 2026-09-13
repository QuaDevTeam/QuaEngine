import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { webSecurityPlugin } from '../src/plugins/web-security'
import { quackPlugin } from '../src/plugins/quack'

it('hashes final Vite chunks after dynamic-import preloads and HTML emission', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-sri-build-')))
  try {
    await mkdir(join(root, 'nested'))
    await Promise.all([
      writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>'),
      writeFile(join(root, 'nested/index.html'), '<script type="module" src="/main.js"></script>'),
      writeFile(join(root, 'main.js'), 'window.openStory = () => import("./story.js");'),
      writeFile(join(root, 'story.js'), 'import "./story.css"; export const title = "雨天来客";'),
      writeFile(join(root, 'story.css'), 'body { color: #123456 }'),
    ])
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: '/demo/',
      plugins: [webSecurityPlugin()],
      build: {
        write: false,
        rolldownOptions: {
          input: [join(root, 'index.html'), join(root, 'nested/index.html')],
        },
      },
    })
    if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one output bundle')
    const output = result.output
    const readAsset = (name: string) => {
      const asset = output.find(item => item.fileName === name)
      if (!asset || asset.type !== 'asset') throw new Error(`Missing asset ${name}`)
      return typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8')
    }
    const manifest = JSON.parse(readAsset('qua-security/security-manifest.json'))
    expect(manifest.sri.assets.length).toBeGreaterThan(2)
    for (const entry of manifest.sri.assets) {
      const file = output.find(item => item.fileName === entry.fileName)!
      const bytes = file.type === 'chunk' ? file.code : file.source
      const hash = createHash('sha384').update(bytes).digest('base64')
      expect(entry.integrity, entry.fileName).toBe(`sha384-${hash}`)
      expect(readAsset('qua-security/csp.txt')).toContain(`'sha384-${hash}'`)
    }
    for (const page of ['index.html', 'nested/index.html']) {
      const html = readAsset(page)
      const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*>/)?.[0]
      expect(script).toBeDefined()
      const fileName = script!.match(/src="\/demo\/([^"]+)"/)?.[1]
      const entry = manifest.sri.assets.find((item: { fileName: string }) => item.fileName === fileName)
      expect(script).toContain(`integrity="${entry.integrity}"`)
      expect(script).toContain('crossorigin="anonymous"')
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps the declared QPK in the final output after Vite empties outDir', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qua-qpk-build-')))
  try {
    await mkdir(join(root, 'assets/data'), { recursive: true })
    await writeFile(join(root, 'assets/data/message.json'), '{"message":"雨天来客"}')
    await writeFile(join(root, 'index.html'), '<p>static bundle fixture</p>')
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [quackPlugin({ source: 'assets', format: 'qpk' })],
      build: { emptyOutDir: true },
    })
    const manifest = JSON.parse(await readFile(join(root, 'dist/asset-manifest.json'), 'utf8'))
    expect(manifest.bundleFile).toMatch(/^assets\.[a-z0-9]+\.qpk$/)
    expect(manifest.totalFiles).toBe(1)
    expect((await readFile(join(root, 'dist', manifest.bundleFile))).length).toBeGreaterThan(100)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
