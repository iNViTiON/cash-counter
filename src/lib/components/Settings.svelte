<script lang="ts">
	import { CENTS, denomLabel, dmy, hm, money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { PadSize, PhotoMax } from '$lib/types';

	const PAD_SIZES: Array<[string, PadSize]> = [
		['S', 25],
		['M', 50],
		['L', 75],
		['XL', 100]
	];

	const PHOTO_SIZES: Array<[string, PhotoMax]> = [
		['SMALL', 1280],
		['MEDIUM', 1800],
		['LARGE', 2400]
	];

	const today = $derived(dmy(new Date()));

	function labelKey(e: KeyboardEvent): void {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		app.addLabel();
	}
</script>

<div class="screen">
	<div class="bar">
		<div class="title">Settings</div>
		<div class="spacer"></div>
		<button type="button" class="btn-primary done" onclick={() => (app.view = null)}>DONE</button>
	</div>

	<div class="sc body">
		<div class="stack">
			<section class="card">
				<div class="label">DENOMINATIONS</div>
				<div class="hint gap">Turn off what you never handle. Hidden rows are left out of the total.</div>
				<div class="denoms">
					{#each CENTS as cents (cents)}
						<button
							type="button"
							class="denom"
							class:on={app.cfg.enabled[cents] !== false}
							onclick={() => app.toggleDenom(cents)}
						>
							{denomLabel(cents)}
						</button>
					{/each}
				</div>
			</section>

			<section class="card">
				<div class="label gap">INPUT</div>

				<div class="setting div-bottom">
					<div class="text">
						<div class="name">Select all when moving between rows</div>
						<div class="hint">Type over the old number instead of deleting it first.</div>
					</div>
					<button
						type="button"
						class="switch"
						class:on={app.cfg.selectAll}
						aria-pressed={app.cfg.selectAll}
						aria-label="Select all when moving between rows"
						onclick={() => app.toggleSelectAll()}
					>
						<span class="knob"></span>
					</button>
				</div>

				<div class="setting">
					<div class="text">
						<div class="name">Default editor</div>
						<div class="hint">Which mode the app opens in. Switch anytime from the top bar.</div>
					</div>
					<div class="seg">
						<button
							type="button"
							class:on={app.cfg.mode === 'sys'}
							onclick={() => app.setDefaultMode('sys')}
						>
							SYSTEM
						</button>
						<button
							type="button"
							class:on={app.cfg.mode !== 'sys'}
							onclick={() => app.setDefaultMode('pad')}
						>
							KEYPAD
						</button>
					</div>
				</div>

				<div class="setting div-top">
					<div class="text">
						<div class="name">Keypad size</div>
						<div class="hint">
							Share of screen height. Keys keep their shape; now {app.padRow} px tall.
						</div>
					</div>
					<div class="seg">
						{#each PAD_SIZES as [name, size] (size)}
							<button
								type="button"
								class:on={(app.cfg.padSize || 50) === size}
								onclick={() => app.setPadSize(size)}
							>
								{name}
							</button>
						{/each}
					</div>
				</div>
			</section>

			<section class="card">
				<div class="label gap">PHOTO EVIDENCE</div>

				<div class="setting div-bottom">
					<div class="text">
						<div class="name">Camera for photo evidence</div>
						<div class="hint">
							System hands off to your phone's camera app — full sensor quality, autofocus, flash.
							In-app stays inside EuroCash but the preview is lower quality.
						</div>
					</div>
					<div class="seg">
						<button
							type="button"
							class:on={app.cfg.cam !== 'app'}
							onclick={() => app.setCam('system')}
						>
							SYSTEM
						</button>
						<button
							type="button"
							class:on={app.cfg.cam === 'app'}
							onclick={() => app.setCam('app')}
						>
							IN-APP
						</button>
					</div>
				</div>

				<div class="setting div-bottom">
					<div class="text">
						<div class="name">Require a photo when saving</div>
						<div class="hint">A count can't be saved to a slot without photo evidence attached.</div>
					</div>
					<button
						type="button"
						class="switch"
						class:on={app.cfg.needPhoto}
						aria-pressed={app.cfg.needPhoto}
						aria-label="Require a photo when saving"
						onclick={() => app.toggleNeedPhoto()}
					>
						<span class="knob"></span>
					</button>
				</div>

				<div class="setting div-bottom nested" class:dim={!app.cfg.needPhoto}>
					<div class="text">
						<div class="name">Allow skipping with confirmation</div>
						<div class="hint">
							Saving without a photo is still possible, but only after confirming once.
						</div>
					</div>
					<!--
						The track only lights up while the requirement above it is on, but the
						knob always shows what is stored, so the two are separate classes.
					-->
					<button
						type="button"
						class="switch"
						class:on={app.cfg.needPhoto && app.cfg.allowSkip}
						class:knob-on={app.cfg.allowSkip}
						aria-pressed={app.cfg.allowSkip}
						aria-label="Allow skipping with confirmation"
						onclick={() => app.toggleAllowSkip()}
					>
						<span class="knob"></span>
					</button>
				</div>

				<div class="setting">
					<div class="text">
						<div class="name">Stored photo size</div>
						<div class="hint">
							Longest edge of the saved image. Larger reads better; smaller fits more slots on the
							device.
						</div>
					</div>
					<div class="seg">
						{#each PHOTO_SIZES as [name, max] (max)}
							<button
								type="button"
								class:on={app.photoMax === max}
								onclick={() => app.setPhotoMax(max)}
							>
								{name}
							</button>
						{/each}
					</div>
				</div>
			</section>

			<section class="card">
				<div class="label gap">SAVING</div>

				<div class="setting div-bottom">
					<div class="text">
						<div class="name">Auto-save the current count</div>
						<div class="hint">Keeps this screen on this device between visits.</div>
					</div>
					<button
						type="button"
						class="switch"
						class:on={app.cfg.autoSave}
						aria-pressed={app.cfg.autoSave}
						aria-label="Auto-save the current count"
						onclick={() => app.toggleAutoSave()}
					>
						<span class="knob"></span>
					</button>
				</div>

				<div class="setting">
					<div class="text">
						<div class="name">Keep slots for</div>
						<div class="hint">Older slots are deleted on the next save or load.</div>
					</div>
					<div class="seg">
						<button type="button" class:on={app.cfg.maxAge === 7} onclick={() => app.setMaxAge(7)}>
							7 DAYS
						</button>
						<button type="button" class:on={app.cfg.maxAge === 31} onclick={() => app.setMaxAge(31)}>
							31 DAYS
						</button>
					</div>
				</div>
			</section>

			<section class="card">
				<div class="label">SLOT LABELS</div>
				<div class="hint gap">The date is always appended when you save.</div>

				<div class="labels">
					{#each app.cfg.labels as name, i (name)}
						<div class="label-row">
							<div class="label-name">{name}</div>
							<div class="sample">{today}</div>
							<button
								type="button"
								class="btn btn-danger x"
								title="Remove label"
								onclick={() => app.removeLabel(i)}
							>
								✕
							</button>
						</div>
					{/each}
				</div>

				<div class="add">
					<input
						type="text"
						placeholder="New label, e.g. Cash drop"
						bind:value={app.newLabel}
						onkeydown={labelKey}
					/>
					<button type="button" class="btn add-btn" onclick={() => app.addLabel()}>ADD</button>
				</div>
			</section>

			<section class="card">
				<div class="head">
					<div class="label">SAVED SLOTS</div>
					<div class="spacer"></div>
					<div class="count">{app.slots.length} saved</div>
				</div>

				<div class="labels">
					{#each app.slots as slot (slot.id)}
						<div class="slot-row">
							<div class="text">
								<div class="slot-name">{slot.label}</div>
								<div class="stamp">
									{dmy(new Date(slot.ts))}
									{hm(new Date(slot.ts))}{slot.photo ? ' · photo' : ''}
								</div>
							</div>
							<div class="slot-total">{money(slot.total)}</div>
							<button
								type="button"
								class="btn btn-danger x big"
								title="Delete slot"
								onclick={() => app.removeSlot(slot.id)}
							>
								✕
							</button>
						</div>
					{/each}
				</div>

				{#if !app.slots.length}
					<div class="none">Nothing saved yet.</div>
				{/if}

				<div class="danger-row">
					<button type="button" class="btn btn-danger wide" onclick={() => app.dropQuick()}>
						CLEAR QUICK SLOT
					</button>
					<button type="button" class="btn btn-danger wide red" onclick={() => app.dropAllSlots()}>
						DELETE ALL SLOTS
					</button>
				</div>
			</section>

			<div class="foot">Everything is stored on this device only.</div>
		</div>
	</div>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--bg);
		display: flex;
		flex-direction: column;
	}

	.bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 12px;
		background: var(--bar);
		border-bottom: 1px solid var(--line);
	}

	.title {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg);
	}

	.spacer {
		flex: 1;
	}

	.done {
		height: 38px;
		padding: 0 18px;
		font-size: 12px;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 14px;
	}

	.stack {
		max-width: 820px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.gap {
		margin-bottom: 11px;
	}

	.label + .hint {
		margin-top: 4px;
	}

	.denoms {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
		gap: 6px;
	}

	.denom {
		height: 46px;
		border-radius: 9px;
		cursor: pointer;
		font-family: var(--mono);
		font-size: 14px;
		font-weight: 700;
		background: var(--bar);
		color: var(--muted-5);
		border: 1px solid var(--line);
	}

	.denom.on {
		background: var(--chip-on);
		color: var(--fg);
		border-color: var(--acc);
	}

	.setting {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
	}

	.div-bottom {
		border-bottom: 1px solid var(--line-soft);
	}

	.div-top {
		border-top: 1px solid var(--line-soft);
	}

	/* Reads as belonging to the setting above it, and greys out when that is off. */
	.nested {
		padding-left: 18px;
		border-left: 2px solid var(--line-soft);
	}

	/* Dimmed but still tappable — the toggle explains why it does nothing. */
	.dim {
		opacity: 0.42;
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
	}

	.seg {
		flex: 0 0 auto;
	}

	.seg button {
		min-width: 62px;
	}

	.switch {
		flex: 0 0 auto;
		width: 62px;
		height: 34px;
		border-radius: 20px;
		cursor: pointer;
		position: relative;
		padding: 0;
		background: var(--key);
		border: 1px solid var(--line-strong);
	}

	.switch.on {
		background: var(--acc);
		border-color: var(--acc);
	}

	.knob {
		position: absolute;
		top: 3px;
		left: 4px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--acc-ink);
		transition: left 0.12s;
	}

	.switch.on .knob,
	.switch.knob-on .knob {
		left: 32px;
	}

	.labels {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label-row,
	.slot-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 9px;
		background: var(--strip);
	}

	.slot-row {
		gap: 10px;
		padding: 9px 10px;
	}

	.label-name {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sample {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted-3);
	}

	.slot-name {
		font-size: 13px;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stamp {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-3);
	}

	.slot-total {
		font-family: var(--mono);
		font-size: 13px;
		font-weight: 700;
		color: var(--acc);
		white-space: nowrap;
	}

	.x {
		width: 30px;
		height: 30px;
		border-radius: 7px;
		border-color: var(--line-input);
		color: var(--danger);
		font-size: 12px;
		font-weight: 400;
		letter-spacing: 0;
		padding: 0;
	}

	.x.big {
		width: 32px;
		height: 32px;
	}

	.add {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}

	.add input {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--line-input);
		border-radius: 9px;
		background: var(--sunk);
		color: var(--fg);
		font-family: var(--sans);
		font-size: 13px;
		outline: none;
	}

	.add input:focus {
		border-color: var(--acc);
	}

	.add-btn {
		height: 44px;
		padding: 0 16px;
		border-radius: 9px;
		font-size: 11px;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 11px;
	}

	.count {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--muted-3);
	}

	.none {
		font-size: 12px;
		color: var(--muted-4);
	}

	.danger-row {
		display: flex;
		gap: 8px;
		margin-top: 12px;
		flex-wrap: wrap;
	}

	.wide {
		height: 42px;
		padding: 0 14px;
		border-radius: 9px;
		font-size: 11px;
		letter-spacing: 0.08em;
	}

	.red {
		color: var(--danger);
	}

	.foot {
		font-size: 10px;
		color: var(--muted-5);
		line-height: 1.6;
		padding: 0 2px 8px;
	}
</style>
