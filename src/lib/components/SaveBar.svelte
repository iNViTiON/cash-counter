<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<div class="no-sb bar">
	<div class="title">SAVE AS</div>

	<div class="chips">
		{#each app.cfg.labels as name (name)}
			<button
				type="button"
				class="chip"
				class:on={name === app.saveLabel}
				onclick={() => (app.saveLabel = name)}
			>
				{name}
			</button>
		{/each}
	</div>

	<div class="seg">
		<button
			type="button"
			class:on={app.saveDay === 'today'}
			onclick={() => (app.saveDay = 'today')}
		>
			TODAY
		</button>
		<button
			type="button"
			class:on={app.saveDay === 'yesterday'}
			onclick={() => (app.saveDay = 'yesterday')}
		>
			YESTERDAY
		</button>
	</div>

	<div class="date">{app.filedOn}</div>
</div>

<style>
	.bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 12px;
		background: var(--strip);
		border-top: 1px solid var(--line);
		overflow-x: auto;
		overflow-y: hidden;
	}

	.title {
		flex: 0 0 auto;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--muted-3);
	}

	.chips {
		flex: 0 0 auto;
		display: flex;
		gap: 5px;
	}

	.chip {
		height: 32px;
		padding: 0 12px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		cursor: pointer;
		font-family: var(--sans);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		background: var(--chip);
		color: var(--fg-dim);
	}

	.chip.on {
		background: var(--acc);
		border-color: var(--acc);
		color: var(--acc-ink);
	}

	.seg {
		flex: 0 0 auto;
	}

	.seg button {
		height: 32px;
		padding: 0 11px;
		font-size: 10px;
	}

	.date {
		flex: 0 0 auto;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
</style>
