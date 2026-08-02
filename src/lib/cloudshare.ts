/**
 * One-string cloud config, for moving settings between machines.
 *
 * The machine with Cloudflare admin access is rarely the tablet doing the
 * counting, and retyping an endpoint, a bucket, a key id and a 40-character
 * secret on a touch keyboard is where setup actually goes wrong. This packs the
 * lot into a single token to copy once.
 *
 * **The token contains the secret access key in clear.** Anyone who sees it has
 * the bucket — treat it exactly like the key itself, and prefer a channel you
 * would send a password over. The UI says so; this comment exists so nobody
 * later mistakes it for an opaque identifier. It is deliberately not encrypted:
 * a passphrase the two machines already share would be another secret to move,
 * and pretending base64 is protection would be worse than saying it is not.
 */

import type { CloudCfg, CloudKey, MaxAge } from './types';

/** Bumped if the payload shape ever changes, so an old token fails loudly. */
const PREFIX = 'EC1';

export interface SharedConfig {
	endpoint: string;
	bucket: string;
	region: string;
	style: 'path' | 'vhost';
	prefix: string;
	cloudAge: MaxAge;
	role: 'writer' | 'viewer';
	accessKeyId: string;
	secretAccessKey: string;
	/**
	 * What the token was made for. Carried so the viewer card can *detect* a
	 * read-write token being pasted in rather than only warning about it in
	 * prose — the app cannot inspect a token's real scope, but it can at least
	 * notice when the sending device said it was a backup key.
	 */
	kind?: 'backup' | 'viewer';
	/** Profile name, for viewer tokens. */
	name?: string;
}

/** Binary-safe base64url — the payload is UTF-8 and may hold non-ASCII. */
function toB64(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): string {
	const pad = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

/**
 * FNV-1a, base36. Only job is to make a truncated or mangled paste fail loudly
 * rather than half-configure a device — not a security property.
 */
function sum(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36);
}

function pack(payload: SharedConfig): string {
	const body = toB64(JSON.stringify(payload));
	return `${PREFIX}.${body}.${sum(body)}`;
}

export function encodeConfig(cfg: CloudCfg, key: CloudKey): string {
	return pack({
		kind: 'backup',
		endpoint: cfg.endpoint,
		bucket: cfg.bucket,
		region: cfg.region,
		style: cfg.style,
		prefix: cfg.prefix,
		cloudAge: cfg.cloudAge,
		role: cfg.role,
		accessKeyId: key.accessKeyId,
		secretAccessKey: key.secretAccessKey
	});
}

/** Where this device's bucket lives, without any credential attached to it. */
export type BucketRef = Pick<
	CloudCfg,
	'endpoint' | 'bucket' | 'region' | 'style' | 'prefix' | 'cloudAge'
>;

/**
 * A string around a key the operator **pasted**, not the one stored here.
 *
 * This exists because a device cannot make a read-only string out of its own
 * credentials: it holds exactly one key, the read-write one it backs up with,
 * and re-labelling that as `viewer` would be a lie the receiving app has no way
 * to detect. So handing someone view-only access means making a read-only key
 * in the bucket console and wrapping it here.
 *
 * `kind` is a label for the receiving app, not a restriction. What the key can
 * actually do is whatever the bucket policy says, and nothing in this file —
 * or in the app that reads it — can check that.
 */
export function encodeFor(
	kind: 'backup' | 'viewer',
	name: string,
	bucket: BucketRef,
	key: CloudKey
): string {
	return pack({
		kind,
		name,
		endpoint: bucket.endpoint,
		bucket: bucket.bucket,
		region: bucket.region,
		style: bucket.style,
		prefix: bucket.prefix,
		cloudAge: bucket.cloudAge,
		role: kind === 'viewer' ? 'viewer' : 'writer',
		accessKeyId: key.accessKeyId,
		secretAccessKey: key.secretAccessKey
	});
}

export type DecodeResult =
	| { ok: true; config: SharedConfig }
	| { ok: false; error: string };

export function decodeConfig(token: string): DecodeResult {
	// Pasting from chat apps drags in whitespace and line breaks.
	const clean = token.trim().replace(/\s+/g, '');
	if (!clean) return { ok: false, error: 'Paste the config string first' };

	const parts = clean.split('.');
	if (parts.length !== 3) return { ok: false, error: 'That does not look like a config string' };
	const [prefix, body, check] = parts;
	if (prefix !== PREFIX)
		return { ok: false, error: `Unknown config format "${prefix}" — made by a newer version?` };
	if (sum(body) !== check)
		return { ok: false, error: 'Config string looks incomplete — copy the whole thing' };

	let parsed: Partial<SharedConfig>;
	try {
		parsed = JSON.parse(fromB64(body)) as Partial<SharedConfig>;
	} catch {
		return { ok: false, error: 'Config string is damaged' };
	}

	if (!parsed.endpoint || !parsed.bucket || !parsed.accessKeyId || !parsed.secretAccessKey)
		return { ok: false, error: 'Config string is missing the endpoint, bucket or keys' };

	return {
		ok: true,
		config: {
			endpoint: String(parsed.endpoint).replace(/\/+$/, ''),
			bucket: String(parsed.bucket),
			region: String(parsed.region || 'auto'),
			style: parsed.style === 'vhost' ? 'vhost' : 'path',
			prefix: normalisePrefix(String(parsed.prefix ?? '')),
			cloudAge: parsed.cloudAge === 7 ? 7 : 31,
			role: parsed.role === 'viewer' ? 'viewer' : 'writer',
			accessKeyId: String(parsed.accessKeyId),
			secretAccessKey: String(parsed.secretAccessKey),
			kind: parsed.kind === 'viewer' ? 'viewer' : 'backup',
			name: parsed.name ? String(parsed.name) : undefined
		}
	};
}

/**
 * A viewer profile as a token. The embedded key should be scoped **Object Read
 * only** — this cannot verify that, and says so wherever the token is shown.
 */
export function encodeViewer(r: {
	name: string;
	endpoint: string;
	bucket: string;
	region: string;
	style: 'path' | 'vhost';
	prefix: string;
	accessKeyId: string;
	secretAccessKey: string;
}): string {
	return encodeFor(
		'viewer',
		r.name,
		{
			endpoint: r.endpoint,
			bucket: r.bucket,
			region: r.region,
			style: r.style,
			prefix: r.prefix,
			cloudAge: 31
		},
		{ accessKeyId: r.accessKeyId, secretAccessKey: r.secretAccessKey }
	);
}

function normalisePrefix(p: string): string {
	const t = p.trim();
	return t && !t.endsWith('/') ? `${t}/` : t;
}
