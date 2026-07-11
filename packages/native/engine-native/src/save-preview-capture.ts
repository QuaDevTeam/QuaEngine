import type {
  EngineContext,
} from '@quajs/engine'
import type {
  SavePreviewCapturePolicy,
  SavePreviewCaptureRequestPayload,
} from '@quajs/render-core'
import {
  emitRenderToLogic,
  LogicToRenderEvents,
  onLogicToRender,
  RenderToLogicEvents,
} from '@quajs/engine'

export interface NativeSavePreviewCapture {
  bytes: Uint8Array
  mimeType: string
  width: number
  height: number
  capturedAt?: number
}

export type NativeSavePreviewCaptureProvider = (
  policy: SavePreviewCapturePolicy,
) => NativeSavePreviewCapture | Promise<NativeSavePreviewCapture>

export interface NativeSavePreviewCaptureResponderOptions {
  capture?: NativeSavePreviewCaptureProvider
  rendererId?: string
}

type NativeSavePreviewPipeline = NonNullable<EngineContext['pipeline']>

export function installNativeSavePreviewCaptureResponder(
  pipeline: NativeSavePreviewPipeline,
  options: NativeSavePreviewCaptureResponderOptions,
): () => void {
  return onLogicToRender(
    pipeline,
    LogicToRenderEvents.SAVE_PREVIEW_CAPTURE_REQUEST,
    async (payload) => {
      const task = handleNativeSavePreviewCaptureRequest(pipeline, payload, options)
      if (payload.transaction === 'async-clone') {
        void task.catch(() => undefined)
        return
      }
      await task
    },
  )
}

async function handleNativeSavePreviewCaptureRequest(
  pipeline: NativeSavePreviewPipeline,
  payload: SavePreviewCaptureRequestPayload,
  options: NativeSavePreviewCaptureResponderOptions,
): Promise<void> {
  try {
    if (!options.capture)
      throw new Error('Native save preview capture is unavailable for this product host.')

    const capture = await options.capture(payload.policy)
    assertNativeSavePreviewCapture(capture)
    const timestamp = Date.now()
    await emitRenderToLogic(pipeline, RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_RESULT, {
      requestId: payload.requestId,
      saveOpId: payload.saveOpId,
      slotId: payload.slotId,
      rendererId: options.rendererId,
      timestamp,
      mimeType: capture.mimeType,
      image: {
        kind: 'bytes',
        bytes: capture.bytes,
      },
      width: capture.width,
      height: capture.height,
      capturedAt: capture.capturedAt ?? timestamp,
    })
  }
  catch (error) {
    await emitRenderToLogic(pipeline, RenderToLogicEvents.SAVE_PREVIEW_CAPTURE_ERROR, {
      requestId: payload.requestId,
      saveOpId: payload.saveOpId,
      slotId: payload.slotId,
      rendererId: options.rendererId,
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    })
  }
}

function assertNativeSavePreviewCapture(
  capture: NativeSavePreviewCapture,
): asserts capture is NativeSavePreviewCapture {
  if (!(capture.bytes instanceof Uint8Array) || capture.bytes.byteLength === 0)
    throw new Error('Native save preview capture returned no encoded image bytes.')
  if (!capture.mimeType)
    throw new Error('Native save preview capture returned no MIME type.')
  if (!Number.isInteger(capture.width) || capture.width <= 0
    || !Number.isInteger(capture.height) || capture.height <= 0) {
    throw new Error('Native save preview capture returned invalid image dimensions.')
  }
}
