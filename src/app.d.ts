/// <reference types="vite-plugin-pwa/client" />

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Build id, injected by vite `define`. Seven-char commit SHA, or `dev`. */
	const __BUILD__: string;

	namespace App {
		interface Error {
			/** Real message and stack, kept by `hooks.client.ts` so the error page
			 *  can show them — on a till there is no console to look at. */
			detail?: string;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/**
	 * `ImageCapture` and the continuous-mode track constraints are not in
	 * lib.dom. Both are feature-detected at runtime — the in-app camera falls
	 * back to a canvas frame grab wherever they are missing.
	 */
	interface ImageCapture {
		takePhoto(): Promise<Blob>;
	}

	interface MediaTrackConstraintSet {
		focusMode?: ConstrainDOMString;
		exposureMode?: ConstrainDOMString;
		whiteBalanceMode?: ConstrainDOMString;
	}

	interface Window {
		ImageCapture?: new (track: MediaStreamTrack) => ImageCapture;
	}
}

export {};
