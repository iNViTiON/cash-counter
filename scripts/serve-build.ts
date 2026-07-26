/**
 * Serves `build/` the way Cloudflare Pages does: static asset first, otherwise
 * rewrite onto the SPA shell. Use it to test the service worker and offline
 * behaviour against the real artifact — `vite preview` does not.
 */
const ROOT = 'build';
const PORT = Number(Bun.env.PORT ?? 4173);

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		let path = decodeURIComponent(url.pathname);
		if (path.endsWith('/')) path += 'index.html';

		const file = Bun.file(ROOT + path);
		if (await file.exists()) return new Response(file);
		return new Response(Bun.file(`${ROOT}/index.html`), {
			headers: { 'content-type': 'text/html' }
		});
	}
});

console.log(`serving ${ROOT} on http://localhost:${PORT}`);
