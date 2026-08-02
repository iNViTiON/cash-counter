<script lang="ts">
	import { money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { ArchiveRow } from '$lib/types';

	const link = $derived(app.link);
	const viewing = $derived(app.viewer?.active ?? null);

	/**
	 * Own bucket: local slots merged with cloud objects, badged. Another
	 * machine's: its objects alone, read-only. Nothing from a remote bucket ever
	 * enters `app.slots`, so local retention pruning can never see it.
	 */
	const rows = $derived<ArchiveRow[]>(
		viewing
			? (app.viewer?.entries ?? []).map((e) => ({
					id: e.id,
					ts: e.ts,
					label: e.label ?? '',
					date: e.date ?? '',
					total: e.total ?? 0,
					where: 'cloud' as const,
					local: null,
					cloud: e
				}))
			: (link?.merged ?? [])
	);

	function open(row: ArchiveRow): void {
		app.openId = row.id;
		app.view = 'archslot';
	}

	// Fill in labels and totals for everything, not just the background batch —
	// the user is looking at the list, so the round trips are worth it here.
	$effect(() => {
		if (!app.viewer?.active) void app.link?.fillAllMeta();
	});
</script>

<div class="screen">
	<div class="bar">
		<div class="title">Archive</div>
		<div class="spacer"></div>
		<button
			type="button"
			class="btn refresh"
			onclick={() => (viewing ? app.viewer?.refresh() : app.link?.backupNow())}
		>
			REFRESH
		</button>
		<button type="button" class="btn-primary done" onclick={() => (app.view = null)}>DONE</button>
	</div>

	<div class="sc body">
		<div class="stack">
			{#if app.remotes.length}
				<div class="seg picker">
					<!-- Only offered when this device actually has a bucket of its own.
					     A view-only tablet has nothing to show under "this device". -->
					{#if link}
						<button type="button" class:on={!viewing} onclick={() => app.viewer?.showLocal()}>
							THIS DEVICE
						</button>
					{/if}
					{#each app.remotes as r (r.id)}
						<button type="button" class:on={viewing?.id === r.id} onclick={() => app.openRemote(r.id)}>
							{r.name.toUpperCase()}
						</button>
					{/each}
				</div>
			{/if}

			<div class="hint">
				{#if !viewing && !link && app.remotes.length}
					This device has no bucket of its own. Pick a machine above to read its counts,
					read-only.
				{:else if viewing}
					Read-only view of <b>{viewing.name}</b>. Nothing here is stored on this device, and
					nothing here can be deleted from this app.
				{:else}
					Everything this device has, plus everything in the bucket. Deleting here removes the
					local copy only — cloud objects go when the cloud retention window passes.
				{/if}
			</div>

			{#if viewing && app.viewer?.status === 'loading'}
				<div class="hint">Reading {viewing.name}…</div>
			{/if}
			{#if viewing ? app.viewer?.error : link?.status === 'error' && link.lastError}
				<div class="hint err">{viewing ? app.viewer?.error : link?.lastError}</div>
			{/if}

			<div class="labels">
				{#each rows as row (row.id)}
					<button type="button" class="slot-row row" onclick={() => open(row)}>
						<div class="text">
							<div class="slot-name">
								{row.label || (row.cloud?.meta === 'pending' ? '…' : 'Untitled')}
							</div>
							<div class="stamp">{row.date}</div>
						</div>
						<div class="badge {row.where}">{row.where.toUpperCase()}</div>
						<div class="slot-total">{money(row.total)}</div>
					</button>
				{/each}
			</div>

			{#if !rows.length}
				<div class="none">
					{#if viewing}
						Nothing in that bucket.
					{:else if link}
						Nothing here yet.
					{:else if app.remotes.length}
						Pick a machine above to view its counts.
					{:else}
						Turn on cloud backup, or add a viewer profile, in settings first.
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--bg);
		display: flex;
		flex-direction: column;
	}

	.bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 12px;
		background: var(--bar);
		border-bottom: 1px solid var(--line);
	}

	.title {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg);
	}

	.spacer {
		flex: 1;
	}

	.refresh {
		height: 38px;
		padding: 0 14px;
		font-size: 11px;
	}

	.done {
		height: 38px;
		padding: 0 18px;
		font-size: 12px;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 14px;
	}

	.stack {
		max-width: 820px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.row {
		width: 100%;
		border: 0;
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	/*
	 * Text, not glyphs: `◉` is already the photo dot in the slot strip, and a
	 * second glyph vocabulary is a thing to misread at a glance.
	 */
	.badge {
		flex: 0 0 auto;
		padding: 3px 7px;
		border-radius: 5px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--muted-3);
	}

	.badge.cloud {
		background: var(--chip);
		color: var(--muted);
	}

	.badge.both {
		background: var(--chip-on);
		color: var(--acc);
	}

	.err {
		color: var(--danger);
	}

	.picker {
		flex-wrap: wrap;
	}

	.picker button {
		flex: 1 1 auto;
		min-width: 96px;
		padding: 0 12px;
	}
</style>
