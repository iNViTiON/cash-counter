<script lang="ts">
	import { dmy, hm, money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { ArchiveRow } from '$lib/types';

	/**
	 * The slot strip without the six-chip cap. This is what the archive screen
	 * used to be — a sheet rather than a screen, because it lists the same rows
	 * from the same source and a whole screen implied a second place data lives.
	 */
	const rows = $derived(app.rows);
	const remote = $derived(app.viewing);

	function where(row: ArchiveRow): string {
		if (row.where === 'both') return 'On this device and in the cloud';
		if (row.where === 'local') return 'On this device — not backed up yet';
		return remote ? `In ${remote.name}’s bucket` : 'In the cloud only — no longer on this device';
	}

	function open(row: ArchiveRow): void {
		app.openId = row.id;
		app.view = 'slot';
		app.allOpen = false;
	}
</script>

<div class="wrap">
	<div
		class="back"
		role="presentation"
		onclick={() => (app.allOpen = false)}
	></div>
	<div class="sheet">
		<div class="head">
			<div class="title">ALL SLOTS</div>
			<div class="src" class:on={remote}>
				<span class="src-icon">{remote ? '☁' : '▣'}</span>
				<span class="src-name">{remote ? remote.name.toUpperCase() : 'THIS DEVICE'}</span>
			</div>
			<div class="spacer"></div>
			<div class="count">{rows.length} {rows.length === 1 ? 'count' : 'counts'}</div>
			<button type="button" class="btn close" title="Close" onclick={() => (app.allOpen = false)}>
				✕
			</button>
		</div>

		<div class="sc body">
			{#each rows as row (row.id)}
				<button type="button" class="row" title={where(row)} onclick={() => open(row)}>
					<span class="marks">
						{#if row.where !== 'cloud'}<span class="m-dev">▣</span>{/if}
						{#if row.where !== 'local'}<span class="m-cloud">☁</span>{/if}
					</span>
					<span class="text">
						<span class="name">
							{row.label || (row.cloud?.meta === 'pending' ? '…' : 'Untitled')}
						</span>
						<span class="stamp">
							{dmy(new Date(row.ts))}
							{hm(new Date(row.ts))}{row.local?.photo || row.cloud?.photoKey ? ' · photo' : ''}
						</span>
					</span>
					<span class="total">{money(row.total)}</span>
				</button>
			{/each}

			{#if !rows.length}
				<div class="none">{remote ? 'Nothing in that bucket.' : 'Nothing saved yet.'}</div>
			{/if}
		</div>

		<div class="legend">
			<span>▣ on this device</span>
			<span>☁ in the cloud</span>
			<span>◉ photo evidence</span>
		</div>
	</div>
</div>

<style>
	.wrap {
		position: fixed;
		inset: 0;
		z-index: 64;
		background: rgba(8, 8, 10, 0.74);
		display: flex;
		align-items: flex-end;
	}

	.back {
		position: absolute;
		inset: 0;
	}

	.sheet {
		position: relative;
		width: 100%;
		max-height: 78%;
		display: flex;
		flex-direction: column;
		background: var(--bar);
		border-top: 1px solid var(--line-strong);
		border-radius: 14px 14px 0 0;
	}

	.head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line-soft);
	}

	.title {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--fg);
	}

	.src {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 22px;
		padding: 0 9px;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: var(--chip);
		color: var(--fg-dim);
	}

	.src.on {
		background: var(--view-bg);
		border-color: var(--view-line);
		color: var(--view-fg);
	}

	.src-icon {
		font-size: 10px;
		line-height: 1;
	}

	.src-name {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.spacer {
		flex: 1;
	}

	.count {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted-3);
		white-space: nowrap;
	}

	.close {
		width: 34px;
		height: 34px;
		padding: 0;
		font-size: 14px;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line-soft);
		border-radius: 10px;
		background: var(--card);
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.row:hover {
		border-color: #3a3e45;
	}

	.marks {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 2px;
		width: 26px;
		font-size: 11px;
		line-height: 1;
	}

	.m-dev {
		color: #9aa0a8;
	}

	.m-cloud {
		color: var(--view);
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stamp {
		display: block;
		margin-top: 1px;
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-3);
	}

	.total {
		flex: 0 0 auto;
		font-family: var(--mono);
		font-size: 14px;
		font-weight: 700;
		color: var(--acc);
		white-space: nowrap;
	}

	.legend {
		flex: 0 0 auto;
		display: flex;
		gap: 14px;
		padding: 9px 14px;
		border-top: 1px solid var(--line-soft);
		font-size: 9px;
		letter-spacing: 0.04em;
		color: var(--muted-4);
	}
</style>
