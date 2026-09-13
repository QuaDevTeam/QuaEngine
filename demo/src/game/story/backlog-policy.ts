import type { BacklogEntry } from '@quajs/plugin-backlog'

/** This linear demo replays the current authored step when closing a menu or loading.
 * Keep its existing tail entry; identical words at a different step still get recorded.
 * This filter runs in the backlog plugin, never in the displayed history.
 */
export function shouldRecordDemoBacklog(entry: BacklogEntry, previous?: BacklogEntry): boolean {
  if (!entry.point?.stepId || !previous?.point?.stepId) return true
  const pointKey = (item: BacklogEntry) => JSON.stringify(Object.entries(item.point!).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
  const contentKey = (item: BacklogEntry) => JSON.stringify([
    item.kind, item.speaker, item.text, item.choices, item.voice,
    item.requiredRuntimePackages, item.rewindable, item.voiceReplay, item.tags,
  ])
  return pointKey(entry) !== pointKey(previous) || contentKey(entry) !== contentKey(previous)
}
