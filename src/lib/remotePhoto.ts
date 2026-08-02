/**
 * Object-URL cache for photos fetched from someone else's bucket.
 *
 * Keyed by `profileId + '/' + uuid`, not by uuid alone: two machines can hold
 * slots with different ids, but a shared key space is one rename away from
 * showing one till's evidence under another till's numbers. The composite key
 * makes that impossible rather than unlikely.
 *
 * Capped, because a 31-day bucket holds hundreds of ~1 MB JPEGs and keeping
 * them all as live Blobs will exhaust a phone.
 */

const MAX_CACHED = 12;

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export function remoteUrl(
	profileId: string,
	uuid: string,
	fetcher: () => Promise<Blob | null>
): Promise<string | null> {
	const id = `${profileId}/${uuid}`;
	const have = urls.get(id);
	if (have) {
		// Refresh LRU position.
		urls.delete(id);
		urls.set(id, have);
		return Promise.resolve(have);
	}

	let pending = inflight.get(id);
	if (!pending) {
		pending = fetcher()
			.then((blob) => {
				if (!blob) return null;
				const url = URL.createObjectURL(blob);
				urls.set(id, url);
				while (urls.size > MAX_CACHED) {
					const oldest = urls.keys().next().value;
					if (oldest === undefined) break;
					const dead = urls.get(oldest);
					if (dead) URL.revokeObjectURL(dead);
					urls.delete(oldest);
				}
				return url;
			})
			.finally(() => inflight.delete(id));
		inflight.set(id, pending);
	}
	return pending;
}

/** Runs on profile switch and on leaving the screen. Missing either leaks. */
export function releaseRemotePhotos(): void {
	for (const url of urls.values()) URL.revokeObjectURL(url);
	urls.clear();
	inflight.clear();
}
