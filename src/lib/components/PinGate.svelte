<script lang="ts">
	import { app, PIN_MIN } from '$lib/state.svelte';

	/**
	 * Digits only, never a text input. The soft keyboard is the thing this
	 * codebase already fights — `readonly={app.padOpen}`, `setMode('pad')`
	 * blurring — and an `<input>` on a fixed scrim reflows the iOS viewport
	 * out from under the sheet.
	 */
	const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

	const TITLES: Record<string, string> = {
		unlock: 'ADMIN PIN',
		set: 'SET A PIN',
		change: 'CHANGE PIN',
		clear: 'REMOVE PIN'
	};

	const gate = $derived(app.gate);
	const title = $derived(gate ? (TITLES[gate.kind] ?? 'ADMIN PIN') : '');
	const step = $derived(
		gate?.step === 'new'
			? `Enter a new PIN — ${PIN_MIN} to 8 digits.`
			: gate?.step === 'confirm'
				? 'Enter it once more to confirm.'
				: gate?.kind === 'unlock'
					? 'Enter the PIN to continue.'
					: 'Enter the current PIN.'
	);
	const warn = $derived(gate?.kind === 'set' || gate?.kind === 'change');
</script>

{#if gate}
	<div class="scrim">
		<div class="sheet">
			<div class="sheet-title acc">{title}</div>
			<div class="sheet-body">{gate.why}. {step}</div>

			{#if warn}
				<div class="warn">
					<div class="warn-title">THIS IS A MIS-TAP GUARD, NOT SECURITY</div>
					<div class="warn-body">
						The PIN is stored on this device in plain text. Anyone who can open this browser's
						developer tools can read it, change it or erase it in seconds.
						<br /><br />
						It stops a wrong tap from deleting your counts. It does not protect anything from someone
						holding the phone.
					</div>
				</div>
			{/if}

			<!-- Fixed height so the sheet never jumps as digits go in or errors appear. -->
			<div class="dots">
				{#each app.pinEntry.split('') as _, i (i)}<span class="dot">●</span>{/each}
			</div>
			<div class="err">
				{#if app.pinStuck}
					Forgot it? Clear this site's data in your browser settings. That also erases every slot
					saved on this device.
				{:else}{app.pinErr}{/if}
			</div>

			<!-- `pin-grid`, not `grid`: Keypad stays mounted behind the scrim and
			     owns that name, which makes anything selecting it ambiguous. -->
			<div class="pin-grid">
				{#each KEYS as k (k)}
					<button type="button" class="pad-key num" onclick={() => app.pinKey(k)}>{k}</button>
				{/each}
				<button type="button" class="pad-key warn-key" onclick={() => app.pinDel()}>⌫</button>
				<button type="button" class="pad-key num" onclick={() => app.pinKey('0')}>0</button>
				<button type="button" class="pad-key acc" onclick={() => app.pinSubmit()}>OK</button>
			</div>

			<button type="button" class="cancel" onclick={() => app.pinCancel()}>CANCEL</button>
		</div>
	</div>
{/if}

<style>
	.sheet {
		max-width: 340px;
	}

	.acc {
		color: var(--acc);
	}

	.warn {
		border: 1px solid var(--danger);
		border-radius: 9px;
		padding: 10px 12px;
	}

	.warn-title {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--danger);
		margin-bottom: 6px;
	}

	.warn-body {
		font-size: 11px;
		line-height: 1.5;
		color: var(--fg-dim);
	}

	.dots {
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 14px;
		color: var(--acc);
	}

	.err {
		min-height: 30px;
		font-size: 11px;
		line-height: 1.45;
		text-align: center;
		color: var(--danger);
	}

	.pin-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-auto-rows: 52px;
		gap: 6px;
	}

	/* `.warn` is taken by the notice above, so the delete key names itself. */
	.warn-key {
		background: #241a1a;
		color: var(--danger);
		border: 1px solid #4a2622;
		font-size: 16px;
	}

	.cancel {
		height: 40px;
		border: 0;
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
