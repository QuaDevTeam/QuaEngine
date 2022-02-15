import { UIEvent } from '../types/events';
import { Middleware, MiddlewareContext } from '../types/pipeline';
import { QuaStore } from 'quastore';
import { compose } from '../utils/compose';

export default class Pipeline {
  private composed: Middleware | null;
  private store?: QuaStore;

  public constructor(middlewares: Middleware[] | undefined, store?: QuaStore) {
    this.store = store;
    this.composed = Array.isArray(middlewares) ? compose(middlewares) : null;
  }

  public async handle(source: UIEvent): Promise<UIEvent | null> {
    const ctx = {
      store: this.store,
      source: Object.freeze(source),
    };
    const finalEvent = await new Promise<UIEvent | null>((resolve, reject) => {
      if (!this.composed) {
        resolve(source);
      }
      this.composed!(ctx, (ctx: MiddlewareContext) => {
        resolve(ctx.final || null);
      });
    });
    return finalEvent;
  }
}
