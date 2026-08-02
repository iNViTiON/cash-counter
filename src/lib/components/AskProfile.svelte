<script lang="ts">
	import { app } from '$lib/state.svelte';

	/**
	 * Asked once, the moment a profile is added.
	 *
	 * The answer decides what the slot strip shows on every launch from here on,
	 * and the two right answers are far apart: a tablet added to watch one till
	 * wants to open straight into it, a spare that still counts money must stay
	 * local. Defaulting silently gets one of them wrong every time, and the
	 * setting that fixes it is a screen away in a card nobody has opened yet.
	 *
	 * Deliberately not dismissible without answering — every option is a valid
	 * answer, including the one that changes nothing.
	 */
	const ask = $derived(app.askProfile);
</script>

{#if ask}
	<div class="scrim">
		<div class="sheet ask">
			<div class="sheet-title acc">WHICH PROFILE ON LAUNCH?</div>
			<div class="sheet-body">
				<b>{ask.name}</b> is ready. Choose what the slot strip shows when EuroCash opens —
				changeable any time in Settings → Cloud profiles.
			</div>

			<button type="button" class="opt" onclick={() => app.answerAskProfile('local')}>
				<span class="icon local">▣</span>
				<span class="text">
					<span class="name">This device</span>
					<span class="note">Open on your own counts</span>
				</span>
			</button>

			<button type="button" class="opt" onclick={() => app.answerAskProfile('last')}>
				<span class="icon last">⟲</span>
				<span class="text">
					<span class="name">Last used</span>
					<span class="note">Open wherever you left off</span>
				</span>
			</button>

			<button type="button" class="opt" onclick={() => app.answerAskProfile(ask.id)}>
				<span class="icon remote">☁</span>
				<span class="text">
					<span class="name">{ask.name}</span>
					<span class="note">Open straight into this profile, read-only</span>
				</span>
			</button>

			<!-- Saving is blocked while a profile is open, so a till that also counts
			     money needs to know before it picks the third option. -->
			<div class="warn">
				Opening straight into a profile means SAVE is off until you switch back to
				<b>THIS DEVICE</b> from the slot strip.
			</div>
		</div>
	</div>
{/if}

<style>
	.ask {
		max-width: 430px;
	}

	.acc {
		color: var(--acc);
	}

	.opt {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 12px;
		border: 1px solid var(--line-strong);
		border-radius: 11px;
		background: var(--sunk);
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.opt:hover {
		border-color: var(--acc);
	}

	.icon {
		flex: 0 0 auto;
		width: 18px;
		text-align: center;
		font-size: 13px;
		line-height: 1;
	}

	.icon.local {
		color: var(--acc);
	}

	.icon.last {
		color: #9aa0a8;
	}

	.icon.remote {
		color: var(--view);
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		font-size: 13px;
		font-weight: 700;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.note {
		display: block;
		margin-top: 1px;
		font-size: 11px;
		color: var(--muted-2);
	}

	.warn {
		font-size: 11px;
		line-height: 1.5;
		color: var(--muted-3);
	}

	.warn b {
		color: var(--fg-dim);
	}
</style>
