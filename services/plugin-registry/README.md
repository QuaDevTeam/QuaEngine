# QuaEngine Plugin Registry

Cloudflare Workers + D1 service for `https://registry.quaengine.com`. npm remains
the package/version/tarball distributor. Registry stores verified listings,
publisher ownership, review decisions and synchronization state. It never executes
or republishes submitted packages and never receives an npm credential.

## Publisher workflow

1. Declare `package.json.quajs.extension` schema 1 with `runtime`, `devtools`, or
   both. See [the plugin contract](../../docs/design/editor-plugins.md).
2. Open that package directory directly in QuaEngine Editor → 插件 → 发布.
   A game project manifest is not required. Log into Registry using GitHub.
3. Generate a claim. The editor creates an undoable `package.json` draft at
   `quajs.registry.claim`; save it, build your plugin, and log into npm locally.
4. **打包并检查文件** creates a staged npm/pnpm tarball without lifecycle scripts.
   Check its exact name/version, file list and SHA-512. **发布 … 到 npm** publishes
   that same artifact; optional npm OTP stays in the main process only for that
   operation. Changes to package.json require packing again. Cancelling a publish
   may race npm accepting it: inspect npm before retrying. Artifacts are removed
   on re-pack, project switch, successful publication and editor shutdown.
5. Submit the already published npm `latest` package. A matching 24-hour claim in
   the actual tarball proves npm publishing rights without sharing an npm token.
   Claims are consumed on registration. A package has one registry row; ordinary
   updates never require registration again. Pre-releases publish under `next`;
   Registry follows `latest`, so promote a stable release before submitting.

GitHub login uses a browser-bound OAuth state, PKCE and explicit device approval.
Accounts must be at least seven days old. The server stores hashes of editor
sessions; Electron stores the bearer credential using OS-backed `safeStorage`,
scoped to the registry origin. The UI only receives account/display data. GitHub
access tokens are used for the login request and are not retained. Loss of secure
OS storage disables editor login rather than falling back to plaintext.

## Automatic review and sync

`REVIEW_MODE=system` is the default, requiring no reviewer account or AI key.
Checks require a public, non-deprecated npm package with an explicit extension
manifest, valid runtime/devtools entrypoints, ESM/API 1 devtools, SHA-512 integrity,
and agreement between npm metadata and the actual tarball. Metadata and archives
have hard byte/time/file-count limits; links, unsafe paths, duplicate files and
install hooks are rejected. Static rules quarantine credential files/access,
native executables, dynamic process/eval code and oversized scripts. A clean
package becomes visible immediately. A flagged package remains hidden and the
publisher sees the reason; fix it in a new npm version for automatic re-review.

Optional `REVIEW_MODE=jev` adds TypeSafe System One Noul checks for spam, harmful
behavior and QuaEngine relevance. Set `TYPESAFE_API_KEY` as a Worker secret.
`TYPESAFE_MODEL` defaults to `jev-latest`; `JEV_DAILY_LIMIT` defaults to 100 calls
and is enforced atomically in D1 **before** a call, including failed calls. Send
bounded public metadata and at most 12,000 source characters. Package text is
untrusted evidence. Responses must contain valid typed probabilities, model and
usage. Approve only when spam/harmful ≤ 0.1 and relevance ≥ 0.9; uncertainty,
malformed responses, outages, missing keys or exhausted budget stay hidden.
Decisions cache for seven days (failures for 15 minutes), with model, probabilities
and usage in the audit log. These initial thresholds need labeled real-package
calibration. Tests use deterministic API fixtures, not paid/live Jev inference.

Cron runs every 15 minutes, leases at most 20 due packages, and normally checks
each package every 12 hours. Pending reviews retry hourly; transient npm failures
back off from 15 minutes to 24 hours. Changed releases are re-inspected and reviewed;
immutable unchanged archives reuse their verified scan. Current npm maintainers
come from the package document, separately from the version document. A maintainer
change remains quarantined across subsequent syncs until a fresh published claim
proves publishing rights. A newly proven publisher can reclaim the existing row.
Removed, deprecated or invalid packages are suspended; valid corrected releases
can recover automatically. Operational holds cannot be cleared by re-registration.
Listings become unavailable after seven days without a successful npm check.

Static rules and Jev are screening, **not a malware guarantee or execution sandbox**.
They do not audit the full transitive dependency graph or prove runtime behavior.
Installing still uses package-manager integrity/trust policies and disables scripts;
editor devtools/indexers are executable code with the user's privileges. Runtime
QPK verification and engine/renderer ownership are separate systems.

Official badges derive only from the exact server-owned
[`official-packages.json`](src/official-packages.json) allowlist after verification.
An `@quajs` prefix, npm `official` field or custom JSON catalog cannot grant a badge.
The built-in character browser is also marked official. Keep this list reviewed in
Git; new official packages must explicitly declare the extension schema and pass
normal npm ownership checks. A listing does not publish a local workspace package.

## Abuse limits and operations

- Cloudflare Rate Limiting binding: 120 requests/minute/IP per location before D1.
  Keys are salted and rotate daily. This is an approximate edge throttle, not a
  global budget; strict account/provider quotas are stored atomically in D1.
- Auth/device/claim routes also have hourly IP limits. Claim/submission: 15/day per
  account, 100 owned packages/account, at most 5 pending packages/account and 500
  globally. npm submission checks have a global 500/day budget. Requests are bounded
  to 8 KiB, npm metadata to 512 KiB (package ownership document 4 MiB), compressed
  tarballs to 8 MiB, expanded archives to 32 MiB / 10,000 entries.
- Network destinations are fixed to GitHub, public npm and TypeSafe. Cloudflare
  uses `redirect: manual` and rejects non-success responses. Tarball URLs must be
  HTTPS on `registry.npmjs.org`. No user-supplied fetch URL or remote code execution.
- Optional `/admin` is an exception/incident console. `ADMIN_GITHUB_IDS` accepts
  immutable numeric GitHub account IDs. Leave `[]` for automatic-only operation.
  Authorized operators can approve, reject, suspend or block an account and revoke
  its sessions; mutations require browser session, Origin and CSRF checks. Decisions
  use revision/candidate checks to prevent stale review overwrites. Manual suspension
  and rejection persist across syncs. Audit retention is 180 days.
- Monitor 429/5xx, cron backlog and candidate reasons in Worker logs/D1. Workers Paid
  is recommended for scheduled inspection CPU/subrequest limits. Batch capacity is
  1,920 checks/day at the configured cron cadence (up to 960 normal twice-daily
  packages before retries); scale batching/Queues when growing beyond this budget.
  Configure account billing alerts and zone WAF rules for distributed attack traffic.

## Deploy

The checked-in configuration targets `registry.quaengine.com` in the Alkinum
Cloudflare account and binds the provisioned `qua-plugin-registry` D1 database.
Normal deployment requires a GitHub OAuth client and all required Worker secrets.
An explicit `--catalog-only` deployment is supported during initial provisioning: it
requires an empty client ID, serves the catalog, and fails closed with HTTP 503 for
login/device authorization and registration. `/health.registrationReady` exposes
this state without exposing credentials.
No Cloudflare resource, public npm release or paid AI call is created by local tests.

Production check (2026-09-21 UTC): version
`1fa1a22b-0fd6-40f9-927a-5216f8004db1` is live with the configured GitHub OAuth
client and `GITHUB_CLIENT_SECRET` stored as a Cloudflare secret. HTTPS `/health`
returned `registrationReady: true`; catalog and device-start returned 200, device
polling returned 202 pending, login redirected to GitHub with the expected callback,
read:user scope and S256 PKCE. A synthetic invalid authorization code exercised the
live Worker → GitHub callback exchange and correctly returned 401 without a session.
This verifies deployment and OAuth wiring, not a completed real-user authorization.
Remote D1 migration `0001_registry.sql`, custom domain, 15-minute Cron, rate limiter
and ABUSE_SECRET are configured. No packages are registered yet; system review is
active and Jev is not enabled.

From this directory, using Wrangler 4.135.0:

```sh
# The configured D1 already exists. Create a new database only for another environment:
# npx --yes wrangler@4.135.0 d1 create qua-plugin-registry
# Put its database_id and account_id in wrangler.jsonc.
# Create a GitHub OAuth App:
# homepage https://registry.quaengine.com
# callback https://registry.quaengine.com/oauth/callback
# Put its client ID in wrangler.jsonc vars.GITHUB_CLIENT_ID.
# Store secrets in a private, ignored JSON file (mode 0600), never in wrangler.jsonc:
# { "ABUSE_SECRET": "at least 32 random characters", "GITHUB_CLIENT_SECRET": "..." }
# Add TYPESAFE_API_KEY only if enabling REVIEW_MODE=jev.
REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs
# Secrets upload atomically with the Worker version; omitted existing secrets are retained.
# Later deployments can omit REGISTRY_SECRETS_FILE when required secrets already exist.
# Initial catalog-only provisioning, while GITHUB_CLIENT_ID is empty:
# REGISTRY_SECRETS_FILE=/absolute/path/to/private-secrets.json node scripts/deploy.mjs --catalog-only
```

Use an available rate-limit namespace ID in your Cloudflare account; `1001` is the
checked-in default, verified unused by existing account bindings during provisioning.
The deploy script checks configuration and required secret names, applies remote D1
migrations, then deploys the custom-domain Worker and Cron Trigger. The JSON secrets
file accepts only ABUSE_SECRET, GITHUB_CLIENT_SECRET and TYPESAFE_API_KEY; Client ID
belongs in vars. Do not rotate ABUSE_SECRET during routine redeployment. DNS/zone ownership
and Cloudflare credentials must already exist. Keep secrets out of Git and the UI.
The GitHub OAuth App must be registered through GitHub Developer settings; `gh` has
no OAuth App creation command or corresponding public API. No npm or GitHub CLI
authentication token can replace the app client secret.

After deployment check `/health`, `/api/catalog`, a complete GitHub device login,
one real npm registration and a scheduled sync. Verify live provider behavior
separately if enabling Jev.

Editor defaults to the production origin. **目录源** can select another HTTPS
Registry; a custom JSON discovery catalog is also supported, but installation must
still pass the selected Registry's review. `QUA_EDITOR_PLUGIN_REGISTRY` is the
host-level development override; empty disables the service for standalone local
catalog fixtures, and HTTP is accepted only for loopback in that host override.

## Validation

Build `@quajs/editor-core` first. `pnpm --filter @quajs/plugin-registry test`,
`typecheck`, and `build` run Node policy tests, TS checks and a Wrangler dry-run.
`node scripts/workerd-smoke.mjs` additionally exercises **real workerd + D1** with
fixture npm HTTP responses and real SHA-512/gzip/tar data: registration, review,
catalog, scheduled version update and withdrawal. It uses Miniflare bundled with
Wrangler; set `REGISTRY_TOOLING_PACKAGE` to the absolute package.json of an isolated
installation containing `wrangler@4.135.0` (default repository
`.codex-tmp/registry-tooling/package.json`).

Editor checks: core/character/Electron tests and typechecks, UI/Electron builds,
`marketplace-smoke.mjs`, `publishing-smoke.mjs`, `character-plugin-smoke.mjs`.
Publishing tests create actual npm **and pnpm** artifacts with malicious lifecycle
fixtures suppressed. They do not call public `npm publish`. Electron smoke tests
check the visible publication preview, not npm ownership of a real account.
