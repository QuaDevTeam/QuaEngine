import type { NpmSource } from './npm'
import type { Env, PackageRow } from './types'
import { administrator, authenticate, browserForm, csrf } from './auth'
import { escape, fail, html, now, quota } from './http'
import { isOfficialPackage, review } from './registry'

export async function adminRoute(
  request: Request,
  env: Env,
  npm: NpmSource,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (url.pathname !== '/admin')
    return undefined
  const account = await authenticate(request, env, true)
  if (!administrator(account, env))
    fail(403, 'admin_required', '此页面仅供审核员使用。')
  if (request.method === 'POST') {
    await quota(env, `admin:${account.id}`, 100, 3600)
    const body = await browserForm(request, env)
    if (body.get('action') === 'block') {
      const id = body.get('account') ?? ''
      const reason = (body.get('reason') ?? '').trim()
      if (
        !/^\d+$/.test(id)
        || id === account.id
        || reason.length < 3
        || reason.length > 1000
      ) {
        fail(400, 'block_account', '需要有效账号与停用理由。')
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE accounts SET blocked = 1 WHERE id = ?1').bind(
          id,
        ),
        env.DB.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(id),
        env.DB.prepare(
          'UPDATE packages SET status = \'suspended\', official = 0, manual_hold = 1, reason = ?1, updated_at = ?2, revision = revision + 1 WHERE owner_id = ?3',
        ).bind(reason, now(), id),
        env.DB.prepare(
          'INSERT INTO audit(name, actor, action, details, created_at) VALUES (\'\', ?1, \'block-account\', ?2, ?3)',
        ).bind(account.id, `${id}: ${reason}`, now()),
      ])
    }
    else {
      const name = body.get('name') ?? ''
      const expected = body.get('hash') ?? ''
      if (body.get('action') === 'approve') {
        // Recheck npm at approval time: a removed or replaced candidate cannot be approved.
        const current = await npm.fetch(name)
        if (current.hash !== expected) {
          fail(
            409,
            'stale_review',
            'npm 候选内容已经变化，请等待同步后重新审核。',
          )
        }
      }
      await review(
        env,
        account,
        name,
        expected,
        body.get('action') ?? '',
        (body.get('reason') ?? '').trim(),
        body.get('official') === 'yes',
      )
    }
    return new Response(null, {
      status: 303,
      headers: { 'Location': '/admin', 'Cache-Control': 'no-store' },
    })
  }
  if (request.method !== 'GET')
    fail(405, 'method', '不支持的请求方法。')
  const state = url.searchParams.get('status') ?? 'pending'
  if (!['pending', 'approved', 'rejected', 'suspended'].includes(state))
    fail(400, 'status', '无效审核状态。')
  const rows = await env.DB.prepare(
    'SELECT * FROM packages WHERE status = ?1 AND name > ?2 ORDER BY name LIMIT 51',
  )
    .bind(state, (url.searchParams.get('after') ?? '').slice(0, 214))
    .all<PackageRow>()
  const csrfToken = await csrf(request)
  let body = `<nav>${['pending', 'approved', 'rejected', 'suspended'].map(status => `<a href="/admin?status=${status}">${status}</a>`).join(' · ')}</nav><p>审核员：${escape(account.login)}</p>`
  for (const row of rows.results.slice(0, 50)) {
    const candidate = JSON.parse(row.candidate_json)
    body += `<article><h2>${escape(row.name)} <small>${escape(candidate.version)}</small></h2><p>提交账号 ${escape(row.owner_id)} · ${escape(row.status)}</p><p>${escape(row.reason)}</p><p><a rel="noreferrer" href="https://www.npmjs.com/package/${encodeURIComponent(row.name)}">查看 npm 包</a></p><pre>${escape(JSON.stringify({ metadata: candidate.metadata, maintainers: candidate.maintainers, integrity: candidate.integrity, tarball: candidate.tarball }, null, 2))}</pre><form method="post"><input type="hidden" name="csrf" value="${csrfToken}"><input type="hidden" name="name" value="${escape(row.name)}"><input type="hidden" name="hash" value="${escape(row.review_hash)}"><textarea name="reason" required minlength="3" maxlength="1000" placeholder="审核结论与依据"></textarea>${isOfficialPackage(row.name) ? `<label><input type="checkbox" name="official" value="yes" ${row.official ? 'checked' : ''}>官方插件</label>` : ''}<button name="action" value="approve">批准</button><button name="action" value="reject">拒绝</button><button name="action" value="suspend">下架</button></form><details><summary>停用提交账号及其全部插件</summary><form method="post"><input type="hidden" name="csrf" value="${csrfToken}"><input type="hidden" name="account" value="${escape(row.owner_id)}"><input name="reason" required minlength="3" maxlength="1000" placeholder="停用理由"><button name="action" value="block">停用账号</button></form></details></article>`
  }
  if (!rows.results.length)
    body += '<p>暂无插件。</p>'
  if (rows.results.length > 50)
    body += `<a href="/admin?status=${state}&after=${encodeURIComponent(rows.results[49].name)}">下一页</a>`
  const audit = await env.DB.prepare(
    'SELECT name, actor, action, details, created_at FROM audit ORDER BY id DESC LIMIT 30',
  ).all()
  body += `<details><summary>最近审核与同步记录</summary><pre>${escape(JSON.stringify(audit.results, null, 2))}</pre></details>`
  return html('QuaEngine 插件审核', body)
}
