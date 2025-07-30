import { QSState, QSGetters, QSMutations, QSActions, QSConstructorOpts, QSSnapshot, QSRestoreOptions } from '../types/base';
import { generateId } from '../utils';
import logger from '../utils';
import db from '../db';

class QuaStore {
  public state: QSState;
  public getters: QSGetters;
  private name: string;
  private mutations: QSMutations;
  private actions: QSActions;
  private innerGetters: QSGetters;
  private initialState: QSState;

  public constructor(name: string, options: QSConstructorOpts) {
    this.name = name;

    this.state = options.state || {};
    this.actions = options.actions || {};
    this.mutations = options.mutations || {};
    this.innerGetters = options.getters || {};
    this.initialState = options.state ? { ...options.state } : {};

    const thisName = this.name;
    const thisState = this.state;

    logger.module(name).debug('Creating store with options:', options);

    this.getters = new Proxy<QSGetters>(this.innerGetters, {
      get: function (target, prop) {
        const key = prop as string;
        const getter = target[key];
        if (typeof getter !== 'function') {
          throw new Error(`Invalid getter in store [${thisName}]`);
        }
        return getter(thisState);
      },
    });
  }

  public commit(key: string, payload?: unknown) {
    const mutation = this.mutations[key];
    if (!mutation) {
      throw new Error('No matched mutation found.');
    }
    mutation(this.state, payload);
  }

  public async dispatch(key: string, payload?: unknown) {
    const action = this.actions[key];
    if (!action) {
      throw new Error('No matched action found.');
    }
    await action(
      {
        state: this.state,
        commit: this.commit.bind(this),
      },
      payload,
    );
  }

  public async snapshot(id?: string): Promise<string> {
    const snapshotId = id || generateId();
    logger.module(this.name).info(`Creating snapshot with ID: ${snapshotId}`);
    
    const snapshot: QSSnapshot = {
      id: snapshotId,
      storeName: this.name,
      data: JSON.parse(JSON.stringify(this.state)),
      createdAt: new Date(),
    };

    await db.saveSnapshot(snapshot);
    logger.module(this.name).debug(`Snapshot saved successfully: ${snapshotId}`);
    return snapshotId;
  }

  public async restore(snapshotId: string, options: QSRestoreOptions = {}) {
    const { force = false } = options;
    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot restore snapshot due to some data already exists in store. Use force option to override.');
    }

    const snapshot = await db.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`);
    }

    if (snapshot.storeName !== this.name) {
      throw new Error(`Snapshot belongs to store "${snapshot.storeName}", not "${this.name}".`);
    }

    this.state = snapshot.data;
    return this;
  }

  public reset() {
    this.state = { ...this.initialState };
  }

  public getName(): string {
    return this.name;
  }
}

export default QuaStore;