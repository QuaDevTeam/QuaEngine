import type { DecoratorLanguageContribution } from '@quajs/plugin-discovery'

/** DSL signatures, deliberately separate from engine methods and injected runtime arguments. */
const signatures: Record<string, [string, ...string[]]> = {
  Choice: ['Show a choice; an omitted target records the selection without jumping.', 'text', 'target?', 'options?'],
  SaveToSlot: ['Save the current game to a slot.', 'slotId', 'metadata?', 'options?'],
  LoadFromSlot: ['Restore a slot and end the current step.', 'slotId', 'options?'],
  QuickSave: ['Save to the quick-save slot.', 'metadata?', 'options?'],
  QuickLoad: ['Restore the quick-save slot and end the current step.'],
  AutoSave: ['Save to the automatic slot.', 'metadata?', 'options?'],
  FlowControl: ['Set narrative flow policy.', 'policy'],
  FlowControlPolicy: ['Set narrative flow policy.', 'policy'],
  ResetFlowControlPolicy: ['Restore the default narrative flow policy.'],
  Skippable: ['Allow or disallow skipping.', 'value?'],
  NoSkip: ['Disallow skipping.'],
  Forwardable: ['Allow or disallow forwarding.', 'value?'],
  NoForward: ['Disallow forwarding.'],
  AutoAdvanceable: ['Allow or disallow automatic advance.', 'value?'],
  NoAutoAdvance: ['Disallow automatic advance.'],
  RollbackAnchor: ['Create a rollback anchor.', 'reason?', 'options?'],
  RollbackBoundary: ['Mark a rollback boundary.', 'reason?', 'options?'],
  FixRollback: ['Fix the current rollback history.', 'options?'],
  NoRollback: ['Prevent rollback across this point.'],
}

export const builtinDecoratorLanguage: Record<string, DecoratorLanguageContribution> = Object.fromEntries(
  Object.entries(signatures).map(([name, [description, ...parameters]]) => [name, {
    description,
    args: parameters.map(name => ({ name })),
  }]),
)
