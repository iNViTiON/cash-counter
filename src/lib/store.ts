/**
 * EuroCash's records on top of `db.ts`, the same way `state.svelte.ts` sits on
 * top of `storage.ts`. Everything here throws on failure; classifying the error
 * and telling the user is the state layer's job.
 *
 * Callers must hand in plain values — `$state.snapshot()` anything reactive
 * first. Structured clone throws `DataCloneError` on a Svelte proxy.
 */

import { del, get, getAll, getAllKeys, put, S, WS_PHOTO, writeAll } from './db';
import type { Quick, Slot, StorageInfo, StoredMeta } from './types';

export interface Loaded {
	slots: Slot[];
	quick: Quick | null;
	wsPhoto: Blob | null;
}

export async function loadAll(): Promise<Loaded> {
	const [slots, quick, wsPhoto] = await Promise.all([
		getAll<Slot>(S.slots),
		get<Quick>(S.kv, 'quick'),
		get<Blob>(S.photos, WS_PHOTO)
	]);
	return {
		// `getAll` returns key order, and the key is a UUID — without this the
		// strip comes back shuffled after a reload.
		slots: slots.sort((a, b) => b.ts - a.ts),
		quick: quick ?? null,
		wsPhoto: wsPhoto ?? null
	};
}

export function readPhoto(key: string): Promise<Blob | null> {
	return get<Blob>(S.photos, key).then((b) => b ?? null);
}

/**
 * Files a slot and retires the ones retention dropped, in one transaction — a
 * slot can never land without its evidence, and a pruned slot can never leave
 * its photo behind to eat the quota.
 */
export function saveSlot(slot: Slot, photo: Blob | null, expired: string[]): Promise<void> {
	return writeAll([S.slots, S.photos], (t) => {
		const slots = t.objectStore(S.slots);
		const photos = t.objectStore(S.photos);
		slots.put(slot);
		if (photo) photos.put(photo, slot.id);
		for (const id of expired) {
			slots.delete(id);
			photos.delete(id);
		}
	});
}

export function dropSlots(ids: string[]): Promise<void> {
	return writeAll([S.slots, S.photos], (t) => {
		const slots = t.objectStore(S.slots);
		const photos = t.objectStore(S.photos);
		for (const id of ids) {
			slots.delete(id);
			photos.delete(id);
		}
	});
}

/** Clears every slot and its photo, but leaves the workspace photo alone. */
export async function dropAll(): Promise<void> {
	const keys = await getAllKeys(S.photos);
	await writeAll([S.slots, S.photos], (t) => {
		t.objectStore(S.slots).clear();
		const photos = t.objectStore(S.photos);
		for (const k of keys) if (k !== WS_PHOTO) photos.delete(k);
	});
}

export function saveWsPhoto(photo: Blob | null): Promise<void> {
	return photo ? put(S.photos, photo, WS_PHOTO) : del(S.photos, WS_PHOTO);
}

export function saveQuick(q: Quick | null): Promise<void> {
	return q ? put(S.kv, q, 'quick') : del(S.kv, 'quick');
}

export function readMeta(): Promise<StoredMeta | undefined> {
	return get<StoredMeta>(S.kv, 'meta');
}

export function writeMeta(m: StoredMeta): Promise<void> {
	return put(S.kv, m, 'meta');
}

/**
 * Deletes photo blobs no slot claims. Keys only, so it is cheap, and it is what
 * keeps "the quota is huge now" from becoming "the quota is huge and full of
 * garbage" after any interrupted write.
 */
export async function sweepOrphans(keep: string[]): Promise<void> {
	const live = new Set<IDBValidKey>(keep);
	live.add(WS_PHOTO);
	const keys = await getAllKeys(S.photos);
	const dead = keys.filter((k) => !live.has(k));
	if (!dead.length) return;
	await writeAll([S.photos], (t) => {
		const photos = t.objectStore(S.photos);
		for (const k of dead) photos.delete(k);
	});
}

export async function usage(): Promise<StorageInfo | null> {
	if (!navigator.storage?.estimate) return null;
	try {
		const { usage: used, quota } = await navigator.storage.estimate();
		if (used === undefined || quota === undefined) return null;
		return { used, quota };
	} catch {
		return null;
	}
}

/**
 * Asks the browser to stop evicting us. This is not an optimisation: Safari
 * deletes script-created storage after seven days without user interaction, and
 * persistence is the documented exemption. Safari and Chrome decide silently;
 * only Firefox prompts, which is why this runs after the data read rather than
 * before it. Null means the API is missing or refused to answer.
 */
export async function claimPersistence(): Promise<boolean | null> {
	if (!navigator.storage?.persist) return null;
	try {
		return (await navigator.storage.persisted()) || (await navigator.storage.persist());
	} catch {
		return null;
	}
}
