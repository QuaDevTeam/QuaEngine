import type { QuaPluginMetadata } from '@quajs/editor-core'

/** Structural subset of Cloudflare D1; no Node API enters the worker. */
export interface Statement {
  bind: (...values: (string | number | null)[]) => Statement
  first: <T = Record<string, unknown>>() => Promise<T | null>
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
  run: () => Promise<{ meta: { changes: number } }>
}
export interface Database {
  prepare: (sql: string) => Statement
  batch: (statements: Statement[]) => Promise<unknown[]>
}
export interface Env {
  REQUEST_LIMITER?: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>
  }
  DB: Database
  PUBLIC_ORIGIN: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ABUSE_SECRET: string
  ADMIN_GITHUB_IDS: string
  REVIEW_MODE?: 'system' | 'jev'
  TYPESAFE_API_KEY?: string
  TYPESAFE_MODEL?: string
  JEV_DAILY_LIMIT?: string
}
export interface Account {
  id: string
  login: string
  created_at: number
  blocked: number
}
export interface Candidate {
  scan: {
    flags: string[]
    evidence: { path: string, text: string }[]
    truncated: boolean
  }
  name: string
  version: string
  title: string
  description: string
  metadata: QuaPluginMetadata
  integrity: string
  tarball: string
  maintainers: string[]
  capabilityHash: string
  hash: string
  claim: string
}
export interface PackageRow {
  name: string
  owner_id: string
  owner_maintainers_json: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  official: number
  manual_hold: number
  approved_json: string | null
  candidate_json: string
  review_hash: string
  revision: number
  reason: string
  checked_at: number
  next_sync: number
  lease_until: number
  failures: number
  created_at: number
  updated_at: number
}
export type Network = typeof fetch
