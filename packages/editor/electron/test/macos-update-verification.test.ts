import { expect, it, vi } from 'vitest'
import { verifyMacUpdate } from '../src/release/install.js'

const identity = 'Identifier=com.quadevteam.quaengine.editor\nTeamIdentifier=ABCD123456\nAuthority=Developer ID Application: Example (ABCD123456)\nCodeDirectory flags=0x10000(runtime)\n'
it('verifies the sealed bundle, installed team/channel, and Gatekeeper before handoff', async () => {
  const run = vi.fn(async (_file: string, _args: string[]) => ({ stdout: '', stderr: identity }))
  await verifyMacUpdate('/temporary/App.app', 'ABCD123456', 'stable', run)
  expect(run.mock.calls.map(args => args[0])).toEqual(['/usr/bin/codesign', '/usr/bin/codesign', '/usr/sbin/spctl'])
})

it.each([
  identity.replace('TeamIdentifier=ABCD123456', 'TeamIdentifier=OTHER12345'),
  identity.replace('Identifier=com.quadevteam.quaengine.editor', 'Identifier=com.quadevteam.quaengine.editor.beta'),
  identity.replace('Authority=Developer ID Application:', 'Authority=Apple Development:'),
  identity.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
])('rejects an untrusted update identity', async (details) => {
  const run = vi.fn(async () => ({ stdout: '', stderr: details }))
  await expect(verifyMacUpdate('/temporary/App.app', 'ABCD123456', 'stable', run)).rejects.toThrow('does not match')
  expect(run).toHaveBeenCalledTimes(2)
})

it('does not continue after a broken code seal or failed Gatekeeper assessment', async () => {
  const brokenSeal = vi.fn(async () => {
    throw new Error('invalid signature')
  })
  await expect(verifyMacUpdate('/temporary/App.app', 'ABCD123456', 'stable', brokenSeal)).rejects.toThrow('invalid signature')
  expect(brokenSeal).toHaveBeenCalledTimes(1)
  const run = vi.fn(async (file: string) => {
    if (file === '/usr/sbin/spctl')
      throw new Error('not notarized')
    return { stdout: '', stderr: identity }
  })
  await expect(verifyMacUpdate('/temporary/App.app', 'ABCD123456', 'stable', run)).rejects.toThrow('not notarized')
})
