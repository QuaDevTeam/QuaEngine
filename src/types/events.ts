import { Emitter, EventType, Handler } from 'mitt';

const PassToPipelineEventType = '<UIEVENT>';

export type ScopeEvent = Record<EventType, unknown>;
export type UIEvent = Record<EventType, unknown>;
