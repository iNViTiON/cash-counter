<script lang="ts">
	import { dmy, hm, money } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { ArchiveRow } from '$lib/types';

	/**
	 * The strip is the archive. It shows this device's slots merged with whatever
	 * is in its bucket, or — when a profile is picked — another machine's bucket
	 * alone. Six chips fit; the rest are one tap away in the sheet.
	 */
	const STRIP_CAP = 6;

	/** The save date is already shown separately, so drop it from the name. */
	const stripDate = (label: string): string => label.replace(/\s\d{2}\/\d{2}\/\d{4}$/, '');

	const rows = $derived(app.rows);
	const chips = $derived(rows.slice(0, STRIP_CAP));
	const remote = $derived(app.viewing);

	/**
	 * Loading only ever means a *remote* listing. This device's own rows are
	 * already in memory, so they never wait on a network — which is what keeps an
	 * offline launch from showing a spinner over counts that are right there.
	 */
	const loading = $derived(Boolean(remote) && app.viewer?.status === 'loading' && !rows.length);
	const failed = $derived(remote ? (app.viewer?.error ?? '') : '');

	const quickInfo = $derived(
		app.quick
			? `${money(app.quick.total)}\n${dmy(new Date(app.quick.ts))} ${hm(new Date(app.quick.ts))}`
			: 'empty'
	);

	const SKELETONS = [
		{ delay: '0s', w1: '62px', w2: '86px' },
		{ delay: '.12s', w1: '76px', w2: '68px' },
		{ delay: '.24s', w1: '54px', w2: '92px' },
		{ delay: '.36s', w1: '70px', w2: '74px' }
	];

	const emptyText = $derived(
		remote ? 'Nothing in that bucket' : app.link ? 'Nothing here or in the cloud yet' : 'No saved slots yet'
	);

	const moreText = $derived(
		rows.length > STRIP_CAP
			? `+ ${rows.length - STRIP_CAP} older`
			: `${rows.length} ${rows.length === 1 ? 'count' : 'counts'}`
	);

	function where(row: ArchiveRow): string {
		if (row.where === 'both') return 'On this device and in the cloud';
		if (row.where === 'local') return 'On this device — not backed up yet';
		return remote ? `In ${remote.name}’s bucket` : 'In the cloud only — no longer on this device';
	}

	function open(row: ArchiveRow): void {
		app.openId = row.id;
		app.view = 'slot';
	}
</script>

<footer class:viewing={remote}>
	<div class="lead">
		<div class="cap">SLOTS</div>
		<button
			type="button"
			class="prof"
			class:on={remote}
			aria-expanded={app.profilesOpen}
			onclick={() => (app.profilesOpen = !app.profilesOpen)}
		>
			<span class="prof-icon">{remote ? '☁' : '▣'}</span>
			<span class="prof-name">{remote ? remote.name.toUpperCase() : 'THIS DEVICE'}</span>
			<span class="caret">▴</span>
		</button>
	</div>

	{#if app.profilesOpen}
		<!-- Full-viewport catcher under the menu, so a tap anywhere closes it
		     without every other control needing an outside-click handler. -->
		<div
			class="catch"
			role="presentation"
			onclick={() => (app.profilesOpen = false)}
		></div>
		<div class="menu">
			<div class="menu-cap">BROWSING</div>
			<button
				type="button"
				class="opt"
				class:sel={!remote}
				onclick={() => app.pickProfile(null)}
			>
				<span class="opt-icon local">▣</span>
				<span class="opt-text">
					<span class="opt-name">THIS DEVICE</span>
					<span class="opt-note">{app.link ? 'Local slots · backed up' : 'Local slots'}</span>
				</span>
				{#if !remote}<span class="opt-dot local">●</span>{/if}
			</button>
			{#each app.remotes as r (r.id)}
				<button
					type="button"
					class="opt"
					class:sel={remote?.id === r.id}
					onclick={() => app.pickProfile(r.id)}
				>
					<span class="opt-icon">☁</span>
					<span class="opt-text">
						<span class="opt-name">{r.name.toUpperCase()}</span>
						<span class="opt-note">{r.bucket} · read-only</span>
					</span>
					{#if remote?.id === r.id}<span class="opt-dot">●</span>{/if}
				</button>
			{/each}
			<div class="legend">
				<span>▣ on this device</span>
				<span>☁ in the cloud</span>
			</div>
		</div>
	{/if}

	<div class="sc rail">
		{#if loading}
			{#each SKELETONS as s, i (i)}
				<div class="skel" style:animation-delay={s.delay}>
					<div class="bone one" style:width={s.w1}></div>
					<div class="bone two" style:width={s.w2}></div>
				</div>
			{/each}
		{/if}

		<!-- `app.ready` or this asserts "nothing saved" during the IDB read. -->
		{#if app.ready && !loading && !rows.length}
			<div class="empty">{emptyText}</div>
		{/if}

		{#each chips as row (row.id)}
			<button
				type="button"
				class="slot"
				class:on={app.openId === row.id}
				title={where(row)}
				onclick={() => open(row)}
			>
				<div class="line">
					<span class="marks">
						{#if row.where !== 'cloud'}<span class="m-dev">▣</span>{/if}
						{#if row.where !== 'local'}<span class="m-cloud">☁</span>{/if}
					</span>
					<span class="name">
						{row.label ? stripDate(row.label) : row.cloud?.meta === 'pending' ? '…' : 'Untitled'}
					</span>
					<span class="date">{row.date}</span>
					{#if row.local?.photo || row.cloud?.photoKey}<span class="dot">◉</span>{/if}
				</div>
				<div class="total">{money(row.total)}</div>
			</button>
		{/each}

		<!--
			A failed remote listing degrades to a note beside whatever is already
			there. It never blanks a populated rail: on a till, an empty list reads
			as data loss, and this list is not where the data lives.
		-->
		{#if failed}
			<div class="empty err">{failed}</div>
		{/if}

		{#if rows.length}
			<button type="button" class="more" onclick={() => app.openAllSlots()}>
				<span class="more-n">{moreText}</span>
				<span class="more-cap">SHOW ALL</span>
			</button>
		{/if}
	</div>

	<div class="quick">
		<div class="cap vert">QUICK</div>
		<div class="quick-btns">
			<button type="button" class="btn tiny" onclick={() => app.quickSave()}>SAVE</button>
			<button type="button" class="btn tiny" onclick={() => app.quickLoad()}>LOAD</button>
		</div>
		<div class="quick-info">{quickInfo}</div>
	</div>
</footer>

<style>
	footer {
		position: relative;
		flex: 0 0 auto;
		display: flex;
		align-items: stretch;
		gap: 9px;
		padding: 8px 10px;
		background: var(--strip);
		border-top: 1px solid var(--line);
	}

	footer.viewing {
		background: var(--strip-view);
	}

	.lead {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
	}

	.cap {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--muted-3);
		padding-left: 2px;
	}

	.cap.vert {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		height: 44px;
		text-align: center;
		padding-left: 0;
	}

	.prof {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--line-strong);
		border-radius: 7px;
		background: var(--chip);
		color: var(--fg-dim);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	.prof:hover {
		border-color: var(--muted-4);
	}

	.prof.on {
		background: var(--view-bg);
		border-color: var(--view-line);
		color: var(--view-fg);
	}

	.prof-icon {
		font-size: 11px;
		line-height: 1;
	}

	.prof-name {
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.caret {
		font-size: 9px;
		opacity: 0.6;
	}

	.catch {
		position: fixed;
		inset: 0;
		z-index: 35;
	}

	.menu {
		position: absolute;
		left: 10px;
		bottom: calc(100% + 8px);
		z-index: 40;
		width: 272px;
		padding: 7px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--card);
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6);
	}

	.menu-cap {
		padding: 5px 7px 7px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--muted-3);
	}

	.opt {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.opt:hover {
		background: #1f2226;
	}

	.opt.sel {
		background: #1f2226;
	}

	.opt-icon {
		flex: 0 0 auto;
		width: 16px;
		text-align: center;
		font-size: 12px;
		line-height: 1;
		color: var(--view);
	}

	.opt-icon.local {
		color: var(--acc);
	}

	.opt-text {
		flex: 1;
		min-width: 0;
	}

	.opt-name {
		display: block;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--fg-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.opt.sel .opt-name {
		color: var(--fg);
	}

	.opt-note {
		display: block;
		margin-top: 1px;
		font-size: 10px;
		color: var(--muted-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.opt-dot {
		flex: 0 0 auto;
		font-size: 9px;
		color: var(--view);
	}

	.opt-dot.local {
		color: var(--acc);
	}

	.legend {
		display: flex;
		gap: 12px;
		margin-top: 5px;
		padding: 8px 7px 3px;
		border-top: 1px solid var(--line-soft);
		font-size: 9px;
		letter-spacing: 0.04em;
		color: var(--muted-4);
	}

	.rail {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: 2px;
	}

	.skel {
		flex: 0 0 auto;
		width: 148px;
		height: 48px;
		padding: 0 12px;
		border: 1px solid var(--line-soft);
		border-radius: 9px;
		background: var(--card);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 7px;
		animation: ec-pulse 1.2s ease-in-out infinite;
	}

	.bone {
		border-radius: 4px;
	}

	.one {
		height: 8px;
		background: #282b31;
	}

	.two {
		height: 9px;
		background: #212429;
	}

	.empty {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		height: 48px;
		padding: 0 12px;
		border: 1px dashed var(--line-strong);
		border-radius: 9px;
		font-size: 11px;
		color: var(--muted-3);
		letter-spacing: 0.04em;
	}

	.empty.err {
		border-color: var(--danger);
		color: var(--danger);
		max-width: 260px;
	}

	.slot {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		height: 48px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--card);
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.slot.on {
		background: var(--chip-on);
		border-color: var(--acc);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.marks {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		line-height: 1;
	}

	.m-dev {
		color: #9aa0a8;
	}

	.m-cloud {
		color: var(--view);
	}

	.name {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--fg);
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-2);
	}

	.dot {
		font-size: 9px;
		color: var(--muted-2);
	}

	.total {
		font-family: var(--mono);
		font-size: 13px;
		font-weight: 700;
		color: var(--acc);
		white-space: nowrap;
	}

	.more {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		height: 48px;
		padding: 0 14px;
		border: 1px dashed #3a3e45;
		border-radius: 9px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		font-family: var(--sans);
	}

	.more:hover {
		border-color: var(--acc);
	}

	.more-n {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--fg-dim);
		white-space: nowrap;
	}

	.more-cap {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--muted-3);
	}

	.quick {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 6px;
		padding-left: 10px;
		border-left: 1px solid var(--line);
	}

	.quick-btns {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tiny {
		height: 22px;
		padding: 0 12px;
		border-radius: 6px;
		font-size: 10px;
	}

	.quick-info {
		font-family: var(--mono);
		font-size: 9px;
		line-height: 1.3;
		color: var(--muted-3);
		width: 60px;
		white-space: pre-line;
	}

	/*
	 * On a phone the rail has to wrap onto its own line.
	 *
	 * The design mocks this bar at desktop width, where the profile picker and the
	 * quick slot leave plenty of room. At 375px they take 268px of 375 between
	 * them and the rail collapses to 69px — not one chip fits, on the app's
	 * primary list surface, on the device it actually runs on. So below 620px the
	 * controls share one line and the chips get the full width underneath.
	 *
	 * The extra height is paid for out of the keypad: the footer sits outside
	 * `.mid`, and the `ResizeObserver` there re-runs `measure()`, so the pad
	 * re-sizes itself. Both caps un-rotate and the quick buttons go side by side
	 * to keep that bill as small as possible.
	 */
	@media (max-width: 620px) {
		footer {
			flex-wrap: wrap;
			row-gap: 7px;
		}

		.lead {
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}

		/*
		 * The two controls have to fit one line between them, or the bar wraps to
		 * three rows and costs the keypad another 30px. "SLOTS" is what gives:
		 * a `▣ THIS DEVICE` button sitting directly above a row of slot chips is
		 * already labelled. "QUICK" stays — it is the only thing distinguishing
		 * its SAVE from the real one.
		 */
		.lead > .cap {
			display: none;
		}

		.prof-name {
			max-width: 90px;
		}

		.cap.vert {
			writing-mode: horizontal-tb;
			transform: none;
			height: auto;
		}

		.quick {
			margin-left: auto;
			padding-left: 8px;
		}

		.quick-btns {
			flex-direction: row;
		}

		.tiny {
			padding: 0 10px;
		}

		.quick-info {
			width: 48px;
		}

		/* Forced onto its own line, under both controls. */
		.rail {
			order: 3;
			flex: 1 0 100%;
		}
	}
</style>
