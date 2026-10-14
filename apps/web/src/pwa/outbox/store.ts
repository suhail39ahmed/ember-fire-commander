import type { OutboxItem } from './types'

/** Persistence for the outbox. IndexedDB in the browser, memory in tests. */
export interface OutboxStore {
  all(): Promise<OutboxItem[]>
  put(item: OutboxItem): Promise<void>
  remove(id: string): Promise<void>
}

const DB_NAME = 'ember-outbox'
const STORE = 'items'
const VERSION = 1

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const req = factory.open(name, VERSION)
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
  }
  return promisify(req)
}

export function createIdbStore(factory: IDBFactory = indexedDB, name: string = DB_NAME): OutboxStore {
  let db: Promise<IDBDatabase> | null = null
  const getDb = () => (db ??= openDb(factory, name))

  async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const tx = (await getDb()).transaction(STORE, mode)
    const result = promisify(fn(tx.objectStore(STORE)))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return result
  }

  return {
    all: () => run('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>),
    put: async (item) => {
      await run('readwrite', (s) => s.put(item))
    },
    remove: async (id) => {
      await run('readwrite', (s) => s.delete(id))
    },
  }
}

export function createMemoryStore(): OutboxStore {
  const items = new Map<string, OutboxItem>()
  return {
    all: async () => [...items.values()].map((i) => ({ ...i })),
    put: async (item) => {
      items.set(item.id, { ...item })
    },
    remove: async (id) => {
      items.delete(id)
    },
  }
}
