import { UIEvent } from './events';
import { QuaStore } from 'quastore';

export interface MiddlewareContext {
  store?: QuaStore;
  source: UIEvent; // read-only source event
  final?: UIEvent; // the final ui event
}

export type Middleware = (ctx: MiddlewareContext, next?: Middleware) => void | Promise<void>;
