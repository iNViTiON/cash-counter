<script lang="ts">
	import { money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { ArchiveRow } from '$lib/types';

	const link = $derived(app.link);
	const rows = $derived(link?.merged ?? []);

	function open(row: ArchiveRow): void {
		app.openId = row.id;
		app.view = 'archslot';
	}

	// Fill in labels and totals for everything, not just the background batch —
	// the user is looking at the list, so the round trips are worth it here.
	$effect(() => {
		void app.link?.fillAllMeta();
	});
</script>

<div class="screen">
	<div class="bar">
		<div class="title">Archive</div>
		<div class="spacer"></div>
		<button type="button" class="btn refresh" onclick={() => app.link?.backupNow()}>REFRESH</button>
		<button type="button" class="btn-primary done" onclick={() => (app.view = null)}>DONE</button>
	</div>

	<div class="sc body">
		<div class="stack">
			<div class="hint">
				Everything this device has, plus everything in the bucket. Deleting here removes the local
				copy only — cloud objects go when the cloud retention window passes.
			</div>

			{#if link?.status === 'error' && link.lastError}
				<div class="hint err">{link.lastError}</div>
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
					{link ? 'Nothing here yet.' : 'Turn on cloud backup in settings first.'}
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
</style>
