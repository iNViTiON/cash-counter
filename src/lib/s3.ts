/**
 * The smallest S3 client this app needs: PUT, GET, HEAD, DELETE, and a
 * ListObjectsV2 that paginates. Every request is a presigned URL from
 * `sigv4.ts`, so nothing here sends a custom header except `content-type`.
 *
 * Nothing at module top level touches a browser API — `DOMParser` is built
 * inside the parser — because module init runs during `vite build`.
 */

import { presign } from './sigv4';
import type { SignInput } from './sigv4';

export interface S3Target {
	/** `https://<account>.r2.cloudflarestorage.com`, no trailing slash. */
	endpoint: string;
	bucket: string;
	/** `auto` for R2. */
	region: string;
	/**
	 * Path-style is R2's native form, what MinIO expects, and it sidesteps TLS
	 * SNI trouble with dotted bucket names. Virtual-host is for AWS buckets
	 * created after 2020.
	 */
	style: 'path' | 'vhost';
	accessKeyId: string;
	secretAccessKey: string;
}

export interface S3Item {
	key: string;
	size: number;
	lastModified: number;
	etag: string;
}

export type S3ErrorKind = 'unreachable' | 'auth' | 'clock' | 'missing' | 'server' | 'parse';

export class S3Error extends Error {
	kind: S3ErrorKind;
	status: number;
	code: string;
	constructor(kind: S3ErrorKind, message: string, status = 0, code = '') {
		super(message);
		this.name = 'S3Error';
		this.kind = kind;
		this.status = status;
		this.code = code;
	}
}

export interface Opt {
	signal?: AbortSignal;
}

const PUT_TIMEOUT_MS = 20_000;
const META_TIMEOUT_MS = 10_000;

/**
 * Set when a response's `Date` header disagrees with this device by more than
 * five minutes. An out-of-sync clock is a 403 that looks exactly like a bad
 * key, and it is the single most confusing way this feature can fail.
 */
export let clockSkewMs = 0;

function target(t: S3Target, key: string): { host: string; path: string } {
	const host = new URL(t.endpoint).host;
	if (t.style === 'vhost') return { host: `${t.bucket}.${host}`, path: key ? `/${key}` : '/' };
	return { host, path: key ? `/${t.bucket}/${key}` : `/${t.bucket}` };
}

function sign(t: S3Target, method: SignInput['method'], key: string, query?: Record<string, string>) {
	const { host, path } = target(t, key);
	return presign({
		method,
		host,
		path,
		query,
		region: t.region,
		accessKeyId: t.accessKeyId,
		secretAccessKey: t.secretAccessKey
	});
}

/** Merges the caller's abort signal with a timeout so neither can hang. */
function deadline(ms: number, outer?: AbortSignal): AbortSignal {
	const timer = AbortSignal.timeout(ms);
	return outer ? AbortSignal.any([outer, timer]) : timer;
}

function noteSkew(res: Response): void {
	const served = res.headers.get('Date');
	if (!served) return;
	const drift = Date.parse(served) - Date.now();
	clockSkewMs = Number.isFinite(drift) ? drift : 0;
}

async function classify(res: Response): Promise<S3Error> {
	let code = '';
	let message = '';
	try {
		const body = await res.text();
		code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? '';
		message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1] ?? '';
	} catch {
		/* an error response with no readable body is still an error */
	}
	if (res.status === 404 || code === 'NoSuchKey') return new S3Error('missing', 'Not found', 404, code);
	if (code === 'RequestTimeTooSkewed' || /expired|not yet current/i.test(message))
		return new S3Error(
			'clock',
			"This device's clock is wrong — the bucket rejected the request as out of date",
			res.status,
			code
		);
	if (res.status === 401 || res.status === 403)
		return new S3Error('auth', `The bucket refused these credentials (${code || res.status})`, res.status, code);
	return new S3Error('server', `The bucket returned ${res.status} ${code}`.trim(), res.status, code);
}

async function send(url: string, init: RequestInit): Promise<Response> {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch (e) {
		if (e instanceof DOMException && e.name === 'TimeoutError')
			return Promise.reject(new S3Error('unreachable', 'The bucket did not respond in time'));
		if (e instanceof DOMException && e.name === 'AbortError') throw e;
		// A missing CORS policy and being offline are the SAME opaque TypeError
		// here — there is no way to tell them apart from JS. The wording has to
		// name both, or setup eats an afternoon.
		throw new S3Error(
			'unreachable',
			"Can't reach the bucket. If you're online, its CORS rules are probably missing"
		);
	}
	noteSkew(res);
	if (!res.ok) throw await classify(res);
	return res;
}

export async function s3Put(t: S3Target, key: string, body: Blob, o?: Opt): Promise<void> {
	const url = await sign(t, 'PUT', key);
	await send(url, {
		method: 'PUT',
		body,
		headers: { 'content-type': body.type || 'application/octet-stream' },
		signal: deadline(PUT_TIMEOUT_MS, o?.signal)
	});
}

export async function s3Get(t: S3Target, key: string, o?: Opt): Promise<Blob> {
	const url = await sign(t, 'GET', key);
	const res = await send(url, { method: 'GET', signal: deadline(PUT_TIMEOUT_MS, o?.signal) });
	return res.blob();
}

export async function s3GetJson<T>(t: S3Target, key: string, o?: Opt): Promise<T> {
	const url = await sign(t, 'GET', key);
	const res = await send(url, { method: 'GET', signal: deadline(META_TIMEOUT_MS, o?.signal) });
	try {
		return (await res.json()) as T;
	} catch {
		throw new S3Error('parse', `${key} is not readable JSON`);
	}
}

/** Null means the object is simply not there, which is not an error to callers. */
export async function s3Head(
	t: S3Target,
	key: string,
	o?: Opt
): Promise<{ size: number; lastModified: number } | null> {
	const url = await sign(t, 'HEAD', key);
	try {
		const res = await send(url, { method: 'HEAD', signal: deadline(META_TIMEOUT_MS, o?.signal) });
		return {
			size: Number(res.headers.get('content-length') ?? 0),
			lastModified: Date.parse(res.headers.get('last-modified') ?? '') || 0
		};
	} catch (e) {
		if (e instanceof S3Error && e.kind === 'missing') return null;
		throw e;
	}
}

export async function s3Delete(t: S3Target, key: string, o?: Opt): Promise<void> {
	const url = await sign(t, 'DELETE', key);
	try {
		await send(url, { method: 'DELETE', signal: deadline(META_TIMEOUT_MS, o?.signal) });
	} catch (e) {
		// DELETE is idempotent; an already-absent key is a success, not a failure.
		if (e instanceof S3Error && e.kind === 'missing') return;
		throw e;
	}
}

export interface ListQuery {
	prefix?: string;
	startAfter?: string;
	maxKeys?: number;
	token?: string;
}

function parseList(xml: string): { items: S3Item[]; next: string | null; truncated: boolean } {
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	// `parseFromString` does NOT throw on malformed XML — it hands back a
	// <parsererror> document with zero <Contents>, which would otherwise read as
	// "the bucket is empty". Orphan GC deletes things based on that answer.
	if (doc.querySelector('parsererror')) throw new S3Error('parse', 'The bucket returned unreadable XML');

	const items: S3Item[] = [...doc.querySelectorAll('Contents')].map((el) => ({
		key: el.querySelector('Key')?.textContent ?? '',
		size: Number(el.querySelector('Size')?.textContent ?? 0),
		lastModified: Date.parse(el.querySelector('LastModified')?.textContent ?? '') || 0,
		etag: (el.querySelector('ETag')?.textContent ?? '').replace(/"/g, '')
	}));
	const truncated = doc.querySelector('IsTruncated')?.textContent === 'true';
	return {
		items,
		next: doc.querySelector('NextContinuationToken')?.textContent ?? null,
		truncated
	};
}

export async function s3ListPage(
	t: S3Target,
	q: ListQuery,
	o?: Opt
): Promise<{ items: S3Item[]; next: string | null; truncated: boolean }> {
	const query: Record<string, string> = { 'list-type': '2' };
	if (q.prefix) query.prefix = q.prefix;
	if (q.startAfter) query['start-after'] = q.startAfter;
	if (q.maxKeys) query['max-keys'] = String(q.maxKeys);
	if (q.token) query['continuation-token'] = q.token;

	const url = await sign(t, 'GET', '', query);
	const res = await send(url, { method: 'GET', signal: deadline(META_TIMEOUT_MS, o?.signal) });
	return parseList(await res.text());
}

/**
 * Every page, or an exception. **Never a partial result** — orphan GC decides
 * what to delete by subtracting one listing from another, so a silently short
 * listing there would delete live evidence.
 */
export async function s3List(t: S3Target, q: ListQuery, o?: Opt): Promise<S3Item[]> {
	const out: S3Item[] = [];
	let token: string | undefined;
	// R2's maximum page size is undocumented, so the loop runs regardless of
	// whether the first page looked complete.
	for (;;) {
		const page = await s3ListPage(t, { ...q, token }, o);
		out.push(...page.items);
		if (!page.truncated || !page.next) return out;
		token = page.next;
	}
}
