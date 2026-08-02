/**
 * Cloud settings and credentials, and the object-key layout they address.
 *
 * Three localStorage keys, split by sensitivity and lifetime:
 *   `ec.cloud`      non-secret settings — readable while the PIN gate is shut
 *   `ec.cloud.key`  the credential pair
 *   `ec.cloud.idx`  cached listing of what is in the bucket; safe to lose
 *
 * `readKey`/`writeKey`/`clearKey` are the only three functions in the codebase
 * that touch the secret. If the PIN should ever encrypt it, this is the seam —
 * nothing else needs to change.
 *
 * On exposure, plainly: any script running on this origin can read
 * localStorage and IndexedDB and send them anywhere. No browser storage
 * prevents that — not IndexedDB, not a PIN, not obfuscation. What limits the
 * damage is the *token*: scope it to Object Read & Write on a single bucket,
 * never account-wide. The app carries zero third-party scripts, which is now a
 * security property and not just a bundle-size one.
 */

import { read, remove, write } from './storage';
import type { CloudCfg, CloudEntry, CloudKey, MaxAge } from './types';

export const CK = {
	cfg: 'ec.cloud',
	key: 'ec.cloud.key',
	idx: 'ec.cloud.idx'
} as const;

/**
 * Inverted timestamps, zero-padded to a fixed 13 digits so lexicographic order
 * equals numeric order. `ListObjectsV2` only lists ascending, but the UI wants
 * newest first — inverting makes "the newest N" a `max-keys=N` away, and makes
 * "everything expired" a single `start-after` range with no client filtering.
 */
const INV_BASE = 1e13;

export const inv = (ts: number): string => String(INV_BASE - ts).padStart(13, '0');
export const unInv = (s: string): number => INV_BASE - Number(s);

/**
 * Keys are machine-only. Nothing user-typed goes in them: a key is immutable,
 * so anything encoded here is frozen at write time and changing the format
 * later means copying every object. The alphabet is deliberately restricted to
 * RFC 3986 unreserved characters plus `/`, which is why no listing needs
 * `encoding-type=url`.
 */
export const slotKey = (prefix: string, ts: number, id: string): string =>
	`${prefix}slots/${inv(ts)}_${id}.json`;

export const photoKey = (prefix: string, id: string): string => `${prefix}photos/${id}.jpg`;

export const LOCK_KEY = (prefix: string): string => `${prefix}meta/lock.json`;

const SLOT_RE = /slots\/(\d{13})_([0-9a-f-]{36})\.json$/;

/** Pulls the two things a listing gives away for free: when, and which slot. */
export function parseSlotKey(key: string): { ts: number; id: string } | null {
	const m = SLOT_RE.exec(key);
	return m ? { ts: unInv(m[1]), id: m[2] } : null;
}

export function defaultCloud(): CloudCfg {
	return {
		v: 1,
		on: false,
		endpoint: '',
		bucket: '',
		region: 'auto',
		style: 'path',
		prefix: '',
		cloudAge: 31 as MaxAge,
		role: 'writer',
		deviceId: '',
		syncFrom: 0,
		lastSyncAt: 0,
		lastPruneAt: 0,
		lastGcAt: 0,
		defaultProfile: 'local',
		lastProfile: ''
	};
}

export function readCloud(): CloudCfg {
	const stored = read<Partial<CloudCfg> | null>(CK.cfg, null);
	const cfg = Object.assign(defaultCloud(), stored ?? {});
	if (cfg.cloudAge !== 7 && cfg.cloudAge !== 31) cfg.cloudAge = 31;
	if (cfg.style !== 'vhost') cfg.style = 'path';
	if (cfg.role !== 'viewer') cfg.role = 'writer';
	if (typeof cfg.defaultProfile !== 'string' || !cfg.defaultProfile) cfg.defaultProfile = 'local';
	if (typeof cfg.lastProfile !== 'string') cfg.lastProfile = '';
	// Trailing slash or not is the user's business; the key builders assume one.
	if (cfg.prefix && !cfg.prefix.endsWith('/')) cfg.prefix += '/';
	cfg.endpoint = cfg.endpoint.replace(/\/+$/, '');
	return cfg;
}

export function writeCloud(cfg: CloudCfg): boolean {
	return write(CK.cfg, cfg);
}

export function readKey(): CloudKey | null {
	const k = read<Partial<CloudKey> | null>(CK.key, null);
	if (!k?.accessKeyId || !k?.secretAccessKey) return null;
	return { accessKeyId: k.accessKeyId, secretAccessKey: k.secretAccessKey };
}

export function writeKey(k: CloudKey): boolean {
	return write(CK.key, k);
}

export function clearKey(): void {
	remove(CK.key);
}

export function readIndex(): CloudEntry[] {
	const v = read<CloudEntry[]>(CK.idx, []);
	return Array.isArray(v) ? v : [];
}

export function writeIndex(entries: CloudEntry[]): boolean {
	return write(CK.idx, entries);
}

/** True when there is enough here to attempt a request at all. */
export function cloudReady(cfg: CloudCfg, key: CloudKey | null): boolean {
	return Boolean(cfg.on && cfg.endpoint && cfg.bucket && key);
}

/**
 * Whether to load the cloud engine at all. Three synchronous `getItem`s, and
 * the answer is no on every device that has not configured a bucket.
 */
export function cloudConfigured(): boolean {
	return cloudReady(readCloud(), readKey());
}
