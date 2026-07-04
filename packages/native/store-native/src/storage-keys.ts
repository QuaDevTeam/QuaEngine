import type { QuaNativeHostApi, QuaNativeHostInfo } from '@quajs/native-contracts'

export interface NativeStoreNamespaceOptions {
  hostInfo?: QuaNativeHostInfo
  profileId?: string
  namespace?: string
}

export function createNativeStoreNamespace(options: NativeStoreNamespaceOptions): string {
  const app = options.hostInfo?.app
  const bundleId = app?.bundleId || 'unknown.app'
  const profile = app?.profile || 'debug'
  const profileId = options.profileId || 'default'
  const namespace = options.namespace || 'qua-store'
  return [bundleId, profile, profileId, namespace].map(encodeURIComponent).join('/')
}

export function createNativeStoreRecordKey(namespace: string, group: string, id: string): string {
  return `${createNativeStoreGroupPrefix(namespace, group)}${encodeURIComponent(id)}`
}

export function createNativeStoreGroupPrefix(namespace: string, group: string): string {
  return `${namespace}/${group}/`
}

export async function requireNativeStoreStorageKeys(
  host: QuaNativeHostApi,
  prefix: string,
): Promise<string[]> {
  if (!host.listStorageKeys) {
    throw new Error('Native store host must provide listStorageKeys for list and clear operations.')
  }
  return await host.listStorageKeys(prefix)
}
