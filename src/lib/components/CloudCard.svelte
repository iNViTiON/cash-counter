<script lang="ts">
	import { readKey, writeKey } from '$lib/cloudcfg';
	import { decodeConfig, encodeConfig, encodeFor } from '$lib/cloudshare';
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

	const backlogBytes = $derived(
		(link?.backlog ?? []).reduce((n, s) => n + (s.photo?.bytes ?? 0) + 400, 0)
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

	/**
	 * The string builder.
	 *
	 * This device holds exactly one key — the read-write one it backs up with —
	 * so it cannot honestly produce a read-only string from what it has. Giving
	 * someone view-only access means making a read-only key in the bucket console
	 * and wrapping it around this device's endpoint, bucket, region and prefix,
	 * which is all this does.
	 */
	let gen = $state<{ name: string; keyId: string; secret: string; scope: 'viewer' | 'backup' } | null>(
		null
	);
	const genReady = $derived(Boolean(gen?.keyId && gen?.secret));
	const genText = $derived(
		gen && genReady
			? encodeFor(
					gen.scope,
					gen.name.trim() || cfg.bucket,
					{
						endpoint: cfg.endpoint,
						bucket: cfg.bucket,
						region: cfg.region,
						style: cfg.style,
						prefix: cfg.prefix,
						cloudAge: cfg.cloudAge
					},
					{ accessKeyId: gen.keyId, secretAccessKey: gen.secret }
				)
			: ''
	);

	function openGen(): void {
		edit(() => {
			if (!cfg.endpoint || !cfg.bucket) return app.say('Fill in the endpoint and bucket first');
			applyFields();
			share = null;
			gen = { name: '', keyId: '', secret: '', scope: 'viewer' };
		});
	}

	async function copyGen(): Promise<void> {
		if (!genText) return;
		try {
			await navigator.clipboard.writeText(genText);
			app.say('String copied');
		} catch {
			app.say('Could not copy — select it by hand');
		}
	}

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
					locally for the strip to keep showing what the device has dropped.
				{/if}
			</div>
		</div>
		<div class="seg">
			{#each [7, 31] as d (d)}
				<!-- Gated like every other cloud control: shortening this is what
				     decides when the off-device copy stops existing. -->
				<button
					type="button"
					class:on={cfg.cloudAge === d}
					onclick={() =>
						edit(() => {
							cfg.cloudAge = d as MaxAge;
							app.persistCloud();
						})}
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
		<button type="button" class="btn wide" onclick={() => test()}>TEST CONNECTION</button>
		<button type="button" class="btn wide" onclick={() => edit(() => void app.link?.backupNow())}>BACK UP NOW</button>
	</div>

	<div class="share-block">
		<div class="label">SHARE ACCESS</div>
		<div class="hint gap">
			A string is endpoint, bucket and a key packed into one paste. This device only holds its
			<b>own</b> key — the read-write one it backs up with — so it cannot invent a read-only string.
			To hand someone view-only access, make a read-only key in your bucket console and build a
			string around it here. Scope lives in the bucket policy; the app can only label what it was
			told.
		</div>
		<div class="danger-row">
			<button type="button" class="btn wide" onclick={openExport}>SHARE THIS DEVICE’S CONFIG</button>
			<button type="button" class="btn wide view-btn" onclick={openGen}>BUILD A STRING</button>
			<button type="button" class="btn wide" onclick={openImport}>PASTE A CONFIG</button>
		</div>

		{#if gen}
			<div class="gen">
				<div class="gen-head">
					<div class="gen-cap">BUILD A STRING AROUND ANOTHER KEY</div>
					<div class="spacer"></div>
					<button type="button" class="btn x" title="Close" onclick={() => (gen = null)}>✕</button>
				</div>
				<div class="hint">
					Takes this device's endpoint, bucket, region and prefix, and the key <i>you</i> paste —
					never the one stored here. Make that key in your bucket console with the permissions you
					actually want.
				</div>

				<div class="fields">
					<label class="f"><span>Name other machines will see</span>
						<input class="field prose" type="text" bind:value={gen.name} placeholder="Till 1 · Viru" /></label>
					<label class="f"><span>Access key ID</span>
						<input class="field" type="text" bind:value={gen.keyId} placeholder="paste the key you made" /></label>
					<label class="f"><span>Secret access key</span>
						<input class="field" type="text" bind:value={gen.secret} /></label>
				</div>

				<div class="scope">
					<span class="scope-cap">THE KEY YOU PASTED IS</span>
					<div class="seg">
						<button type="button" class:on={gen.scope === 'viewer'} onclick={() => gen && (gen.scope = 'viewer')}>
							FOR VIEWING
						</button>
						<button type="button" class:on={gen.scope === 'backup'} onclick={() => gen && (gen.scope = 'backup')}>
							FULL ACCESS
						</button>
					</div>
				</div>

				{#if genReady}
					<div class="gen-out">
						<div class="gen-head">
							<div class="gen-cap" class:view={gen.scope === 'viewer'}>
								{gen.scope === 'viewer' ? '☁ VIEWER STRING' : 'FULL CONFIG STRING'}
							</div>
							<div class="spacer"></div>
							<button type="button" class="btn tiny" onclick={copyGen}>COPY</button>
						</div>
						<textarea class="token" readonly rows="4" value={genText}></textarea>
						<div class="caution">
							{gen.scope === 'viewer'
								? 'Marked read-only for the receiving app. That is a label, not a restriction — what it can actually do is whatever you scoped this key to in the bucket policy.'
								: 'Marked read-write. The receiving till will back up into this same bucket.'}
						</div>
					</div>
				{:else}
					<div class="hint">Paste a key id and secret to build the string.</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Gated on the backlog, not on `pending`: slots saved before sync was
	     switched on are deliberately excluded from the automatic queue, and this
	     is the only control that will send them. -->
	{#if link && link.backlog.length}
		<div class="danger-row">
			<button type="button" class="btn wide" onclick={() => edit(() => void app.link?.backupAll())}>
				BACK UP {link.backlog.length} NOT YET SAVED · ~{bytes(backlogBytes)}
			</button>
		</div>
	{/if}

	<div class="status">
		{#if probeResult}<div class:err={busy === false && !probeResult.startsWith('Bucket')}>{probeResult}</div>{/if}
		{#if link}
			<div>
				{link.status} · {link.backlog.length} not backed up{link.cfg.lastSyncAt
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

	/* Two-up where there is room; one column on a phone. Six single-line fields
	   stacked is a lot of scrolling on the one screen setup actually happens on. */
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(184px, 1fr));
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

	.share-block {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--line-soft);
	}

	.view-btn {
		border-color: var(--view-line);
		background: var(--view-bg);
		color: var(--view-fg);
	}

	.view-btn:hover {
		border-color: var(--view);
		color: var(--view-fg);
	}

	.gen {
		margin-top: 10px;
		padding: 11px;
		border: 1px solid var(--view-line);
		border-radius: 10px;
		background: var(--strip);
		display: flex;
		flex-direction: column;
		gap: 9px;
	}

	.gen-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.gen-cap {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--view-fg);
	}

	.gen-cap.view {
		color: var(--view-fg);
	}

	.spacer {
		flex: 1;
	}

	.tiny {
		height: 30px;
		padding: 0 11px;
		border-radius: 7px;
		font-size: 10px;
	}

	.gen-out {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 9px;
		border-top: 1px solid var(--line-soft);
	}

	.scope {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.scope-cap {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--muted-3);
	}

	.caution {
		font-size: 10px;
		line-height: 1.5;
		color: #a8813f;
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
