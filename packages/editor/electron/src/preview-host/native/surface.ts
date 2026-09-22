import type { EditorBounds } from '@quajs/editor-core'
import type { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'

export interface NativeSurfaceDescriptor {
  kind: 'ca-context'
  contextId: number
  width: number
  height: number
}
interface LayerBinding {
  create: (contextId: number) => unknown
  layout: (handle: unknown, parent: Buffer, x: number, y: number, width: number, height: number, sourceWidth: number, sourceHeight: number) => void
  destroy: (handle: unknown) => void
}

export function nativeLayerBinding(): LayerBinding {
  if (process.platform !== 'darwin')
    throw new Error('当前平台尚未实现 Native 原生表面嵌入。')
  return createRequire(import.meta.url)('./native-layer.node') as LayerBinding
}

export function parseNativeSurface(input: unknown): NativeSurfaceDescriptor {
  const value = input as Partial<NativeSurfaceDescriptor> | null
  if (!value || value.kind !== 'ca-context' || !Number.isSafeInteger(value.contextId) || value.contextId! <= 0 || value.contextId! > 0xFFFFFFFF
    || ![value.width, value.height].every(dimension => typeof dimension === 'number' && Number.isFinite(dimension) && dimension > 0 && dimension <= 4096)) {
    throw new Error('Native 原生表面描述无效。')
  }
  return value as NativeSurfaceDescriptor
}

/** Main-process native resource. Never expose native handles to the workbench. */
export class NativePreviewSurface {
  private readonly binding = nativeLayerBinding()
  private readonly handle: unknown
  private closed = false
  constructor(readonly descriptor: NativeSurfaceDescriptor) {
    this.handle = this.binding.create(descriptor.contextId)
  }

  layout(parent: BrowserWindow, bounds: EditorBounds): void {
    if (this.closed || parent.isDestroyed())
      return
    this.binding.layout(this.handle, parent.getNativeWindowHandle(), bounds.x, bounds.y, bounds.width, bounds.height, this.descriptor.width, this.descriptor.height)
  }

  destroy(): void {
    if (this.closed)
      return
    this.binding.destroy(this.handle)
    this.closed = true
  }
}
