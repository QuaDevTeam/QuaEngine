import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../src/storage/manager';
import { MemoryBackend } from '../src/backends/memory';
import { LocalStorageBackend } from '../examples/backends/custom-backends';
import { EncryptionMiddleware, CompressionMiddleware, LoggingMiddleware } from '../examples/middlewares/custom-middlewares';
import { QSSnapshot } from '../src/types/base';

// Mock localStorage for testing
const localStorageMock = {
  storage: new Map<string, string>(),
  getItem: vi.fn((key: string) => localStorageMock.storage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageMock.storage.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageMock.storage.clear();
  })
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('Storage Manager', () => {
  beforeEach(() => {
    // Clear localStorage mock
    localStorageMock.storage.clear();
    vi.clearAllMocks();
  });

  describe('Backend Management', () => {
    it('should use default IndexedDB backend when no config provided', () => {
      const manager = new StorageManager();
      const backend = manager.getBackend();
      expect(backend).toBeDefined();
      expect(backend.constructor.name).toBe('IndexedDBBackend');
    });

    it('should use custom backend when provided', () => {
      const manager = new StorageManager({
        backend: MemoryBackend
      });
      const backend = manager.getBackend();
      expect(backend).toBeInstanceOf(MemoryBackend);
    });

    it('should use backend with options', () => {
      const manager = new StorageManager({
        backend: {
          driver: LocalStorageBackend,
          options: { prefix: 'test_' }
        }
      });
      const backend = manager.getBackend();
      expect(backend).toBeInstanceOf(LocalStorageBackend);
    });
  });

  describe('Memory Backend', () => {
    let backend: MemoryBackend;
    let testSnapshot: QSSnapshot;

    beforeEach(() => {
      backend = new MemoryBackend();
      testSnapshot = {
        id: 'test-123',
        storeName: 'testStore',
        data: { count: 5, name: 'test' },
        createdAt: new Date()
      };
    });

    it('should save and retrieve snapshots', async () => {
      await backend.saveSnapshot(testSnapshot);
      const retrieved = await backend.getSnapshot('test-123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('test-123');
      expect(retrieved!.storeName).toBe('testStore');
      expect(retrieved!.data).toEqual({ count: 5, name: 'test' });
    });

    it('should return undefined for non-existent snapshot', async () => {
      const retrieved = await backend.getSnapshot('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should delete snapshots', async () => {
      await backend.saveSnapshot(testSnapshot);
      expect(await backend.getSnapshot('test-123')).toBeDefined();
      
      await backend.deleteSnapshot('test-123');
      expect(await backend.getSnapshot('test-123')).toBeUndefined();
    });

    it('should list snapshots', async () => {
      const snapshot1 = { ...testSnapshot, id: 'snap-1' };
      const snapshot2 = { ...testSnapshot, id: 'snap-2', storeName: 'otherStore' };
      
      await backend.saveSnapshot(snapshot1);
      await backend.saveSnapshot(snapshot2);
      
      const allSnapshots = await backend.listSnapshots();
      expect(allSnapshots).toHaveLength(2);
      
      const testStoreSnapshots = await backend.listSnapshots('testStore');
      expect(testStoreSnapshots).toHaveLength(1);
      expect(testStoreSnapshots[0].id).toBe('snap-1');
    });

    it('should clear snapshots', async () => {
      const snapshot1 = { ...testSnapshot, id: 'snap-1' };
      const snapshot2 = { ...testSnapshot, id: 'snap-2', storeName: 'otherStore' };
      
      await backend.saveSnapshot(snapshot1);
      await backend.saveSnapshot(snapshot2);
      
      await backend.clearSnapshots('testStore');
      const remaining = await backend.listSnapshots();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].storeName).toBe('otherStore');
      
      await backend.clearSnapshots();
      expect(await backend.listSnapshots()).toHaveLength(0);
    });

    it('should handle concurrent operations', async () => {
      const snapshots = Array.from({ length: 10 }, (_, i) => ({
        ...testSnapshot,
        id: `concurrent-${i}`,
        data: { count: i }
      }));

      // Save multiple snapshots concurrently
      await Promise.all(snapshots.map(snapshot => backend.saveSnapshot(snapshot)));
      
      expect(backend.getStorageSize()).toBe(10);
      
      // Retrieve all concurrently
      const retrieved = await Promise.all(
        snapshots.map(snapshot => backend.getSnapshot(snapshot.id))
      );
      
      expect(retrieved.every(s => s !== undefined)).toBe(true);
      expect(retrieved.map(s => s!.data.count)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should provide debugging utilities', async () => {
      expect(backend.getStorageSize()).toBe(0);
      expect(backend.hasSnapshot('test-123')).toBe(false);
      
      await backend.saveSnapshot(testSnapshot);
      expect(backend.getStorageSize()).toBe(1);
      expect(backend.hasSnapshot('test-123')).toBe(true);
      
      await backend.deleteSnapshot('test-123');
      expect(backend.getStorageSize()).toBe(0);
      expect(backend.hasSnapshot('test-123')).toBe(false);
    });

    it('should handle snapshots with complex data structures', async () => {
      const complexSnapshot = {
        id: 'complex-test',
        storeName: 'complexStore',
        data: {
          nested: {
            deeply: {
              nested: {
                array: [1, 2, 3, { key: 'value' }],
                nullValue: null,
                undefinedValue: undefined,
                booleanValue: true,
                dateValue: new Date().toISOString()
              }
            }
          },
          functions: undefined, // Functions should be filtered out in JSON serialization
          symbols: undefined
        },
        createdAt: new Date()
      };

      await backend.saveSnapshot(complexSnapshot);
      const retrieved = await backend.getSnapshot('complex-test');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.data.nested.deeply.nested.array).toEqual([1, 2, 3, { key: 'value' }]);
      expect(retrieved!.data.nested.deeply.nested.nullValue).toBeNull();
      expect(retrieved!.data.nested.deeply.nested.booleanValue).toBe(true);
    });

    it('should handle empty and edge case data', async () => {
      const edgeCases = [
        { id: 'empty-object', data: {} },
        { id: 'empty-array', data: { arr: [] } },
        { id: 'empty-string', data: { str: '' } },
        { id: 'zero-values', data: { zero: 0, false: false } },
        { id: 'special-strings', data: { 
          special: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
          unicode: '🚀 Unicode: 你好 مرحبا Здравствуйте'
        }}
      ];

      for (const testCase of edgeCases) {
        const snapshot = {
          ...testSnapshot,
          id: testCase.id,
          data: testCase.data
        };
        
        await backend.saveSnapshot(snapshot);
        const retrieved = await backend.getSnapshot(testCase.id);
        
        expect(retrieved).toBeDefined();
        expect(retrieved!.data).toEqual(testCase.data);
      }
    });

    it('should maintain data isolation between snapshots', async () => {
      const snapshot1 = { ...testSnapshot, id: 'isolated-1', data: { shared: 'original', unique1: 'value1' } };
      const snapshot2 = { ...testSnapshot, id: 'isolated-2', data: { shared: 'modified', unique2: 'value2' } };
      
      await backend.saveSnapshot(snapshot1);
      await backend.saveSnapshot(snapshot2);
      
      const retrieved1 = await backend.getSnapshot('isolated-1');
      const retrieved2 = await backend.getSnapshot('isolated-2');
      
      expect(retrieved1!.data.shared).toBe('original');
      expect(retrieved2!.data.shared).toBe('modified');
      expect(retrieved1!.data).not.toHaveProperty('unique2');
      expect(retrieved2!.data).not.toHaveProperty('unique1');
    });

    it('should handle large datasets efficiently', async () => {
      const largeData = {
        largeArray: Array.from({ length: 1000 }, (_, i) => ({ index: i, data: `item-${i}` })),
        largeString: 'x'.repeat(10000),
        nestedLargeObject: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`key${i}`, { nested: `value${i}` }])
        )
      };

      const largeSnapshot = {
        ...testSnapshot,
        id: 'large-test',
        data: largeData
      };

      const startTime = Date.now();
      await backend.saveSnapshot(largeSnapshot);
      const saveTime = Date.now() - startTime;
      
      const retrieveStartTime = Date.now();
      const retrieved = await backend.getSnapshot('large-test');
      const retrieveTime = Date.now() - retrieveStartTime;
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.data.largeArray).toHaveLength(1000);
      expect(retrieved!.data.largeString).toHaveLength(10000);
      expect(Object.keys(retrieved!.data.nestedLargeObject)).toHaveLength(100);
      
      // Performance should be reasonable (less than 100ms for these operations)
      expect(saveTime).toBeLessThan(100);
      expect(retrieveTime).toBeLessThan(100);
    });
  });

  describe('LocalStorage Backend', () => {
    let backend: LocalStorageBackend;
    let testSnapshot: QSSnapshot;

    beforeEach(() => {
      backend = new LocalStorageBackend({ prefix: 'test_' });
      testSnapshot = {
        id: 'test-123',
        storeName: 'testStore',
        data: { count: 5, name: 'test' },
        createdAt: new Date()
      };
    });

    it('should save and retrieve snapshots', async () => {
      await backend.saveSnapshot(testSnapshot);
      const retrieved = await backend.getSnapshot('test-123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('test-123');
      expect(retrieved!.storeName).toBe('testStore');
      expect(retrieved!.data).toEqual({ count: 5, name: 'test' });
      
      // Check that localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should list snapshots with proper sorting', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);
      
      const snapshot1 = { ...testSnapshot, id: 'snap-1', createdAt: earlier };
      const snapshot2 = { ...testSnapshot, id: 'snap-2', createdAt: now };
      
      await backend.saveSnapshot(snapshot1);
      await backend.saveSnapshot(snapshot2);
      
      const snapshots = await backend.listSnapshots();
      expect(snapshots).toHaveLength(2);
      // Should be sorted by createdAt descending (newest first)
      expect(snapshots[0].id).toBe('snap-2');
      expect(snapshots[1].id).toBe('snap-1');
    });
  });

  describe('Middleware System', () => {
    let manager: StorageManager;
    let testSnapshot: QSSnapshot;

    beforeEach(() => {
      testSnapshot = {
        id: 'test-123',
        storeName: 'testStore',
        data: { count: 5, name: 'test' },
        createdAt: new Date()
      };
    });

    it('should apply encryption middleware', async () => {
      const encryption = new EncryptionMiddleware('test-key');
      manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [encryption]
      });
      await manager.init();

      await manager.saveSnapshot(testSnapshot);
      const retrieved = await manager.getSnapshot('test-123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.data).toEqual({ count: 5, name: 'test' });
    });

    it('should apply compression middleware', async () => {
      const compression = new CompressionMiddleware();
      manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [compression]
      });
      await manager.init();

      await manager.saveSnapshot(testSnapshot);
      const retrieved = await manager.getSnapshot('test-123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.data).toEqual({ count: 5, name: 'test' });
    });

    it('should apply logging middleware', async () => {
      const logger = vi.fn();
      const logging = new LoggingMiddleware(logger);
      manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [logging]
      });
      await manager.init();

      await manager.saveSnapshot(testSnapshot);
      await manager.getSnapshot('test-123');
      
      expect(logger).toHaveBeenCalledTimes(2); // Once for write, once for read
    });

    it('should apply multiple middlewares in order', async () => {
      const logger = vi.fn();
      const encryption = new EncryptionMiddleware('test-key');
      const logging = new LoggingMiddleware(logger);
      
      manager = new StorageManager({
        backend: MemoryBackend,
        middlewares: [encryption, logging]
      });
      await manager.init();

      await manager.saveSnapshot(testSnapshot);
      const retrieved = await manager.getSnapshot('test-123');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.data).toEqual({ count: 5, name: 'test' });
      expect(logger).toHaveBeenCalled();
    });

    it('should support adding and removing middleware', () => {
      manager = new StorageManager({
        backend: MemoryBackend
      });

      const middleware = new LoggingMiddleware();
      manager.addMiddleware(middleware);
      
      expect((manager as any).middlewares).toContain(middleware);
      
      manager.removeMiddleware(middleware);
      expect((manager as any).middlewares).not.toContain(middleware);
    });
  });
});