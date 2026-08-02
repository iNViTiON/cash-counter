<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<header>
	<div class="wordmark">Eurocash</div>
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

	<!--
		Conditional, so the bar is byte-identical on an unconfigured device — but
		viewer profiles count too. A view-only tablet has no bucket of its own, so
		gating this on `link` alone left the archive, and therefore every viewer
		profile, unreachable on exactly the device the feature exists for.
	-->
	{#if app.link?.ready || app.remotes.length}
		<button type="button" class="btn icon" title="Archive" onclick={() => (app.view = 'archive')}>
			☁
		</button>
	{/if}

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
