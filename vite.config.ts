import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static-only output for Cloudflare Pages. The single route prerenders
			// to index.html; static/_redirects rewrites everything else onto it.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				precompress: false,
				strict: true
			}),

			// The service worker comes from vite-plugin-pwa, not from SvelteKit.
			serviceWorker: { register: false }
		}),

		SvelteKitPWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: {
				id: '/',
				name: 'EuroCash — cash counter',
				short_name: 'EuroCash',
				description: 'Offline euro cash counting with saved slots and photo evidence.',
				lang: 'en',
				theme_color: '#0F0F10',
				background_color: '#0F0F10',
				display: 'standalone',
				orientation: 'any',
				scope: '/',
				start_url: '/',
				categories: ['finance', 'productivity', 'utilities'],
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{
						src: '/icons/icon-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// Everything the app needs is precached — fonts included, or the
				// first offline load falls back to system typography.
				globPatterns: ['client/**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}'],
				navigateFallback: '/',
				// Without this a missing hashed asset is answered with the SPA shell,
				// because `static/_redirects` rewrites anything unmatched to
				// `/index.html` with a 200. The browser then parses HTML as
				// JavaScript and the app dies with an opaque syntax error rather
				// than a clean 404.
				navigateFallbackDenylist: [/^\/_app\//, /^\/fonts\//, /^\/icons\//],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				skipWaiting: true,
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			},
			kit: {
				assets: 'static',
				appDir: '_app',
				outDir: '.svelte-kit'
			},
			devOptions: {
				enabled: false,
				type: 'module',
				navigateFallback: '/'
			}
		})
	]
});
