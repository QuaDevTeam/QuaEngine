import type {
  NativeHostApiErrorInfo,
  NativeRendererIntent,
  QuaNativeHostInfo,
} from './capabilities'

export type NativeProductBridgeRequest =
  | { method: 'getHostInfo' }
  | { method: 'renderProjectionFrame', params: NativeProductBridgeProjectionFrameRequest }
  | { method: 'tickLifecycle' }
  | { method: 'drainRendererIntents' }
  | { method: 'shutdown' }

export interface NativeProductBridgeProjectionFrameRequest {
  frameJson?: string
  frame?: unknown
}

export interface NativeProductBridgeProjectionFrameSummary {
  frameNumber: number
  renderedFrameCount: number
  revision: number
  passCount: number
  batchCount: number
  commandCount: number
  resourceCount: number
  missingResourceCount: number
  textureUploadPendingRequestCount: number
  textureUploadUploadedCount: number
  textureUploadErrorCount: number
  textureUploadResubmitCount: number
  resubmittedAfterTextureUpload: boolean
  textureLifecycleInitialSync: boolean
  textureLifecycleTrackedPackageCount: number
  textureLifecycleReleasedPackageCount: number
  rendererIntents: NativeRendererIntent[]
}

export interface NativeProductBridgeLifecycleSummary {
  renderedFrameCount: number
  initialSync: boolean
  observedBundleCount: number
  currentPackageIds: string[]
  removedPackageIds: string[]
  releasedPackageIds: string[]
  trackedPackageIds: string[]
  releaseAttemptCount: number
  releasedResourceCount: number
  textureCleanupErrorCount: number
  rendererIntents: NativeRendererIntent[]
}

export interface NativeProductBridgeShutdownSummary {
  renderedFrameCount: number
  releasedResourceCount: number
  hostCleanupCount: number
  textureCleanupReleasedCount: number
  textureCleanupErrorCount: number
  rendererIntents: NativeRendererIntent[]
}

export interface NativeProductBridgeResponseValueByType {
  hostInfo: QuaNativeHostInfo
  projectionFrame: NativeProductBridgeProjectionFrameSummary
  lifecycleTick: NativeProductBridgeLifecycleSummary
  rendererIntents: NativeRendererIntent[]
  shutdown: NativeProductBridgeShutdownSummary
}

export type NativeProductBridgeResponsePayload = {
  [TType in keyof NativeProductBridgeResponseValueByType]: {
    type: TType
    value: NativeProductBridgeResponseValueByType[TType]
  }
}[keyof NativeProductBridgeResponseValueByType]

export interface NativeProductBridgeResponse {
  ok: boolean
  payload?: NativeProductBridgeResponsePayload
  error?: NativeHostApiErrorInfo
}

export type NativeProductBridgeDispatch =
  (request: NativeProductBridgeRequest) => NativeProductBridgeResponse | Promise<NativeProductBridgeResponse>

export interface QuaNativeProductBridge {
  getHostInfo: () => Promise<QuaNativeHostInfo>
  renderProjectionFrame: (
    frame: string | object | NativeProductBridgeProjectionFrameRequest,
  ) => Promise<NativeProductBridgeProjectionFrameSummary>
  tickLifecycle: () => Promise<NativeProductBridgeLifecycleSummary>
  drainRendererIntents: () => Promise<NativeRendererIntent[]>
  shutdown: () => Promise<NativeProductBridgeShutdownSummary>
}

export function createNativeProductBridgeFromBridge(
  dispatch: NativeProductBridgeDispatch,
): QuaNativeProductBridge {
  const call = async <TPayload extends NativeProductBridgeResponsePayload['type']>(
    request: NativeProductBridgeRequest,
    expectedType: TPayload,
  ): Promise<NativeProductBridgeResponseValueByType[TPayload]> => {
    const response = await dispatch(request)
    if (!response.ok)
      throw nativeProductBridgeError(response.error)
    if (response.payload?.type !== expectedType)
      throw new Error(`Native product bridge returned unexpected payload for "${request.method}".`)
    return response.payload.value as NativeProductBridgeResponseValueByType[TPayload]
  }

  return {
    getHostInfo: () => call({ method: 'getHostInfo' }, 'hostInfo'),
    renderProjectionFrame: frame => call({
      method: 'renderProjectionFrame',
      params: createNativeProductBridgeProjectionFrameRequest(frame),
    }, 'projectionFrame'),
    tickLifecycle: () => call({ method: 'tickLifecycle' }, 'lifecycleTick'),
    drainRendererIntents: () => call({ method: 'drainRendererIntents' }, 'rendererIntents'),
    shutdown: () => call({ method: 'shutdown' }, 'shutdown'),
  }
}

export function createNativeProductBridgeProjectionFrameRequest(
  frame: string | object | NativeProductBridgeProjectionFrameRequest,
): NativeProductBridgeProjectionFrameRequest {
  if (typeof frame === 'string')
    return { frameJson: frame }

  if (isProjectionFrameRequest(frame))
    return frame

  return { frame }
}

function isProjectionFrameRequest(input: object): input is NativeProductBridgeProjectionFrameRequest {
  return Object.prototype.hasOwnProperty.call(input, 'frameJson')
    || Object.prototype.hasOwnProperty.call(input, 'frame')
}

function nativeProductBridgeError(error: NativeHostApiErrorInfo | undefined): Error {
  if (!error)
    return new Error('Native product bridge request failed.')
  return new Error(error.message)
}
