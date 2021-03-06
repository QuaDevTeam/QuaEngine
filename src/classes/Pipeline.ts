import { UIEvent } from '../types/events';
import { Middleware, MiddlewareContext } from '../types/pipeline';
import { QuaStore } from '@quajs/store';
import { compose } from '../utils/compose';

export default class Pipeline {
  private composed: Middleware | null;
  private store?: QuaStore;

  public constructor(middlewares: Middleware[] | undefined, store?: QuaStore) {
    this.store = store;
    this.composed = Array.isArray(middlewares) ? compose(middlewares) : null;
  }

  public async handle(source: UIEvent): Promise<UIEvent | null> {
    const ctx: MiddlewareContext = {
      store: this.store,
      source: Object.freeze(source),
    };
    if (!this.composed) {
      return source;
    }
    await this.composed!(ctx);
    return ctx.final || null;
  }
}
