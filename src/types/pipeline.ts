import { UIEvent } from './events';
import { QuaStore } from 'quastore';

export type MiddleWare = (store: QuaStore, source: UIEvent) => UIEvent;