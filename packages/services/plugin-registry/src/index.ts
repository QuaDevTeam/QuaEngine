import type { Env, Network } from './types'
import { adminRoute } from './admin'
import { authRoute, registrationReady } from './auth'
import { fail, html, HttpError, json, requestLimit } from './http'
import { NpmSource } from './npm'
import { registryRoute, synchronize } from './registry'

export function createRegistry(network: Network = fetch) {
  const npm = new NpmSource(network)
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        await requestLimit(request, env)
        const url = new URL(request.url)
        if (url.pathname === '/health') {
          return json({
            service: 'qua-plugin-registry',
            schemaVersion: 1,
            registrationReady: registrationReady(env),
          })
        }
        if (url.pathname === '/' && request.method === 'GET') {
          return html(
            'QuaEngine Plugin Registry',
            `<p>已发布到 npm 的 QuaEngine 插件目录。</p><p><a href="/api/catalog">查看已审核目录</a>${registrationReady(env) ? ' · <a href="/login">GitHub 登录</a>' : '</p><p>GitHub 登录与插件登记即将开放。'}</p><p>在 QuaEngine Editor 的插件发布页认领并提交 npm 包。加入后自动同步，无需逐版本注册。</p>`,
          )
        }
        const response
          = (await authRoute(request, env, network))
            ?? (await registryRoute(request, env, npm, network))
            ?? (await adminRoute(request, env, npm))
        if (response)
          return response
        fail(404, 'not_found', '接口不存在。')
      }
      catch (error) {
        if (!(error instanceof HttpError) && !(error instanceof SyntaxError)) {
          console.error(
            'Registry internal error',
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Unknown failure',
          )
        }
        const status
          = error instanceof HttpError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 500
        return json(
          {
            error:
              error instanceof HttpError
                ? error.code
                : status === 400
                  ? 'invalid_json'
                  : 'internal_error',
            message:
              error instanceof HttpError
                ? error.message
                : status === 400
                  ? '无效 JSON。'
                  : '服务暂时不可用。',
          },
          status,
          status === 429 ? { 'Retry-After': '60' } : {},
        )
      }
    },
    async scheduled(_controller: unknown, env: Env): Promise<void> {
      await synchronize(env, npm, network)
    },
  }
}
export default createRegistry()
