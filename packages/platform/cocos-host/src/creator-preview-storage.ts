import type { CocosCreatorFileBridge } from './creator'

/** Preview-only durable byte files. The browser database is injected by the shell. */
export function createCreatorPreviewFileBridge(options: { indexedDB: any, namespace: string }): CocosCreatorFileBridge {
  const database = new Promise<any>((resolve, reject) => {
    const request = options.indexedDB.open(`qua-creator-preview:${options.namespace}`, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Creator preview storage is blocked by another database connection.'))
  })
  async function operation<T>(mode: 'readonly' | 'readwrite', action: (store: any) => any): Promise<T> {
    const db = await database
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', mode)
      const request = action(transaction.objectStore('files'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error || request.error)
      transaction.onabort = () => reject(transaction.error || new Error('Creator preview storage transaction aborted.'))
    })
  }
  const readBytes = async (path: string) => operation<Uint8Array | undefined>('readonly', store => store.get(path))
  return {
    readBytes,
    async writeBytes(path, bytes) { await operation('readwrite', store => store.put(bytes.slice(), path)) },
    async delete(path) { await operation('readwrite', store => store.delete(path)) },
    async ensureDir() {},
    async list(root) {
      const paths = await operation<string[]>('readonly', store => store.getAllKeys())
      return Promise.all(paths.filter(path => path.startsWith(`${root.replace(/\/$/, '')}/`)).map(async path => ({ path, size: (await readBytes(path))?.byteLength ?? 0 })))
    },
    async move(from, to) {
      const bytes = await readBytes(from)
      if (!bytes)
        throw new Error(`Missing Creator preview file: ${from}`)
      const db = await database
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite')
        const files = tx.objectStore('files')
        files.put(bytes, to)
        files.delete(from)
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    },
  }
}
