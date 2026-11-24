import type { QuaNativeHostApi } from '@quajs/native-contracts'
import { requireNativeStoreStorageKeys } from './keys'

export interface NativeStoreRecords {
  read: (key: string) => string | undefined | Promise<string | undefined>
  write: (key: string, value: string) => void | Promise<void>
  remove: (key: string) => void | Promise<void>
  list: (prefix: string) => string[] | Promise<string[]>
  transaction?: <T>(action: (records: NativeStoreRecords) => Promise<T>) => Promise<T>
}

declare const TextEncoder: { new(): { encode: (input: string) => Uint8Array } }
declare const TextDecoder: { new(): { decode: (input: Uint8Array) => string } }

export function createByteHostRecords(host: QuaNativeHostApi): NativeStoreRecords {
  return {
    async read(key) {
      const data = await host.readStorage(key)
      return data && new TextDecoder().decode(data)
    },
    write: (key, value) => host.writeStorage(key, new TextEncoder().encode(value)),
    remove: key => host.deleteStorage(key),
    list: prefix => requireNativeStoreStorageKeys(host, prefix),
  }
}
