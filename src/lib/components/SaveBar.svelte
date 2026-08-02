<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<div class="shell">
<div class="no-sb bar" class:dim={app.viewing}>
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

	<!-- Not shown while browsing: the date a save would be filed under is a lie
	     when nothing here can be saved. -->
	{#if !app.viewing}
		<div class="date">{app.filedOn}</div>
	{/if}
</div>

{#if app.viewing}
	<div class="ro-chip"><span>☁ READ-ONLY</span></div>
	<!--
		A transparent lid over the whole bar rather than `disabled` on each control.
		A disabled button is silent, and silence is the wrong answer here: the tap
		is not a mistake, it is a reasonable thing to try while the strip is showing
		another till, and it deserves a sentence saying which one and how to leave.
	-->
	<div
		class="lid"
		role="presentation"
		title="Read-only while viewing another machine"
		onclick={() => app.blockSave()}
	></div>
{/if}
</div>

<style>
	.shell {
		position: relative;
		flex: 0 0 auto;
		display: flex;
		align-items: stretch;
		background: var(--strip);
		border-top: 1px solid var(--line);
	}

	.bar {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 12px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.bar.dim {
		opacity: 0.36;
	}

	.ro-chip {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		padding: 0 12px 0 6px;
	}

	.ro-chip span {
		display: flex;
		align-items: center;
		height: 22px;
		padding: 0 9px;
		border: 1px solid var(--view-line);
		border-radius: 6px;
		background: var(--view-bg);
		color: var(--view-fg);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		white-space: nowrap;
	}

	.lid {
		position: absolute;
		inset: 0;
		cursor: not-allowed;
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
