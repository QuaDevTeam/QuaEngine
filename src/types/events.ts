import { EventType } from 'mitt';

export const ScopeToPipelineEventName = '<UIEVENT>';

export interface Scope {
  [objName: string]: Scope;
}

export interface ScopeEvent {
  scopeName: string;
  scope: Scope;
}

export interface UIEvent {
  scope: Scope;
}

export type ScopeEvents = Record<EventType, ScopeEvent>;
export type UIEvents = Record<EventType, UIEvent>;
