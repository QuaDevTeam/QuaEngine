import { QSState, QSGetters, QSMutations, QSActions, QSConstructorOpts, QSSnapshot, QSRestoreOptions } from '../types/base';
import { StorageManager } from '../storage/manager';
import { generateId } from '../utils';
import logger from '../utils';

class QuaStore {
  public state: QSState;
  public getters: QSGetters;
  private name: string;
  private mutations: QSMutations;
  private actions: QSActions;
  private innerGetters: QSGetters;
  private initialState: QSState;
  private storageManager: StorageManager | null = null;

  public constructor(name: string, options: QSConstructorOpts) {
    this.name = name;

    this.state = options.state || {};
    this.actions = options.actions || {};
    this.mutations = options.mutations || {};
    this.innerGetters = options.getters || {};
    this.initialState = options.state ? { ...options.state } : {};

    // Initialize storage manager if storage config is provided
    if (options.storage) {
      this.storageManager = new StorageManager(options.storage);
      this.storageManager.init().catch(error => {
        logger.module(name).error('Failed to initialize storage manager:', error);
      });
    }

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

  /**
   * Get or create the default storage manager
   */
  private async getStorageManager(): Promise<StorageManager> {
    if (!this.storageManager) {
      // Try to use global storage manager if available
      const QuaStoreManager = (await import('../manager/index')).default;
      const globalManager = await QuaStoreManager.getGlobalStorageManager();
      if (globalManager) {
        this.storageManager = globalManager;
        return this.storageManager;
      }
      
      // Create default storage manager with IndexedDB backend
      this.storageManager = new StorageManager();
      await this.storageManager.init();
    }
    return this.storageManager;
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

    const storageManager = await this.getStorageManager();
    await storageManager.saveSnapshot(snapshot);
    logger.module(this.name).debug(`Snapshot saved successfully: ${snapshotId}`);
    return snapshotId;
  }

  public async restore(snapshotId: string, options: QSRestoreOptions = {}) {
    const { force = false } = options;

    const storageManager = await this.getStorageManager();
    const snapshot = await storageManager.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`);
    }

    if (snapshot.storeName !== this.name) {
      throw new Error(`Snapshot belongs to store "${snapshot.storeName}", not "${this.name}".`);
    }

    if (Object.keys(this.state).length && !force) {
      throw new Error('Cannot restore snapshot due to some data already exists in store. Use force option to override.');
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