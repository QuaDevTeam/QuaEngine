import mitt, { Emitter } from 'mitt';
import { QuaStore, QuaStoreManager, useStore } from 'quastore';
import Pipeline from './Pipeline';
import { ScopeEvent, UIEvent } from '../types';
import { QuaEngineOpts } from '../types/engine';

export default class QuaEngine {
  private bus: {
    engine: Emitter<ScopeEvent>;
    ui: Emitter<UIEvent>;
  };
  public pipeline: Pipeline;
  public store: QuaStore;

  public constructor(opts: QuaEngineOpts) {
    this.bus = {
      engine: mitt<ScopeEvent>(),
      ui: mitt<UIEvent>(),
    };
    // init quastore
    if (opts.store instanceof QuaStore) {
      this.store = opts.store;
    } else if (typeof opts.store === 'string') {
      const store = useStore(opts.store);
      if (!store) {
        throw new Error(`Cannot find the store named "${opts.store}".`);
      }
      this.store = store;
    } else {
      this.store = QuaStoreManager.createStore(opts.store);
    }
    this.pipeline = new Pipeline(opts.middlewares, this.store);
  }
};
