<script lang="ts">
	import { dmy, hm, money } from '$lib/format';
	import { app } from '$lib/state.svelte';

	/** The save date is already shown separately, so drop it from the name. */
	const stripDate = (label: string): string => label.replace(/\s\d{2}\/\d{2}\/\d{4}$/, '');

	const quickInfo = $derived(
		app.quick
			? `${money(app.quick.total)}\n${dmy(new Date(app.quick.ts))} ${hm(new Date(app.quick.ts))}`
			: 'empty'
	);

	function open(id: string): void {
		app.openId = id;
		app.view = 'slot';
	}
</script>

<footer>
	<div class="sc rail">
		<div class="rail-cap">SLOTS</div>

		<!-- `app.ready` or this asserts "nothing saved" during the IDB read. -->
		{#if app.ready && !app.slots.length}
			<div class="empty">No saved slots yet</div>
		{/if}

		{#each app.slots as slot (slot.id)}
			<button
				type="button"
				class="slot"
				class:on={app.openId === slot.id}
				onclick={() => open(slot.id)}
			>
				<div class="line">
					<span class="name">{stripDate(slot.label)}</span>
					<span class="date">{slot.date}</span>
					{#if slot.photo}<span class="dot">◉</span>{/if}
				</div>
				<div class="total">{money(slot.total)}</div>
			</button>
		{/each}
	</div>

	<div class="quick">
		<div class="rail-cap">QUICK</div>
		<div class="quick-btns">
			<button type="button" class="btn tiny" onclick={() => app.quickSave()}>SAVE</button>
			<button type="button" class="btn tiny" onclick={() => app.quickLoad()}>LOAD</button>
		</div>
		<div class="quick-info">{quickInfo}</div>
	</div>
</footer>

<style>
	footer {
		flex: 0 0 auto;
		display: flex;
		align-items: stretch;
		gap: 8px;
		padding: 8px 10px;
		background: var(--strip);
		border-top: 1px solid var(--line);
	}

	.rail {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: 2px;
	}

	.rail-cap {
		flex: 0 0 auto;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--muted-3);
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		height: 44px;
		text-align: center;
	}

	.empty {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		height: 48px;
		padding: 0 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 9px;
		font-size: 11px;
		color: var(--muted-3);
		letter-spacing: 0.04em;
	}

	.slot {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		height: 48px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--card);
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.slot.on {
		background: var(--chip-on);
		border-color: var(--acc);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.name {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--fg);
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-2);
	}

	.dot {
		font-size: 9px;
		color: var(--muted-2);
	}

	.total {
		font-family: var(--mono);
		font-size: 13px;
		font-weight: 700;
		color: var(--acc);
		white-space: nowrap;
	}

	.quick {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 6px;
		padding-left: 10px;
		border-left: 1px solid var(--line);
	}

	.quick-btns {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tiny {
		height: 22px;
		padding: 0 12px;
		border-radius: 6px;
		font-size: 10px;
	}

	.quick-info {
		font-family: var(--mono);
		font-size: 9px;
		line-height: 1.3;
		color: var(--muted-3);
		width: 60px;
		white-space: pre-line;
	}
</style>
