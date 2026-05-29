import { openDB, type IDBPDB } from 'idb';
import type { Memory } from '../types';
import { ALL_MEMORIES } from '../constants/presets';

const DB_NAME = 'hippocampal-kb';
const DB_VERSION = 1;
const STORE_NAME = 'memories';

let dbPromise: Promise<IDBPDB> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('scenarioId', 'scenarioId');
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export class MemoryStore {
  private cache = new Map<string, Memory>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    const db = await getDb();
    const count = await db.count(STORE_NAME);
    if (count === 0) {
      for (const memory of ALL_MEMORIES) {
        await db.put(STORE_NAME, memory);
      }
    }
    await this.warmCache();
    this.initialized = true;
  }

  private async warmCache(): Promise<void> {
    const db = await getDb();
    const all = await db.getAll(STORE_NAME);
    this.cache.clear();
    for (const m of all) this.cache.set(m.id, m);
  }

  async getAll(): Promise<Memory[]> {
    if (!this.initialized) await this.init();
    return Array.from(this.cache.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  async get(id: string): Promise<Memory | undefined> {
    if (!this.initialized) await this.init();
    return this.cache.get(id);
  }

  async add(memory: Memory): Promise<void> {
    const db = await getDb();
    await db.put(STORE_NAME, memory);
    this.cache.set(memory.id, memory);
  }

  async count(): Promise<number> {
    return this.cache.size;
  }

  isReady(): boolean {
    return this.initialized;
  }
}

export const memoryStore = new MemoryStore();
