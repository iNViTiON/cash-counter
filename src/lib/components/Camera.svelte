<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { encodePhoto } from '$lib/photo';
	import { app } from '$lib/state.svelte';

	/**
	 * Asked for in this order — the first the device grants wins. Phones hand
	 * back a soft 480p stream if nothing is requested, which is what made the
	 * in-app shots look worse than the ones from the camera app.
	 */
	const TRIES: MediaTrackConstraints[] = [
		{ facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
		{ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
		{ facingMode: { ideal: 'environment' } }
	];

	/** How long to wait between checks for the stream reporting its size. */
	const RES_POLL_MS = 150;

	let video = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	let gone = false;

	onMount(async () => {
		app.camErr = null;
		app.camRes = '';

		for (let i = 0; i < TRIES.length; i++) {
			try {
				const s = await navigator.mediaDevices.getUserMedia({ video: TRIES[i], audio: false });
				if (gone) return s.getTracks().forEach((t) => t.stop());
				stream = s;
				// Show the preview first: tuning is independent of it, and on some
				// devices `applyConstraints` takes long enough to be noticed.
				attach(s);
				await tune(s);
				return;
			} catch (e) {
				if (i < TRIES.length - 1) continue;
				const name = e instanceof Error ? e.name : 'error';
				app.camErr = `Camera not available (${name}). Use the system camera or pick a file.`;
			}
		}
	});

	onDestroy(() => {
		gone = true;
		stopCam();
	});

	/** Continuous focus, exposure and white balance where the device offers them. */
	async function tune(s: MediaStream): Promise<void> {
		const track = s.getVideoTracks()[0];
		if (!track) return;
		try {
			await track.applyConstraints({
				advanced: [
					{ focusMode: 'continuous' },
					{ exposureMode: 'continuous' },
					{ whiteBalanceMode: 'continuous' }
				]
			});
		} catch {
			/* unsupported on this device — the untuned stream is still usable */
		}
	}

	function attach(s: MediaStream): void {
		if (!video) return;
		video.srcObject = s;
		video.play().catch(() => {});
		showRes();
	}

	/** The track only reports its real size once frames start arriving. */
	function showRes(): void {
		if (gone) return;
		if (video?.videoWidth) app.camRes = `${video.videoWidth}×${video.videoHeight}`;
		else setTimeout(showRes, RES_POLL_MS);
	}

	function stopCam(): void {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	function close(): void {
		stopCam();
		app.camErr = null;
		app.camRes = '';
		app.view = null;
	}

	async function shoot(): Promise<void> {
		if (!video?.videoWidth) return app.say('No camera frame yet');

		// A real still off the track is far sharper than a preview frame, so try
		// that first and keep the frame grab for devices without ImageCapture.
		const track = stream?.getVideoTracks()[0];
		if (track && window.ImageCapture) {
			try {
				const blob = await new window.ImageCapture(track).takePhoto();
				const bmp = await createImageBitmap(blob);
				const still = encodePhoto(bmp, bmp.width, bmp.height, app.photoMax);
				stopCam();
				app.attachPhoto(still);
				return;
			} catch {
				/* the track will not take a still — fall through to the frame grab */
			}
		}

		const data = encodePhoto(video, video.videoWidth, video.videoHeight, app.photoMax);
		stopCam();
		app.attachPhoto(data);
	}

	/** Both hand off to an input that outlives this overlay, so the stream goes first. */
	function useSysCam(): void {
		close();
		app.openSysCam();
	}

	function useFile(): void {
		close();
		app.pickAnyFile();
	}
</script>

<div class="overlay">
	<div class="head">
		<div class="title">PHOTO EVIDENCE</div>
		<div class="res">{app.camRes}</div>
		<div class="spacer"></div>
		<button type="button" class="btn close" title="Close" onclick={close}>✕</button>
	</div>

	<div class="stage">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} playsinline muted autoplay></video>

		{#if app.camErr}
			<div class="err">
				<div class="msg">{app.camErr}</div>
				<button type="button" class="btn file" onclick={useFile}>CHOOSE A FILE</button>
			</div>
		{/if}
	</div>

	<div class="foot">
		<button type="button" class="btn hand" onclick={useSysCam}>SYSTEM<br />CAMERA</button>
		<button type="button" class="shoot" onclick={shoot}>SHOOT</button>
		<button type="button" class="btn hand" onclick={useFile}>CHOOSE<br />FILE</button>
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

	.res {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--muted-3);
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
		border-radius: 9px;
		font-size: 11px;
	}

	.foot {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding: 14px;
	}

	.hand {
		flex: 0 0 auto;
		height: 44px;
		padding: 0 14px;
		border-radius: 9px;
		font-size: 10px;
		line-height: 1.3;
		text-align: center;
	}

	.shoot {
		flex: 0 0 auto;
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
