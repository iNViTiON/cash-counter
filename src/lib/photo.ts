/**
 * JPEG encoding for evidence photos, shared by the in-app camera, the system
 * camera and the file chooser so every path stores the same thing.
 */

/** Above this the data URL is re-encoded lower — localStorage is only 5 MB. */
const MAX_BYTES = 1.2e6;
const START_QUALITY = 0.88;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.1;

/**
 * Downscales to `maxEdge` on the longest side and returns a JPEG data URL,
 * stepping the quality down until the result fits the size ceiling.
 */
export function encodePhoto(
	source: CanvasImageSource,
	w: number,
	h: number,
	maxEdge: number
): string {
	const scale = Math.min(1, maxEdge / Math.max(w, h));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(w * scale);
	canvas.height = Math.round(h * scale);

	const cx = canvas.getContext('2d');
	if (cx) {
		cx.imageSmoothingEnabled = true;
		cx.imageSmoothingQuality = 'high';
		cx.drawImage(source, 0, 0, canvas.width, canvas.height);
	}

	let quality = START_QUALITY;
	let data = canvas.toDataURL('image/jpeg', quality);
	while (data.length > MAX_BYTES && quality > MIN_QUALITY) {
		quality -= QUALITY_STEP;
		data = canvas.toDataURL('image/jpeg', quality);
	}
	return data;
}
