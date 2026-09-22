import { expect, it } from 'vitest'
import { storageDetail, validateStorageRequest } from '../src/preview/storage.js'

it('bounds queries and values, preserves hostile keys as data and summarizes binary storage', () => {
  expect(() => validateStorageRequest({ action: 'delete' })).toThrow()
  expect(() => validateStorageRequest({ action: 'page', source: 'x', offset: -1 })).toThrow()
  expect(() => validateStorageRequest({ action: 'detail', source: 'x', key: 'x'.repeat(4097) })).toThrow()
  const value = JSON.parse('{"__proto__":{"safe":true},"<script>":"literal"}')
  const result = storageDetail({ value, binary: new Uint8Array(100000), large: 'x'.repeat(100000) })
  expect(result.truncated).toBe(true)
  expect(result.text.length).toBeLessThan(40000)
  expect(JSON.parse(result.text).binary).toEqual({ type: 'Uint8Array', byteLength: 100000 })
  expect(Object.getOwnPropertyDescriptor(JSON.parse(result.text).value, '__proto__')?.value).toEqual({ safe: true })
  expect(({} as any).safe).toBeUndefined()
})
