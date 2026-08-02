<script lang="ts">
	import { app } from '$lib/state.svelte';

	let open = $state(false);
	let name = $state('');
	let endpoint = $state('');
	let bucket = $state('');
	let region = $state('auto');
	let prefix = $state('');
	let accessKeyId = $state('');
	let secretAccessKey = $state('');
	let showSecret = $state(false);

	/** Revealing the key is gated; hiding it again is not. */
	function toggleSecret(): void {
		if (showSecret) {
			showSecret = false;
			return;
		}
		app.revealSecret('Show this profile’s secret access key', () => (showSecret = true));
	}

	const complete = $derived(
		Boolean(name.trim() && endpoint.trim() && bucket.trim() && accessKeyId && secretAccessKey)
	);

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

	<button type="button" class="disclose" onclick={() => (open = !open)}>
		{open ? '▾' : '▸'} ADD A PROFILE
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

<style>
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
