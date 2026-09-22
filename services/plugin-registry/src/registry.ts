import type { NpmSource } from './npm'
import type { Account, Candidate, Env, Network, PackageRow } from './types'
import { isNpmPackageName } from '@quajs/editor-core'
import { authenticate } from './auth'
import {
  fail,
  hash,
  HttpError,
  ipQuota,
  json,
  jsonBody,
  now,
  quota,
  token,
} from './http'
import officialPackages from './official-packages.json'
import { automaticReview } from './review'

export function isOfficialPackage(name: string) {
  return officialPackages.includes(name)
}
export async function findPackage(
  env: Env,
  name: string,
): Promise<PackageRow | null> {
  return env.DB.prepare('SELECT * FROM packages WHERE name = ?1')
    .bind(name)
    .first<PackageRow>()
}
export async function audit(
  env: Env,
  name: string,
  actor: string,
  action: string,
  details: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit(name, actor, action, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
  )
    .bind(name, actor, action, details.slice(0, 2000), now())
    .run()
}
function packageName(value: unknown): string {
  if (!isNpmPackageName(value))
    fail(400, 'package_name', '请输入完整 npm 包名。')
  return value
}
function status(row: PackageRow) {
  const candidate = JSON.parse(row.candidate_json) as Candidate
  return {
    name: row.name,
    status: row.status,
    version: candidate.version,
    reason: row.reason,
    official:
      row.status === 'approved'
      && Boolean(row.official)
      && isOfficialPackage(row.name),
    updatedAt: row.updated_at,
  }
}
function listing(row: PackageRow) {
  const value = JSON.parse(row.approved_json!) as Candidate
  return {
    name: row.name,
    title: value.title,
    description: value.description,
    tags: [
      value.metadata.runtime ? 'runtime' : '',
      value.metadata.devtools ? 'devtools' : '',
    ].filter(Boolean),
    version: value.version,
    metadata: value.metadata,
    integrity: value.integrity,
    official: Boolean(row.official) && isOfficialPackage(row.name),
    reviewed: true,
    updatedAt: row.updated_at,
  }
}
export async function registryRoute(
  request: Request,
  env: Env,
  npm: NpmSource,
  network: Network = fetch,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const path = url.pathname
  if (request.method === 'GET' && path === '/api/catalog') {
    const query = (url.searchParams.get('q') ?? '').slice(0, 100)
    const after = (url.searchParams.get('after') ?? '').slice(0, 214)
    const rows = await env.DB.prepare(
      `SELECT * FROM packages WHERE status = 'approved' AND approved_json IS NOT NULL AND checked_at > ?1 AND name > ?2 AND (?3 = '' OR instr(lower(name), lower(?3)) > 0 OR instr(lower(approved_json), lower(?3)) > 0) ORDER BY name LIMIT 51`,
    )
      .bind(now() - 7 * 86400, after, query)
      .all<PackageRow>()
    const plugins = rows.results.slice(0, 50).map(listing)
    return json(
      {
        schemaVersion: 1,
        registry: true,
        plugins,
        next: rows.results.length > 50 ? plugins.at(-1)?.name : null,
      },
      200,
      { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
    )
  }
  if (request.method === 'GET' && path === '/api/package') {
    const name = packageName(url.searchParams.get('name'))
    const row = await findPackage(env, name)
    if (
      !row
      || row.status !== 'approved'
      || !row.approved_json
      || row.checked_at <= now() - 7 * 86400
    ) {
      fail(404, 'not_listed', '此包尚未通过 registry 审核，或已暂停展示。')
    }
    return json(listing(row), 200, { 'Cache-Control': 'public, max-age=30' })
  }
  if (request.method === 'GET' && path === '/api/submissions') {
    const account = await authenticate(request, env)
    const rows = await env.DB.prepare(
      'SELECT * FROM packages WHERE owner_id = ?1 ORDER BY name LIMIT 100',
    )
      .bind(account.id)
      .all<PackageRow>()
    return json({ packages: rows.results.map(status) })
  }
  if (
    request.method === 'POST'
    && (path === '/api/claims' || path === '/api/submissions')
  ) {
    await ipQuota(request, env, 'submit', 30)
    const account = await authenticate(request, env)
    await quota(env, `submit:${account.id}`, 15, 86400)
    const body = await jsonBody(request)
    const name = packageName(body.name)
    const existing = await findPackage(env, name)
    if (path === '/api/claims') {
      const claim = token()
      await env.DB.prepare(
        'INSERT INTO claims(name, account_id, hash, expires_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(name, account_id) DO UPDATE SET hash = excluded.hash, expires_at = excluded.expires_at',
      )
        .bind(name, account.id, await hash(claim), now() + 86400)
        .run()
      return json({
        name,
        claim,
        expiresAt: now() + 86400,
        field: 'quajs.registry.claim',
      })
    }
    const claim = await env.DB.prepare(
      'SELECT hash FROM claims WHERE name = ?1 AND account_id = ?2 AND expires_at > ?3',
    )
      .bind(name, account.id, now())
      .first<{ hash: string }>()
    if (!claim && existing?.owner_id === account.id)
      return json({ registered: true, ...status(existing) })
    if (!claim)
      fail(422, 'claim_required', '请先生成认领声明并随 npm 包发布。')
    if (existing?.manual_hold)
      fail(409, 'manual_hold', '此包已被运营暂停，无法通过重新认领解除。')
    const count = await env.DB.prepare(
      'SELECT count(*) AS count FROM packages WHERE owner_id = ?1',
    )
      .bind(account.id)
      .first<{ count: number }>()
    if (count && count.count >= 100 && existing?.owner_id !== account.id)
      fail(429, 'account_limit', '账号已达到 100 个插件的上限。')
    await quota(env, 'npm-submit-daily', 500, 86400)
    const candidate = await npm.fetch(
      name,
      existing ? (JSON.parse(existing.candidate_json) as Candidate) : undefined,
    )
    if (!candidate.claim || (await hash(candidate.claim)) !== claim.hash)
      fail(403, 'ownership', '公开 npm 包的认领声明与当前账号不匹配。')
    const decision = await automaticReview(env, candidate, undefined, network)
    const created = now()
    const approved = decision.status === 'approved'
    const values = [
      name,
      account.id,
      decision.status,
      JSON.stringify(candidate),
      candidate.hash,
      created,
      created + (approved ? 12 * 3600 : 3600),
      approved ? JSON.stringify(candidate) : null,
      approved && isOfficialPackage(name) ? 1 : 0,
      decision.reason,
      JSON.stringify(candidate.maintainers),
    ] as const
    if (existing) {
      const updated = await env.DB.prepare(
        `UPDATE packages SET owner_id = ?2, status = ?3, candidate_json = ?4, review_hash = ?5, checked_at = ?6, updated_at = ?6, next_sync = ?7, approved_json = ?8, official = ?9, reason = ?10, owner_maintainers_json = ?11, revision = revision + 1, lease_until = 0, failures = 0 WHERE name = ?1 AND revision = ?12 AND manual_hold = 0 AND EXISTS (SELECT 1 FROM accounts WHERE id = ?2 AND blocked = 0)`,
      )
        .bind(...values, existing.revision)
        .run()
      if (!updated.meta.changes)
        fail(409, 'stale_claim', '同步期间状态已变化，请重试。')
    }
    else {
      const inserted = await env.DB.prepare(
        `INSERT INTO packages(name, owner_id, status, candidate_json, review_hash, checked_at, next_sync, approved_json, official, reason, owner_maintainers_json, created_at, updated_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?6, ?6 WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?2 AND blocked = 0) AND (SELECT count(*) FROM packages WHERE status = 'pending') < 500 AND (SELECT count(*) FROM packages WHERE status = 'pending' AND owner_id = ?2) < 5
        ON CONFLICT(name) DO NOTHING RETURNING name`,
      )
        .bind(...values)
        .first()
      if (!inserted)
        fail(409, 'queue_full', '包已提交，或审核队列已达到上限。')
    }
    await audit(
      env,
      name,
      account.id,
      existing ? 'reclaim' : 'submit',
      JSON.stringify({
        version: candidate.version,
        integrity: candidate.integrity,
        ...decision,
      }),
    )
    await env.DB.prepare(
      'DELETE FROM claims WHERE name = ?1 AND account_id = ?2',
    )
      .bind(name, account.id)
      .run()
    return json(
      { registered: true, ...status((await findPackage(env, name))!) },
      existing ? 200 : 201,
    )
  }
  return undefined
}
export async function review(
  env: Env,
  account: Account,
  name: string,
  expected: string,
  action: string,
  reason: string,
  official: boolean,
): Promise<void> {
  const row = await findPackage(env, name)
  if (!row || row.review_hash !== expected)
    fail(409, 'stale_review', '候选版本已变化，请刷新后重新审核。')
  if (
    !['approve', 'reject', 'suspend'].includes(action)
    || reason.length < 3
    || reason.length > 1000
  ) {
    fail(400, 'review_action', '请选择审核操作并填写 3–1000 字的理由。')
  }
  if (official && !isOfficialPackage(name))
    fail(400, 'official_allowlist', '官方标识只可授予仓库白名单中的包。')
  if (action === 'approve' && row.checked_at < now() - 86400)
    fail(409, 'stale_candidate', 'npm 校验已过期，请等待下一次同步后审核。')
  const time = now()
  const nextStatus
    = action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : 'suspended'
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE packages SET status = ?1, official = ?2, manual_hold = CASE WHEN ?1 = 'approved' THEN 0 ELSE 1 END, owner_maintainers_json = CASE WHEN ?1 = 'approved' THEN json_extract(candidate_json, '$.maintainers') ELSE owner_maintainers_json END, approved_json = CASE WHEN ?1 = 'approved' THEN candidate_json ELSE approved_json END, reason = ?3, revision = revision + 1, updated_at = ?4 WHERE name = ?5 AND review_hash = ?6 AND revision = ?7`,
    ).bind(
      nextStatus,
      action === 'approve' && official ? 1 : 0,
      reason,
      time,
      name,
      expected,
      row.revision,
    ),
    env.DB.prepare(
      `INSERT INTO audit(name, actor, action, details, created_at) SELECT name, ?1, ?2, ?3, ?4 FROM packages WHERE name = ?5 AND review_hash = ?6 AND revision = ?7 AND updated_at = ?4`,
    ).bind(
      account.id,
      action,
      `${reason}; official=${official}; candidate=${expected}`,
      time,
      name,
      expected,
      row.revision + 1,
    ),
  ])
  const updated = await findPackage(env, name)
  if (updated?.revision !== row.revision + 1 || updated.status !== nextStatus)
    fail(409, 'stale_review', '审核期间状态发生变化，请刷新。')
}
export async function synchronize(
  env: Env,
  npm: NpmSource,
  network: Network = fetch,
): Promise<{ synced: number }> {
  const time = now()
  // Atomic, bounded leases keep overlapping Cron invocations from fetching the same packages.
  const claimed = await env.DB.prepare(
    `UPDATE packages SET lease_until = ?1 WHERE name IN
    (SELECT p.name FROM packages p JOIN accounts a ON a.id = p.owner_id WHERE p.next_sync <= ?2 AND p.lease_until <= ?2 AND a.blocked = 0 ORDER BY p.next_sync LIMIT 20) RETURNING *`,
  )
    .bind(time + 600, time)
    .all<PackageRow>()
  for (const row of claimed.results) {
    try {
      const previous = JSON.parse(row.candidate_json) as Candidate
      const candidate = await npm.fetch(row.name, previous)
      const changed = candidate.hash !== row.review_hash
      const baseline = {
        ...previous,
        maintainers: JSON.parse(row.owner_maintainers_json) as string[],
      }
      const decision = row.manual_hold
        ? { status: row.status, reason: row.reason, policy: 'manual-hold' }
        : await automaticReview(env, candidate, baseline, network)
      const autoApprove = decision.status === 'approved'
      const updated = await env.DB.prepare(
        `UPDATE packages SET candidate_json = ?1, review_hash = ?2, status = ?3, approved_json = CASE WHEN ?4 = 1 THEN ?1 ELSE approved_json END, official = ?10,
        reason = ?5, checked_at = ?6, next_sync = ?7, lease_until = 0, failures = 0, updated_at = ?6, revision = revision + 1 WHERE name = ?8 AND revision = ?9`,
      )
        .bind(
          JSON.stringify(candidate),
          candidate.hash,
          decision.status,
          autoApprove ? 1 : 0,
          decision.reason,
          now(),
          now() + (autoApprove ? 12 * 3600 : 3600),
          row.name,
          row.revision,
          autoApprove && isOfficialPackage(row.name) ? 1 : 0,
        )
        .run()
      if (updated.meta.changes && (changed || row.status !== decision.status)) {
        await audit(
          env,
          row.name,
          'cron',
          autoApprove ? 'sync-approved' : 'sync-review',
          JSON.stringify({
            from: previous.version,
            to: candidate.version,
            hash: candidate.hash,
            ...decision,
          }),
        )
      }
    }
    catch (error) {
      const invalid = error instanceof HttpError && error.status === 422
      const message = error instanceof Error ? error.message : 'npm 同步失败。'
      const updated = await env.DB.prepare(
        `UPDATE packages SET status = CASE WHEN ?1 = 1 THEN 'suspended' ELSE status END, official = CASE WHEN ?1 = 1 THEN 0 ELSE official END, reason = ?2, next_sync = ?3, lease_until = 0, failures = failures + 1, revision = revision + 1 WHERE name = ?4 AND revision = ?5`,
      )
        .bind(
          invalid ? 1 : 0,
          message.slice(0, 1000),
          now() + Math.min(86400, 900 * 2 ** Math.min(row.failures, 6)),
          row.name,
          row.revision,
        )
        .run()
      if (updated.meta.changes && invalid)
        await audit(env, row.name, 'cron', 'suspend-invalid', message)
    }
    finally {
      await env.DB.prepare(
        'UPDATE packages SET lease_until = 0 WHERE name = ?1 AND lease_until = ?2',
      )
        .bind(row.name, time + 600)
        .run()
    }
  }
  await env.DB.batch([
    ...[
      'sessions',
      'oauth_states',
      'devices',
      'claims',
      'quotas',
      'review_cache',
    ].map(table =>
      env.DB.prepare(`DELETE FROM ${table} WHERE expires_at <= ?1`).bind(time),
    ),
    env.DB.prepare('DELETE FROM audit WHERE created_at < ?1').bind(
      time - 180 * 86400,
    ),
  ])
  return { synced: claimed.results.length }
}
