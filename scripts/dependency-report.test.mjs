/* eslint-disable test/no-import-node-test -- Runs in the dependency-report workflow before installing workspace packages. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { collectWorkspace, summarize } from './dependency-report.mjs'

const audit = { metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } }, advisories: {} }
const response = (data, code = 0) => ({ code, stdout: JSON.stringify(data), stderr: '' })
const report = workspace => ({ generatedAt: '2026-11-14', workspaces: [workspace] })

test('findings are retained when pnpm exits 1; deprecated packages are visible', async () => {
  const workspace = await collectWorkspace('.', async args => args[0] === 'outdated'
    ? response({ old: { current: '1.0.0', latest: '1.0.0', isDeprecated: true } }, 1)
    : response({ ...audit, metadata: { vulnerabilities: { high: 1, critical: 0 } } }, 1))
  const result = summarize(report(workspace))
  assert.equal(result.failed, true)
  assert.match(result.markdown, /DEPRECATED/)
  assert.equal(workspace.audit.data.metadata.vulnerabilities.high, 1)
})

test('registry failure and invalid JSON fail closed while preserving the other check', async () => {
  for (const result of [
    { code: 1, stdout: '', stderr: 'offline' },
    response({ error: { message: 'registry unavailable' } }, 1),
    response({}, 1),
    response({ metadata: { vulnerabilities: {} }, advisories: {} }, 1),
    response(audit, 'ETIMEDOUT'),
  ]) {
    const workspace = await collectWorkspace('docs', async args => args[0] === 'audit' ? result : response({}))
    assert.ok(workspace.audit.error)
    assert.deepEqual(workspace.outdated.data, {})
    assert.equal(summarize(report(workspace)).failed, true)
  }
})

test('clean audits and lower severity findings do not block the report', async () => {
  const workspace = await collectWorkspace('packages/editor/release', async args => args[0] === 'audit'
    ? response({ ...audit, metadata: { vulnerabilities: { low: 1, high: 0, critical: 0 } } }, 1)
    : response({}))
  assert.equal(summarize(report(workspace)).failed, false)
})
