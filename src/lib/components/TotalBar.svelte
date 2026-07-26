<script lang="ts">
	import { money, pieces } from '$lib/format';
	import { app } from '$lib/state.svelte';
</script>

<div class="bar">
	<div class="total">
		<div class="cap">TOTAL</div>
		<div class="amount">{money(app.totalCents)}</div>
		<div class="pieces">{pieces(app.pieceCount)}</div>
	</div>

	{#if app.photo}
		<div class="thumb">
			<img alt="Evidence" src={app.photo} />
			<button type="button" class="drop" title="Remove photo" onclick={() => app.setPhoto(null)}>
				✕
			</button>
		</div>
	{/if}

	<div class="actions">
		<button type="button" class="btn wide" onclick={() => (app.view = 'camera')}>PHOTO</button>
		<button type="button" class="btn btn-danger wide" onclick={() => app.clearAll()}>CLEAR</button>
		<button type="button" class="btn-primary save" onclick={() => app.commitSave()}>SAVE</button>
	</div>
</div>

<style>
	.bar {
		flex: 0 0 auto;
		border-top: 1px solid var(--line);
		background: var(--bar);
		padding: 10px 12px;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.total {
		flex: 1;
		min-width: 150px;
	}

	.cap {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--muted-2);
	}

	.amount {
		font-family: var(--mono);
		font-weight: 700;
		font-size: clamp(26px, 6vw, 40px);
		line-height: 1.1;
		color: var(--acc);
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	.pieces {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-3);
		letter-spacing: 0.04em;
	}

	.thumb {
		position: relative;
		flex: 0 0 auto;
	}

	.thumb img {
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid var(--line-strong);
		display: block;
	}

	.drop {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 20px;
		height: 20px;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: var(--chip);
		color: var(--danger);
		cursor: pointer;
		font-size: 11px;
		line-height: 1;
		padding: 0;
	}

	.actions {
		flex: 0 0 auto;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.wide {
		height: 46px;
		padding: 0 14px;
		border-radius: 9px;
		font-size: 11px;
	}

	.save {
		height: 46px;
		padding: 0 20px;
		font-size: 12px;
	}
</style>
