import { cp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Isolated smoke project: reuses installed builds without installation or Demo writes. */
export async function copyDemoFixture(repository, destination, { native = false } = {}) {
  const demo = join(repository, 'demo')
  await mkdir(destination, { recursive: true })
  destination = await realpath(destination)
  for (const entry of ['src', 'assets', 'public', 'index.html', 'tsconfig.json', 'qua.project.yaml', 'quack.workspace.ts', 'vite.config.ts'])
    await cp(join(demo, entry), join(destination, entry), { recursive: true })
  await symlink(join(demo, 'node_modules'), join(destination, 'node_modules'), 'dir')
  await cp(join(demo, 'package.json'), join(destination, 'package.json'))
  const config = await readFile(join(destination, 'vite.config.ts'), 'utf8')
  await writeFile(join(destination, 'vite.config.ts'), config.replace('server: {', `server: { fs: { allow: ${JSON.stringify([repository, destination])} },`))
  if (native) {
    for (const entry of ['scripts', 'vite.native-jsc.config.ts'])
      await cp(join(demo, entry), join(destination, entry), { recursive: true })
    for (const entry of ['node_modules', 'packages'])
      await symlink(join(repository, entry), join(dirname(destination), entry), 'dir')
    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))
    manifest.scripts['dev:native'] = 'node native-smoke.mjs'
    await writeFile(join(destination, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(destination, 'native-smoke.mjs'), 'process.env.QUA_NATIVE_EDITOR_FAST_REBUILD = "1"; await import("./scripts/native-dev.mjs");\n')
  }
  return destination
}
