<script lang="ts">
	import { onMount } from 'svelte';
	import Camera from '$lib/components/Camera.svelte';
	import CameraPick from '$lib/components/CameraPick.svelte';
	import DenomList from '$lib/components/DenomList.svelte';
	import Keypad from '$lib/components/Keypad.svelte';
	import Archive from '$lib/components/Archive.svelte';
	import PhotoRequired from '$lib/components/PhotoRequired.svelte';
	import PinGate from '$lib/components/PinGate.svelte';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import Settings from '$lib/components/Settings.svelte';
	import SlotDetail from '$lib/components/SlotDetail.svelte';
	import SlotStrip from '$lib/components/SlotStrip.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import TotalBar from '$lib/components/TotalBar.svelte';
	import { app } from '$lib/state.svelte';

	/** Save bar + total bar, which the keypad has to fit underneath in portrait. */
	const STACKED_CHROME = 150;
	/** Pad header plus its own padding. */
	const PAD_CHROME = 63;
	const PAD_ROWS = 4;
	/** Below this the header is dropped to buy the keys some height. */
	const MIN_ROW_WITH_HEADER = 34;

	let mid = $state<HTMLElement | null>(null);

	/** Landscape puts the keypad beside the list instead of under it. */
	const midDir = $derived(
		app.landscape && app.padOpen ? (app.padSide === 'left' ? 'row-reverse' : 'row') : 'column'
	);

	/**
	 * Sizes the keypad rows: as tall as the setting asks for, but never taller
	 * than the space actually left over.
	 */
	function measure(): void {
		if (!mid) return;
		// Overlays size themselves against this area too.
		app.midW = mid.clientWidth;
		app.midH = mid.clientHeight;
		const avail = mid.clientHeight - (app.landscape ? 0 : STACKED_CHROME);
		const pct = [25, 50, 75, 100].includes(app.cfg.padSize) ? app.cfg.padSize : 50;
		const want = Math.floor(((window.innerHeight * pct) / 100 - PAD_CHROME) / PAD_ROWS);
		const fits = Math.floor((avail - PAD_CHROME) / PAD_ROWS);

		if (fits >= MIN_ROW_WITH_HEADER) {
			app.padHdr = true;
			app.padRow = Math.min(want, fits);
		} else {
			app.padHdr = false;
			app.padRow = Math.max(
				20,
				Math.min(want, Math.floor((avail - MIN_ROW_WITH_HEADER) / PAD_ROWS))
			);
		}
	}

	/**
	 * The archive detail. A cloud-only row has no local `Slot`, so one is built
	 * from the cached index — it is display data only and never reaches storage.
	 */
	const archRow = $derived(app.link?.merged.find((r) => r.id === app.openId) ?? null);
	const archSlot = $derived(
		archRow
			? (archRow.local ?? {
					id: archRow.id,
					label: archRow.label,
					date: archRow.date,
					ts: archRow.ts,
					total: archRow.total,
					qty: archRow.cloud?.qty ?? {},
					photo: archRow.cloud?.photoKey ? { bytes: 0, w: 0, h: 0 } : null,
					updatedAt: archRow.ts
				})
			: null
	);
	const cloudPhoto = (): Promise<Blob | null> =>
		archRow?.cloud ? (app.link?.cloudPhoto(archRow.cloud) ?? Promise.resolve(null)) : Promise.resolve(null);

	onMount(() => {
		app.hydrate();
		// Deliberately not awaited: an async `onMount` callback has its teardown
		// discarded, which would leak every listener registered below.
		void app.load();

		const mq = window.matchMedia('(min-aspect-ratio: 1/1) and (min-width: 620px)');
		// Read the query on every trigger rather than trusting `change` alone —
		// some embedded browsers resize the viewport without firing it.
		const sync = () => {
			app.landscape = mq.matches;
			measure();
		};
		sync();
		mq.addEventListener('change', sync);

		const ro = new ResizeObserver(sync);
		if (mid) ro.observe(mid);
		window.addEventListener('resize', sync);
		// The first measurement lands before the layout has settled, so take
		// another one once the browser has actually painted.
		requestAnimationFrame(sync);

		// A phone can kill a backgrounded tab without ever running the teardown,
		// so the working count is written out the moment the page is hidden.
		const flush = () => {
			if (document.visibilityState === 'hidden') app.saveWorkspace();
		};
		document.addEventListener('visibilitychange', flush);

		return () => {
			mq.removeEventListener('change', sync);
			ro.disconnect();
			window.removeEventListener('resize', sync);
			document.removeEventListener('visibilitychange', flush);
			app.dispose();
		};
	});

	// Re-measure whenever the size setting or the orientation changes.
	$effect(() => {
		void app.cfg.padSize;
		void app.landscape;
		measure();
	});
</script>

<svelte:head>
	<title>EuroCash — cash counter</title>
</svelte:head>

<div class="app">
	<TopBar />

	<div class="mid" bind:this={mid} style:flex-direction={midDir}>
		<div class="col">
			<DenomList />
			<SaveBar />
			<TotalBar />
		</div>

		{#if app.padOpen}
			<Keypad />
		{/if}

		{#if app.view === 'slot'}
			<SlotDetail />
		{/if}

		<!-- Inside `.mid`, not in the full-screen Archive shell: SlotDetail's photo
		     placement measures against midW/midH and its overlay is absolute
		     against `.mid`. A fixed shell would size it against the wrong box. -->
		{#if app.view === 'archslot' && archRow}
			<SlotDetail
				slot={archSlot}
				where={archRow.where}
				readonly={!archRow.local}
				photoSrc={archRow.local ? null : cloudPhoto}
			/>
		{/if}

		{#if app.view === 'camera'}
			<Camera />
		{/if}
	</div>

	<SlotStrip />

	{#if app.view === 'settings'}
		<Settings />
	{/if}

	{#if app.view === 'archive'}
		<Archive />
	{/if}

	{#if app.view === 'campick'}
		<CameraPick />
	{/if}

	{#if app.view === 'needphoto'}
		<PhotoRequired />
	{/if}

	<!-- Not an `app.view` case: the gate has to paint *over* Settings, and `view`
	     is a single scalar that would unmount it. `.scrim` is z70 to its z60. -->
	<PinGate />

	<Toast />
</div>

<style>
	.app {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--sans);
		overflow: hidden;
	}

	.mid {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		align-items: stretch;
	}

	.col {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
