<script lang="ts">
	import { denomLabel, money } from '$lib/format';
	import { app } from '$lib/state.svelte';

	function pick(i: number): void {
		app.setActive(i);
		app.reveal(i);
		if (app.mode === 'sys') app.inputs[i]?.focus();
	}

	function onInput(e: Event & { currentTarget: HTMLInputElement }, cents: number): void {
		app.freshRow = false;
		app.setQty(cents, e.currentTarget.value);
		// setQty strips anything that is not a digit, so push the cleaned value
		// back into the field or the rejected characters stay on screen.
		e.currentTarget.value = app.qty[cents] ?? '';
	}

	function onFocus(e: FocusEvent & { currentTarget: HTMLInputElement }, i: number): void {
		app.setActive(i);
		if (app.cfg.selectAll && app.mode === 'sys') {
			try {
				e.currentTarget.select();
			} catch {
				/* not selectable, no matter */
			}
		}
	}

	// Turning a denomination off leaves a dangling ref at the end of the list.
	$effect(() => {
		app.inputs.length = app.live.length;
	});

	/** Enter / ArrowDown go down the list, Space / ArrowUp go back up. */
	function onKeydown(e: KeyboardEvent, i: number): void {
		if (e.key === 'Enter' || e.key === 'ArrowDown') {
			e.preventDefault();
			app.focusIdx(i + 1);
		} else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowUp') {
			e.preventDefault();
			app.focusIdx(i - 1);
		}
	}
</script>

<div class="sc scroller" bind:this={app.scroller}>
	<div class="grid">
		{#each app.live as cents, i (cents)}
			{@const qty = parseInt(app.qty[cents], 10) || 0}
			{@const active = app.padOpen && app.active === i}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="row" class:active onclick={() => pick(i)}>
				<div class="chip" class:filled={qty > 0}>{denomLabel(cents)}</div>
				<input
					type="text"
					inputmode="numeric"
					autocomplete="off"
					placeholder="0"
					aria-label={`${denomLabel(cents)} count`}
					value={app.qty[cents] ?? ''}
					readonly={app.padOpen}
					bind:this={app.inputs[i]}
					oninput={(e) => onInput(e, cents)}
					onfocus={(e) => onFocus(e, i)}
					onkeydown={(e) => onKeydown(e, i)}
				/>
				<div class="sub" class:filled={qty > 0}>{qty ? money(cents * qty) : '—'}</div>
			</div>
		{/each}
	</div>
	<div class="tail"></div>
</div>

<style>
	.scroller {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 10px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(258px, 1fr));
		gap: 8px;
		align-content: safe start;
		max-width: 1180px;
		margin: 0 auto;
	}

	.row {
		display: grid;
		grid-template-columns: 66px 1fr 96px;
		align-items: center;
		gap: 8px;
		height: 56px;
		padding: 0 10px 0 8px;
		border-radius: 10px;
		background: var(--card);
		box-shadow: inset 0 0 0 1px var(--line-soft);
	}

	.row.active {
		box-shadow: inset 0 0 0 2px var(--acc);
	}

	.chip {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 38px;
		border-radius: 7px;
		font-family: var(--mono);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.01em;
		background: var(--chip);
		color: var(--muted);
	}

	.chip.filled {
		background: var(--chip-on);
		color: var(--fg);
	}

	input {
		width: 100%;
		height: 40px;
		padding: 0 10px;
		border: 1px solid var(--line-input);
		border-radius: 8px;
		background: var(--sunk);
		color: var(--fg);
		font-size: 19px;
		font-weight: 500;
		text-align: right;
		letter-spacing: 0.02em;
		outline: none;
	}

	input:focus {
		border-color: var(--acc);
		background: #131416;
	}

	.sub {
		font-family: var(--mono);
		font-size: 14px;
		text-align: right;
		white-space: nowrap;
		letter-spacing: -0.01em;
		color: var(--muted-5);
	}

	.sub.filled {
		color: var(--fg);
	}

	.tail {
		height: 6px;
	}
</style>
