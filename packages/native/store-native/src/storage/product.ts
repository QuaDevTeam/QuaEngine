import type { StorageConfig } from '@quajs/store'
import type { NativeStoreRecords } from './transport'
import { NativeStoreBackend } from './backend'

type ProductStorageCall = (operation: 'read' | 'write' | 'delete' | 'list' | 'batch', key: string, value?: string) => string

/** Captures the host callback at signed product bootstrap. Embedded hosts may omit it. */
export function resolveNativeProductStorage(namespace: string) {
  const call = (globalThis as { __quaNativeProductStorage?: ProductStorageCall }).__quaNativeProductStorage
  if (typeof call !== 'function')
    return undefined

  const getItem = (key: string): string | null => JSON.parse(call('read', key))
  const list = (prefix: string): string[] => JSON.parse(call('list', prefix))

  let latestCommit = Promise.resolve()
  const records: NativeStoreRecords = {
    read: key => getItem(key) ?? undefined,
    write: (key, value) => { call('write', key, value) },
    remove: (key) => { call('delete', key) },
    list,
    transaction(action) {
      const run = latestCommit.then(async () => {
        const changes = new Map<string, string | null>()
        const result = await action({
          read: key => (changes.has(key) ? changes.get(key) : getItem(key)) ?? undefined,
          write: (key, value) => { changes.set(key, value) },
          remove: (key) => { changes.set(key, null) },
          list(prefix) {
            const keys = new Set(list(prefix))
            for (const [key, value] of changes) {
              if (key.startsWith(prefix)) {
                if (value === null)
                  keys.delete(key)
                else
                  keys.add(key)
              }
            }
            return [...keys]
          },
        })
        if (changes.size)
          call('batch', '', JSON.stringify([...changes]))
        return result
      })
      latestCommit = run.then(() => {}, () => {})
      return run
    },
  }
  const store: StorageConfig = { backend: { driver: NativeStoreBackend, options: { records, namespace: encodeURIComponent(namespace) } } }
  return {
    store,
    getItem,
    setItem: (key: string, value: string) => { call('write', key, value) },
    removeItem: (key: string) => { call('delete', key) },
  }
}
