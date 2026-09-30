import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)
it.skipIf(process.platform === 'win32')('oS handoff swaps an app with spaces in its path and restores a failed launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qua update handoff '))
  try {
    for (const fail of [false, true]) {
      const current = join(root, `current ${fail}`)
      const replacement = join(root, `replacement ${fail}`)
      const backup = join(root, `backup ${fail}`)
      const status = join(root, `status ${fail}`)
      const profile = join(root, 'profile with spaces')
      const started = `${status}.started`
      await mkdir(current)
      await mkdir(replacement)
      await writeFile(join(current, 'version'), 'old')
      await writeFile(join(replacement, 'version'), 'new')
      await writeFile(join(current, 'editor'), '#!/bin/sh\nexit 0\n')
      await writeFile(join(replacement, 'editor'), fail ? '#!/bin/sh\nexit 1\n' : '#!/bin/sh\n[ -z "$ELECTRON_RUN_AS_NODE" ] || exit 1\n[ "$1" = "--user-data-dir=$EXPECTED_PROFILE" ] || exit 1\nprintf "test-token 0.1.1 %s\\n" "$$" > "$STARTED_FILE"\nsleep 3\n')
      await chmod(join(current, 'editor'), 0o755)
      await chmod(join(replacement, 'editor'), 0o755)
      const result = await exec('/bin/sh', [fileURLToPath(new URL('../src/release/apply-update.sh', import.meta.url)), '99999999', current, replacement, backup, join(current, 'editor'), status, `${status}.ready`, profile, 'test-token', '0.1.1', started], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', EXPECTED_PROFILE: profile, STARTED_FILE: started } }).catch(error => error)
      expect(await readFile(join(current, 'version'), 'utf8')).toBe(fail ? 'old' : 'new')
      expect(await readFile(status, 'utf8')).toContain(fail ? 'previous application restored' : 'installed')
      if (!fail)
        expect(result.code).toBeUndefined()
    }
  }
  finally { await rm(root, { recursive: true, force: true }) }
}, 15000)
