import { expect, it, vi } from 'vitest'

vi.mock('lzma-native', () => {
  throw new Error('A project worker initialized the native compression library during import')
})

it('loads the project and QPK APIs without initializing the native compressor', async () => {
  const { loadQuaProjectConfig } = await import('../src/project')
  const { QPKBundler } = await import('../src/bundlers/qpk-bundler')
  expect(loadQuaProjectConfig).toBeTypeOf('function')
  expect(new QPKBundler()).toBeInstanceOf(QPKBundler)
})
