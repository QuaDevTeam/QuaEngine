import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const config = JSON.parse(
  await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
)
const origin = new URL(config.vars.PUBLIC_ORIGIN)
const catalogOnly = process.argv.slice(2).includes('--catalog-only')
if (process.argv.slice(2).some(argument => argument !== '--catalog-only')) {
  throw new Error(
    'Only --catalog-only is supported. Use REGISTRY_SECRETS_FILE for a private JSON secrets file.',
  )
}
const hasClient = Boolean(
  config.vars.GITHUB_CLIENT_ID
  && config.vars.GITHUB_CLIENT_ID !== 'CONFIGURE_BEFORE_DEPLOY',
)
if (
  origin.protocol !== 'https:'
  || origin.hostname.endsWith('.invalid')
  || (!catalogOnly && !hasClient)
  || (catalogOnly && hasClient)
  || !/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id)
) {
  throw new Error(
    'Configure PUBLIC_ORIGIN, D1 database_id and GitHub OAuth client. --catalog-only requires an empty OAuth client and leaves login/registration unavailable.',
  )
}
function invoke(args, capture = false, allowMissingWorker = false) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'wrangler@4.135.0', ...args],
    {
      cwd: new URL('../', import.meta.url),
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )
  if (
    result.status !== 0
    && allowMissingWorker
    && /10007/.test(`${result.stdout}${result.stderr}`)
  ) {
    return '[]'
  }
  if (result.status !== 0)
    throw new Error(`Wrangler failed (${result.status})`)
  return result.stdout
}
const secretsFile = process.env.REGISTRY_SECRETS_FILE
  ? resolve(process.env.REGISTRY_SECRETS_FILE)
  : undefined
let secrets = {}
if (secretsFile) {
  try {
    secrets = JSON.parse(await readFile(secretsFile, 'utf8'))
  }
  catch {
    throw new Error(
      'REGISTRY_SECRETS_FILE must point to a valid private JSON file.',
    )
  }
  if (
    !secrets
    || Array.isArray(secrets)
    || typeof secrets !== 'object'
    || Object.entries(secrets).some(
      ([key, value]) =>
        !['ABUSE_SECRET', 'GITHUB_CLIENT_SECRET', 'TYPESAFE_API_KEY'].includes(
          key,
        )
        || typeof value !== 'string'
        || !value.trim(),
    )
  ) {
    throw new Error(
      'Secrets file may contain only non-empty ABUSE_SECRET, GITHUB_CLIENT_SECRET and TYPESAFE_API_KEY values. Client ID belongs in wrangler vars.',
    )
  }
  if (secrets.ABUSE_SECRET && secrets.ABUSE_SECRET.length < 32)
    throw new Error('ABUSE_SECRET must contain at least 32 random characters.')
}
const required = [
  'ABUSE_SECRET',
  ...(!catalogOnly ? ['GITHUB_CLIENT_SECRET'] : []),
  ...(config.vars.REVIEW_MODE === 'jev' ? ['TYPESAFE_API_KEY'] : []),
]
const missing = required.filter(name => !secrets[name])
if (missing.length) {
  const remote = JSON.parse(invoke(['secret', 'list'], true, true))
  const unavailable = missing.filter(
    name => !remote.some(secret => secret.name === name),
  )
  if (unavailable.length) {
    throw new Error(
      `Missing Worker secrets: ${unavailable.join(', ')}. Supply REGISTRY_SECRETS_FILE.`,
    )
  }
}
if (catalogOnly) {
  process.stdout.write(
    'Deploying catalog only: GitHub login and plugin registration will return 503 until OAuth is configured.\n',
  )
}
invoke(['d1', 'migrations', 'apply', 'qua-plugin-registry', '--remote'])
invoke([
  'deploy',
  '--no-autoconfig',
  ...(secretsFile ? ['--secrets-file', secretsFile] : []),
])
