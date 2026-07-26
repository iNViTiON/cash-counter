<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<div class="scrim">
	<div class="sheet">
		<div class="sheet-title acc">PHOTO REQUIRED</div>
		<div class="sheet-body">
			This count needs photo evidence before it can be saved to a slot.
		</div>

		<button type="button" class="btn-primary take" onclick={() => app.takePhoto()}>
			TAKE PHOTO
		</button>

		{#if app.cfg.allowSkip}
			<button type="button" class="btn btn-danger skip" onclick={() => app.saveWithoutPhoto()}>
				SAVE WITHOUT A PHOTO
			</button>
		{/if}

		<button type="button" class="cancel" onclick={() => (app.view = null)}>CANCEL</button>
	</div>
</div>

<style>
	.sheet {
		max-width: 400px;
	}

	.acc {
		color: var(--acc);
	}

	.take {
		height: 46px;
		font-size: 12px;
	}

	.skip {
		height: 44px;
		border-radius: 9px;
		font-size: 11px;
		color: var(--danger);
	}

	.cancel {
		height: 40px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted-2);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.cancel:hover {
		color: var(--fg-dim);
	}
</style>
