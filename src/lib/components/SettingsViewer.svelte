<script lang="ts">
	import { decodeConfig, encodeViewer } from '$lib/cloudshare';
	import { app } from '$lib/state.svelte';
	import type { Remote } from '$lib/types';

	let open = $state(false);
	let name = $state('');
	let endpoint = $state('');
	let bucket = $state('');
	let region = $state('auto');
	let prefix = $state('');
	let accessKeyId = $state('');
	let secretAccessKey = $state('');
	let showSecret = $state(false);

	/** Same section-level gate as the cloud card — these are bucket keys too. */
	const locked = $derived(app.pinSet && !app.unlocked);

	function unlock(): void {
		app.guard('Change viewer profiles');
	}

	/** Revealing the key is gated; hiding it again is not. */
	function toggleSecret(): void {
		if (showSecret) {
			showSecret = false;
			return;
		}
		if (locked) return unlock();
		app.guard('Show this profile’s secret access key', () => (showSecret = true));
	}

	const complete = $derived(
		Boolean(name.trim() && endpoint.trim() && bucket.trim() && accessKeyId && secretAccessKey)
	);

	/* ---------- one-string transfer ---------- */

	let share = $state<'export' | 'import' | null>(null);
	let shareToken = $state('');
	let shareName = $state('');
	let importText = $state('');
	let importName = $state('');
	/** Which token `importName` was filled from, so a re-paste re-prefills it. */
	let namedFor = $state('');
	let importErr = $state('');
	/** Set when the pasted token says it was made as a backup (read-write) key. */
	let importWarn = $state('');

	function shareProfile(r: Remote): void {
		if (locked) return unlock();
		app.guard(`Show the config string for “${r.name}”`, () => {
			shareName = r.name;
			shareToken = encodeViewer(r);
			share = 'export';
		});
	}

	function openImport(): void {
		if (locked) return unlock();
		app.guard('Import a viewer profile', () => {
			importText = '';
			importName = '';
			namedFor = '';
			importErr = '';
			importWarn = '';
			share = 'import';
		});
	}

	/**
	 * Decodes as you paste so the name can be shown and edited *before*
	 * importing. The name is this device's label for that machine — the sender's
	 * choice is only a suggestion, and two tills can easily arrive with the same
	 * one. A backup-kind token carries no name at all.
	 */
	const preview = $derived(importText.trim() ? decodeConfig(importText) : null);

	$effect(() => {
		const p = preview;
		if (!p?.ok) return;
		// Re-prefill only when a different string is pasted, so typing a name is
		// not undone on the next keystroke.
		if (namedFor !== importText) {
			importName = p.config.name || p.config.bucket || '';
			namedFor = importText;
		}
	});

	function applyImport(): void {
		const res = decodeConfig(importText);
		if (!res.ok) {
			importErr = res.error;
			return;
		}
		const c = res.config;
		// The app cannot inspect a key's real scope. What it can do is notice when
		// the sending device labelled it a backup key, which means read-write.
		if (c.kind === 'backup' && !importWarn) {
			importWarn =
				'That string was made by a device\u2019s CLOUD BACKUP card, so it almost certainly carries a read-write key. A viewer should hold an Object Read only token. Press IMPORT again to add it anyway.';
			return;
		}
		app.addRemote({
			name: importName.trim() || c.name || c.bucket || 'Imported',
			endpoint: c.endpoint,
			bucket: c.bucket,
			region: c.region,
			prefix: c.prefix,
			style: c.style,
			accessKeyId: c.accessKeyId,
			secretAccessKey: c.secretAccessKey
		});
		share = null;
	}

	async function copyToken(): Promise<void> {
		try {
			await navigator.clipboard.writeText(shareToken);
			app.say('Config string copied');
		} catch {
			app.say('Could not copy — select it by hand');
		}
	}

	function add(): void {
		if (!complete) return app.say('Fill in every field first');
		app.addRemote({
			name: name.trim(),
			endpoint: endpoint.trim().replace(/\/+$/, ''),
			bucket: bucket.trim(),
			region: region.trim() || 'auto',
			prefix: prefix.trim(),
			style: 'path',
			accessKeyId,
			secretAccessKey
		});
		name = endpoint = bucket = prefix = accessKeyId = secretAccessKey = '';
		region = 'auto';
		open = false;
	}
</script>

<section class="card">
	<div class="head">
		<div class="label">CLOUD VIEWER</div>
		<div class="spacer"></div>
		<div class="count">{app.remotes.length} saved</div>
	</div>
	<div class="hint gap">
		Browse another machine's bucket, read-only, from the archive screen. Counting and saving on
		this device carry on as normal while you do.
	</div>

	<div class="labels">
		{#each app.remotes as r (r.id)}
			<div class="slot-row">
				<div class="text">
					<div class="slot-name">{r.name}</div>
					<div class="stamp">{r.bucket}{r.prefix ? ` · ${r.prefix}` : ''}</div>
				</div>
				<button type="button" class="btn tiny" title="Share this profile" onclick={() => shareProfile(r)}>
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
		<div class="none">No viewer profiles.</div>
	{/if}

	{#if locked}
		<button type="button" class="locked" onclick={unlock}>
			LOCKED · TAP TO UNLOCK WITH THE ADMIN PIN
		</button>
	{/if}

	<div class="danger-row">
		<button type="button" class="btn wide" onclick={openImport}>IMPORT A PROFILE STRING</button>
	</div>

	<button type="button" class="disclose" onclick={() => (locked ? unlock() : (open = !open))}>
		{open ? '▾' : '▸'} ADD A PROFILE BY HAND
	</button>

	{#if open}
		<div class="warn">
			Paste a token scoped <b>Object Read only</b> and to <b>one bucket</b>. EuroCash cannot check
			this for you — a read-write token pasted here can delete the other machine's data.
		</div>

		<div class="fields">
			<label class="f"><span>Name</span>
				<input class="field prose" type="text" bind:value={name} placeholder="Till 2 — back office" /></label>
			<label class="f"><span>Endpoint</span>
				<input class="field" type="url" bind:value={endpoint} /></label>
			<label class="f"><span>Bucket</span>
				<input class="field" type="text" bind:value={bucket} /></label>
			<label class="f"><span>Region</span>
				<input class="field" type="text" bind:value={region} /></label>
			<label class="f"><span>Folder prefix (optional)</span>
				<input class="field" type="text" bind:value={prefix} /></label>
			<label class="f"><span>Access key ID</span>
				<input class="field" type="text" bind:value={accessKeyId} /></label>
			<label class="f"><span>Secret access key</span>
				<span class="secret">
					<input class="field" type={showSecret ? 'text' : 'password'} bind:value={secretAccessKey} />
					<button type="button" class="btn field-btn" onclick={toggleSecret}>
						{showSecret ? 'HIDE' : 'SHOW'}
					</button>
				</span></label>
		</div>

		<div class="danger-row">
			<button type="button" class="btn wide" class:dim={!complete} onclick={add}>ADD PROFILE</button>
		</div>
	{/if}

	<div class="hint note">
		A viewer profile is a key to another machine's bucket. Anyone who has it can read that
		machine's counts and photos with any S3 tool — this app's read-only browsing is a convenience,
		not a lock. To take access away you <b>rotate the token on the source machine</b>; changing a
		PIN does nothing.
	</div>
</section>

{#if share}
	<div class="scrim">
		<div class="sheet share">
			{#if share === 'export'}
				<div class="sheet-title acc">SHARE “{shareName}”</div>
				<div class="sheet-body">
					Paste this on the other device under CLOUD VIEWER to add the same profile.
				</div>
				<div class="warn">
					<b>This string contains that bucket's secret key in clear.</b> It should be an
					<b>Object Read only</b> token scoped to one bucket — EuroCash cannot check that for you.
					If it is a read-write key, whoever receives this can change or delete that machine's
					counts. Send it the way you would send a password.
				</div>
				<textarea class="token" readonly rows="4" value={shareToken}></textarea>
				<button type="button" class="btn-primary act" onclick={copyToken}>COPY CONFIG STRING</button>
			{:else}
				<div class="sheet-title acc">IMPORT A VIEWER PROFILE</div>
				<div class="sheet-body">
					Paste a profile string from the machine you want to read. It is added as a new profile;
					nothing already here is replaced.
				</div>
				<textarea
					class="token"
					rows="4"
					placeholder="EC1.…"
					bind:value={importText}
					oninput={() => { importErr = ''; importWarn = ''; }}
				></textarea>
				{#if preview?.ok}
					<label class="f">
						<span>Name on this device</span>
						<input class="field prose" type="text" bind:value={importName} placeholder="Till 2" />
					</label>
					<div class="hint">
						{preview.config.bucket}{preview.config.prefix ? ` · ${preview.config.prefix}` : ''}
					</div>
				{/if}
				{#if importErr}<div class="imp-err">{importErr}</div>{/if}
				{#if importWarn}<div class="warn">{importWarn}</div>{/if}
				<button type="button" class="btn-primary act" onclick={applyImport}>
					{importWarn ? 'IMPORT ANYWAY' : 'IMPORT'}
				</button>
			{/if}
			<button type="button" class="cancel" onclick={() => (share = null)}>CLOSE</button>
		</div>
	</div>
{/if}

<style>
	.share {
		max-width: 460px;
	}

	.acc {
		color: var(--acc);
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

	.tiny {
		height: 30px;
		padding: 0 10px;
		border-radius: 7px;
		font-size: 10px;
		flex: 0 0 auto;
	}

	.locked {
		width: 100%;
		margin-top: 8px;
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

	.disclose {
		width: 100%;
		margin-top: 8px;
		padding: 8px 0;
		border: 0;
		background: transparent;
		color: var(--muted-2);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-align: left;
	}

	.disclose:hover {
		color: var(--acc);
	}

	.warn {
		border: 1px solid var(--danger);
		border-radius: 9px;
		padding: 10px 12px;
		font-size: 11px;
		line-height: 1.5;
		color: var(--fg-dim);
	}

	.warn b {
		color: var(--danger);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 9px;
		margin: 11px 0;
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

	.secret {
		display: flex;
		gap: 8px;
	}

	.note {
		display: block;
		margin-top: 11px;
	}
</style>
