import type {
  NativeHostApiErrorInfo,
  NativeHostApiRequest,
  NativeHostApiResponsePayload,
  NativeHostApiResponseValueByType,
  NativeHostBridgeDispatch,
  NativeSignatureVerifyRequest,
  NativeSignatureVerifyWireRequest,
  QuaNativeHostApi,
} from './capabilities'

export function createNativeSignatureVerifyWireRequest(
  request: NativeSignatureVerifyRequest,
): NativeSignatureVerifyWireRequest {
  return {
    bytes: Array.from(request.bytes),
    signature: Array.from(request.signature),
    ...(request.keyId !== undefined ? { keyId: request.keyId } : {}),
    ...(request.algorithm !== undefined ? { algorithm: request.algorithm } : {}),
  }
}

export function createNativeHostApiRequest(request: NativeHostApiRequest): NativeHostApiRequest {
  return request
}

export function nativeBytesToWire(bytes: Uint8Array): number[] {
  return Array.from(bytes)
}

export function nativeWireBytesToUint8Array(bytes: readonly number[] | null | undefined): Uint8Array | undefined {
  return bytes == null ? undefined : new Uint8Array(bytes)
}

export function createNativeHostApiFromBridge(dispatch: NativeHostBridgeDispatch): QuaNativeHostApi {
  const call = async <TPayload extends NativeHostApiResponsePayload['type']>(
    request: NativeHostApiRequest,
    expectedType: TPayload,
  ): Promise<NativeHostApiResponseValueByType[TPayload]> => {
    const response = await dispatch(request)
    if (!response.ok)
      throw nativeHostBridgeError(response.error)
    if (response.payload?.type !== expectedType)
      throw new Error(`Native host bridge returned unexpected payload for "${request.method}".`)
    return response.payload.value as NativeHostApiResponseValueByType[TPayload]
  }

  return {
    getHostInfo: () => call({ method: 'getHostInfo' }, 'hostInfo'),
    async readAssetBytes(request) {
      return nativeWireBytesToUint8Array(await call({ method: 'readAssetBytes', params: request }, 'assetBytes'))!
    },
    listMountedBundles: () => call({ method: 'listMountedBundles' }, 'mountedBundles'),
    async readStorage(key) {
      return nativeWireBytesToUint8Array(await call({ method: 'readStorage', params: { key } }, 'storageBytes'))
    },
    async writeStorage(key, value) {
      await callVoid(dispatch, {
        method: 'writeStorage',
        params: {
          key,
          value: nativeBytesToWire(value),
        },
      })
    },
    async deleteStorage(key) {
      await callVoid(dispatch, { method: 'deleteStorage', params: { key } })
    },
    listStorageKeys: prefix => call({ method: 'listStorageKeys', params: { prefix } }, 'storageKeys'),
    hashBytes: (bytes, algorithm) => call({
      method: 'hashBytes',
      params: {
        bytes: nativeBytesToWire(bytes),
        algorithm,
      },
    }, 'hash'),
    verifySignature: request => call({
      method: 'verifySignature',
      params: createNativeSignatureVerifyWireRequest(request),
    }, 'signatureValid'),
    evaluateQuickJsModule: request => call({
      method: 'evaluateQuickJsModule',
      params: request,
    }, 'quickJsEvaluation'),
    releaseQuickJsModuleNamespace: moduleNamespaceId => call({
      method: 'releaseQuickJsModuleNamespace',
      params: { moduleNamespaceId },
    }, 'quickJsNamespace').then(value => value ?? undefined),
    releaseQuickJsPackageNamespaces: packageId => call({
      method: 'releaseQuickJsPackageNamespaces',
      params: { packageId },
    }, 'quickJsNamespaces'),
    getQuickJsNamespaceSummary: () => call({
      method: 'getQuickJsNamespaceSummary',
    }, 'quickJsNamespaceSummary'),
    getQuickJsPackageNamespaceSummary: packageId => call({
      method: 'getQuickJsPackageNamespaceSummary',
      params: { packageId },
    }, 'quickJsNamespaceSummary'),
    emitRendererIntent(event) {
      void callVoid(dispatch, { method: 'emitRendererIntent', params: event })
    },
  }
}

async function callVoid(dispatch: NativeHostBridgeDispatch, request: NativeHostApiRequest): Promise<void> {
  const response = await dispatch(request)
  if (!response.ok)
    throw nativeHostBridgeError(response.error)
  if (response.payload !== undefined)
    throw new Error(`Native host bridge returned unexpected payload for "${request.method}".`)
}

function nativeHostBridgeError(error: NativeHostApiErrorInfo | undefined): Error {
  if (!error)
    return new Error('Native host bridge request failed.')
  return new Error(error.message)
}
