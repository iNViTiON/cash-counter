/// <reference types="vite-plugin-pwa/client" />

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
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
