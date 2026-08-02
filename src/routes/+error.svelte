<script lang="ts">
	import { page } from '$app/state';

	/**
	 * The recovery screen. Two rules shaped it:
	 *
	 * 1. **It must never depend on app code.** Whatever broke is in that code, so
	 *    this page opens IndexedDB with the raw API and imports nothing from
	 *    `$lib`. A rescue path that can fail the same way is not a rescue path.
	 * 2. **It must never touch saved counts.** Clearing "site data" in browser
	 *    settings deletes them; that advice is a foot-gun on a till. The button
	 *    here removes the service worker and its cached files only, and says so.
	 */
	const DB = 'eurocash';

	let busy = $state(false);
	let note = $state('');
	let showDetail = $state(false);

	const detail = $derived((page.error as { detail?: string } | null)?.detail ?? '');

	function openDb(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(DB);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('Close the app’s other tabs first'));
		});
	}

	function readStore<T>(db: IDBDatabase, store: string): Promise<{ keys: IDBValidKey[]; values: T[] }> {
		return new Promise((resolve, reject) => {
			if (!db.objectStoreNames.contains(store)) return resolve({ keys: [], values: [] });
			const tx = db.transaction([store], 'readonly');
			const os = tx.objectStore(store);
			const k = os.getAllKeys();
			const v = os.getAll();
			tx.oncomplete = () => resolve({ keys: k.result, values: v.result as T[] });
			tx.onerror = () => reject(tx.error);
		});
	}

	const blobToDataUrl = (b: Blob): Promise<string> =>
		new Promise((res) => {
			const r = new FileReader();
			r.onload = () => res(String(r.result));
			r.onerror = () => res('');
			r.readAsDataURL(b);
		});

	/** Writes everything out, photos included, so the file alone is a full backup. */
	async function rescue(): Promise<void> {
		busy = true;
		note = 'Reading saved counts…';
		try {
			const db = await openDb();
			const slots = await readStore<Record<string, unknown>>(db, 'slots');
			const photos = await readStore<Blob>(db, 'photos');
			db.close();

			const photoMap: Record<string, string> = {};
			for (let i = 0; i < photos.keys.length; i++) {
				const blob = photos.values[i];
				if (blob instanceof Blob) photoMap[String(photos.keys[i])] = await blobToDataUrl(blob);
			}

			const dump = {
				app: 'eurocash',
				exportedAt: new Date().toISOString(),
				slots: slots.values,
				photos: photoMap,
				settings: {
					cfg: localStorage.getItem('ec.cfg'),
					ws: localStorage.getItem('ec.ws')
				}
			};

			const url = URL.createObjectURL(
				new Blob([JSON.stringify(dump)], { type: 'application/json' })
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = `eurocash-backup-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			note = `Saved ${slots.values.length} slots and ${Object.keys(photoMap).length} photos to your downloads.`;
		} catch (e) {
			note = `Could not read the saved counts: ${e instanceof Error ? e.message : String(e)}`;
		}
		busy = false;
	}

	/**
	 * Service worker and its caches only. IndexedDB and localStorage are left
	 * alone deliberately — that is where the counts and photos live.
	 */
	async function clearAppFiles(): Promise<void> {
		busy = true;
		note = 'Removing cached app files…';
		try {
			if ('serviceWorker' in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				await Promise.all(regs.map((r) => r.unregister()));
			}
			if ('caches' in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			}
			note = 'Cleared. Reloading…';
			setTimeout(() => location.reload(), 600);
		} catch (e) {
			note = `Could not clear: ${e instanceof Error ? e.message : String(e)}`;
			busy = false;
		}
	}
</script>

<div class="wrap">
	<div class="card box">
		<div class="code">{page.status}</div>
		<div class="title">EuroCash could not start</div>
		<div class="msg">{page.error?.message ?? 'Unknown error'}</div>

		<div class="acts">
			<button type="button" class="btn-primary act" onclick={rescue} disabled={busy}>
				SAVE MY COUNTS TO A FILE
			</button>
			<button type="button" class="btn act" onclick={clearAppFiles} disabled={busy}>
				CLEAR APP FILES AND RELOAD
			</button>
		</div>

		<div class="safe">
			Clearing app files removes the cached program only. Your saved counts and photos stay on this
			device. Do <b>not</b> use the browser's "clear site data" — that deletes them.
		</div>

		{#if note}<div class="note">{note}</div>{/if}

		{#if detail}
			<button type="button" class="more" onclick={() => (showDetail = !showDetail)}>
				{showDetail ? '▾' : '▸'} TECHNICAL DETAIL
			</button>
			{#if showDetail}
				<pre class="detail">{detail}</pre>
			{/if}
		{/if}
	</div>
</div>

<style>
	.wrap {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 18px;
		background: var(--bg);
		overflow-y: auto;
	}

	.box {
		width: 100%;
		max-width: 460px;
		display: flex;
		flex-direction: column;
		gap: 11px;
	}

	.code {
		font-family: var(--mono);
		font-size: 32px;
		font-weight: 700;
		color: var(--danger);
		line-height: 1;
	}

	.title {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--fg);
	}

	.msg {
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.5;
		color: var(--muted);
		word-break: break-word;
	}

	.acts {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
	}

	.act {
		height: 46px;
		border-radius: 9px;
		font-size: 11px;
	}

	.safe {
		font-size: 11px;
		line-height: 1.55;
		color: var(--muted-3);
	}

	.safe b {
		color: var(--danger);
	}

	.note {
		font-size: 11px;
		line-height: 1.5;
		color: var(--acc);
	}

	.more {
		align-self: flex-start;
		padding: 6px 0;
		border: 0;
		background: transparent;
		color: var(--muted-2);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
	}

	.detail {
		margin: 0;
		padding: 10px;
		max-height: 220px;
		overflow: auto;
		border-radius: 9px;
		background: var(--sunk);
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 10px;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
