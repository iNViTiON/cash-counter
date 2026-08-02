<script lang="ts">
	import { blobUrl } from '$lib/bloburl.svelte';
	import { CENTS, denomLabel, dmy, hm, money, pieces } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import { readPhoto } from '$lib/store';
	import type { Slot, Where } from '$lib/types';

	interface Props {
		/** The slot to show. Defaults to the strip's selection. */
		slot?: Slot | null;
		/** Cloud-only rows have nothing here to delete or reload. */
		readonly?: boolean;
		/** Where the evidence comes from. Cloud rows override this. */
		photoSrc?: ((id: string) => Promise<Blob | null>) | null;
		where?: Where | null;
	}

	let {
		slot: slotProp = undefined,
		readonly = false,
		photoSrc = null,
		where = null
	}: Props = $props();

	/** Padding and gap around the photo pane inside the dialog. */
	const FRAME_W = 40;
	const FRAME_H = 92;
	/** Height of the button row under the photo. */
	const BUTTONS_H = 54;
	const RIGHT_SHARE = 0.42;
	const BOTTOM_SHARE = 0.54;

	const slot = $derived(slotProp !== undefined ? slotProp : app.openSlot);
	const shown = (cents: number): boolean => app.cfg.enabled[cents] !== false;

	/**
	 * Hidden denominations still appear when this slot counted some — otherwise
	 * a total would not add up against the lines shown.
	 */
	const lines = $derived(
		slot
			? CENTS.filter((c) => shown(c) || (parseInt(slot.qty[c], 10) || 0) > 0).map((c) => {
					const qty = parseInt(slot.qty[c], 10) || 0;
					return { cents: c, qty, extra: qty > 0 && !shown(c) };
				})
			: []
	);
	const count = $derived(lines.reduce((a, l) => a + l.qty, 0));

	/** Photo aspect ratio, known only once the image has decoded. */
	let ar = $state(0);
	/** Evidence bytes, fetched on open rather than held in memory for every slot. */
	let blob = $state<Blob | null>(null);
	const url = blobUrl(() => blob);

	// A different slot means a different photo; forget the old shape and fetch.
	$effect(() => {
		const id = slot?.id;
		ar = 0;
		blob = null;
		if (!id || !slot?.photo) return;
		// Opening A then B quickly would otherwise let A's read land last and
		// show the wrong evidence under B's numbers.
		let alive = true;
		void (photoSrc ?? readPhoto)(id).then((b) => {
			if (alive) blob = b;
		});
		return () => {
			alive = false;
		};
	});

	/**
	 * Puts the photo wherever it comes out biggest: beside the counts for a tall
	 * photo, under them for a wide one. Compares the area the image would
	 * actually cover in each arrangement, letterboxing included.
	 */
	const layout = $derived.by(() => {
		if (!slot?.photo || ar <= 0 || !app.midW || !app.midH) {
			return app.landscape
				? { dir: 'row', pane: `0 0 38%` }
				: { dir: 'column', pane: `0 0 calc(40% + ${BUTTONS_H}px)` };
		}
		const bw = Math.max(220, app.midW - FRAME_W);
		const bh = Math.max(180, app.midH - FRAME_H);
		const area = (paneW: number, paneH: number) => {
			const h = Math.min(paneW / ar, paneH);
			return h * h * ar;
		};
		const right = area(bw * RIGHT_SHARE - 10, bh - BUTTONS_H);
		const bottom = area(bw, bh * BOTTOM_SHARE);
		return right >= bottom
			? { dir: 'row', pane: `0 0 ${RIGHT_SHARE * 100}%` }
			: { dir: 'column', pane: `0 0 calc(${BOTTOM_SHARE * 100}% + ${BUTTONS_H}px)` };
	});

	function onPhotoLoad(e: Event): void {
		const { naturalWidth: w, naturalHeight: h } = e.currentTarget as HTMLImageElement;
		if (!w || !h) return;
		const next = w / h;
		if (Math.abs(next - ar) > 0.01) ar = next;
	}

	function close(): void {
		app.view = null;
		app.openId = null;
	}

	/**
	 * Glyphs, matching the strip. `▣` is this device and `☁` is the bucket, so
	 * `▣☁` reads as both without a third word for the combination.
	 */
	/**
	 * A cloud row's quantities arrive with its JSON body, and `#fillMeta` only
	 * fetches a bounded batch per run — so on a big bucket an older row can be
	 * on screen with nothing behind it yet. Loading then would quietly write an
	 * empty count over the working one and toast "Counts loaded". The check is
	 * here rather than in `loadCounts`, because a local slot that genuinely
	 * counted nothing is still a legitimate thing to load.
	 */
	const countsReady = $derived(!readonly || app.openRow?.cloud?.meta === 'ok');

	const badge = $derived(
		where === 'both'
			? { text: '▣☁ DEVICE + CLOUD', remote: false }
			: where === 'cloud'
				? { text: '☁ CLOUD', remote: true }
				: where === 'local'
					? { text: '▣ THIS DEVICE', remote: false }
					: null
	);
</script>

{#if slot}
	<div class="overlay">
		<div class="panel">
			<div class="head">
				<div class="who">
					<div class="titled">
						<div class="name">{slot.label}</div>
						{#if badge}
							<span class="badge" class:remote={badge.remote}>{badge.text}</span>
						{/if}
					</div>
					<div class="stamp">
						{dmy(new Date(slot.ts))}
						{hm(new Date(slot.ts))} · {readonly
							? (app.viewing?.name ?? 'in the cloud only')
							: 'saved'}
					</div>
				</div>
				<div class="spacer"></div>
				<div class="sum">
					<div class="total">{money(slot.total)}</div>
					<div class="pieces">{pieces(count)}</div>
				</div>
				<button type="button" class="btn close" title="Close" onclick={close}>✕</button>
			</div>

			<div class="body" style:flex-direction={layout.dir}>
				<div class="sc counts">
					<div class="lines">
						{#each lines as line (line.cents)}
							<div class="line" class:extra={line.extra}>
								<div class="chip" class:filled={line.qty > 0}>{denomLabel(line.cents)}</div>
								<div class="qty" class:filled={line.qty > 0}>{line.qty || 0}</div>
								<div class="sub" class:filled={line.qty > 0}>
									{line.qty ? money(line.cents * line.qty) : '—'}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div class="side" style:flex={layout.pane}>
					<div class="photo">
						<!-- An empty pane for a few ms reads as nothing; "NO PHOTO"
						     flashing on a slot that has one reads as data loss. -->
						{#if slot.photo}
							{#if url.current}
								<img alt="Evidence" src={url.current} onload={onPhotoLoad} />
							{/if}
						{:else}
							<div class="no-photo">NO PHOTO</div>
						{/if}
					</div>
					<div class="acts">
						<!-- Loading counts is safe from a cloud row: it copies numbers
						     into the workspace and touches nothing remote. Deleting is
						     not offered, because the UI never deletes cloud objects. -->
						{#if countsReady}
							<button
								type="button"
								class="btn-primary load"
								onclick={() => app.loadCounts(slot.qty)}
							>
								{readonly ? 'LOAD FROM CLOUD' : 'LOAD COUNTS'}
							</button>
						{:else}
							<span class="loading">Still reading this count from the bucket…</span>
						{/if}
						{#if !readonly}
							<button type="button" class="btn btn-danger del" onclick={() => app.deleteSlot()}>
								DELETE
							</button>
						{:else}
							<!-- Says why there is no DELETE, rather than leaving a gap the
							     user has to interpret. The UI never removes a cloud object;
							     only the retention window does. -->
							<span class="cloud-note">Cloud copies are removed by retention only</span>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 30;
		background: rgba(8, 8, 9, 0.78);
		display: flex;
		padding: 8px;
	}

	.panel {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		background: var(--card);
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		overflow: hidden;
	}

	.head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line-soft);
		background: var(--bar);
	}

	.who {
		min-width: 0;
	}

	.titled {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.badge {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		height: 20px;
		padding: 0 7px;
		border-radius: 5px;
		background: var(--chip-on);
		color: #9aa0a8;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		white-space: nowrap;
	}

	.badge.remote {
		background: var(--view-bg);
		color: var(--view-fg);
	}

	.name {
		font-size: 14px;
		font-weight: 700;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stamp {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-2);
		letter-spacing: 0.04em;
	}

	.spacer {
		flex: 1;
	}

	.sum {
		text-align: right;
	}

	.total {
		font-family: var(--mono);
		font-size: 24px;
		font-weight: 700;
		color: var(--acc);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.pieces {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-3);
	}

	.close {
		width: 34px;
		height: 34px;
		font-size: 14px;
		font-weight: 400;
		letter-spacing: 0;
		padding: 0;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 10px;
		padding: 10px;
	}

	.counts {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding-right: 6px;
	}

	.lines {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 8px;
		align-content: start;
	}

	.line {
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

	.line.extra {
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
		background: var(--chip);
		color: var(--muted);
	}

	.chip.filled {
		background: var(--chip-on);
		color: var(--fg);
	}

	.line.extra .chip {
		color: var(--acc);
	}

	.qty {
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 0 10px;
		border: 1px solid var(--line-input);
		border-radius: 8px;
		background: var(--sunk);
		font-family: var(--mono);
		font-size: 19px;
		font-weight: 500;
		color: var(--muted-5);
	}

	.qty.filled {
		color: var(--fg);
	}

	.sub {
		font-family: var(--mono);
		font-size: 14px;
		text-align: right;
		white-space: nowrap;
		color: var(--muted-5);
	}

	.sub.filled {
		color: var(--fg);
	}

	.side {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.photo {
		flex: 1;
		min-height: 0;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: #0b0c0d;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.photo img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.no-photo {
		font-size: 10px;
		letter-spacing: 0.12em;
		font-weight: 700;
		color: var(--muted-5);
	}

	.acts {
		flex: 0 0 auto;
		display: flex;
		gap: 8px;
	}

	.load {
		flex: 1;
		height: 46px;
		font-size: 12px;
	}

	.del {
		flex: 0 0 auto;
		height: 46px;
		padding: 0 16px;
		border-radius: 9px;
		color: var(--danger);
		font-size: 11px;
	}

	.loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 46px;
		border: 1px dashed var(--line-strong);
		border-radius: 9px;
		color: var(--muted-3);
		font-size: 11px;
	}

	.cloud-note {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		height: 46px;
		max-width: 190px;
		padding: 0 12px;
		border: 1px dashed var(--view-line);
		border-radius: 9px;
		color: var(--view-dim);
		font-size: 10px;
		line-height: 1.4;
	}
</style>
