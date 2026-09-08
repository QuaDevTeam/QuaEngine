import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldRecordDemoBacklog } from '../src/game/story/backlog-policy.ts'

const line = {
  id: 'original', kind: 'dialogue', point: { sceneId: 'demo', stepId: 'line-1' },
  speaker: 'Mara', text: '明天见。', rewindable: false, voiceReplay: false,
  gameTimeMs: 1000, recordedAt: 1000,
}
test('restoring the same authored line retains its original history entry', () => {
  assert.equal(shouldRecordDemoBacklog({ ...line, id: 'restored', recordedAt: 2000, gameTimeMs: 2000 }, line), false)
  const beforeSave = { ...line, point: { ...line.point, lineId: undefined, contentPackageId: undefined } }
  assert.equal(shouldRecordDemoBacklog(JSON.parse(JSON.stringify(beforeSave)), beforeSave), false, 'save serialization omits optional undefined point fields')
})
test('repeated words at another step, scene, or package remain separate records', () => {
  for (const point of [
    { ...line.point, stepId: 'line-2' },
    { ...line.point, sceneId: 'other-scene' },
    { ...line.point, contentPackageId: 'new-content' },
  ]) assert.equal(shouldRecordDemoBacklog({ ...line, point }, line), true)
})
test('changed speaker, text, choice, voice and package dependencies remain visible', () => {
  for (const change of [
    { speaker: '神代凛' }, { text: '后天见。' },
    { kind: 'choice', choices: [{ id: 'leave', text: '离开' }] },
    { voice: { assetKey: 'another-voice' } }, { requiredRuntimePackages: ['new-content'] },
  ]) assert.equal(shouldRecordDemoBacklog({ ...line, ...change }, line), true)
  assert.equal(shouldRecordDemoBacklog(line), true)
  assert.equal(shouldRecordDemoBacklog({ ...line, point: undefined }, line), true)
})
