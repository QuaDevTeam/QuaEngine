PRAGMA foreign_keys = ON;
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, login TEXT NOT NULL, created_at INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1))
);
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('browser', 'editor')), expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_states (
  hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL,
  device_code TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE devices (
  hash TEXT PRIMARY KEY, user_code TEXT NOT NULL UNIQUE, account_id TEXT REFERENCES accounts(id),
  expires_at INTEGER NOT NULL, approved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX devices_expiry ON devices(expires_at);
CREATE TABLE claims (
  name TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
  hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (name, account_id)
);
CREATE TABLE packages (
  name TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  official INTEGER NOT NULL DEFAULT 0 CHECK (official IN (0, 1)),
  manual_hold INTEGER NOT NULL DEFAULT 0 CHECK (manual_hold IN (0, 1)),
  approved_json TEXT, candidate_json TEXT NOT NULL, owner_maintainers_json TEXT NOT NULL,
  review_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '', checked_at INTEGER NOT NULL,
  next_sync INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX packages_sync ON packages(next_sync, lease_until);
CREATE INDEX packages_status ON packages(status, name);
CREATE INDEX packages_owner ON packages(owner_id, status);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_name ON audit(name, id);
CREATE TABLE quotas (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX quotas_expiry ON quotas(expires_at);

CREATE TABLE review_cache (
  key TEXT PRIMARY KEY, result_json TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX review_cache_expiry ON review_cache(expires_at);
