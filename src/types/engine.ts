import type { QuaStore } from 'quastore';
import { QSConstructorOpts } from 'quastore/dist/types/types/base';
import { MiddleWare } from './pipeline';

interface ExQSConstructorOpts extends QSConstructorOpts {
  name: string;
}

export interface QuaEngineOpts {
  store: string | QuaStore | ExQSConstructorOpts;
  middlewares: MiddleWare[];
}