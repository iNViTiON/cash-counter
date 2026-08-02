<script lang="ts">
	import { decodeConfig, encodeViewer } from '$lib/cloudshare';
	import { app } from '$lib/state.svelte';
	import type { Remote } from '$lib/types';

	/**
	 * Cloud profiles: other machines' buckets, and which one the slot strip opens
	 * on. Adding and removing are gated — a profile is a bucket credential, and
	 * handing one out is the "loses data or gives away access" case the PIN
	 * exists for. Choosing a default and switching between them are not: they
	 * only change what is read, through a key this device already holds.
	 */
	const locked = $derived(app.pinSet && !app.unlocked);
	const cfg = $derived(app.cloudCfg);
	const lastUsed = $derived(app.remotes.find((r) => r.id === cfg.lastProfile) ?? null);

	function unlock(): void {
		app.guard('Change cloud profiles');
	}

	/* ---------- add ---------- */

	let addOpen = $state(false);
	let addName = $state('');
	let addToken = $state('');
	let addErr = $state('');
	/** Set when the pasted token says it was made as a backup (read-write) key. */
	let addWarn = $state('');
	/** Which token `addName` was prefilled from, so a re-paste re-prefills it. */
	let namedFor = $state('');

	/**
	 * Decoded as you paste, so the name and the target are visible and editable
	 * *before* anything is added. The name is this device's label for that
	 * machine — the sender's choice is a suggestion, and two tills easily arrive
	 * with the same one.
	 */
	const preview = $derived(addToken.trim() ? decodeConfig(addToken) : null);

	$effect(() => {
		const p = preview;
		if (!p?.ok) return;
		// Re-prefill only when a different string is pasted, so a typed name is not
		// undone on the next keystroke.
		if (namedFor !== addToken) {
			addName = p.config.name || p.config.bucket || '';
			namedFor = addToken;
		}
	});

	/**
	 * Straight to `app.guard`, with no `if (locked) unlock()` in front of it.
	 * `guard` already covers both states — it runs the job now when the window is
	 * open and holds it when it is not. An extra `locked` branch calling `unlock()`
	 * hands the gate an *empty* job, so unlocking swallows the tap that triggered
	 * it and every button needs pressing twice.
	 */
	function openAdd(): void {
		app.guard('Add a cloud profile — the string carries another bucket’s key', () => {
			addName = '';
			addToken = '';
			addErr = '';
			addWarn = '';
			namedFor = '';
			addOpen = true;
		});
	}

	function confirmAdd(): void {
		const res = decodeConfig(addToken);
		if (!res.ok) {
			addErr = res.error;
			return;
		}
		const c = res.config;
		// The app cannot inspect a key's real scope. What it can do is notice when
		// the sending device labelled it a backup key, which means read-write.
		if (c.kind === 'backup' && !addWarn) {
			addWarn =
				'That string was built as a full config, so it almost certainly carries a read-write key. A profile should hold an Object Read only token. Press ADD PROFILE again to add it anyway.';
			return;
		}
		app.addRemote(
			{
				name: addName.trim() || c.name || c.bucket || 'Another till',
				endpoint: c.endpoint,
				bucket: c.bucket,
				region: c.region,
				prefix: c.prefix,
				style: c.style,
				accessKeyId: c.accessKeyId,
				secretAccessKey: c.secretAccessKey
			},
			() => (addOpen = false)
		);
	}

	/* ---------- pass a profile on ---------- */

	let share = $state<{ name: string; text: string } | null>(null);

	function shareProfile(r: Remote): void {
		app.guard(`Share the profile “${r.name}”`, () => {
			share = { name: r.name, text: encodeViewer(r) };
		});
	}

	async function copyShare(): Promise<void> {
		if (!share) return;
		try {
			await navigator.clipboard.writeText(share.text);
			app.say('String copied');
		} catch {
			app.say('Could not copy — select it by hand');
		}
	}
</script>

<section class="card">
	<div class="label">CLOUD PROFILES</div>
	<div class="hint gap">
		Which counts the slot strip opens on. A profile is another machine's bucket — always read-only,
		never saved to. Tap a row to make it the default.
	</div>

	{#if locked}
		<button type="button" class="locked" onclick={unlock}>
			LOCKED · TAP TO UNLOCK WITH THE ADMIN PIN
		</button>
	{/if}

	<div class="rows">
		<button
			type="button"
			class="prow"
			class:def={cfg.defaultProfile === 'local'}
			onclick={() => app.setDefaultProfile('local')}
		>
			<span class="picon local">▣</span>
			<span class="ptext">
				<span class="pname">This device</span>
				<span class="pnote">Always opens on your own counts</span>
			</span>
			{#if cfg.defaultProfile === 'local'}<span class="tag">DEFAULT</span>{/if}
		</button>

		<button
			type="button"
			class="prow"
			class:def={cfg.defaultProfile === 'last'}
			onclick={() => app.setDefaultProfile('last')}
		>
			<span class="picon last">⟲</span>
			<span class="ptext">
				<span class="pname">Last used</span>
				<span class="pnote">Now: {lastUsed?.name ?? 'This device'}</span>
			</span>
			{#if cfg.defaultProfile === 'last'}<span class="tag">DEFAULT</span>{/if}
		</button>

		{#each app.remotes as r (r.id)}
			<div class="prow-wrap" class:def={cfg.defaultProfile === r.id}>
				<button type="button" class="prow bare" onclick={() => app.setDefaultProfile(r.id)}>
					<span class="picon remote">☁</span>
					<span class="ptext">
						<span class="pname">{r.name}</span>
						<span class="pnote">{r.bucket}{r.prefix ? ` · ${r.prefix}` : ''} · read-only</span>
					</span>
				</button>
				{#if cfg.defaultProfile === r.id}<span class="tag">DEFAULT</span>{/if}
				<button type="button" class="btn view-btn" title="Pass this profile on" onclick={() => shareProfile(r)}>
					SHARE
				</button>
				<button
					type="button"
					class="btn btn-danger x big"
					title="Remove profile"
					onclick={() => app.removeRemote(r.id)}
				>
					✕
				</button>
			</div>
		{/each}
	</div>

	{#if !app.remotes.length}
		<div class="none">No profiles — the strip always shows this device.</div>
	{/if}

	<div class="danger-row">
		<button type="button" class="btn wide" onclick={openAdd}>ADD A PROFILE</button>
	</div>

	<div class="hint note">
		A profile is a key to another machine's bucket. Anyone who has it can read that machine's counts
		and photos with any S3 tool — this app's read-only browsing is a convenience, not a lock, and
		browsing one asks for no PIN. To take access away you
		<b>rotate the token on the source machine</b>. Adding and removing a profile is what the PIN
		guards, because that is what hands the key out.
	</div>
</section>

{#if addOpen}
	<div class="scrim">
		<div class="sheet wide-sheet">
			<div class="sheet-title acc">ADD A PROFILE</div>
			<div class="sheet-body">
				Paste the string from the machine you want to read. It carries that bucket's key in clear —
				treat it like the key itself. Its real permissions are whatever that key was given; this app
				cannot check.
			</div>

			<label class="f">
				<span>Name on this device</span>
				<input
					class="field prose"
					type="text"
					bind:value={addName}
					placeholder="Blank uses the name in the string"
				/>
			</label>

			<textarea
				class="token"
				rows="4"
				placeholder="EC1.…"
				bind:value={addToken}
				oninput={() => {
					addErr = '';
					addWarn = '';
				}}
			></textarea>

			{#if preview?.ok}
				<div class="hint">
					{preview.config.bucket}{preview.config.prefix ? ` · ${preview.config.prefix}` : ''}
				</div>
			{/if}
			{#if addErr}<div class="imp-err">{addErr}</div>{/if}
			{#if addWarn}<div class="warn">{addWarn}</div>{/if}

			<button type="button" class="btn-primary act" onclick={confirmAdd}>
				{addWarn ? 'ADD ANYWAY' : 'ADD PROFILE'}
			</button>
			<button type="button" class="cancel" onclick={() => (addOpen = false)}>CANCEL</button>
		</div>
	</div>
{/if}

{#if share}
	<div class="scrim">
		<div class="sheet wide-sheet">
			<div class="sheet-title view">☁ {share.name.toUpperCase()} — PROFILE STRING</div>
			<textarea class="token" readonly rows="4" value={share.text}></textarea>
			<div class="hint">
				The same key this device was given for that bucket — passing it on grants exactly what it
				already grants, no more. The receiving machine adds it under Cloud profiles and can rename
				it there.
			</div>
			<button type="button" class="btn-primary act" onclick={copyShare}>COPY</button>
			<button type="button" class="cancel" onclick={() => (share = null)}>CLOSE</button>
		</div>
	</div>
{/if}

<style>
	.wide-sheet {
		max-width: 460px;
	}

	.acc {
		color: var(--acc);
	}

	.view {
		color: var(--view-fg);
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.prow,
	.prow-wrap {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: 1px solid var(--line-soft);
		border-radius: 9px;
		background: var(--bar);
		text-align: left;
		font-family: var(--sans);
	}

	.prow {
		cursor: pointer;
	}

	.prow.def,
	.prow-wrap.def {
		background: #1f2226;
		border-color: #4a3a1c;
	}

	/* The row inside a wrapper carries no chrome of its own — the wrapper is the row. */
	.prow.bare {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.picon {
		flex: 0 0 auto;
		width: 16px;
		text-align: center;
		font-size: 12px;
		line-height: 1;
	}

	.picon.local {
		color: var(--acc);
	}

	.picon.last {
		color: #9aa0a8;
	}

	.picon.remote {
		color: var(--view);
	}

	.ptext {
		flex: 1;
		min-width: 0;
	}

	.pname {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pnote {
		display: block;
		margin-top: 1px;
		font-size: 11px;
		color: var(--muted-4);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		border-radius: 5px;
		background: #2a2318;
		color: var(--acc);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.view-btn {
		flex: 0 0 auto;
		height: 30px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--view-fg);
		font-size: 9px;
	}

	.view-btn:hover {
		border-color: var(--view);
		color: var(--view-fg);
	}

	.token {
		width: 100%;
		padding: 10px;
		border: 1px solid var(--line-input);
		border-radius: 9px;
		background: var(--sunk);
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.45;
		resize: vertical;
		outline: none;
		word-break: break-all;
	}

	.token:focus {
		border-color: var(--acc);
	}

	.imp-err {
		font-size: 11px;
		color: var(--danger);
	}

	.warn {
		border: 1px solid var(--danger);
		border-radius: 9px;
		padding: 10px 12px;
		font-size: 11px;
		line-height: 1.5;
		color: var(--fg-dim);
	}

	.act {
		height: 44px;
		font-size: 11px;
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

	.locked {
		width: 100%;
		margin-bottom: 11px;
		padding: 9px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--sunk);
		color: var(--acc);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
	}

	.locked:hover {
		border-color: var(--acc);
	}

	.f {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.f > span:first-child {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--muted-2);
	}

	.note {
		display: block;
		margin-top: 11px;
	}
</style>
