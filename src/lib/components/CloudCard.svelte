<script lang="ts">
	import { readKey, writeKey } from '$lib/cloudcfg';
	import { decodeConfig, encodeConfig } from '$lib/cloudshare';
	import { bytes, dmy, hm } from '$lib/format';
	import { app } from '$lib/state.svelte';
	import type { MaxAge } from '$lib/types';

	const link = $derived(app.link);
	// Not `link.cfg` — this card has to be usable before there is an engine.
	const cfg = $derived(app.cloudCfg);

	const stored = readKey();
	let accessKeyId = $state(stored?.accessKeyId ?? '');
	let secretAccessKey = $state(stored?.secretAccessKey ?? '');
	let showSecret = $state(false);
	let guideOpen = $state(false);
	let probeResult = $state('');
	let busy = $state(false);

	/**
	 * Non-secret fields, held locally so typing does not fire a write per
	 * keystroke — seeded straight from the stored config at init.
	 *
	 * Emphatically NOT seeded from an `$effect`: that runs after mount, so
	 * anything calling `applyFields()` first would write these empty strings
	 * over a perfectly good endpoint and bucket. That is a config-destroying
	 * race, and reading synchronously removes it rather than guarding it.
	 * `app.cloudCfg` is hydrated before settings can be opened, so it is ready.
	 */
	let endpoint = $state(app.cloudCfg.endpoint);
	let bucket = $state(app.cloudCfg.bucket);
	let region = $state(app.cloudCfg.region);
	let prefix = $state(app.cloudCfg.prefix);

	const CORS = `[
  {
    "AllowedOrigins": ["${typeof location === 'undefined' ? 'https://cash.invition.dev' : location.origin}"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag", "Date"],
    "MaxAgeSeconds": 86400
  }
]`;

	function applyFields(): void {
		// Guard the same failure from any future caller: blanking these is never
		// something a user meant to do by pressing a button.
		if (!endpoint.trim() && cfg.endpoint) return;
		cfg.endpoint = endpoint.trim().replace(/\/+$/, '');
		cfg.bucket = bucket.trim();
		cfg.region = region.trim() || 'auto';
		cfg.prefix = prefix.trim();
		if (cfg.prefix && !cfg.prefix.endsWith('/')) cfg.prefix += '/';
		app.persistCloud();
		if (accessKeyId && secretAccessKey) writeKey({ accessKeyId, secretAccessKey });
	}

	async function toggleOn(): Promise<void> {
		const next = !cfg.on;
		cfg.on = next;
		// Stamped now, so switching on does not queue every slot ever saved. The
		// explicit button below is how you ask for that.
		if (next) cfg.syncFrom = Date.now();
		applyFields();
		if (next) await app.enableCloud();
	}

	async function test(): Promise<void> {
		if (locked) return app.guard('Change cloud settings', () => void test());
		applyFields();
		busy = true;
		probeResult = 'Checking…';
		// Deliberately not `enableCloud`: that requires the switch to be on, which
		// would mean the only way to check your keys is to commit to them first.
		const link = await app.loadCloudEngine();
		probeResult = link
			? await link.probe()
			: 'Fill in the endpoint, bucket and both keys first';
		busy = false;
	}

	const pendingBytes = $derived(
		(link?.pending ?? []).reduce((n, s) => n + (s.photo?.bytes ?? 0) + 400, 0)
	);

	/**
	 * The whole section is gated, not each control: these credentials grant every
	 * photo in the bucket, and repointing the endpoint silently sends future
	 * backups somewhere else. One prompt opens the five-minute window for all of
	 * it, rather than asking again on every field.
	 */
	const locked = $derived(app.pinSet && !app.unlocked);

	function unlock(): void {
		app.guard('Change cloud settings');
	}

	/**
	 * Runs `job` when the section is unlocked, otherwise asks once and then runs
	 * it. Handing the job to the gate matters: without it, unlocking swallows the
	 * tap that triggered it and every control needs pressing twice.
	 */
	function edit(job: () => void): void {
		if (locked) return app.guard('Change cloud settings', job);
		job();
	}

	/** Revealing the key is gated; hiding it again is not. */
	function toggleSecret(): void {
		if (showSecret) {
			showSecret = false;
			return;
		}
		edit(() => (showSecret = true));
	}

	/* ---------- one-string config transfer ---------- */

	let share = $state<'export' | 'import' | null>(null);
	let shareToken = $state('');
	let importText = $state('');
	let importErr = $state('');

	/** Generating exposes the secret key — the section gate already covers it. */
	function openExport(): void {
		edit(() => {
			const key = readKey();
			if (!key) return app.say('Fill in both keys first');
			applyFields();
			shareToken = encodeConfig($state.snapshot(cfg), key);
			share = 'export';
		});
	}

	function openImport(): void {
		edit(() => {
			importText = '';
			importErr = '';
			share = 'import';
		});
	}

	function applyImport(): void {
		const res = decodeConfig(importText);
		if (!res.ok) {
			importErr = res.error;
			return;
		}
		const c = res.config;
		cfg.endpoint = c.endpoint;
		cfg.bucket = c.bucket;
		cfg.region = c.region;
		cfg.style = c.style;
		cfg.prefix = c.prefix;
		cfg.cloudAge = c.cloudAge;
		cfg.role = c.role;
		app.persistCloud();
		writeKey({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey });
		// The visible fields are local copies, so they have to follow.
		endpoint = c.endpoint;
		bucket = c.bucket;
		region = c.region;
		prefix = c.prefix;
		accessKeyId = c.accessKeyId;
		secretAccessKey = c.secretAccessKey;
		share = null;
		app.say('Cloud config imported');
	}

	async function copyToken(): Promise<void> {
		try {
			await navigator.clipboard.writeText(shareToken);
			app.say('Config string copied');
		} catch {
			app.say('Could not copy — select it by hand');
		}
	}

	async function copyCors(): Promise<void> {
		try {
			await navigator.clipboard.writeText(CORS);
			app.say('CORS policy copied');
		} catch {
			app.say('Could not copy — select it by hand');
		}
	}
</script>

<section class="card">
	<div class="label">CLOUD BACKUP</div>
	<div class="hint gap">
		Your own storage bucket. EuroCash has no server — the app talks to your bucket directly, and a
		slot that has been backed up survives being deleted here.
	</div>

	{#if locked}
		<button type="button" class="locked" onclick={unlock}>
			LOCKED · TAP TO UNLOCK WITH THE ADMIN PIN
		</button>
	{/if}

	<div class="setting div-bottom" class:dim={locked}>
		<div class="text">
			<div class="name">Back up to my bucket</div>
			<div class="hint">S3-compatible: Cloudflare R2, Backblaze B2, MinIO, AWS S3.</div>
		</div>
		<button
			type="button"
			class="switch"
			class:on={cfg.on}
			aria-pressed={cfg.on}
			aria-label="Back up to my bucket"
			onclick={() => edit(toggleOn)}
		>
			<span class="knob"></span>
		</button>
	</div>

	<button type="button" class="disclose" onclick={() => (guideOpen = !guideOpen)}>
		{guideOpen ? '▾' : '▸'} SETUP GUIDE
	</button>

	{#if guideOpen}
		<ol class="guide">
			<li>
				Cloudflare dashboard → <b>R2</b> → <b>Create bucket</b>. Any name; note it. (Check whether
				enabling R2 asks for a payment method — the pricing page does not say, and it is the first
				place setup can stall.)
			</li>
			<li>
				Copy the <b>account ID</b> from the R2 overview. Your endpoint is
				<code>https://&lt;account-id&gt;.r2.cloudflarestorage.com</code> and the region is
				<code>auto</code>.
			</li>
			<li>
				R2 → <b>Manage API Tokens</b> → <b>Create API Token</b>. Permission
				<b>Object Read &amp; Write</b>, and under <i>Specify bucket(s)</i> pick
				<b>only the bucket from step 1</b>. Never an account-scoped or Admin token. Copy both keys —
				the secret is shown once.
			</li>
			<li>
				Bucket → <b>Settings</b> → <b>CORS policy</b> → Edit, and paste the policy below. Changes
				take up to 30 seconds.
			</li>
			<li>Fill in the fields here and press TEST CONNECTION.</li>
		</ol>

		<pre class="cors">{CORS}</pre>
		<div class="danger-row">
			<button type="button" class="btn wide" onclick={() => copyCors()}>COPY CORS POLICY</button>
		</div>
		<div class="hint">
			A viewer device uses <b>Object Read only</b> and needs only
			<code>["GET", "HEAD"]</code>. Same policy works on AWS S3 and MinIO; B2 uses its own
			<code>corsRules</code> shape with the same fields.
		</div>
	{/if}

	<div class="fields" class:dim={locked}>
		<label class="f"><span>Endpoint</span>
			<input class="field" type="url" bind:value={endpoint} onchange={applyFields} readonly={locked} onclick={() => locked && unlock()}
				placeholder="https://<account-id>.r2.cloudflarestorage.com" /></label>
		<label class="f"><span>Bucket</span>
			<input class="field" type="text" bind:value={bucket} onchange={applyFields} readonly={locked} onclick={() => locked && unlock()} placeholder="eurocash" /></label>
		<label class="f"><span>Region</span>
			<input class="field" type="text" bind:value={region} onchange={applyFields} readonly={locked} onclick={() => locked && unlock()} placeholder="auto" /></label>
		<label class="f"><span>Folder prefix (optional)</span>
			<input class="field" type="text" bind:value={prefix} onchange={applyFields} readonly={locked} onclick={() => locked && unlock()} placeholder="till-1/" /></label>
		<label class="f"><span>Access key ID</span>
			<input class="field" type="text" bind:value={accessKeyId} onchange={applyFields} readonly={locked} onclick={() => locked && unlock()} /></label>
		<label class="f"><span>Secret access key</span>
			<span class="secret">
				<input class="field" type={showSecret ? 'text' : 'password'} bind:value={secretAccessKey}
					onchange={applyFields} readonly={locked} onclick={() => locked && unlock()} />
				<button type="button" class="btn field-btn" onclick={toggleSecret}>
					{showSecret ? 'HIDE' : 'SHOW'}
				</button>
			</span></label>
	</div>

	<div class="setting div-top" class:dim={locked}>
		<div class="text">
			<div class="name">Keep cloud slots for</div>
			<div class="hint">
				Independent of the local window.
				{#if cfg.cloudAge === app.cfg.maxAge}
					Same as the local window — the cloud copy expires with the local one. Set 31 here and 7
					locally for the archive to add anything.
				{/if}
			</div>
		</div>
		<div class="seg">
			{#each [7, 31] as d (d)}
				<button
					type="button"
					class:on={cfg.cloudAge === d}
					onclick={() => {
						cfg.cloudAge = d as MaxAge;
						app.persistCloud();
					}}
				>
					{d} DAYS
				</button>
			{/each}
		</div>
	</div>

	<div class="setting" class:dim={locked}>
		<div class="text">
			<div class="name">This device</div>
			<div class="hint">
				A viewer never uploads, never prunes and should hold a read-only token.
			</div>
		</div>
		<div class="seg">
			{#each ['writer', 'viewer'] as r (r)}
				<button type="button" class:on={cfg.role === r}
					onclick={() =>
						edit(() => {
							cfg.role = r as 'writer' | 'viewer';
							app.persistCloud();
						})}>
					{r.toUpperCase()}
				</button>
			{/each}
		</div>
	</div>

	<div class="danger-row">
		<button type="button" class="btn wide" onclick={openExport}>SHARE CONFIG</button>
		<button type="button" class="btn wide" onclick={openImport}>IMPORT CONFIG</button>
	</div>

	<div class="danger-row">
		<button type="button" class="btn wide" onclick={() => test()}>TEST CONNECTION</button>
		<button type="button" class="btn wide" onclick={() => edit(() => void app.link?.backupNow())}>BACK UP NOW</button>
	</div>

	{#if link && link.pending.length}
		<div class="danger-row">
			<button type="button" class="btn wide" onclick={() => edit(() => void app.link?.backupAll())}>
				BACK UP {link.pending.length} WAITING · ~{bytes(pendingBytes)}
			</button>
		</div>
	{/if}

	<div class="status">
		{#if probeResult}<div class:err={busy === false && !probeResult.startsWith('Bucket')}>{probeResult}</div>{/if}
		{#if link}
			<div>
				{link.status} · {link.pending.length} waiting{link.cfg.lastSyncAt
					? ` · last ${dmy(new Date(link.cfg.lastSyncAt))} ${hm(new Date(link.cfg.lastSyncAt))}`
					: ''}
			</div>
			{#if link.lastError}<div class="err">{link.lastError}</div>{/if}
			{#if Math.abs(link.skewMin) > 5}
				<div class="err">This device's clock is {Math.abs(link.skewMin)} min out — fix it or the bucket will refuse writes.</div>
			{/if}
		{/if}
	</div>

	<div class="hint note">
		The keys are stored on this device in plain text. Scope the token to
		<b>one bucket</b> — anything that can read this browser's storage can read them, and no browser
		storage prevents that.
	</div>
</section>

{#if share}
	<div class="scrim">
		<div class="sheet share">
			{#if share === 'export'}
				<div class="sheet-title acc">SHARE CLOUD CONFIG</div>
				<div class="sheet-body">
					Copy this once on the machine that set the bucket up, then import it on the tablet. It
					replaces every cloud field including both keys.
				</div>
				<div class="warn">
					<b>This string contains your secret access key in clear.</b> Anyone who sees it has the
					bucket. Send it the way you would send a password, and delete it afterwards.
				</div>
				<textarea class="token" readonly rows="4" value={shareToken}></textarea>
				<button type="button" class="btn-primary act" onclick={copyToken}>COPY CONFIG STRING</button>
			{:else}
				<div class="sheet-title acc">IMPORT CLOUD CONFIG</div>
				<div class="sheet-body">
					Paste the string from the other machine. This overwrites the cloud settings and keys on
					this device.
				</div>
				<textarea
					class="token"
					rows="4"
					placeholder="EC1.…"
					bind:value={importText}
					oninput={() => (importErr = '')}
				></textarea>
				{#if importErr}<div class="imp-err">{importErr}</div>{/if}
				<button type="button" class="btn-primary act" onclick={applyImport}>IMPORT</button>
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

	.disclose {
		width: 100%;
		margin-top: 4px;
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

	.guide {
		margin: 0 0 10px;
		padding-left: 18px;
		font-size: 11px;
		line-height: 1.6;
		color: var(--muted);
	}

	.guide li {
		margin-bottom: 7px;
	}

	.guide b {
		color: var(--fg-dim);
	}

	code {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--acc);
	}

	.cors {
		margin: 0;
		padding: 10px;
		border-radius: 9px;
		background: var(--sunk);
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 10px;
		line-height: 1.5;
		overflow-x: auto;
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

	/* First child only — the secret field wraps its input and button in a span too. */
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

	.status {
		margin-top: 11px;
		font-family: var(--mono);
		font-size: 10px;
		line-height: 1.7;
		color: var(--muted-3);
	}

	.err {
		color: var(--danger);
	}

	.note {
		display: block;
		margin-top: 11px;
	}
</style>
