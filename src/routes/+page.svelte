<script lang="ts">
	import { onMount } from 'svelte';
	import Camera from '$lib/components/Camera.svelte';
	import CameraPick from '$lib/components/CameraPick.svelte';
	import DenomList from '$lib/components/DenomList.svelte';
	import Keypad from '$lib/components/Keypad.svelte';
	import PhotoRequired from '$lib/components/PhotoRequired.svelte';
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

	onMount(() => {
		app.hydrate();

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

		return () => {
			mq.removeEventListener('change', sync);
			ro.disconnect();
			window.removeEventListener('resize', sync);
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

		{#if app.view === 'camera'}
			<Camera />
		{/if}
	</div>

	<SlotStrip />

	{#if app.view === 'settings'}
		<Settings />
	{/if}

	{#if app.view === 'campick'}
		<CameraPick />
	{/if}

	{#if app.view === 'needphoto'}
		<PhotoRequired />
	{/if}

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
