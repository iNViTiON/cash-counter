/**
 * Keeps an object URL alive exactly as long as the blob it points at is on
 * screen. The effect's teardown runs both before a re-run and on destroy, which
 * is the whole lifecycle — no caller has to remember to revoke.
 *
 * Must be called during component init so the effect has an owner. Revoking
 * after the `<img>` has loaded is safe: the image is already decoded, and the
 * teardown only fires when the blob changes or the component goes away.
 */
export function blobUrl(src: () => Blob | null): { readonly current: string | null } {
	let url = $state<string | null>(null);

	$effect(() => {
		const blob = src();
		if (!blob) {
			url = null;
			return;
		}
		const made = URL.createObjectURL(blob);
		url = made;
		return () => URL.revokeObjectURL(made);
	});

	return {
		get current() {
			return url;
		}
	};
}
