/**
 * IndexedDB glue. Knows nothing about slots — see `store.ts` for that.
 *
 * Four rules hold this together, and each one has bitten a browser somewhere:
 *
 * 1. The connection opens lazily. Module init runs during `vite build`, where
 *    `indexedDB` does not exist, so nothing here may touch it at import time.
 * 2. Never `await` between opening a transaction and issuing its requests. A
 *    transaction goes inactive at the end of the task that created it; Safari
 *    enforces it strictly and the error is an opaque `TransactionInactiveError`.
 * 3. Writes resolve on `tx.oncomplete`, not `req.onsuccess`. A quota failure
 *    arrives on the transaction abort — resolving on the request would report
 *    success for a write that then rolled back, which is the one failure this
 *    whole migration exists to surface.
 * 4. Every value put here must be `$state.snapshot()`ed first. IDB uses
 *    structured clone, which throws `DataCloneError` on a Svelte proxy.
 *    `JSON.stringify` used to read through proxies happily; that net is gone.
 */

export const DB_NAME = 'eurocash';

/** Structural version: stores and indexes. Record shape is versioned in `kv:meta`. */
export const DB_VERSION = 1;

export const S = { slots: 'slots', photos: 'photos', kv: 'kv' } as const;
export type StoreName = (typeof S)[keyof typeof S];

/** The photo store key for the workspace photo. A UUID can never collide with it. */
export const WS_PHOTO = 'ws';

let conn: Promise<IDBDatabase> | null = null;

export function available(): boolean {
	return typeof indexedDB !== 'undefined';
}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(S.slots)) {
				const slots = db.createObjectStore(S.slots, { keyPath: 'id' });
				// Neither index is needed while every slot is resident in memory, but
				// adding one later costs a version bump, and sync wants `updatedAt`.
				slots.createIndex('ts', 'ts');
				slots.createIndex('updatedAt', 'updatedAt');
			}
			if (!db.objectStoreNames.contains(S.photos)) db.createObjectStore(S.photos);
			if (!db.objectStoreNames.contains(S.kv)) db.createObjectStore(S.kv);
		};

		req.onsuccess = () => {
			const db = req.result;
			// Without this a newer tab's upgrade blocks forever. Dropping the memo
			// matters as much as closing: every later transaction on a closed
			// handle throws `InvalidStateError`.
			db.onversionchange = () => {
				db.close();
				conn = null;
			};
			db.onclose = () => {
				conn = null;
			};
			resolve(db);
		};

		req.onerror = () => reject(req.error ?? new Error('IndexedDB refused to open'));
		req.onblocked = () => reject(new DOMException('EuroCash is open in another tab', 'BlockedError'));
	});
}

function handle(): Promise<IDBDatabase> {
	// Drop the memo on rejection, or one failed open poisons every later call.
	conn ??= open().catch((e: unknown) => {
		conn = null;
		throw e;
	});
	return conn;
}

/** Runs `fill` against a fresh transaction and settles when the transaction does. */
async function tx<T>(
	stores: StoreName[],
	mode: IDBTransactionMode,
	fill: (t: IDBTransaction) => T
): Promise<T> {
	const db = await handle();
	return new Promise<T>((resolve, reject) => {
		const t = db.transaction(stores, mode);
		let out: T;
		try {
			// Synchronous by contract — see rule 2 at the top of this file.
			out = fill(t);
		} catch (e) {
			t.abort();
			reject(e);
			return;
		}
		t.oncomplete = () => resolve(out);
		t.onabort = () => reject(t.error ?? new DOMException('Transaction aborted', 'AbortError'));
		t.onerror = () => reject(t.error ?? new Error('Transaction failed'));
	});
}

/** Resolves a single request's result once its transaction commits. */
function one<T>(req: IDBRequest<T>): () => T {
	let value: T;
	req.onsuccess = () => (value = req.result);
	return () => value;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
	const read = await tx([store], 'readonly', (t) => one<T | undefined>(t.objectStore(store).get(key)));
	return read();
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
	const read = await tx([store], 'readonly', (t) => one<T[]>(t.objectStore(store).getAll()));
	return read();
}

export async function getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
	const read = await tx([store], 'readonly', (t) => one(t.objectStore(store).getAllKeys()));
	return read();
}

export function put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
	return tx([store], 'readwrite', (t) => {
		t.objectStore(store).put(value, key);
	});
}

export function del(store: StoreName, key: IDBValidKey): Promise<void> {
	return tx([store], 'readwrite', (t) => {
		t.objectStore(store).delete(key);
	});
}

export function clear(store: StoreName): Promise<void> {
	return tx([store], 'readwrite', (t) => {
		t.objectStore(store).clear();
	});
}

/** Several writes that must land together, or not at all. */
export function writeAll(stores: StoreName[], fill: (t: IDBTransaction) => void): Promise<void> {
	return tx(stores, 'readwrite', fill);
}
