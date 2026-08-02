/**
 * AWS Signature Version 4, presigned-query flavour, on WebCrypto.
 *
 * Presigned rather than an `Authorization` header, for three reasons in
 * increasing order of importance:
 *
 * 1. GET/HEAD/LIST become CORS-*simple* — no preflight at all — and PUT/DELETE
 *    preflight with `content-type` alone instead of three `x-amz-*` headers.
 * 2. `UNSIGNED-PAYLOAD` means no hashing a multi-megabyte photo before sending it.
 * 3. **Only `host` is signed.** The browser is free to attach `Origin`,
 *    `Referer`, `sec-fetch-*`, `User-Agent` — none touch the signature. Header
 *    signing in a browser is a standing trap, because any header the engine adds
 *    that lands in `SignedHeaders` silently breaks it, and some headers you would
 *    want to sign are forbidden to JS outright.
 *
 * The secret never enters a URL. What does is the access key id — an identifier,
 * equally present in the header form — and a time-limited, single-operation
 * signature.
 *
 * Deliberately free of `$lib`, `$state` and SvelteKit imports so
 * `scripts/sigv4-check.ts` can import it under plain `bun` and diff it against
 * Bun's own native presigner.
 */

export interface SignInput {
	method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
	/** e.g. `acct.r2.cloudflarestorage.com`. */
	host: string;
	/** Unencoded, with a leading slash: `/bucket/slots/x.json`, or `/bucket` for a listing. */
	path: string;
	/** Operation parameters. Merged with the `X-Amz-*` set before canonicalisation. */
	query?: Record<string, string>;
	/** `auto` for R2. */
	region: string;
	service?: string;
	accessKeyId: string;
	secretAccessKey: string;
	expiresIn?: number;
	/** Injectable so the differential test can be exact rather than racy. */
	now?: Date;
}

const ALGO = 'AWS4-HMAC-SHA256';
const enc = new TextEncoder();

/**
 * RFC 3986. `encodeURIComponent` leaves `!'()*` alone and AWS wants them
 * escaped; it also leaves `~` alone, which AWS wants left alone.
 */
function uri(s: string): string {
	return encodeURIComponent(s).replace(
		/[!'()*]/g,
		(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
	);
}

/** Path segments are encoded individually so the separators survive. */
function uriPath(p: string): string {
	return p.split('/').map(uri).join('/');
}

function hex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(s: string): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', buf(s)));
}

/** `TextEncoder` hands back a view whose buffer TS types as possibly shared. */
function buf(s: string): ArrayBuffer {
	const u = enc.encode(s);
	return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function hmacKey(raw: ArrayBuffer): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function hmac(key: CryptoKey, data: string): Promise<ArrayBuffer> {
	return crypto.subtle.sign('HMAC', key, buf(data));
}

/**
 * The kDate→kRegion→kService→kSigning chain is four HMACs, and it only changes
 * once a day. Memory only, never persisted, and small enough to bound hard.
 */
const keyCache = new Map<string, Promise<CryptoKey>>();
const KEY_CACHE_MAX = 4;

function signingKey(secret: string, day: string, region: string, service: string): Promise<CryptoKey> {
	const id = `${secret.slice(-4)}|${day}|${region}|${service}`;
	let k = keyCache.get(id);
	if (!k) {
		k = (async () => {
			let key = await hmacKey(buf(`AWS4${secret}`));
			for (const part of [day, region, service, 'aws4_request']) {
				key = await hmacKey(await hmac(key, part));
			}
			return key;
		})();
		if (keyCache.size >= KEY_CACHE_MAX) keyCache.delete(keyCache.keys().next().value!);
		keyCache.set(id, k);
	}
	return k;
}

/** Call after changing credentials — a stale signing key is a silent 403. */
export function clearSigningKeyCache(): void {
	keyCache.clear();
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function presign(i: SignInput): Promise<string> {
	const service = i.service ?? 's3';
	const now = i.now ?? new Date();
	const amzDate = stamp(now);
	const day = amzDate.slice(0, 8);
	const scope = `${day}/${i.region}/${service}/aws4_request`;

	// The operation parameters and the X-Amz-* set are ONE sorted list. Appending
	// the operation params afterwards is the classic SigV4 bug, and it is exactly
	// the path ListObjectsV2 depends on — note `X` (0x58) sorts before `l`/`p`.
	const params: Record<string, string> = {
		...(i.query ?? {}),
		'X-Amz-Algorithm': ALGO,
		'X-Amz-Credential': `${i.accessKeyId}/${scope}`,
		'X-Amz-Date': amzDate,
		'X-Amz-Expires': String(i.expiresIn ?? 900),
		'X-Amz-SignedHeaders': 'host'
	};

	const canonicalQuery = Object.keys(params)
		.map((k) => [uri(k), uri(params[k])] as const)
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');

	const canonicalRequest = [
		i.method,
		uriPath(i.path),
		canonicalQuery,
		`host:${i.host}\n`,
		'host',
		'UNSIGNED-PAYLOAD'
	].join('\n');

	const toSign = [ALGO, amzDate, scope, await sha256(canonicalRequest)].join('\n');
	const key = await signingKey(i.secretAccessKey, day, i.region, service);
	const signature = hex(await hmac(key, toSign));

	// The signature is sorted into the emitted query rather than appended. S3 does
	// not care about parameter order, but matching the canonical ordering lets the
	// differential test compare whole URLs instead of picking them apart.
	const emitted = Object.entries({ ...params, 'X-Amz-Signature': signature })
		.map(([k, v]) => [uri(k), uri(v)] as const)
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');

	return `https://${i.host}${uriPath(i.path)}?${emitted}`;
}

/** Exposed for the one LIST case the differential test cannot cover. See the script. */
export const _internal = { uri, uriPath };
