import type { Env } from './types'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message)
}
export const now = () => Math.floor(Date.now() / 1000)
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, '0')).join('')
}
export async function hash(value: string | Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof value === 'string'
          ? new TextEncoder().encode(value)
          : new Uint8Array(value),
      ),
    ),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}
export async function boundedBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader()
  if (!reader)
    fail(502, 'empty_response', '上游响应为空。')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > limit)
        fail(413, 'response_limit', '响应超过大小上限。')
      chunks.push(value)
    }
  }
  finally {
    await reader.cancel().catch(() => {})
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    fail(415, 'content_type', '需要 application/json。')
  const data = JSON.parse(
    new TextDecoder().decode(
      await boundedBytes(new Response(request.body), 8192),
    ),
  )
  if (!data || typeof data !== 'object' || Array.isArray(data))
    fail(400, 'invalid_body', '无效请求。')
  return data
}
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
}
export function origin(env: Env): string {
  const url = new URL(env.PUBLIC_ORIGIN)
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.hostname.endsWith('.invalid')
  ) {
    fail(503, 'configuration', 'Registry 尚未配置。')
  }
  return url.origin
}
export function sameOrigin(request: Request, env: Env): void {
  if (request.headers.get('Origin') !== origin(env))
    fail(403, 'origin', '请求来源不匹配。')
}
export function cookie(request: Request, name: string): string {
  return (
    request.headers
      .get('Cookie')
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  )
}
export async function quota(
  env: Env,
  key: string,
  limit: number,
  seconds: number,
): Promise<void> {
  const expiry = (Math.floor(now() / seconds) + 1) * seconds
  const row = await env.DB.prepare(
    `INSERT INTO quotas(key, count, expires_at) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ?3 THEN 1 ELSE count + 1 END, expires_at = ?2 RETURNING count`,
  )
    .bind(key, expiry, now())
    .first<{ count: number }>()
  if (!row || row.count > limit)
    fail(429, 'rate_limit', '请求过于频繁，请稍后重试。')
}
export async function ipQuota(
  request: Request,
  env: Env,
  bucket: string,
  limit: number,
): Promise<void> {
  if (!env.ABUSE_SECRET || env.ABUSE_SECRET.length < 32)
    fail(503, 'configuration', 'Registry 防滥用密钥尚未配置。')
  // Cloudflare supplies CF-Connecting-IP; origin has no direct public bypass.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  const key = await hash(
    `${env.ABUSE_SECRET}:${Math.floor(now() / 86400)}:${ip}`,
  )
  await quota(env, `ip:${bucket}:${key}`, limit, 3600)
}
export function escape(value: unknown) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[
        char
      ]!,
  )
}
export function html(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:15px/1.7 system-ui;margin:48px auto;padding:0 24px;max-width:980px;background:#171b22;color:#d9e2ef}a{color:#9dc0f3}article{border:1px solid #394455;border-radius:8px;padding:20px;margin:18px 0}button,input,select,textarea{font:inherit;padding:8px;margin:6px;background:#273344;color:#d9e2ef;border:1px solid #46566c;border-radius:4px}code,pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#aec4e2}small{color:#9cacbf}</style><h1>${escape(title)}</h1>${body}</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          'default-src \'none\'; style-src \'unsafe-inline\'; form-action \'self\'; frame-ancestors \'none\'; base-uri \'none\'',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

/** Fast per-location guard runs before any D1 work; account/budget quotas remain strict in D1. */
export async function requestLimit(request: Request, env: Env): Promise<void> {
  if (!env.REQUEST_LIMITER)
    return
  if (!env.ABUSE_SECRET || env.ABUSE_SECRET.length < 32)
    fail(503, 'configuration', 'Registry 防滥用密钥尚未配置。')
  const key = await hash(
    `${env.ABUSE_SECRET}:${Math.floor(now() / 86400)}:${request.headers.get('CF-Connecting-IP') ?? 'local'}`,
  )
  if (!(await env.REQUEST_LIMITER.limit({ key })).success)
    fail(429, 'rate_limit', '请求过于频繁，请稍后重试。')
}
