import { QuaManager, useStore, QuaStore } from 'quastore';
import mitt from 'mitt';
import { Emitter, EventType, Handler } from 'mitt';

const EventToPipelineType = "<UIEVENT>"

type ScopeEvent = Record<EventType, unknown>;
type UIEvent = Record<EventType, unknown>;

class Pipeline {
    handler(event: ScopeEvent) {

    }
}

class QuaEngine {
    private engineBus: Emitter<ScopeEvent>;
    uiBus: Emitter<UIEvent>;
    store: QuaStore;
    private pipeline: Pipeline;
    constructor () {
        this.pipeline = new Pipeline();
        this.engineBus = mitt<ScopeEvent>();
        
        this.uiBus = mitt<UIEvent>();
    }
}

export default QuaEngine;
