# @quajs/store-cocos

The Cocos file backend persists QuaStore snapshots, slot indexes/payloads and preview records through the injected CocosHost storage API. Use the concrete Creator runtime bridge for durable native files or preview IndexedDB; memory-only fake hosts are for tests.

Await transactions; nested or overlapping transactions reject. A readwrite transaction keeps before-images of only touched files in `qua-store/transaction-backups`, retaining paths rather than all save contents in memory. On an action failure it restores overwritten/deleted records and removes new records. Backups are removed after successful commit or rollback; failed rollback retains its backup files for recovery. This is best-effort file rollback, not crash-atomic multi-file storage.

Run `pnpm --filter @quajs/store-cocos test -- --run`, `typecheck` and `build`. The demo native lifecycle and full parity commands exercise real persistence, large saves and process restart.
