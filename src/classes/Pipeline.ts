import { UIEvent } from '../types/events';
import { MiddleWare } from '../types/pipeline';
import { QuaStore } from 'quastore';

export default class Pipeline {
    private middlewares: MiddleWare[];
    private store: QuaStore;

    public constructor(middlewares: undefined | MiddleWare[] = undefined, store: QuaStore) {
        this.store = store
        if (middlewares) {
            this.middlewares = middlewares;
        } else {
            this.middlewares = [];
        }
    }

    public use(middleware: MiddleWare) {
        this.middlewares.push(middleware);
    }

    public handle(source: UIEvent): UIEvent {
        if (this.middlewares.length <= 0) {
            return source;
        }
        return this.next(source, 0);
    }

    private next(source: UIEvent, middlewareIndex: number): UIEvent {
        // recursively execute middlewares
        if (middlewareIndex >= this.middlewares.length) {
            return source;
        }
        return this.next(this.middlewares[middlewareIndex](this.store, source), middlewareIndex + 1);
    }
}
