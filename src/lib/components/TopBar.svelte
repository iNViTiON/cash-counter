<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<header class:viewing={app.viewing}>
	<div class="wordmark">Eurocash</div>

	<!-- The only always-on signal that saving is off. The bar tint carries it at a
	     glance; this says which machine, because "read-only" without a name is a
	     puzzle rather than an explanation. -->
	{#if app.viewing}
		<div class="view-chip">
			<span class="glyph">☁</span>
			<span class="who">{app.viewing.name.toUpperCase()}</span>
			<span class="ro">VIEW ONLY</span>
		</div>
	{/if}

	<div class="spacer"></div>

	<div class="seg">
		<button type="button" class:on={app.mode === 'sys'} onclick={() => app.setMode('sys')}>
			SYS
		</button>
		<button type="button" class:on={app.mode === 'pad'} onclick={() => app.setMode('pad')}>
			PAD
		</button>
	</div>

	{#if app.landscape && app.padOpen}
		<button type="button" class="btn icon" title="Move keypad" onclick={() => app.swapPadSide()}>
			{app.padSide === 'left' ? '⇥' : '⇤'}
		</button>
	{/if}

	<!-- No archive button: the archive is the slot strip, and the profile picker
	     that reaches every bucket lives there next to the rows it changes. -->
	<button
		type="button"
		class="btn icon"
		title="Settings"
		onclick={() => (app.view = 'settings')}
	>
		⚙
	</button>
</header>

<style>
	header {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		background: var(--bar);
		border-bottom: 1px solid var(--line);
	}

	header.viewing {
		background: var(--bar-view);
		border-bottom-color: var(--view-line);
	}

	.view-chip {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 24px;
		padding: 0 9px;
		border: 1px solid var(--view-line);
		border-radius: 6px;
		background: var(--view-bg);
		min-width: 0;
	}

	.glyph {
		font-size: 11px;
		line-height: 1;
		color: var(--view);
	}

	.who {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--view-fg);
		max-width: 170px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ro {
		flex: 0 0 auto;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--view-dim);
	}

	.wordmark {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--fg);
	}

	.spacer {
		flex: 1;
	}

	.seg button {
		min-width: 52px;
		padding: 0 10px;
		letter-spacing: 0.1em;
	}

	.icon {
		width: 38px;
		height: 34px;
		font-size: 15px;
		line-height: 1;
		letter-spacing: 0;
	}
</style>
