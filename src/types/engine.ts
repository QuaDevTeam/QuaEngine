import type { QuaStore } from '@quajs/store';
import { QSConstructorOpts } from '@quajs/store/dist/types/types/base';
import { Middleware } from './pipeline';

interface ExQSConstructorOpts extends QSConstructorOpts {
  name: string;
}

export interface QuaEngineOpts {
  store?: string | QuaStore | ExQSConstructorOpts;
  middlewares?: Middleware[];
}
