<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { app } from '$lib/state.svelte';

	/** Long edge of the stored evidence photo — localStorage is only 5 MB. */
	const MAX_EDGE = 1280;
	const QUALITY = 0.7;

	let video = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	let gone = false;

	onMount(async () => {
		app.camErr = null;
		try {
			const s = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (gone) return s.getTracks().forEach((t) => t.stop());
			stream = s;
			if (video) {
				video.srcObject = s;
				video.play().catch(() => {});
			}
		} catch (e) {
			const name = e instanceof Error ? e.name : 'error';
			app.camErr = `Camera not available (${name}). Pick a file instead.`;
		}
	});

	onDestroy(() => {
		gone = true;
		stopCam();
	});

	function stopCam(): void {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	function close(): void {
		app.camErr = null;
		app.view = null;
	}

	function downscale(source: HTMLVideoElement | HTMLImageElement, w: number, h: number): string {
		const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(w * scale);
		canvas.height = Math.round(h * scale);
		canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/jpeg', QUALITY);
	}

	function shoot(): void {
		if (!video?.videoWidth) return app.say('No camera frame yet');
		const data = downscale(video, video.videoWidth, video.videoHeight);
		stopCam();
		app.view = null;
		app.setPhoto(data);
		app.say('Photo attached');
	}

	function pickFile(e: Event & { currentTarget: HTMLInputElement }): void {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const data = downscale(img, img.width, img.height);
				app.camErr = null;
				app.view = null;
				app.setPhoto(data);
				app.say('Photo attached');
			};
			img.src = String(reader.result);
		};
		reader.readAsDataURL(file);
	}
</script>

<div class="overlay">
	<div class="head">
		<div class="title">PHOTO EVIDENCE</div>
		<div class="spacer"></div>
		<button type="button" class="btn close" title="Close" onclick={close}>✕</button>
	</div>

	<div class="stage">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} playsinline muted autoplay></video>

		{#if app.camErr}
			<div class="err">
				<div class="msg">{app.camErr}</div>
				<label class="file">
					CHOOSE A FILE
					<input type="file" accept="image/*" onchange={pickFile} />
				</label>
			</div>
		{/if}
	</div>

	<div class="foot">
		<button type="button" class="shoot" onclick={shoot}>SHOOT</button>
	</div>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: #08080a;
		display: flex;
		flex-direction: column;
	}

	.head {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--line-soft);
	}

	.title {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--fg);
	}

	.spacer {
		flex: 1;
	}

	.close {
		width: 34px;
		height: 34px;
		font-size: 14px;
		font-weight: 400;
		letter-spacing: 0;
		padding: 0;
	}

	.stage {
		flex: 1;
		min-height: 0;
		position: relative;
		background: #000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.err {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 20px;
		text-align: center;
	}

	.msg {
		font-size: 12px;
		color: var(--danger);
		max-width: 320px;
		line-height: 1.5;
	}

	.file {
		height: 44px;
		padding: 0 18px;
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--chip);
		color: var(--fg-dim);
		cursor: pointer;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.file input {
		display: none;
	}

	.foot {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 14px;
	}

	.shoot {
		width: 74px;
		height: 74px;
		border-radius: 50%;
		border: 4px solid var(--acc);
		background: var(--bar);
		color: var(--acc);
		cursor: pointer;
		font-family: var(--sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
	}

	.shoot:hover {
		background: #1f2124;
	}
</style>
