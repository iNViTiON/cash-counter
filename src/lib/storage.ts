/**
 * localStorage access. Every read is defensive — a half-written or
 * hand-edited key must never take the app down on startup.
 *
 * Slots and the quick slot live in IndexedDB now (`db.ts`). What is left here
 * is what has to be readable *synchronously*, before the first paint: settings,
 * and the working count.
 */

export const K = {
	ws: 'ec.ws',
	cfg: 'ec.cfg',
	/**
	 * Its own key rather than a field on `cfg`: whether a PIN exists has to be
	 * known before the first paint (so it cannot be async), and `persistCfg()`
	 * fires from a dozen unrelated places — a wholesale `cfg` rewrite must never
	 * be able to clobber or resurrect the PIN.
	 */
	lock: 'ec.lock',
	/**
	 * Read-only credentials for OTHER machines' buckets. Kept apart from
	 * `ec.cloud.key`, which is this device's own read-write pair, and the two
	 * are never read by the same code path.
	 */
	remotes: 'ec.remotes'
} as const;

/** Read once by `migrate.ts`, then removed. Nothing else may touch these. */
export const LEGACY = {
	slots: 'ec.slots',
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
