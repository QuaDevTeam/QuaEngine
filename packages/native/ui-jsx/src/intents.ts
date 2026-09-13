import type { QuiIntent } from './types'

function makeIntent(
  event: QuiIntent['event'],
  action?: string,
  choiceId?: string,
  metadata?: QuiIntent['metadata'],
): QuiIntent {
  return { __quiIntent: true, event, action, choiceId, metadata }
}

/**
 * Actions for the `ui` namespace (screen / overlay navigation).
 * Pass the result to a component's `action` prop.
 *
 * The navigation target travels in `metadata.arg0`: the canonical payload
 * fields `action` / `choiceId` / `elementId` are reserved and any metadata key
 * colliding with them is dropped by the native renderer bridge.
 */
export const ui = {
  open: (target: string): QuiIntent =>
    makeIntent('ui/intent', 'open', undefined, { arg0: target }),

  close: (target: string): QuiIntent =>
    makeIntent('ui/intent', 'close', undefined, { arg0: target }),

  block: (target: string): QuiIntent =>
    makeIntent('ui/intent', 'block', undefined, { arg0: target }),

  back: (): QuiIntent =>
    makeIntent('ui/intent', 'back'),

  toggle: (target: string): QuiIntent =>
    makeIntent('ui/intent', 'toggle', undefined, { arg0: target }),

  confirm: (target: string): QuiIntent =>
    makeIntent('ui/intent', 'confirm', undefined, { arg0: target }),
} as const

/**
 * Actions for the `choice` namespace (story-graph choices).
 */
export const choice = {
  select: (choiceId: string): QuiIntent =>
    makeIntent('choice/select', undefined, choiceId),
} as const

/**
 * Actions for the `save` namespace.
 */
export const save = {
  select: (slotId: string): QuiIntent =>
    makeIntent('ui/intent', 'save.select', undefined, { arg0: slotId }),

  delete: (slotId: string): QuiIntent =>
    makeIntent('ui/intent', 'save.delete', undefined, { arg0: slotId }),
} as const

/**
 * Actions for the `settings` namespace.
 */
export const settings = {
  open: (): QuiIntent =>
    makeIntent('ui/intent', 'settings/open'),

  close: (): QuiIntent =>
    makeIntent('ui/intent', 'settings/close'),

  /** Set a setting value by id and numeric index. */
  set: (settingId: string, index: number): QuiIntent =>
    makeIntent('ui/intent', 'settings/set', undefined, { arg0: settingId, value: index }),
} as const

/** Type-guard to distinguish QuiIntent objects from other values. */
export function isQuiIntent(value: unknown): value is QuiIntent {
  return (
    typeof value === 'object'
    && value !== null
    && (value as QuiIntent).__quiIntent === true
  )
}
