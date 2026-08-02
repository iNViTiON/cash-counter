/**
 * JPEG encoding for evidence photos, shared by the in-app camera, the system
 * camera and the file chooser so every path stores the same thing.
 *
 * Output is a `Blob`, not a data URL. Base64 cost a third of the bytes for
 * nothing, and a Blob is what both IndexedDB and an S3 PUT actually want.
 */

/**
 * A sanity ceiling, not a quota device — IndexedDB is a share of the disk, not
 * 5 MB. The old 1.2e6-*character* base64 cap worked out to ~900 KB of image and
 * is exactly what made the LARGE/2400 px setting pointless, since a 2400 px
 * cash-drawer JPEG at q0.88 lands well above it and was getting clipped.
 */
const MAX_BYTES = 2e6;
const START_QUALITY = 0.88;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.1;

export interface EncodedPhoto {
	blob: Blob;
	w: number;
	h: number;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Downscales to `maxEdge` on the longest side and encodes JPEG, stepping the
 * quality down until the result fits the size ceiling. `toBlob` may encode off
 * the main thread, so this no longer blocks the way `toDataURL` did.
 */
export async function encodePhoto(
	source: CanvasImageSource,
	w: number,
	h: number,
	maxEdge: number
): Promise<EncodedPhoto> {
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
	let blob = await toBlob(canvas, quality);
	while (blob && blob.size > MAX_BYTES && quality > MIN_QUALITY) {
		quality -= QUALITY_STEP;
		blob = await toBlob(canvas, quality);
	}
	if (!blob) throw new Error('The browser refused to encode this image');
	return { blob, w: canvas.width, h: canvas.height };
}

/** Decodes a file that `createImageBitmap` will not take, via an object URL. */
async function viaImage(src: Blob, maxEdge: number): Promise<EncodedPhoto> {
	const url = URL.createObjectURL(src);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('Not a readable image'));
			el.src = url;
		});
		return await encodePhoto(img, img.naturalWidth, img.naturalHeight, maxEdge);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * The single entry point for every producer: camera still, system camera file,
 * chosen file. Replaces the old FileReader → data URL → `<img>` → canvas →
 * data URL chain, which encoded the same picture twice.
 */
export async function photoFromBlob(src: Blob, maxEdge: number): Promise<EncodedPhoto> {
	let bmp: ImageBitmap;
	try {
		// `<img>` always applies EXIF orientation but `createImageBitmap`'s
		// default has varied by engine — ask, so both paths agree.
		bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
	} catch {
		return viaImage(src, maxEdge);
	}
	try {
		// Already small enough and already JPEG: keep the original bytes rather
		// than spend quality on a re-encode that changes nothing.
		if (Math.max(bmp.width, bmp.height) <= maxEdge && src.size <= MAX_BYTES && src.type === 'image/jpeg')
			return { blob: src, w: bmp.width, h: bmp.height };
		return await encodePhoto(bmp, bmp.width, bmp.height, maxEdge);
	} finally {
		// Not closing this leaked ~48 MB of decoded pixels per shot until GC.
		bmp.close();
	}
}
