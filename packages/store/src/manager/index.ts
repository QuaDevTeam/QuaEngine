import { QSConstructorOpts, QSRestoreOptions, QSSnapshotMeta, QSSnapshot } from '../types/base';
import { generateId } from '../utils';
import logger from '../utils';
import QuaStore from '../store';
import db from '../db';

interface ExQSConstructorOpts extends QSConstructorOpts {
  name: string;
}

const getTargetNames = (name: string): [string, string] => {
  if (!name.includes('/')) {
    throw new Error('Invalid action name.');
  }
  const slashIdx = name.indexOf('/');
  const storeName = name.slice(0, slashIdx);
  const targetName = name.slice(slashIdx + 1);
  return [storeName, targetName];
};

export const useStore = (name: string): QuaStore | null => {
  const store = QuaStoreManager.stores[name];
  if (!store) {
    console.error('No matched store.');
    return null;
  }
  return store;
};

const callMethod = (action: 'commit' | 'dispatch', name: string, payload?: unknown): any => {
  const [storeName, targetName] = getTargetNames(name);
  const store = useStore(storeName);
  if (!store) {
    throw new Error(`Cannot find the certain store named "${storeName}".`);
  }
  return store[action](targetName, payload);
};

export const dispatch = (name: string, payload?: unknown) => {
  return callMethod('dispatch', name, payload) as Promise<void>;
};

export const commit = (name: string, payload?: unknown): void => {
  callMethod('commit', name, payload);
};

class QuaStoreManager {
  public static stores: Record<string, QuaStore> = {};

  public static createStore(opts: ExQSConstructorOpts) {
    const { name } = opts;
    if (!name) {
      throw new Error('Must specify the name of store.');
    }
    
    logger.module('manager').info(`Creating store: ${name}`);
    const newStore = new QuaStore(opts.name, opts);
    QuaStoreManager.stores[name] = newStore;
    logger.module('manager').debug(`Store created and registered: ${name}`);
    return newStore;
  }

  public static register(name: string, store: QuaStore) {
    if (this.stores[name]) {
      throw new Error('The name has already been existed.');
    }
    this.stores[name] = store;
  }

  public static unregister(name: string) {
    if (!this.stores[name]) {
      throw new Error(`Cannot find the certain store named "${name}".`);
    }
    delete this.stores[name];
  }

  public static getStore(name: string): QuaStore | null {
    return useStore(name);
  }

  // Snapshot management methods
  public static async snapshot(storeName: string, id?: string): Promise<string> {
    const store = useStore(storeName);
    if (!store) {
      throw new Error(`Cannot find the certain store named "${storeName}".`);
    }
    return await store.snapshot(id);
  }

  public static async snapshotAll(id?: string): Promise<string> {
    const snapshotId = id || generateId();
    const allStoresData: Record<string, any> = {};
    
    for (const [name, store] of Object.entries(this.stores)) {
      allStoresData[name] = JSON.parse(JSON.stringify(store.state));
    }

    const snapshot = {
      id: snapshotId,
      storeName: '__ALL_STORES__',
      data: allStoresData,
      createdAt: new Date(),
    };

    await db.saveSnapshot(snapshot);
    return snapshotId;
  }

  public static async restoreStore(name: string, snapshotId: string, options?: QSRestoreOptions) {
    const store = useStore(name);
    if (!store) {
      throw new Error(`Cannot find the certain store named "${name}".`);
    }
    await store.restore(snapshotId, options);
  }

  public static async restoreAll(snapshotId: string, options?: QSRestoreOptions) {
    const snapshot = await db.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot with id "${snapshotId}" not found.`);
    }

    if (snapshot.storeName !== '__ALL_STORES__') {
      throw new Error(`Snapshot "${snapshotId}" is not a global snapshot.`);
    }

    const { force = false } = options || {};
    
    // Check if any store has data and force is not set
    if (!force) {
      for (const [name, store] of Object.entries(this.stores)) {
        if (Object.keys(store.state).length > 0) {
          throw new Error(`Store "${name}" has data. Use force option to override.`);
        }
      }
    }

    // Restore all stores
    const allStoresData = snapshot.data as Record<string, any>;
    for (const [name, storeData] of Object.entries(allStoresData)) {
      const store = this.stores[name];
      if (store) {
        store.state = storeData;
      }
    }
  }

  public static async getSnapshot(id: string): Promise<QSSnapshot | undefined> {
    return await db.getSnapshot(id);
  }

  public static async listSnapshots(storeName?: string): Promise<QSSnapshotMeta[]> {
    return await db.listSnapshots(storeName);
  }

  public static async deleteSnapshot(id: string): Promise<void> {
    await db.deleteSnapshot(id);
  }

  public static async clearSnapshots(storeName?: string): Promise<void> {
    await db.clearSnapshots(storeName);
  }

  public static async clearAllSnapshots(): Promise<void> {
    await db.clearSnapshots();
  }

  // Store management methods
  public static listStores(): string[] {
    return Object.keys(this.stores);
  }

  public static hasStore(name: string): boolean {
    return name in this.stores;
  }

  public static getStoreCount(): number {
    return Object.keys(this.stores).length;
  }

  public static resetStore(name: string): void {
    const store = useStore(name);
    if (!store) {
      throw new Error(`Cannot find the certain store named "${name}".`);
    }
    store.reset();
  }

  public static resetAllStores(): void {
    for (const store of Object.values(this.stores)) {
      store.reset();
    }
  }
}

export default QuaStoreManager;