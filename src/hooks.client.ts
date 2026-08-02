import type { HandleClientError } from '@sveltejs/kit';

/**
 * SvelteKit's default error page says "Internal Error" and nothing else, which
 * on a till with no devtools is indistinguishable from any other failure. This
 * keeps the real message and stack so `+error.svelte` can show them, because on
 * a tablet the screen is the only console there is.
 *
 * `message` is what SvelteKit renders by default; `detail` is ours.
 */
export const handleError: HandleClientError = ({ error, status, message }) => {
	const e = error as Error | undefined;
	const parts = [
		e?.name ? `${e.name}: ${e.message}` : String(error),
		e?.stack ? `\n${e.stack}` : ''
	];
	return {
		message: e?.message || message || 'Internal Error',
		detail: parts.join('').slice(0, 4000),
		status
	};
};
