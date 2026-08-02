<script lang="ts">
	import { blobUrl } from '$lib/bloburl.svelte';
	import { money, pieces } from '$lib/format';
	import { app } from '$lib/state.svelte';

	const thumb = blobUrl(() => app.photoBlob);
</script>

<div class="bar">
	<div class="total">
		<div class="cap">TOTAL</div>
		<div class="amount">{money(app.totalCents)}</div>
		<div class="pieces">{pieces(app.pieceCount)}</div>
	</div>

	<!-- Gated on the metadata, which is synchronous, so the frame is reserved from
	     the first paint and only the image inside it arrives a beat later. -->
	{#if app.photo}
		<div class="thumb">
			{#if thumb.current}
				<img alt="Evidence" src={thumb.current} />
			{/if}
			<button type="button" class="drop" title="Remove photo" onclick={() => app.setPhoto(null)}>
				✕
			</button>
		</div>
	{/if}

	<div class="actions">
		<button type="button" class="btn wide" onclick={() => app.openCamera()}>PHOTO</button>

		<!--
			Both inputs stay mounted for the life of the app: `.click()` only opens a
			file dialog while the originating tap is still being handled, so neither
			can be created at the moment it is needed.
		-->
		<input
			bind:this={app.sysCamInput}
			type="file"
			accept="image/*"
			capture="environment"
			onchange={(e) => app.pickFile(e.currentTarget)}
		/>
		<input
			bind:this={app.fileInput}
			type="file"
			accept="image/*"
			onchange={(e) => app.pickFile(e.currentTarget)}
		/>

		<button type="button" class="btn btn-danger wide" onclick={() => app.clearAll()}>CLEAR</button>
		<!-- Greyed but never `disabled`: `commitSave` answers a tap while browsing
		     with the sentence that explains it. PHOTO and CLEAR keep working —
		     only the commit is blocked, so counting carries on. -->
		<button
			type="button"
			class="btn-primary save"
			class:blocked={app.viewing}
			onclick={() => app.commitSave()}
		>
			SAVE
		</button>
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

	.actions input {
		display: none;
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

	.save.blocked,
	.save.blocked:hover {
		background: var(--chip-on);
		color: var(--muted-4);
		cursor: not-allowed;
		filter: none;
	}
</style>
