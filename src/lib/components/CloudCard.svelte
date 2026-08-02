<script lang="ts">
	import { readKey, writeKey } from '$lib/cloudcfg';
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

	/** Non-secret fields, held locally so typing does not fire a write per keystroke. */
	let endpoint = $state('');
	let bucket = $state('');
	let region = $state('auto');
	let prefix = $state('');
	let loaded = $state(false);

	$effect(() => {
		if (loaded) return;
		endpoint = cfg.endpoint;
		bucket = cfg.bucket;
		region = cfg.region;
		prefix = cfg.prefix;
		loaded = true;
	});

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
		applyFields();
		busy = true;
		probeResult = 'Checking…';
		await app.enableCloud();
		probeResult = (await app.link?.probe()) ?? 'Cloud backup is not on';
		busy = false;
	}

	const pendingBytes = $derived(
		(link?.pending ?? []).reduce((n, s) => n + (s.photo?.bytes ?? 0) + 400, 0)
	);

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

	<div class="setting div-bottom">
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
			onclick={() => toggleOn()}
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

	<div class="fields">
		<label class="f"><span>Endpoint</span>
			<input class="field" type="url" bind:value={endpoint} onchange={applyFields}
				placeholder="https://<account-id>.r2.cloudflarestorage.com" /></label>
		<label class="f"><span>Bucket</span>
			<input class="field" type="text" bind:value={bucket} onchange={applyFields} placeholder="eurocash" /></label>
		<label class="f"><span>Region</span>
			<input class="field" type="text" bind:value={region} onchange={applyFields} placeholder="auto" /></label>
		<label class="f"><span>Folder prefix (optional)</span>
			<input class="field" type="text" bind:value={prefix} onchange={applyFields} placeholder="till-1/" /></label>
		<label class="f"><span>Access key ID</span>
			<input class="field" type="text" bind:value={accessKeyId} onchange={applyFields} /></label>
		<label class="f"><span>Secret access key</span>
			<span class="secret">
				<input class="field" type={showSecret ? 'text' : 'password'} bind:value={secretAccessKey}
					onchange={applyFields} />
				<button type="button" class="btn field-btn" onclick={() => (showSecret = !showSecret)}>
					{showSecret ? 'HIDE' : 'SHOW'}
				</button>
			</span></label>
	</div>

	<div class="setting div-top">
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

	<div class="setting">
		<div class="text">
			<div class="name">This device</div>
			<div class="hint">
				A viewer never uploads, never prunes and should hold a read-only token.
			</div>
		</div>
		<div class="seg">
			{#each ['writer', 'viewer'] as r (r)}
				<button type="button" class:on={cfg.role === r}
					onclick={() => { cfg.role = r as 'writer' | 'viewer'; app.persistCloud(); }}>
					{r.toUpperCase()}
				</button>
			{/each}
		</div>
	</div>

	<div class="danger-row">
		<button type="button" class="btn wide" onclick={() => test()}>TEST CONNECTION</button>
		<button type="button" class="btn wide" onclick={() => app.link?.backupNow()}>BACK UP NOW</button>
	</div>

	{#if link && link.pending.length}
		<div class="danger-row">
			<button type="button" class="btn wide" onclick={() => app.link?.backupAll()}>
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

<style>
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
