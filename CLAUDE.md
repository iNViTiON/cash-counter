# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Bun is the only JS runtime here — never npm, yarn, pnpm or node. Tooling comes
from the nix flake (`bun`, `imagemagick`, `git`); enter it with `direnv allow`
once, or `nix develop` per shell. Nix flakes only see git-tracked files, so
`git add` new files before expecting `nix develop` to pick them up.

## Commands

```bash
bun run dev          # dev server on :5173
bun run check        # svelte-check — the only automated gate in the repo
bun run build        # static site into build/
bun run serve:build  # serves build/ on :4173 the way Pages does (asset first, else SPA shell)
bun run icons        # regenerate PWA icons from static/icons/*.svg via ImageMagick
bun run fonts        # re-download the self-hosted woff2 files
```

There is **no test framework**. `bun run check` is the only static gate. Behaviour
is verified by driving the app in a browser and, for offline claims, by
`bun run build && bun run serve:build`, then **stopping the server** and
exercising features with the origin unreachable.

## Architecture

One route, full CSR. `src/routes/+layout.ts` sets `ssr = false` and
`prerender = true`, so the build emits a single static shell and everything
renders client-side.

**All app state is one object.** `src/lib/state.svelte.ts` exports a singleton
`app` — a class whose fields are `$state`/`$derived`. Components import `app`
directly; there are no stores and no prop drilling. Two rules follow from
prerendering:

- The constructor must not touch browser APIs — module init runs during the
  build. `hydrate()` (called from `onMount`) does all `localStorage` reading.
- DOM handles (`inputs`, `scroller`) live on `app` as `$state` so `bind:this`
  does not warn; element *dimensions* (`midW`, `midH`) are pushed onto `app` by
  the page, because overlays size themselves against that area.

**Layout is computed, not just CSS.** `measure()` in `src/routes/+page.svelte`
derives keypad row height and whether the pad keeps its header, and publishes
`midW`/`midH`. It is driven by `matchMedia`, a `ResizeObserver` on the middle
pane, `window.resize`, and one `requestAnimationFrame` after mount (the first
measurement lands before layout settles). The handler re-reads
`matchMedia(...).matches` on every trigger rather than trusting `change` events,
which some embedded browsers never deliver.

`SlotDetail.svelte` extends this: once the photo reports its aspect ratio it
compares the area the image would cover beside the counts versus under them and
picks the winner, so tall photos go right and wide ones go bottom. The count
grid is `auto-fill` at 240px and reflows to match.

**Persistence** is four `localStorage` keys (`src/lib/storage.ts`). Reads are
defensive and writes return `false` on quota failure, which surfaces as a toast
— storage never throws into the UI. Photos are downscaled JPEG data URLs stored
alongside the slot, so the practical ceiling is ~12 photo slots against the 5 MB
quota.

**Offline is a hard requirement**: every feature must work with no network.
Nothing may be fetched at runtime. Fonts are self-hosted in `static/fonts/` for
this reason — a Google Fonts `<link>` would break the first offline load. Any new
asset type must be added to `workbox.globPatterns` in `vite.config.ts` or it
will not be precached.

## Non-obvious constraints

- **No `svelte.config.js`.** SvelteKit ≥2.62 takes its config inline in
  `sveltekit({...})` inside `vite.config.ts` — adapter, `serviceWorker`, and
  compiler options all live there. A `svelte.config.js` added later would be
  ignored.
- `vite-plugin-pwa` emits `manifest.webmanifest` but does **not** inject
  `<link rel="manifest">` into a prerendered shell; it is declared by hand in
  `src/app.html`.
- Slot ids use `crypto.randomUUID()`, not a timestamp — duplicate keys in a
  keyed `{#each}` are a hard error in Svelte 5.
- Amount formatting is pinned to `et-EE` via `LOCALE` in `src/lib/format.ts`.
  The design's visible `EUR · ET-EE` badge and its formatting footnote are
  deliberately not implemented.
- Keypad mode marks the quantity inputs `readonly` and `setMode('pad')` blurs
  the active element — that pair is what keeps the mobile soft keyboard down.
  Losing it makes pad mode unusable on a phone.
- Row navigation: Enter/ArrowDown go forward, **Space**/ArrowUp go back.
- `app.freshRow` implements "select all": it is set when the cursor lands on a
  row (NEXT/PREV, tap, focus) and cleared by the first key, so that key types
  over the old number instead of appending. Backspace and CLR count as editing.
- Saving a slot moves the photo to the slot and clears it from the workspace;
  quantities stay.
- Retention pruning happens on save/load, not on a timer.

## Design source

The UI comes from a Claude Design project (`EuroCash.dc.html`, project
`852fb9df-ed2a-43fe-a8e3-220c1b04f393`), read through the `DesignSync` tool. When
the design changes, pull the file and diff it as a **line multiset** against the
previous copy — the file is one long generated document and a positional diff is
mostly noise. `<sc-if>` / `<sc-for>` / `hint-placeholder-*` are the design tool's
runtime, not app semantics; translate them to `{#if}` / `{#each}` and drop the
hints.

## Deployment

Cloudflare Pages, static assets only, Git-connected to `iNViTiON/cash-counter`
on `main`, live at `cash.invition.dev`.

- Build command: `bun install --frozen-lockfile && bun run build`
- Build output directory: `build`
- Framework preset: **None** (the SvelteKit preset assumes `adapter-cloudflare`)
- Env var: `BUN_VERSION` — Pages may not detect the text `bun.lock`, hence the
  explicit `bun install` in the build command

`static/_headers` sets the cache policy (immutable bundles and fonts,
never-cached shell/service worker) and `static/_redirects` rewrites unknown
paths onto the SPA shell. Both are plain files copied into `build/`.
