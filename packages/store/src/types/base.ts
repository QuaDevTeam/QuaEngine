export interface QSState {
  [key: string]: any;
}

export interface QSGetters {
  [key: string]: (state: QSState) => any;
}

export interface QSMutations {
  [key: string]: (state: QSState, payload?: any) => void;
}

export interface QSActionContext {
  state: QSState;
  commit: (mutationName: string, payload?: any) => void;
}

export interface QSActions {
  [key: string]: (context: QSActionContext, payload?: any) => Promise<void> | void;
}

export interface QSConstructorOpts {
  state?: QSState;
  getters?: QSGetters;
  mutations?: QSMutations;
  actions?: QSActions;
}

export interface QSRestoreOptions {
  force?: boolean;
}

export interface QSSnapshot {
  id: string;
  storeName: string;
  data: QSState;
  createdAt: Date;
}

export interface QSSnapshotMeta {
  id: string;
  storeName: string;
  createdAt: Date;
}