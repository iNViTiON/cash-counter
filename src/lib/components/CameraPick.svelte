<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<div class="scrim">
	<div class="sheet">
		<div class="sheet-title">WHICH CAMERA?</div>
		<div class="sheet-body">
			Pick how EuroCash takes photo evidence. This becomes your default for every photo from now
			on.
		</div>

		<button type="button" class="opt rec" onclick={() => app.chooseCam('system')}>
			<span class="row">
				<span class="name acc">SYSTEM CAMERA</span>
				<span class="badge">RECOMMENDED</span>
			</span>
			<span class="sub bright">
				Opens your phone's own camera app. Full sensor quality, autofocus and flash.
			</span>
		</button>

		<button type="button" class="opt" onclick={() => app.chooseCam('app')}>
			<span class="name">IN-APP CAMERA</span>
			<span class="sub">
				Stays inside EuroCash — one less app switch, but a lower-quality preview.
			</span>
		</button>

		<div class="foot">
			You can change this any time in Settings → Photo evidence → Camera for photo evidence.
		</div>

		<button type="button" class="btn cancel" onclick={() => (app.view = null)}>CANCEL</button>
	</div>
</div>

<style>
	.sheet {
		max-width: 420px;
	}

	.opt {
		display: flex;
		flex-direction: column;
		gap: 3px;
		text-align: left;
		padding: 13px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 11px;
		background: var(--strip);
		cursor: pointer;
		font-family: var(--sans);
	}

	.opt:hover {
		border-color: var(--muted-4);
	}

	.rec {
		border-color: var(--acc);
		background: #1f1a10;
	}

	.rec:hover {
		border-color: var(--acc);
		background: #26200f;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.name {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--fg);
	}

	.acc {
		color: var(--acc);
	}

	.badge {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--acc-ink);
		background: var(--acc);
		border-radius: 4px;
		padding: 2px 6px;
	}

	.sub {
		font-size: 11px;
		color: var(--muted-2);
		line-height: 1.5;
	}

	.bright {
		color: #a9a49b;
	}

	.foot {
		font-size: 11px;
		color: var(--muted-4);
		line-height: 1.5;
	}

	.cancel {
		align-self: flex-start;
		height: 38px;
		padding: 0 14px;
		border-radius: 9px;
		font-size: 11px;
	}

	.cancel:hover {
		border-color: var(--muted-4);
		color: var(--fg-dim);
	}
</style>
