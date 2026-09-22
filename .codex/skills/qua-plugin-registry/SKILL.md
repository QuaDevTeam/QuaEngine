---
name: qua-plugin-registry
description: Develop the Cloudflare Workers and D1 plugin registry, npm publisher verification, automatic system or TypeSafe Jev review, official badges, abuse controls and cron sync.
---

# QuaEngine Plugin Registry

Read `services/plugin-registry/README.md` and use `qua-editor-marketplace` for editor
integration. Read the TypeSafe skill and current System One docs when changing Jev.

- Domain is registry.quaengine.com. Workers + D1 hold metadata and review state;
  npm owns published package distribution. Accept only public npm packages with
  explicit schema-1 quajs.extension and runtime, devtools or both. This is authoring
  tooling, not a Runtime QPK loader, engine plugin activation or renderer state bus.
- Require a fresh random ownership claim published in the actual npm tarball once.
  GitHub device OAuth authenticates the registry account, not npm ownership. Keep
  npm credentials local to authors; never request/store them. Hash sessions/claims;
  use browser-bound OAuth state/PKCE, Origin/CSRF and explicit device approval.
- Reuse one package row. Cron leases bounded due work, validates new archives, applies
  automatic review and expires stale listings. Preserve the last proven maintainer
  baseline; a change must remain quarantined across syncs until fresh publishing proof.
  Manual holds survive sync/reclaim. Compare revisions to avoid stale review writes.
- System review is default and requires no human queue. Optional Jev consumes bounded
  public evidence, with untrusted-input instructions, typed Noul validation, deterministic
  policy thresholds, global reserved daily quota, response cache, audit model/probability/
  usage and fail-closed uncertainty/outage handling. No model verdict bypasses structural,
  identity, ownership or deterministic flags. Describe screening limits accurately.
- Bound bodies, metadata, tarball and expanded sizes, file counts, code excerpts and
  network time. Inspect archives without extraction/execution; verify SHA-512 and
  metadata/manifest/claim agreement. Allow npm tarball origin only. Workers require
  redirect: manual plus success checks and properly bound fetch; Node tests alone do
  not establish workerd compatibility. Never execute submitted code or lifecycle hooks.
- Fast edge throttling precedes D1; strict account/provider/global budgets live in D1.
  Namespace IDs are account configuration. Keep no raw IPs in persisted quota keys.
  Optional admin allowlist uses immutable GitHub IDs and is incident tooling, not a
  required author-review step. Blocked-account packages must remain held.
- Official status comes from src/official-packages.json exact allowlist after normal
  verification, never npm-authored fields, broad scope matching or custom JSON.
  Official feature packages declare runtime entry '.'; core target packages stay excluded.
- Editor publication is explicit staged npm/pnpm packing + file/hash preview + publish
  action. Registration retry must not republish. Do not live-publish during validation.
- Update service README, metadata docs and relevant skills alongside user-facing changes.
  No new QuaScript decorator, runtime API or engine/renderer state owner belongs here.

Validation: build editor-core, service typecheck/tests/Workers dry-run, then run real
workerd + D1 smoke with bounded fixture npm upstreams. Test claims, automatic review,
maintainer quarantine/reclaim, manual hold, withdrawal, quotas and Jev malformed/outage/
budget behavior. Run editor npm/pnpm packing tests and Electron publication/marketplace
smokes for integration. Record live deployment, npm publication and real Jev inference
separately; fixture success does not establish them. Deployment requires real D1 ID,
GitHub OAuth configuration and Worker secrets, using scripts/deploy.mjs.

## Cloudflare provisioning

- The production config binds Alkinum / qua-plugin-registry D1 and the custom domain.
  Inspect current Wrangler auth, domain and existing database before creating resources.
  Do not create duplicate databases or rotate existing ABUSE_SECRET on repeat setup.
- `scripts/deploy.mjs` checks required secrets and applies migrations before deployment.
  An ignored, mode-0600 JSON `REGISTRY_SECRETS_FILE` may supply only ABUSE_SECRET,
  GITHUB_CLIENT_SECRET and optional TYPESAFE_API_KEY, uploaded with the Worker version.
  Client ID is a public var. Never print credentials or copy gh's token as an app secret.
- While OAuth is unavailable, explicit `--catalog-only` requires an empty Client ID.
  Public catalog remains available; authenticated routes and device/login flows return
  oauth_not_configured / HTTP 503. Health exposes registrationReady and homepage omits
  the unavailable login link. Ordinary deploy still requires valid OAuth configuration.
- OAuth App creation requires the GitHub settings UI; gh does not expose creation.
  Complete available Cloudflare provisioning before reporting that external prerequisite.
  Verify HTTPS health/catalog, private-route status, remote D1 tables and Cron binding;
  distinguish deployed catalog from a working publisher registration flow.
