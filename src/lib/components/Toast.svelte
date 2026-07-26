<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

{#if app.toast}
	<div class="toast" role="status" aria-live="polite">{app.toast}</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		z-index: 80;
		padding: 10px 16px;
		border-radius: 9px;
		background: var(--fg);
		color: var(--acc-ink);
		font-family: var(--sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}
</style>
