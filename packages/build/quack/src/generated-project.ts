import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export async function assertGeneratedProjectPath(root: string, destination: string): Promise<void> {
  root = await realpath(root)
  let ancestor = destination
  while (true) {
    try {
      const stat = await lstat(ancestor)
      if (ancestor === destination && stat.isSymbolicLink())
        throw new Error('Generated output must not be a symbolic link.')
      const canonical = resolve(await realpath(ancestor), relative(ancestor, destination))
      if (canonical === root || root.startsWith(canonical + sep))
        throw new Error('Generated output must not replace source directories or their parents.')
      return
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
      const parent = dirname(ancestor)
      if (parent === ancestor)
        throw error
      ancestor = parent
    }
  }
}

export async function generateProjectAtomically<T>(options: {
  root: string
  destination: string
  target: string
  bundleId: string
  signal?: AbortSignal
  build: (stage: string) => Promise<T>
}): Promise<T> {
  const { root, destination, target, bundleId } = options
  await assertGeneratedProjectPath(root, destination)
  const existing = await readdir(destination).catch((error) => {
    if (error.code === 'ENOENT')
      return []
    throw error
  })
  if (existing.length) {
    const marker = await readFile(join(destination, '.qua-generated.json'), 'utf8').then(JSON.parse).catch(() => undefined)
    if (marker?.target !== target || marker?.bundleId !== bundleId || marker?.schemaVersion !== 1)
      throw new Error(`${target} output contains an authored project or belongs to another project. Choose a separate projectDir.`)
  }
  const stage = `${destination}.build-${randomUUID()}`
  const backup = `${destination}.previous-${randomUUID()}`
  await mkdir(stage, { recursive: true })
  try {
    options.signal?.throwIfAborted()
    const result = await options.build(stage)
    await writeFile(join(stage, '.qua-generated.json'), `${JSON.stringify({ schemaVersion: 1, target, bundleId })}\n`)
    options.signal?.throwIfAborted()
    let replaced = false
    try {
      await rename(destination, backup)
      replaced = true
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
    try {
      await rename(stage, destination)
    }
    catch (error) {
      if (replaced)
        await rename(backup, destination)
      throw error
    }
    if (replaced)
      await rm(backup, { recursive: true, force: true })
    return result
  }
  finally { await rm(stage, { recursive: true, force: true }) }
}
