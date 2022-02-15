import mitt, { Emitter } from 'mitt';
import { QuaStore, QuaStoreManager, useStore } from 'quastore';
import Pipeline from './Pipeline';
import { ScopeEvent, ScopeEvents, UIEvents, ScopeToPipelineEventName, UIEvent } from '../types';
import { QuaEngineOpts } from '../types/engine';

export default class QuaEngine {
  public pipeline: Pipeline;
  public store?: QuaStore;

  private bus: {
    engine: Emitter<ScopeEvents>;
    ui: Emitter<UIEvents>;
  };

  public constructor(opts: QuaEngineOpts) {
    this.bus = {
      engine: mitt<ScopeEvents>(),
      ui: mitt<UIEvents>(),
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
    } else if (opts.store) {
      this.store = QuaStoreManager.createStore(opts.store);
    }
    // init pipeline
    this.pipeline = new Pipeline(opts.middlewares, this.store);
    // mount internal event handler
    this.bus.engine.on<keyof ScopeEvents>(ScopeToPipelineEventName, this.passToPipeline);
  }

  private async passToPipeline(e: ScopeEvent) {
    const sourceEvent: UIEvent = {
      scope: e.scope,
    };
    const finalEvent = await this.pipeline.handle(sourceEvent);
    if (!finalEvent) {
      return;
    }
    this.bus.ui.emit(e.scopeName, finalEvent);
  }
}
