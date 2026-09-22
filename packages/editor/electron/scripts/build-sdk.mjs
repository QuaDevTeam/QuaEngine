import { execFile } from 'node:child_process'
import { cp, glob, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parse } from 'yaml'

// Ship built SDK archives, never source symlinks or another target's bootstrap.
const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const output = resolve(repository, 'packages/editor/electron/dist/sdk')
const staging = join(output, 'staging')
await rm(output, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
const workspace = parse(await readFile(join(repository, 'pnpm-workspace.yaml'), 'utf8'))
const packages = new Map()
for await (const file of glob(['packages/{core,platform,render,build,plugins,game,native,utils}/*/package.json', 'packages/utils/package.json'], { cwd: repository })) {
  const path = join(repository, file)
  const pkg = JSON.parse(await readFile(path, 'utf8'))
  packages.set(pkg.name, { pkg, directory: dirname(path) })
}
const roots = []
for (const template of ['visual-novel-vue', 'plugin']) {
  const manifest = JSON.parse(await readFile(join(repository, 'packages/build/create-qua-game/templates', template, 'package.json'), 'utf8'))
  roots.push(...Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => name.startsWith('@quajs/')))
}
const index = {}
async function pack(name) {
  if (index[name])
    return
  const source = packages.get(name)
  if (!source)
    throw new Error(`Missing SDK package: ${name}`)
  const pkg = structuredClone(source.pkg)
  const dependencies = []
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependency, specifier] of Object.entries(pkg[field] ?? {})) {
      // This SDK is selected from the Web game template. Do not follow optional
      // native/Cocos adapters into its dependency graph or project overrides.
      if (field === 'peerDependencies' && pkg.peerDependenciesMeta?.[dependency]?.optional
        && /^@quajs\/.*(?:native|cocos)/.test(dependency)) {
        delete pkg[field][dependency]
        delete pkg.peerDependenciesMeta[dependency]
        continue
      }
      if (specifier.startsWith('workspace:')) {
        const entry = packages.get(dependency)
        if (!entry)
          throw new Error(`Missing SDK dependency: ${dependency}`)
        pkg[field][dependency] = entry.pkg.version
        // npm resolves optional peers too; keep their local SDK versions available.
        dependencies.push(dependency)
      }
      else if (specifier === 'catalog:') {
        pkg[field][dependency] = workspace.catalog[dependency]
      }
    }
  }
  delete pkg.devDependencies
  delete pkg.scripts
  delete pkg.private
  const archive = `${name.replace('@', '').replaceAll('/', '-')}-${pkg.version}.tgz`
  index[name] = { archive, version: pkg.version, dependencies }
  const directory = join(staging, name.replaceAll('/', '-'))
  await mkdir(directory, { recursive: true })
  for (const pattern of pkg.files ?? ['dist']) {
    for await (const path of glob(pattern, { cwd: source.directory })) {
      await cp(join(source.directory, path), join(directory, path), { recursive: true, dereference: true })
    }
  }
  if (!await stat(join(directory, 'dist')).catch(() => undefined))
    throw new Error(`Build ${name} before packaging the editor SDK.`)
  await writeFile(join(directory, 'package.json'), JSON.stringify(pkg, null, 2))
  const license = await stat(join(source.directory, 'LICENSE')).catch(() => undefined)
  await cp(license ? join(source.directory, 'LICENSE') : join(repository, 'LICENSE'), join(directory, 'LICENSE'))
  await promisify(execFile)('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: directory, maxBuffer: 2 * 1024 * 1024 })
  for (const dependency of dependencies) await pack(dependency)
}
try {
  for (const root of roots) await pack(root)
  await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2))
}
finally { await rm(staging, { recursive: true, force: true }) }
process.stdout.write(`Editor SDK: ${Object.keys(index).length} packages\n`)
