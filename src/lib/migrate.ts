/**
 * One-time move of slots and photos from localStorage into IndexedDB.
 *
 * Runs from `load()` **before any read**, so nothing is on screen and nothing
 * is editable while it works. That single ordering decision is what makes
 * partial failure safe: a retry next launch cannot resurrect a slot the user
 * deleted in between, because there is no in-between.
 *
 * Delete this file once no install can still be carrying the old keys.
 */

import { readMeta, saveSlot, saveQuick, saveWsPhoto, writeMeta } from './store';
import { K, LEGACY, read, remove, write } from './storage';
import type { PhotoMeta, Qty, Quick, Slot } from './types';

/** The record shape this migration produces. */
const SHAPE_VERSION = 1;

/** What a slot looked like before: photo inline, as a base64 JPEG data URL. */
interface OldSlot {
	id: string;
	label: string;
	date: string;
	ts: number;
	total: number;
	qty: Qty;
	photo: string | null;
}

interface OldWorkspace {
	qty: Qty;
	photo: string | null;
}

/**
 * `atob` rather than `fetch(dataUrl)` — fetching a data URL takes a trip
 * through the network stack and is blocked outright under some CSPs.
 */
function dataUrlToBlob(url: string): Blob | null {
	const comma = url.indexOf(',');
	if (!url.startsWith('data:') || comma < 0) return null;
	try {
		const type = url.slice(5, comma).replace(';base64', '') || 'image/jpeg';
		const bin = atob(url.slice(comma + 1));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new Blob([bytes], { type });
	} catch {
		return null;
	}
}

/** Size is known; dimensions are not, and are not worth a decode. See `PhotoMeta`. */
function metaFor(blob: Blob): PhotoMeta {
	return { bytes: blob.size, w: 0, h: 0 };
}

export async function migrate(): Promise<void> {
	if ((await readMeta())?.migratedAt) return;

	const oldSlots = read<OldSlot[]>(LEGACY.slots, []);
	const oldQuick = read<Quick | null>(LEGACY.quick, null);
	const oldWs = read<OldWorkspace | null>(K.ws, null);
	const hadPhoto = typeof oldWs?.photo === 'string' && oldWs.photo.startsWith('data:');

	if (!Array.isArray(oldSlots) || !oldSlots.length) {
		if (!oldQuick && !hadPhoto) {
			await writeMeta({ version: SHAPE_VERSION, migratedAt: Date.now() });
			return;
		}
	}

	// One transaction per slot, not one giant one: a single oversized commit is
	// the shape most likely to be refused outright.
	for (const old of Array.isArray(oldSlots) ? oldSlots : []) {
		if (!old?.id) continue;
		const blob = typeof old.photo === 'string' ? dataUrlToBlob(old.photo) : null;
		const slot: Slot = {
			id: old.id,
			label: old.label ?? '',
			date: old.date ?? '',
			ts: old.ts ?? Date.now(),
			total: old.total ?? 0,
			qty: old.qty ?? {},
			photo: blob ? metaFor(blob) : null,
			updatedAt: old.ts ?? Date.now()
		};
		await saveSlot(slot, blob, []);
	}

	if (oldQuick) await saveQuick(oldQuick);

	let wsMeta: PhotoMeta | null = null;
	if (hadPhoto) {
		const blob = dataUrlToBlob(oldWs!.photo!);
		if (blob) {
			await saveWsPhoto(blob);
			wsMeta = metaFor(blob);
		}
	}

	// Only now, with every write committed, do the old keys go. A throw above
	// leaves localStorage intact and `migratedAt` unset, so the next launch
	// simply runs the whole thing again.
	remove(LEGACY.slots);
	remove(LEGACY.quick);
	if (oldWs) write(K.ws, { qty: oldWs.qty ?? {}, photo: wsMeta });

	await writeMeta({ version: SHAPE_VERSION, migratedAt: Date.now() });
}
