import { ScopeEvent } from './events';
import { QuaStore } from 'quastore';

export type MiddleWare = (store: QuaStore, source: ScopeEvent) => ScopeEvent;