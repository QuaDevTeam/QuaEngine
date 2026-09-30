import type { EditorUpdateInstallRequest } from './updater.js'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** Preparation happens before shutdown; the OS helper never holds the installed executable open. */
export async function prepareEditorInstall(request: EditorUpdateInstallRequest, helperDirectory: string, bundledDirectory: string, userDataDirectory?: string, noSandbox = false): Promise<{ launch: () => Promise<void>, discard: () => Promise<void> }> {
  if (request.format !== 'tar.gz')
    throw new Error('Unsupported editor update archive format.')
  const root = resolve(request.installRoot)
  const executable = relative(root, request.executablePath)
  if (!executable || outside(executable) || root === dirname(root))
    throw new Error('Invalid editor installation directory.')
  await access(dirname(root), constants.W_OK)
  // A sibling guarantees same-filesystem rename, including apps installed on another volume.
  const staging = await mkdtemp(join(dirname(root), '.qua-editor-update-'))
  try {
    const listing = await exec('tar', ['-tzf', request.archivePath], { maxBuffer: 16 * 1024 * 1024 })
    const paths = listing.stdout.split('\n').filter(Boolean)
    if (!paths.length || paths.length > 100000 || paths.some(path => path.includes('\\') || outside(path) || Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)))
      throw new Error('Unsafe editor update archive path.')
    // tar rejects writes through symlinks. Additionally reject absolute/escaping link targets
    // before extraction, while allowing the relative Framework symlinks required on macOS.
    const verbose = await exec('tar', ['-tvzf', request.archivePath], { maxBuffer: 32 * 1024 * 1024 })
    for (const line of verbose.stdout.split('\n').filter(Boolean)) {
      if (line[0] === 'l') {
        const marker = line.lastIndexOf(' -> ')
        const path = paths.find(path => line.slice(0, marker).endsWith(` ${path}`))
        const target = line.slice(marker + 4)
        if (marker < 0 || !path || isAbsolute(target) || target.includes('\\') || outside(join(dirname(path), target)))
          throw new Error('Unsafe editor update archive link.')
      }
      else if (!['-', 'd'].includes(line[0])) {
        throw new Error('Unsupported editor update archive entry.')
      }
    }
    await exec('tar', ['-xzf', request.archivePath, '--no-same-owner', '-C', staging], { maxBuffer: 4 * 1024 * 1024 })
    const entries = await readdir(staging, { withFileTypes: true })
    if (entries.length !== 1 || !entries[0].isDirectory())
      throw new Error('Invalid editor update application layout.')
    const outer = join(staging, entries[0].name)
    const replacement = outer
    await validateTree(staging, staging)
    await access(join(replacement, executable), process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    // This file is deliberately outside asar so both the installer and users can inspect it.
    const identity = JSON.parse(await readFile(join(replacement, process.platform === 'darwin' ? 'Contents/Resources' : 'resources', 'editor-release.json'), 'utf8'))
    if (identity.version !== request.version || identity.product !== 'quaengine-editor' || identity.channel !== request.channel || identity.platform !== request.platform || identity.arch !== request.arch)
      throw new Error('Editor update application identity mismatch.')
    if (process.platform === 'darwin' && request.signingTeamId)
      await verifyMacUpdate(replacement, request.signingTeamId, request.channel)
    const backup = `${root}.previous-${Date.now()}`
    const status = join(helperDirectory, 'install-status.txt')
    const helper = join(helperDirectory, process.platform === 'win32' ? 'apply-update.ps1' : 'apply-update.sh')
    await mkdir(helperDirectory, { recursive: true })
    await writeFile(helper, await readFile(join(bundledDirectory, basename(helper))))
    const ready = `${helper}.ready`
    const token = randomBytes(32).toString('hex')
    const started = join(helperDirectory, 'startup-ready.txt')
    await rm(started, { force: true })
    await rm(ready, { force: true })
    await writeFile(status, 'prepared\n')
    let helperChild: ReturnType<typeof spawn> | undefined
    const launch = async (): Promise<void> => {
      const args = [String(process.pid), root, replacement, backup, request.executablePath, status, ready, userDataDirectory ?? '', token, request.version, started, noSandbox ? '1' : '0']
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.NODE_OPTIONS
      env.QUA_EDITOR_UPDATE_TOKEN = token
      const child = process.platform === 'win32'
        ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, ...args], { env, detached: true, stdio: 'ignore', windowsHide: true, cwd: helperDirectory })
        : spawn('/bin/sh', [helper, ...args], { env, detached: true, stdio: 'ignore', cwd: helperDirectory })
      helperChild = child
      await new Promise<void>((accept, reject) => {
        child.once('spawn', accept)
        child.once('error', reject)
      })
      child.unref()
      // Refuse to exit if the helper could not even start (e.g. PowerShell policy).
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await stat(ready).catch(() => undefined))
          return
        await new Promise(accept => setTimeout(accept, 50))
      }
      child.kill()
      throw new Error('Editor updater could not start. The current application is unchanged.')
    }
    return {
      launch,
      discard: async () => {
        helperChild?.kill()
        await rm(staging, { recursive: true, force: true })
      },
    }
  }
  catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

function outside(path: string): boolean {
  return isAbsolute(path) || /^[a-z]:/iu.test(path) || path.split(/[\\/]/u).includes('..')
}

async function validateTree(root: string, directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = await readlink(path)
      if (isAbsolute(target) || outside(relative(root, resolve(dirname(path), target))))
        throw new Error('Editor update contains an escaping symbolic link.')
    }
    else if (entry.isDirectory()) {
      await validateTree(root, path)
    }
    else if (!entry.isFile()) {
      throw new Error('Editor update contains a special file.')
    }
  }
}

/** Trust the team embedded in the installed signed editor, never the remote manifest. */
export async function verifyMacUpdate(
  application: string,
  teamId: string,
  channel: EditorUpdateInstallRequest['channel'],
  run: (file: string, args: string[]) => Promise<{ stdout: string, stderr: string }> = (file, args) => exec(file, args, { timeout: 60000 }),
): Promise<void> {
  if (!/^[A-Z0-9]{10}$/u.test(teamId))
    throw new Error('Invalid editor signing team.')
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application])
  const { stderr } = await run('/usr/bin/codesign', ['--display', '--verbose=4', application])
  const bundleId = channel === 'beta' ? 'com.quadevteam.quaengine.editor.beta' : 'com.quadevteam.quaengine.editor'
  if (!stderr.split('\n').includes(`TeamIdentifier=${teamId}`)
    || !stderr.split('\n').includes(`Identifier=${bundleId}`)
    || !/^Authority=Developer ID Application: /mu.test(stderr)
    || !/flags=.*\bruntime\b/u.test(stderr)) {
    throw new Error('Editor update signing identity or channel does not match the installed application.')
  }
  // Gatekeeper consumes the stapled notarization ticket; users do not need Xcode/stapler.
  await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', application])
}
