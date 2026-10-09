import type { Account, Env, Network } from './types'
import {
  boundedBytes,
  cookie,
  escape,
  fail,
  hash,
  html,
  ipQuota,
  json,
  jsonBody,
  now,
  origin,
  quota,
  sameOrigin,
  token,
} from './http'

const cookieName = '__Host-qua-session'
const cookieOptions = 'Path=/; HttpOnly; Secure; SameSite=Lax'
export function registrationReady(env: Env): boolean {
  return Boolean(
    env.GITHUB_CLIENT_ID
    && env.GITHUB_CLIENT_ID !== 'CONFIGURE_BEFORE_DEPLOY'
    && env.GITHUB_CLIENT_SECRET,
  )
}
function requireRegistration(env: Env): void {
  if (!registrationReady(env)) {
    fail(
      503,
      'oauth_not_configured',
      '插件目录已上线；GitHub 登录与插件登记尚待配置。',
    )
  }
}
export function administrator(account: Account, env: Env): boolean {
  try {
    const ids: unknown = JSON.parse(env.ADMIN_GITHUB_IDS)
    return Array.isArray(ids) && ids.includes(account.id)
  }
  catch {
    return false
  }
}
export async function authenticate(
  request: Request,
  env: Env,
  browser = false,
): Promise<Account> {
  requireRegistration(env)
  const value = browser
    ? cookie(request, cookieName)
    : (request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '')
  if (!/^[a-f0-9]{64}$/.test(value))
    fail(401, 'login_required', '请先登录 registry。')
  const account = await env.DB.prepare(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.hash = ?1 AND s.kind = ?2 AND s.expires_at > ?3 AND a.blocked = 0`,
  )
    .bind(await hash(value), browser ? 'browser' : 'editor', now())
    .first<Account>()
  if (!account)
    fail(401, 'session_expired', '登录已过期，请重新登录。')
  return account
}
export async function csrf(request: Request): Promise<string> {
  return hash(`csrf:${cookie(request, cookieName)}`)
}
export async function browserForm(
  request: Request,
  env: Env,
): Promise<URLSearchParams> {
  sameOrigin(request, env)
  const body = new URLSearchParams(
    new TextDecoder().decode(
      await boundedBytes(new Response(request.body), 8192),
    ),
  )
  if (body.get('csrf') !== (await csrf(request)))
    fail(403, 'csrf', '表单已过期，请刷新页面。')
  return body
}
async function session(
  env: Env,
  id: string,
  kind: 'browser' | 'editor',
): Promise<string> {
  const value = token()
  await env.DB.prepare(
    'INSERT INTO sessions(hash, account_id, kind, expires_at) VALUES (?1, ?2, ?3, ?4)',
  )
    .bind(
      await hash(value),
      id,
      kind,
      now() + (kind === 'browser' ? 8 * 3600 : 30 * 86400),
    )
    .run()
  return value
}
async function upstream(
  network: Network,
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await network(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok)
    fail(502, 'github_unavailable', 'GitHub 登录暂不可用。')
  return JSON.parse(
    new TextDecoder().decode(await boundedBytes(response, 128 * 1024)),
  )
}
export async function authRoute(
  request: Request,
  env: Env,
  network: Network,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const path = url.pathname
  if (
    [
      '/api/device/start',
      '/api/device/token',
      '/login',
      '/oauth/callback',
      '/activate',
    ].includes(path)
  ) {
    requireRegistration(env)
  }
  if (path === '/api/device/start' && request.method === 'POST') {
    await ipQuota(request, env, 'device', 10)
    origin(env)
    const device = token()
    const code = token().slice(0, 10).toUpperCase()
    await env.DB.prepare(
      'INSERT INTO devices(hash, user_code, expires_at) VALUES (?1, ?2, ?3)',
    )
      .bind(await hash(device), code, now() + 600)
      .run()
    return json({
      deviceCode: device,
      userCode: code,
      verificationUrl: `${origin(env)}/activate?code=${code}`,
      expiresIn: 600,
      interval: 5,
    })
  }
  if (path === '/api/device/token' && request.method === 'POST') {
    await ipQuota(request, env, 'poll', 800)
    const { deviceCode } = await jsonBody(request)
    if (typeof deviceCode !== 'string' || !/^[a-f0-9]{64}$/.test(deviceCode))
      fail(400, 'invalid_device', '无效设备代码。')
    const digest = await hash(deviceCode)
    await quota(env, `poll:${digest}`, 2, 5)
    const device = await env.DB.prepare(
      'SELECT * FROM devices WHERE hash = ?1 AND expires_at > ?2',
    )
      .bind(digest, now())
      .first<{ account_id: string | null, approved: number }>()
    if (!device)
      fail(410, 'expired_device', '登录请求已过期。')
    if (!device.approved)
      return json({ pending: true }, 202)
    const consumed = await env.DB.prepare(
      'DELETE FROM devices WHERE hash = ?1 AND approved = 1 RETURNING account_id',
    )
      .bind(digest)
      .first<{ account_id: string }>()
    if (!consumed)
      fail(410, 'expired_device', '登录请求已使用。')
    const account = await env.DB.prepare(
      'SELECT * FROM accounts WHERE id = ?1 AND blocked = 0',
    )
      .bind(consumed.account_id)
      .first<Account>()
    if (!account)
      fail(403, 'account_blocked', '账号不可用。')
    return json({
      token: await session(env, account.id, 'editor'),
      account: { id: account.id, login: account.login },
    })
  }
  if (path === '/login' && request.method === 'GET') {
    await ipQuota(request, env, 'login', 20)
    const code = url.searchParams.get('code') ?? ''
    if (code && !/^[A-F0-9]{10}$/.test(code))
      fail(400, 'invalid_device', '无效设备代码。')
    const state = token()
    const browser = token()
    const verifier = token()
    await env.DB.prepare(
      'INSERT INTO oauth_states(hash, browser_hash, verifier, device_code, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
      .bind(await hash(state), await hash(browser), verifier, code, now() + 600)
      .run()
    const bytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    )
    const challenge = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const target = new URL('https://github.com/login/oauth/authorize')
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${origin(env)}/oauth/callback`,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'read:user',
    }).toString()
    return new Response(null, {
      status: 302,
      headers: {
        'Location': target.href,
        'Set-Cookie': `__Host-qua-state=${browser}; ${cookieOptions}; Max-Age=600`,
        'Cache-Control': 'no-store',
      },
    })
  }
  if (path === '/oauth/callback' && request.method === 'GET') {
    await ipQuota(request, env, 'callback', 30)
    const state = url.searchParams.get('state') ?? ''
    const code = url.searchParams.get('code') ?? ''
    if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 300)
      fail(400, 'oauth_state', '无效登录响应。')
    const row = await env.DB.prepare(
      'DELETE FROM oauth_states WHERE hash = ?1 AND browser_hash = ?2 AND expires_at > ?3 RETURNING *',
    )
      .bind(
        await hash(state),
        await hash(cookie(request, '__Host-qua-state')),
        now(),
      )
      .first<{ verifier: string, device_code: string }>()
    if (!row)
      fail(403, 'oauth_state', '登录状态不匹配或已使用。')
    const access = await upstream(
      network,
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          code_verifier: row.verifier,
          redirect_uri: `${origin(env)}/oauth/callback`,
        }),
      },
    )
    if (typeof access.access_token !== 'string')
      fail(401, 'github_login', 'GitHub 未授权登录。')
    const user = await upstream(network, 'https://api.github.com/user', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${access.access_token}`,
        'User-Agent': 'QuaEngine-Registry',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (
      !Number.isSafeInteger(user.id)
      || typeof user.login !== 'string'
      || typeof user.created_at !== 'string'
    ) {
      fail(502, 'github_identity', 'GitHub 账号信息不完整。')
    }
    const created = Math.floor(Date.parse(user.created_at) / 1000)
    if (!Number.isFinite(created) || created > now() - 7 * 86400)
      fail(403, 'account_age', '提交插件需要注册满 7 天的 GitHub 账号。')
    const id = String(user.id)
    await env.DB.prepare(
      'INSERT INTO accounts(id, login, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET login = excluded.login',
    )
      .bind(id, user.login, created)
      .run()
    const account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?1')
      .bind(id)
      .first<Account>()
    if (account?.blocked)
      fail(403, 'account_blocked', '账号已停用。')
    const value = await session(env, id, 'browser')
    const headers = new Headers({
      'Location': row.device_code
        ? `${origin(env)}/activate?code=${row.device_code}`
        : `${origin(env)}/admin`,
      'Cache-Control': 'no-store',
    })
    headers.append(
      'Set-Cookie',
      `${cookieName}=${value}; ${cookieOptions}; Max-Age=28800`,
    )
    headers.append(
      'Set-Cookie',
      `__Host-qua-state=; ${cookieOptions}; Max-Age=0`,
    )
    return new Response(null, { status: 302, headers })
  }
  if (
    path === '/activate'
    && (request.method === 'GET' || request.method === 'POST')
  ) {
    const code = url.searchParams.get('code') ?? ''
    if (!/^[A-F0-9]{10}$/.test(code))
      fail(400, 'invalid_device', '无效设备代码。')
    let account: Account
    try {
      account = await authenticate(request, env, true)
    }
    catch {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${origin(env)}/login?code=${code}`,
          'Cache-Control': 'no-store',
        },
      })
    }
    const device = await env.DB.prepare(
      'SELECT user_code FROM devices WHERE user_code = ?1 AND expires_at > ?2 AND approved = 0',
    )
      .bind(code, now())
      .first()
    if (!device)
      return html('登录请求已过期', '<p>请返回编辑器重新登录。</p>')
    if (request.method === 'POST') {
      await browserForm(request, env)
      await env.DB.prepare(
        'UPDATE devices SET account_id = ?1, approved = 1 WHERE user_code = ?2 AND approved = 0 AND expires_at > ?3',
      )
        .bind(account.id, code, now())
        .run()
      return html(
        '已连接 QuaEngine Editor',
        '<p>可以关闭此页面，返回编辑器。</p>',
      )
    }
    return html(
      '连接 QuaEngine Editor',
      `<p>GitHub 账号：${escape(account.login)}</p><p>确认编辑器显示的代码为 <strong>${escape(code)}</strong>。</p><form method="post"><input type="hidden" name="csrf" value="${await csrf(request)}"><button>授权此编辑器</button></form>`,
    )
  }
  if (path === '/api/me' && request.method === 'GET') {
    const account = await authenticate(request, env)
    return json({ id: account.id, login: account.login })
  }
  if (path === '/api/logout' && request.method === 'POST') {
    await authenticate(request, env)
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?1')
      .bind(await hash(request.headers.get('Authorization')!.slice(7)))
      .run()
    return json({ ok: true })
  }
  return undefined
}
