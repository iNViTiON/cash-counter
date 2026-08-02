/**
 * Backup to a bucket the user owns. There is no server of ours anywhere in
 * this: the browser signs SigV4 itself and talks to the bucket directly.
 *
 * This module is dynamically imported, and only when credentials exist. On an
 * unconfigured device nothing here is evaluated — no fetch, no probe, no timer,
 * no listener — which is how "offline is a hard requirement" survives a feature
 * that is, by definition, online.
 *
 * Named `link`, not `sync`: `+page.svelte` has a local `const sync` for the
 * layout listener and `svelte-kit sync` is in the check script.
 */

import {
	cloudReady,
	inv,
	LOCK_KEY,
	parseSlotKey,
	photoKey,
	readIndex,
	readKey,
	slotKey,
	writeIndex
} from './cloudcfg';
import { clockSkew, s3Delete, s3Get, s3GetJson, s3Head, s3List, s3Put, S3Error } from './s3';
import type { S3Target } from './s3';
import { readPhoto } from './store';
import { app } from './state.svelte';
import type { ArchiveRow, CloudCfg, CloudEntry, CloudStatus, Slot } from './types';

const DAY_MS = 864e5;
const PRUNE_EVERY_MS = 6 * 3600e3;
const GC_EVERY_MS = 24 * 3600e3;
const MAX_TRIES = 5;
const BACKOFF_BASE_MS = 60e3;
const BACKOFF_CAP_MS = 30 * 60e3;
/** How many cloud JSON bodies to fetch per background refresh. */
const META_BATCH = 50;
const META_CONCURRENCY = 4;
/** Another device may be mid-write between its photo PUT and its JSON PUT. */
const ORPHAN_GRACE_MS = 3600e3;

/** The JSON body of a `slots/…json` object. */
interface CloudSlot {
	v: 1;
	id: string;
	label: string;
	date: string;
	ts: number;
	total: number;
	qty: Record<number, string>;
	photo: boolean;
	device: string;
}

export class CloudLink {
	/** Owned by `app` so the settings card can edit it with no engine loaded. */
	get cfg(): CloudCfg {
		return app.cloudCfg;
	}

	index = $state<CloudEntry[]>(readIndex());
	status = $state<CloudStatus>('idle');
	lastError = $state('');
	/** Minutes of clock drift against the bucket, when it is worth mentioning. */
	skewMin = $state(0);

	#running: Promise<void> | null = null;
	#tries = new Map<string, { n: number; next: number }>();
	#abort: AbortController | null = null;
	#onOnline = () => void this.kick();
	#onVisible = () => {
		if (document.visibilityState === 'visible') void this.kick();
	};

	/**
	 * Slots still owed to the bucket. Derived, never stored — `syncedAt` already
	 * holds the fact, so there is no outbox to keep in step and no way for a
	 * queue entry to carry its own megabyte-sized copy of a photo.
	 */
	pending = $derived(app.slots.filter((s) => !s.syncedAt && s.ts >= this.cfg.syncFrom));

	/**
	 * Every slot not in the bucket, ignoring `syncFrom`.
	 *
	 * `pending` is what uploads on its own; this is the honest "not backed up"
	 * count. They differ for slots that existed before sync was switched on, and
	 * conflating them was a real bug: the button offering to back those up was
	 * gated on `pending.length`, which excludes exactly them, so it never
	 * appeared and the bucket stayed empty with nothing on screen to explain it.
	 */
	backlog = $derived(app.slots.filter((s) => !s.syncedAt));

	ready = $derived(cloudReady(this.cfg, readKey()));

	/**
	 * Local slots and cloud objects in one list, matched on `Slot.id` — a UUID,
	 * so cross-device collisions are impossible and there is no conflict
	 * resolution to design.
	 *
	 * Provenance comes from the cloud index, NOT from `syncedAt`. With the
	 * recommended cloudAge 31 / maxAge 7 every slot older than the local window
	 * legitimately becomes cloud-only while `syncedAt` still holds a timestamp.
	 */
	merged = $derived.by<ArchiveRow[]>(() => {
		const byId = new Map(this.index.map((e) => [e.id, e]));
		const out: ArchiveRow[] = [];
		for (const s of app.slots) {
			const c = byId.get(s.id);
			out.push({
				id: s.id,
				ts: s.ts,
				label: s.label,
				date: s.date,
				total: s.total,
				where: c ? 'both' : 'local',
				local: s,
				cloud: c ?? null
			});
			byId.delete(s.id);
		}
		for (const c of byId.values()) {
			out.push({
				id: c.id,
				ts: c.ts,
				label: c.label ?? '',
				date: c.date ?? '',
				total: c.total ?? 0,
				where: 'cloud',
				local: null,
				cloud: c
			});
		}
		return out.sort((a, b) => b.ts - a.ts);
	});

	get target(): S3Target | null {
		const key = readKey();
		if (!key) return null;
		return {
			endpoint: this.cfg.endpoint,
			bucket: this.cfg.bucket,
			region: this.cfg.region,
			style: this.cfg.style,
			...key
		};
	}

	start(): void {
		if (!this.cfg.deviceId) {
			this.cfg.deviceId = crypto.randomUUID();
			this.save();
		}
		window.addEventListener('online', this.#onOnline);
		document.addEventListener('visibilitychange', this.#onVisible);
		void this.kick();
	}

	stop(): void {
		window.removeEventListener('online', this.#onOnline);
		document.removeEventListener('visibilitychange', this.#onVisible);
		// A late response must never write into a torn-down store.
		this.#abort?.abort();
		this.#abort = null;
	}

	save(): void {
		app.persistCloud();
	}

	/** Forced, full run — clears every backoff so the user sees an immediate try. */
	backupNow(): Promise<void> {
		this.#tries.clear();
		return this.kick(true, true);
	}

	/** Queues everything, however old. The explicit "back up existing slots". */
	backupAll(): Promise<void> {
		this.cfg.syncFrom = 0;
		this.save();
		return this.backupNow();
	}

	/**
	 * `loud` is only true for a run the user asked for. A background run that
	 * fails must stay silent: it fires right after `#commit`, and a toast there
	 * would paint over the "Saved · …" the user actually needs to see. The
	 * failure still lands in `status`/`lastError`, which settings renders.
	 */
	kick(force = false, loud = false): Promise<void> {
		this.#running ??= this.#run(force, loud).finally(() => (this.#running = null));
		return this.#running;
	}

	async #run(force: boolean, loud: boolean): Promise<void> {
		const t = this.target;
		if (!this.cfg.on || !t) {
			this.status = 'off';
			return;
		}
		if (!navigator.onLine) {
			this.status = 'offline';
			return;
		}
		this.#abort = new AbortController();
		const signal = this.#abort.signal;
		this.status = 'busy';
		try {
			if (this.cfg.role === 'writer') await this.#upload(t, signal);
			await this.#refreshIndex(t, signal);
			if (this.cfg.role === 'writer') {
				await this.#prune(t, signal, force);
				await this.#gc(t, signal, force);
			}
			this.cfg.lastSyncAt = Date.now();
			this.save();
			this.skewMin = Math.round(clockSkew() / 60e3);
			this.lastError = '';
			this.status = 'idle';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			this.#fail(e, loud);
		}
	}

	#fail(e: unknown, loud: boolean): void {
		const msg = e instanceof Error ? e.message : 'Cloud backup failed';
		this.lastError = msg;
		this.status = 'error';
		const skew = e instanceof S3Error && e.kind === 'clock';
		if (loud) app.say(skew ? 'Clock is wrong — the bucket refused the write' : msg);
	}

	/* ---------- upload ---------- */

	async #upload(t: S3Target, signal: AbortSignal): Promise<void> {
		// Oldest first, and sequential: the mobile uplink is the bottleneck, so
		// concurrency buys nothing here and complicates aborting.
		const queue = [...this.pending].sort((a, b) => a.ts - b.ts);
		const now = Date.now();
		for (const slot of queue) {
			const state = this.#tries.get(slot.id);
			if (state && (state.n >= MAX_TRIES || now < state.next)) continue;
			try {
				await this.#uploadOne(t, slot, state?.n ?? 0, signal);
				this.#tries.delete(slot.id);
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') throw e;
				// A bad key or a wrong clock will not fix itself by retrying the
				// next slot, and every attempt burns a Class A operation.
				if (e instanceof S3Error && (e.kind === 'auth' || e.kind === 'clock')) throw e;
				const n = (state?.n ?? 0) + 1;
				this.#tries.set(slot.id, {
					n,
					next: Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** n, BACKOFF_CAP_MS)
				});
			}
		}
	}

	async #uploadOne(t: S3Target, slot: Slot, tries: number, signal: AbortSignal): Promise<void> {
		const p = this.cfg.prefix;
		if (slot.photo) {
			const pk = photoKey(p, slot.id);
			// On a retry the photo may already be up there; HEAD is CORS-simple and
			// far cheaper than re-sending a megabyte after a timeout.
			const there = tries > 0 ? await s3Head(t, pk, { signal }) : null;
			if (!there?.size) {
				const blob = await readPhoto(slot.id);
				if (blob) await s3Put(t, pk, blob, { signal });
			}
		}

		// The JSON is the commit record, so it goes SECOND, always. A crash
		// between the two leaves a collectable orphan photo; reversed, it leaves
		// a slot pointing at evidence that is not there.
		const body: CloudSlot = {
			v: 1,
			id: slot.id,
			label: slot.label,
			date: slot.date,
			ts: slot.ts,
			total: slot.total,
			qty: slot.qty,
			photo: Boolean(slot.photo),
			device: this.cfg.deviceId
		};
		const json = new Blob([JSON.stringify(body)], { type: 'application/json' });
		await s3Put(t, slotKey(p, slot.ts, slot.id), json, { signal });

		await app.markSynced(slot.id, Date.now());
	}

	/* ---------- index ---------- */

	async #refreshIndex(t: S3Target, signal: AbortSignal): Promise<void> {
		const items = await s3List(t, { prefix: `${this.cfg.prefix}slots/` }, { signal });
		const seen = new Map(this.index.map((e) => [e.id, e]));
		const next: CloudEntry[] = [];
		for (const it of items) {
			const parsed = parseSlotKey(it.key);
			if (!parsed) continue;
			const old = seen.get(parsed.id);
			// Cloud objects are immutable, so an entry already fetched stays valid
			// forever — the index only ever gains and loses rows.
			next.push(old?.meta === 'ok' ? old : { ...parsed, key: it.key, meta: 'pending' });
		}
		next.sort((a, b) => b.ts - a.ts);
		this.index = next;
		writeIndex($state.snapshot(next));
		await this.#fillMeta(t, signal, META_BATCH);
	}

	/** Fetches the JSON bodies the listing could not give us. Bounded. */
	async #fillMeta(t: S3Target, signal: AbortSignal, limit: number): Promise<void> {
		const todo = this.index.filter((e) => e.meta === 'pending').slice(0, limit);
		if (!todo.length) return;
		const queue = [...todo];
		const work = async (): Promise<void> => {
			for (;;) {
				const e = queue.shift();
				if (!e) return;
				try {
					const body = await s3GetJson<CloudSlot>(t, e.key, { signal });
					Object.assign(e, {
						label: body.label,
						date: body.date,
						total: body.total,
						qty: body.qty,
						photoKey: body.photo ? photoKey(this.cfg.prefix, e.id) : undefined,
						meta: 'ok' as const
					});
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') throw err;
					e.meta = 'failed';
				}
			}
		};
		await Promise.all(Array.from({ length: META_CONCURRENCY }, work));
		this.index = [...this.index];
		writeIndex($state.snapshot(this.index));
	}

	/** Called by the archive screen, where the user is looking and wants it all. */
	async fillAllMeta(): Promise<void> {
		const t = this.target;
		if (!t || !navigator.onLine) return;
		const c = new AbortController();
		try {
			await this.#fillMeta(t, c.signal, Number.MAX_SAFE_INTEGER);
		} catch {
			/* the rows stay pending and the screen says so */
		}
	}

	/* ---------- retention ---------- */

	async #prune(t: S3Target, signal: AbortSignal, force: boolean): Promise<void> {
		if (!force && Date.now() - this.cfg.lastPruneAt < PRUNE_EVERY_MS) return;
		const cut = Date.now() - this.cfg.cloudAge * DAY_MS;
		// Inverted keys put the oldest objects LAST, so one `start-after` at the
		// cutoff returns exactly the expired set — no client-side filtering, no
		// over-fetch. `~` exceeds every character a UUID can hold, so a slot at
		// exactly `ts === cut` is excluded, matching `#prune()`'s inclusive `>=`.
		const expired = await s3List(
			t,
			{ prefix: `${this.cfg.prefix}slots/`, startAfter: `${this.cfg.prefix}slots/${inv(cut)}_~` },
			{ signal }
		);
		for (const it of expired) {
			const parsed = parseSlotKey(it.key);
			if (!parsed) continue;
			// JSON first, photo second — the mirror of the upload order, and for
			// the same reason: a crash must leave a collectable orphan, never a
			// slot whose evidence has gone.
			await s3Delete(t, it.key, { signal });
			await s3Delete(t, photoKey(this.cfg.prefix, parsed.id), { signal });
		}
		this.cfg.lastPruneAt = Date.now();
		this.save();
		if (expired.length) await this.#refreshIndex(t, signal);
	}

	/* ---------- orphan collection ---------- */

	/**
	 * Photos no slot claims. This is the one operation here that can destroy
	 * live evidence, so it is all-or-nothing: any short, aborted or unparseable
	 * listing abandons the pass without deleting anything. A truncated `slots/`
	 * listing makes live photos look orphaned, and a `<parsererror>` document
	 * looks exactly like an empty bucket.
	 */
	async #gc(t: S3Target, signal: AbortSignal, force: boolean): Promise<void> {
		if (!force && Date.now() - this.cfg.lastGcAt < GC_EVERY_MS) return;
		const p = this.cfg.prefix;

		let slots, photos;
		try {
			slots = await s3List(t, { prefix: `${p}slots/` }, { signal });
			photos = await s3List(t, { prefix: `${p}photos/` }, { signal });
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') throw e;
			return; // deliberately silent: deleting nothing is always the safe answer
		}

		const live = new Set(slots.map((s) => parseSlotKey(s.key)?.id).filter(Boolean));
		const cutoff = Date.now() - ORPHAN_GRACE_MS;
		const orphans = photos.filter((ph) => {
			const id = ph.key.slice(`${p}photos/`.length).replace(/\.jpg$/, '');
			return !live.has(id) && ph.lastModified > 0 && ph.lastModified < cutoff;
		});

		// No healthy bucket is ever half orphans. If it looks that way, the
		// `slots/` listing is what is wrong, not the bucket.
		if (photos.length && orphans.length > photos.length / 2) {
			this.lastError = 'Orphan sweep looked wrong and was skipped';
			return;
		}
		for (const o of orphans) await s3Delete(t, o.key, { signal });
		this.cfg.lastGcAt = Date.now();
		this.save();
	}

	/* ---------- archive reads ---------- */

	/** Fetches a cloud photo. Deliberately not cached locally — caching it would
	 *  quietly defeat the shorter local retention window the user chose. */
	async cloudPhoto(entry: CloudEntry): Promise<Blob | null> {
		const t = this.target;
		if (!t || !entry.photoKey) return null;
		try {
			return await s3Get(t, entry.photoKey);
		} catch {
			return null;
		}
	}

	/** One cheap round trip, used by TEST CONNECTION. */
	async probe(): Promise<string> {
		const t = this.target;
		if (!t) return 'Fill in the endpoint, bucket and keys first';
		try {
			await s3List(t, { prefix: this.cfg.prefix, maxKeys: 1 });
			this.skewMin = Math.round(clockSkew() / 60e3);
			const drift = Math.abs(this.skewMin);
			return drift > 5 ? `Reached the bucket, but this device's clock is ${drift} min out` : 'Bucket reachable';
		} catch (e) {
			return e instanceof Error ? e.message : 'Could not reach the bucket';
		}
	}

	/** Publishes the PIN so a viewer device can check it. See CLAUDE.md. */
	async publishLock(pin: string): Promise<void> {
		const t = this.target;
		if (!t || this.cfg.role !== 'writer') return;
		const body = new Blob([JSON.stringify({ v: 1, pin, ts: Date.now() })], {
			type: 'application/json'
		});
		try {
			await s3Put(t, LOCK_KEY(this.cfg.prefix), body);
		} catch {
			/* the PIN still works locally; the viewer check is the only casualty */
		}
	}
}

export const link = new CloudLink();
