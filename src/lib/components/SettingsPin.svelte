<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<section class="card">
	<div class="label">ADMIN PIN</div>
	<div class="hint gap">
		A 4–8 digit code in front of deleting slots and changing these settings.
	</div>

	{#if app.pinSet}
		<div class="head">
			<div class="state" class:open={app.unlocked}>
				{app.unlocked ? 'Unlocked' : 'Locked'}
			</div>
			<div class="spacer"></div>
			{#if app.unlocked}
				<button type="button" class="btn small" onclick={() => app.lockNow()}>LOCK NOW</button>
			{/if}
		</div>
	{/if}

	<div class="setting div-bottom">
		<div class="text">
			<div class="name">Require a PIN</div>
			<div class="hint">Asked once, then not again for five minutes.</div>
		</div>
		<!--
			Alone among the switches in this app, this one does not flip
			optimistically: `pinSet` only changes when the gate completes, so
			cancelling leaves the track correctly un-flipped for free.
		-->
		<button
			type="button"
			class="switch"
			class:on={app.pinSet}
			aria-pressed={app.pinSet}
			aria-label="Require a PIN"
			onclick={() => app.togglePin()}
		>
			<span class="knob"></span>
		</button>
	</div>

	<div class="setting" class:dim={!app.pinSet}>
		<div class="text">
			<div class="name">Change PIN</div>
			<div class="hint">Asks for the current one first.</div>
		</div>
		<button type="button" class="btn small" onclick={() => app.changePin()}>CHANGE</button>
	</div>

	{#if app.pinSet}
		<div class="hint note">
			Stored in plain text on this device. A guard against wrong taps, not against anyone holding
			the phone.
		</div>
	{/if}
</section>

<style>
	.state {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted-3);
	}

	.state.open {
		color: var(--acc);
	}

	.spacer {
		flex: 1;
	}

	.small {
		height: 34px;
		padding: 0 14px;
		border-radius: 8px;
		font-size: 11px;
		flex: 0 0 auto;
	}

	.note {
		display: block;
		margin-top: 11px;
	}
</style>
