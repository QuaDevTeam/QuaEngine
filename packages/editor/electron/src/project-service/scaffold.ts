import type { EditorCreateProject } from '@quajs/editor-core'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scaffoldProject } from 'create-qua-game'

/** Parent comes from the host's directory dialog. Never merge existing user work. */
export async function createEditorProject(parent: string, request: EditorCreateProject, sdk?: string): Promise<string> {
  if (!request || !['game', 'plugin'].includes(request.kind)
    || typeof request.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(request.name)
    || /^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(request.name)) {
    throw new Error('项目名称须以小写字母开头，仅含小写字母、数字或连字符，最长 64 个字符。')
  }
  const root = await realpath(parent)
  if (!(await stat(root)).isDirectory())
    throw new Error('请选择有效的项目位置。')
  const destination = join(root, request.name)
  await mkdir(destination)
  await scaffoldProject({ projectName: request.name, targetDirectory: destination, template: request.kind === 'plugin' ? 'plugin' : 'visual-novel-vue', packageManager: 'npm', install: false, stdout: { log() {} } })
  if (sdk) {
    const manifestPath = join(destination, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.packageManager = 'npm@11.0.0'
    const index = JSON.parse(await readFile(join(sdk, 'index.json'), 'utf8')) as Record<string, { archive: string, dependencies: string[] }>
    const selected = new Set<string>()
    const select = (name: string) => {
      if (selected.has(name))
        return
      if (!index[name])
        throw new Error(`IDE SDK 缺少 ${name}，请重新构建 IDE。`)
      selected.add(name)
      for (const dependency of index[name].dependencies) select(dependency)
    }
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => name.startsWith('@quajs/'))) select(name)
    await mkdir(join(destination, 'vendor/quajs'), { recursive: true })
    manifest.overrides = {}
    for (const name of selected) {
      const archive = index[name].archive
      if (!/^[\w.-]+\.tgz$/.test(archive))
        throw new Error('IDE SDK 索引无效。')
      await copyFile(join(sdk, archive), join(destination, 'vendor/quajs', archive), constants.COPYFILE_EXCL)
      const specifier = `file:./vendor/quajs/${archive}`
      // npm resolves relative peer overrides from the peer's package directory.
      // Refer to a root dependency instead so every archive stays project-relative.
      manifest.overrides[name] = `$${name}`
      if (!manifest.dependencies?.[name]) {
        manifest.devDependencies ??= {}
        manifest.devDependencies[name] = specifier
      }
      for (const field of ['dependencies', 'devDependencies']) {
        if (manifest[field]?.[name])
          manifest[field][name] = specifier
      }
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return destination
}
