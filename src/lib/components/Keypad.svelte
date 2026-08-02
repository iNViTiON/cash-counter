<script lang="ts">
	import { denomLabel, money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { PadKey } from '$lib/types';

	type Kind = 'num' | 'act' | 'acc' | 'warn';
	const KEYS: Array<{ t: string; k: PadKey; kind: Kind }> = [
		{ t: '7', k: '7', kind: 'num' },
		{ t: '8', k: '8', kind: 'num' },
		{ t: '9', k: '9', kind: 'num' },
		{ t: '⌫', k: 'del', kind: 'warn' },
		{ t: '4', k: '4', kind: 'num' },
		{ t: '5', k: '5', kind: 'num' },
		{ t: '6', k: '6', kind: 'num' },
		{ t: 'CLR', k: 'clr', kind: 'warn' },
		{ t: '1', k: '1', kind: 'num' },
		{ t: '2', k: '2', kind: 'num' },
		{ t: '3', k: '3', kind: 'num' },
		{ t: '▲ PREV', k: 'prev', kind: 'acc' },
		{ t: '0', k: '0', kind: 'num' },
		{ t: '00', k: '00', kind: 'num' },
		{ t: 'HIDE', k: 'hide', kind: 'act' },
		{ t: '▼ NEXT', k: 'next', kind: 'acc' }
	];

	// Keys keep their 1.15:1 shape, so the pad's width follows its row height.
	const gridWidth = $derived(Math.round(app.padRow * 1.15) * 4 + 18 + 16);
	const qty = $derived(parseInt(app.qty[app.activeCents], 10) || 0);
</script>

<div class="wrap" style:width={app.landscape ? `${gridWidth}px` : '100%'}>
	<div class="pad">
		{#if app.padHdr}
			<div class="head">
				<div class="which">{app.activeCents === undefined ? '' : denomLabel(app.activeCents)}</div>
				<div class="spacer"></div>
				<div class="value">
					{qty ? `×${qty}  =  ${money(app.activeCents * qty)}` : 'empty'}
				</div>
			</div>
		{/if}

		<div class="grid" style:grid-auto-rows={`${app.padRow}px`} style:max-width={`${gridWidth}px`}>
			{#each KEYS as key (key.k)}
				<button type="button" class="pad-key {key.kind}" onclick={() => app.press(key.k)}>
					{key.t}
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.wrap {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.pad {
		background: var(--bar);
		border-top: 1px solid var(--line);
		border-left: 1px solid var(--line);
		border-right: 1px solid var(--line);
	}

	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--line-soft);
	}

	.spacer {
		flex: 1;
	}

	.which {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
		color: var(--acc);
	}

	.value {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted);
	}

	.grid {
		flex: 0 0 auto;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		padding: 8px;
		width: 100%;
		margin: 0 auto;
	}

	/* Key skins live in app.css as `.pad-key` — the PIN pad needs the same ones. */
</style>
