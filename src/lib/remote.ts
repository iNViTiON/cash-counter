/**
 * Read-only access to another machine's bucket.
 *
 * **This module exports `list` and `get` and nothing else. There is no write
 * path here, and that absence is the enforcement** — not a `readOnly` boolean
 * somewhere that a future branch could ignore. Adding a `put` or a `delete`
 * here would quietly turn a viewer profile into something that can damage
 * someone else's data.
 *
 * What it cannot enforce: whoever holds a viewer profile holds a bucket
 * credential, and can use it with curl. The honest control is the token's own
 * scope (Object Read only, one bucket) and the honest revocation is rotating
 * that token on the source machine.
 */

import { parseSlotKey, photoKey } from './cloudcfg';
import { s3Get, s3GetJson, s3List } from './s3';
import type { S3Target } from './s3';
import type { CloudEntry, Qty, Remote } from './types';

interface RemoteSlotBody {
	v: 1;
	id: string;
	label: string;
	date: string;
	ts: number;
	total: number;
	qty: Qty;
	photo: boolean;
}

export function remoteTarget(r: Remote): S3Target {
	return {
		endpoint: r.endpoint,
		bucket: r.bucket,
		region: r.region,
		style: r.style,
		accessKeyId: r.accessKeyId,
		secretAccessKey: r.secretAccessKey
	};
}

/** Everything in the other machine's bucket, newest first. */
export async function remoteIndex(r: Remote): Promise<CloudEntry[]> {
	const t = remoteTarget(r);
	const items = await s3List(t, { prefix: `${r.prefix}slots/` });
	return items
		.map((it) => {
			const parsed = parseSlotKey(it.key);
			return parsed ? ({ ...parsed, key: it.key, meta: 'pending' } as CloudEntry) : null;
		})
		.filter((e): e is CloudEntry => e !== null)
		.sort((a, b) => b.ts - a.ts);
}

/** Fills in the label, total and quantities a listing cannot give away. */
export async function remoteFill(r: Remote, entry: CloudEntry): Promise<CloudEntry> {
	try {
		const body = await s3GetJson<RemoteSlotBody>(remoteTarget(r), entry.key);
		return {
			...entry,
			label: body.label,
			date: body.date,
			total: body.total,
			qty: body.qty,
			photoKey: body.photo ? photoKey(r.prefix, entry.id) : undefined,
			meta: 'ok'
		};
	} catch {
		return { ...entry, meta: 'failed' };
	}
}

export async function remotePhoto(r: Remote, key: string): Promise<Blob | null> {
	try {
		return await s3Get(remoteTarget(r), key);
	} catch {
		return null;
	}
}
