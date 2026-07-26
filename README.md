# cash-count — EuroCash

**Live: [cash.invition.dev](https://cash.invition.dev)** — installable, and works
with no connection once installed.

Euro cash counting for a till: type quantities per denomination, get a running
total, save the count into a dated slot with optional photo evidence. Everything
lives on the device — there is no backend and no network call at runtime.

Built from the `EuroCash.dc.html` Claude Design project.

## Stack

| Piece     | Choice                                                            |
| --------- | ----------------------------------------------------------------- |
| UI        | Svelte 5 (runes) + SvelteKit 2                                     |
| Rendering | Full CSR — `ssr = false`, one prerendered shell                    |
| Build     | Vite 8, `@sveltejs/adapter-static` → `build/`                      |
| Offline   | `@vite-pwa/sveltekit` (Workbox `generateSW`), everything precached |
| Runtime   | Bun only — no Node.js in the dev shell                             |
| Env       | Nix flake + direnv                                                 |
| Storage   | `localStorage`                                                     |
| Deploy    | Cloudflare Pages, static assets only                               |

## Getting started

The dev shell provides `bun`, `imagemagick` and `git`. Nothing is installed
globally.

```bash
direnv allow
```

`direnv allow` has to be run by you once — it is what loads the flake into the
shell. Without direnv, use `nix develop` instead.

```bash
bun install
bun run dev
```

| Command               | Does                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `bun run dev`         | Dev server on :5173                                                                             |
| `bun run check`       | `svelte-check` over the whole project                                                           |
| `bun run build`       | Static site into `build/`                                                                       |
| `bun run serve:build` | Serves `build/` on :4173 exactly as Pages does — use this to test the service worker and offline |
| `bun run icons`       | Regenerates the PWA icon set from `static/icons/*.svg`                                          |
| `bun run fonts`       | Re-downloads the self-hosted woff2 files                                                        |

## Deploy

`build/` is a plain directory of static files.

```bash
bunx wrangler pages deploy build
```

Or point a Pages project at the repo with build command `bun run build` and
output directory `build`. `static/_headers` sets the cache policy (immutable
bundles and fonts, never-cached shell and service worker) and `static/_redirects`
rewrites unknown paths onto the SPA shell.

## How it is put together

```
src/lib/format.ts          denominations, money/date formatting
src/lib/storage.ts         localStorage read/write, quota-safe
src/lib/state.svelte.ts    the whole app state as one runes class, exported as `app`
src/lib/components/        TopBar, DenomList, Keypad, SaveBar, TotalBar,
                           SlotStrip, SlotDetail, Camera, Settings, Toast
src/routes/+page.svelte    composition, keypad sizing, orientation handling
```

State is one class instance (`app`) with `$state` fields and `$derived` totals.
Its constructor only sets defaults, so it is safe during prerender; every browser
API is reached from `onMount` or an event handler.

Two editors share the same rows: **SYS** uses the device keyboard, **PAD** marks
the inputs read-only and drives them from the on-screen keypad, which is how the
soft keyboard stays down on a phone. "Select all when moving between rows" covers
both: the system keyboard selects the field's text, and on the keypad the first
key pressed after moving to a row types over the old number instead of appending. In landscape the keypad moves beside the
list and can be flipped to either side.

The slot dialog fills the whole counting area and gives the photo as much room as
it can get. Once the image reports its aspect ratio, the dialog compares the area
the photo would actually cover beside the counts against under them, and picks the
winner — tall photos land on the right, wide ones across the bottom. The count
grid is `auto-fill` at 240 px, so it reflows to fewer, wider columns when the
photo takes the side and more when it takes the bottom.

## Offline

Every feature works with no network at all — there is no runtime request to make.
The service worker precaches the shell, every bundle, the icons and all font
files — 38 entries, ~630 KB. Fonts are self-hosted in `static/fonts/` for that
reason; a Google Fonts `<link>` would leave the first offline load in a system
fallback.

Verified by building, serving with `bun run serve:build`, **stopping the server**
and then driving the whole app: counting, attaching a photo, saving a slot,
opening the slot dialog, loading counts back, toggling a denomination in settings
and using the quick slot — all after `fetch()` to the origin started throwing.

## Things worth knowing

- **Amount formatting** uses the `et-EE` locale (`12 345,67 €`), set once as
  `LOCALE` in `src/lib/format.ts`. The design's visible `EUR · ET-EE` badge and
  its "Estonian formatting" footnote are deliberately not implemented.
- **Saving hands the photo over.** The slot keeps the evidence and the workspace
  is left without it, so the next count cannot file the previous count's photo.
  The quantities stay on screen.
- **Photo evidence** is a downscaled (1280 px, JPEG q0.7) data URL kept in
  `localStorage` alongside the slot, as in the design. That is roughly 200–400 KB
  per photo against a 5 MB quota, so expect about a dozen photo slots before
  saving starts to fail — the app catches the quota error and says so rather than
  losing the count. Move slots to IndexedDB if that ceiling becomes a problem.
- **Retention**: slots older than the configured 7 or 31 days are pruned on the
  next save or load, not on a timer.
