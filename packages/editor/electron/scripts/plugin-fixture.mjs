import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { promisify } from 'node:util'

/** Local npm registry with real tarballs; no publication or changes to developer dependencies. */
export async function pluginFixture(directory) {
  const packages = new Map()
  for (const capability of ['devtools', 'runtime', 'combined']) {
    const name = `qua-fixture-${capability}`
    const id = `fixture.${capability}`
    const packageRoot = join(directory, name)
    const source = join(packageRoot, 'package')
    await mkdir(join(source, 'dist'), { recursive: true })
    const extension = { schemaVersion: 1, id, title: `Fixture ${capability}` }
    if (capability !== 'devtools')
      extension.runtime = { entry: './dist/runtime.js' }
    if (capability !== 'runtime') {
      extension.devtools = {
        apiVersion: 1,
        entry: './dist/editor.js',
        indexer: './dist/indexer.js',
        style: './dist/style.css',
      }
    }
    const manifest = {
      name,
      version: '1.0.0',
      type: 'module',
      description: 'Local registry installation fixture',
      quajs: { extension },
      scripts: {
        postinstall:
          'node -e "require(\'fs\').writeFileSync(\'executed.txt\', \'bad\')"',
      },
    }
    await writeFile(join(source, 'package.json'), JSON.stringify(manifest))
    await writeFile(
      join(source, 'dist/runtime.js'),
      'export const runtime = true',
    )
    await writeFile(
      join(source, 'dist/label.js'),
      'export const label = "Fixture panel"',
    )
    await writeFile(
      join(source, 'dist/editor.js'),
      `import { label } from './label.js'
export const editorPlugin = { id: '${id}', apiVersion: 1, panels: [{ id: 'browser', title: label, mount(host) {
  host.className = 'fixture-plugin'
  return { update(project) { host.textContent = JSON.stringify(project.plugins['${id}']) }, setVisible(visible) { host.dataset.visible = String(visible) }, dispose() { host.replaceChildren() } }
} }] }`,
    )
    await writeFile(
      join(source, 'dist/indexer.js'),
      `export const editorIndexer = { id: '${id}', apiVersion: 1, async index(context) { const doc = await context.readDocument('scene.qs'); return { text: doc.text, files: context.entries.length } } }`,
    )
    await writeFile(
      join(source, 'dist/style.css'),
      '.fixture-plugin { padding: 24px; color: rgb(110, 200, 170); }',
    )
    await promisify(execFile)('tar', [
      '-czf',
      join(packageRoot, 'package.tgz'),
      '-C',
      packageRoot,
      'package',
    ])
    const tarball = await readFile(join(packageRoot, 'package.tgz'))
    packages.set(name, {
      manifest,
      tarball,
      integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
    })
  }
  let base = ''
  const server = createServer((request, response) => {
    const path = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    ).slice(1)
    const [name, version] = path.split('/')
    const value = packages.get(name)
    if (!value) {
      response.writeHead(404)
      response.end('{}')
      return
    }
    if (version === 'package.tgz') {
      response.setHeader('content-type', 'application/octet-stream')
      response.end(value.tarball)
      return
    }
    const manifest = {
      ...value.manifest,
      dist: {
        integrity: value.integrity,
        tarball: `${base}${name}/package.tgz`,
      },
    }
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify(
        version
          ? manifest
          : {
              name,
              'dist-tags': { latest: '1.0.0' },
              'versions': { '1.0.0': manifest },
            },
      ),
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/`
  return {
    base,
    packages,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  }
}
