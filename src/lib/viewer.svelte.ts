/**
 * Browsing another machine's bucket, read-only.
 *
 * This used to be a separate screen, on the argument that viewing another
 * till's records is no reason to stop working. Then the archive became the slot
 * strip itself, and that argument inverted: with one list on screen, a save made
 * while browsing another machine would land in a list nobody can see. So while a
 * profile is open, **committing is blocked** — `app.blockSave()` says which
 * machine and how to leave. Counting, CLEAR and PHOTO are untouched; this is a
 * save block, not a read-only app.
 *
 * The invariant that makes it safe is unchanged: remote data lives here and only
 * here. It never reaches `app.slots`, so `#prune()` — which runs on save and
 * load and filters by the *local* retention window — can never see it, and no
 * persistence path can write it to this device's store.
 */

import { remoteFill, remoteIndex, remoteLock, remotePhoto } from './remote';
import { releaseRemotePhotos, remoteUrl } from './remotePhoto';
import type { CloudEntry, Remote } from './types';

const FILL_CONCURRENCY = 4;

export class Viewer {
	/**
	 * Session state only. The profile *list* lives on `app` so the settings card
	 * can manage it with none of this module loaded.
	 *
	 * Null active means the strip is showing this device's own slots and bucket.
	 */
	active = $state<Remote | null>(null);
	entries = $state<CloudEntry[]>([]);
	status = $state<'idle' | 'auth' | 'loading' | 'ready' | 'error'>('idle');
	error = $state('');

	/** Back to this device's own bucket. */
	showLocal(): void {
		this.active = null;
		this.entries = [];
		this.status = 'idle';
		this.error = '';
		releaseRemotePhotos();
	}

	/**
	 * Checks the source machine's PIN, then lists its bucket.
	 *
	 * Refuses on 403 and on a network failure rather than failing open: a
	 * viewer that shrugs and shows the data when it cannot verify is worse than
	 * one that does not check at all, because it implies a check happened.
	 *
	 * Returns the source PIN when one is set, so the caller can prompt. The PIN
	 * is handed back as a return value and never stored — the only PIN this
	 * device keeps is its own `app.lock.pin`.
	 */
	async requiredPin(r: Remote): Promise<string | null> {
		this.status = 'auth';
		this.error = '';
		const doc = await remoteLock(r);
		return doc?.pin ? doc.pin : null;
	}

	/**
	 * Lists a profile's bucket. Also the refresh path — `refresh()` is this call
	 * with the profile already open.
	 *
	 * **Clearing is conditional on actually switching.** Blanking a populated list
	 * on a failed refresh is the one thing that reads as data loss, and clearing
	 * up front made the catch block's promise to keep the old rows impossible to
	 * keep: there were none left to keep by the time it ran. Switching profiles
	 * still clears, because rows from the previous machine must never be on screen
	 * under this one's name.
	 */
	async open(r: Remote): Promise<void> {
		const switching = this.active?.id !== r.id;
		if (switching) {
			releaseRemotePhotos();
			this.entries = [];
		}
		this.active = r;
		this.status = 'loading';
		this.error = '';
		try {
			const index = await remoteIndex(r);
			// Cloud objects are immutable, so an entry already fetched stays valid
			// forever — a refresh only ever gains and loses rows. Carrying the
			// filled ones over keeps labels and totals on screen instead of
			// flashing back to placeholders, and saves re-fetching every body.
			if (switching) {
				this.entries = index;
			} else {
				const seen = new Map(this.entries.map((e) => [e.id, e]));
				this.entries = index.map((e) => {
					const old = seen.get(e.id);
					return old?.meta === 'ok' ? old : e;
				});
			}
			await this.#fill(r);
			this.status = 'ready';
		} catch (e) {
			this.status = 'error';
			this.error = e instanceof Error ? e.message : 'Could not read that bucket';
			// Whatever was listed before stays listed, with the error beside it.
		}
	}

	async refresh(): Promise<void> {
		if (this.active) await this.open(this.active);
	}

	async #fill(r: Remote): Promise<void> {
		const queue = this.entries.filter((e) => e.meta === 'pending');
		const work = async (): Promise<void> => {
			for (;;) {
				const e = queue.shift();
				if (!e) return;
				const filled = await remoteFill(r, e);
				const i = this.entries.findIndex((x) => x.id === filled.id);
				if (i >= 0) this.entries[i] = filled;
			}
		};
		await Promise.all(Array.from({ length: FILL_CONCURRENCY }, work));
	}

	photoUrl(entry: CloudEntry): Promise<string | null> {
		const r = this.active;
		if (!r || !entry.photoKey) return Promise.resolve(null);
		return remoteUrl(r.id, entry.id, () => remotePhoto(r, entry.photoKey!));
	}

	dispose(): void {
		releaseRemotePhotos();
	}
}

export const viewer = new Viewer();
