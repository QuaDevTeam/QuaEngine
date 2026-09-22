import type {
  PreviewStorageRequest,
  PreviewStorageResult,
} from '@quajs/editor-core'
import { randomUUID } from 'node:crypto'

export function nativeStorage(
  send: (
    method: string,
    params: Record<string, unknown>,
    timeout?: number,
  ) => Promise<Record<string, any>>,
  token: string,
) {
  const engine = async (
    request: PreviewStorageRequest,
  ): Promise<PreviewStorageResult> => {
    const result = await send(
      'Qua.editorCommand',
      {
        token,
        requestId: randomUUID(),
        command: { action: 'storage', request },
      },
      8000,
    )
    if (!result.storage)
      throw new Error('此项目未接入引擎存储调试，请启用 editor-core/runtime。')
    return result.storage
  }
  return async (
    request: PreviewStorageRequest,
  ): Promise<PreviewStorageResult> => {
    if (request.source?.startsWith('engine:'))
      return engine(request)
    const result = (await send('Qua.getStorage', {
      token,
      request,
    })) as PreviewStorageResult
    if (request.action === 'catalog') {
      try {
        result.sources!.unshift(...((await engine(request)).sources ?? []))
      }
      catch (error) {
        result.warning = `引擎存档查询失败：${String(error)}`
      }
    }
    return result
  }
}
