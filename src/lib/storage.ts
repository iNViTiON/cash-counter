/**
 * localStorage access. Every read is defensive — a half-written or
 * hand-edited key must never take the app down on startup.
 */

export const K = {
	ws: 'ec.ws',
	slots: 'ec.slots',
	cfg: 'ec.cfg',
	quick: 'ec.quick'
} as const;

export function read<T>(key: string, fallback: T): T {
	try {
		const v = localStorage.getItem(key);
		return v ? (JSON.parse(v) as T) : fallback;
	} catch {
		return fallback;
	}
}

/** Returns false when the write failed — almost always the 5 MB quota. */
export function write(key: string, value: unknown): boolean {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export function remove(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		/* nothing to do */
	}
}
