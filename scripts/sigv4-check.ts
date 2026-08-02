/**
 * Differential test for `src/lib/sigv4.ts`.
 *
 * Not a table of constants recalled from memory: bun ships a native S3
 * presigner (`Bun.S3Client.presign`) which produces path-style URLs with
 * `SignedHeaders=host` — the same canonicalisation this design uses. We parse
 * `X-Amz-Date` back out of bun's URL, feed it to our signer as `now`, and
 * assert the two URL strings are byte-identical. No timing race, no tolerance.
 *
 *   bun run check:sigv4
 */

import { presign } from '../src/lib/sigv4';

const ACCESS = 'AKIDEXAMPLE';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const BUCKET = 'examplebucket';

const METHODS = ['GET', 'PUT', 'DELETE', 'HEAD'] as const;
const KEYS = [
	'slots/9992145678901_0f8fad5b-d9cb-469f-a165-70867728950e.json',
	'photos/0f8fad5b-d9cb-469f-a165-70867728950e.jpg',
	// Pins the unreserved set exactly: space -> %20, + -> %2B, ~ survives.
	'a b/c+d~e.json'
];
const REGIONS = ['auto', 'us-east-1', 'eu-central-1'];
const EXTRA: Array<Record<string, string> | undefined> = [
	undefined,
	{ 'response-content-type': 'text/plain' }
];

let pass = 0;
const failures: string[] = [];

for (const region of REGIONS) {
	const endpoint = `https://s3.${region}.amazonaws.com`;
	const host = `s3.${region}.amazonaws.com`;
	for (const method of METHODS) {
		for (const key of KEYS) {
			for (const extra of EXTRA) {
				const theirs = Bun.S3Client.presign(key, {
					accessKeyId: ACCESS,
					secretAccessKey: SECRET,
					bucket: BUCKET,
					region,
					endpoint,
					expiresIn: 900,
					method,
					// bun spells `response-content-type` as `type`. This case is the
					// one that pins the merge-and-sort path LIST depends on.
					...(extra ? { type: extra['response-content-type'] } : {})
				});

				// Replay bun's own timestamp so the comparison is exact.
				const amzDate = new URL(theirs).searchParams.get('X-Amz-Date')!;
				const iso = `${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}.000Z`;

				const ours = await presign({
					method,
					host,
					path: `/${BUCKET}/${key}`,
					query: extra,
					region,
					accessKeyId: ACCESS,
					secretAccessKey: SECRET,
					expiresIn: 900,
					now: new Date(iso)
				});

				const label = `${method} ${region} ${key}${extra ? ' +query' : ''}`;
				if (ours === theirs) pass++;
				else failures.push(`${label}\n  bun:  ${theirs}\n  ours: ${ours}`);
			}
		}
	}
}

/**
 * The one gap, stated rather than hidden: `Bun.S3Client.presign('')` throws
 * `Invalid S3 bucket, key combination`, so the bucket-root URI that
 * ListObjectsV2 signs (`/bucket`, no key) cannot be diffed against it. Assert
 * the pieces directly instead. Everything else about LIST — the query merge,
 * the sort, the encoding, the key derivation — is covered by the matrix above,
 * and a wrong root URI is an immediate, loud 403 on first contact with a bucket.
 */
const listUrl = await presign({
	method: 'GET',
	host: 'acct.r2.cloudflarestorage.com',
	path: `/${BUCKET}`,
	query: { 'list-type': '2', prefix: 'slots/', 'max-keys': '1000' },
	region: 'auto',
	accessKeyId: ACCESS,
	secretAccessKey: SECRET,
	now: new Date('2026-08-02T12:00:00.000Z')
});
const q = new URL(listUrl).search.slice(1);
const order = q.split('&').map((p) => p.split('=')[0]);
// Byte order, not alphabetical-ish: `X-Amz-Signature` precedes
// `X-Amz-SignedHeaders` ('a' < 'e'), and every `X` (0x58) precedes the
// lowercase operation params. That last part is what LIST depends on.
const expected = [
	'X-Amz-Algorithm',
	'X-Amz-Credential',
	'X-Amz-Date',
	'X-Amz-Expires',
	'X-Amz-Signature',
	'X-Amz-SignedHeaders',
	'list-type',
	'max-keys',
	'prefix'
];
if (JSON.stringify(order) === JSON.stringify(expected)) pass++;
else failures.push(`LIST param order\n  want: ${expected.join(',')}\n  got:  ${order.join(',')}`);

if (!listUrl.startsWith(`https://acct.r2.cloudflarestorage.com/${BUCKET}?`))
	failures.push(`LIST root URI: ${listUrl.split('?')[0]}`);
else pass++;

console.log(`sigv4: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
	for (const f of failures) console.error('\nFAIL ' + f);
	process.exit(1);
}
