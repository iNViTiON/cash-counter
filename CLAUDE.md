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
  build. `hydrate()` (called from `onMount`) does all `localStorage` reading,
  and `src/lib/db.ts` must not open its IndexedDB connection at import time.
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

**Persistence is split by what has to be synchronous.** Settings (`ec.cfg`) and
the working count (`ec.ws`) stay in `localStorage` (`src/lib/storage.ts`),
because `measure()` reads `cfg.padSize` on the same tick as `hydrate()` and
because a count restored a frame late is a count the user can type over and
lose. Keeping `saveWorkspace()` synchronous is also what lets it run inside a
`visibilitychange` handler and stops the 260 ms debounce racing itself.

Slots, the quick slot and every photo live in **IndexedDB** — `src/lib/db.ts`
is generic glue, `src/lib/store.ts` is the record layer on top, the same split
as `storage.ts` / `state.svelte.ts`. Photos are `Blob`s in their own store,
keyed by the owning slot's id (the workspace photo under `'ws'`). This is not
the 5 MB `localStorage` pool: quota is a share of the disk, so the old ceiling
of three or four photo slots is gone.

`hydrate()` is synchronous and `load()` is not. `app.ready` guards the gap, and
it is **load-bearing, not cosmetic**: `#prune()` reads `app.slots`, so running
it before the read lands would write an empty array back over every saved slot.

`navigator.storage.persist()` is called unconditionally on every launch from
`load()`. Safari deletes script-created storage after seven days without user
interaction, and persistence is the documented exemption — for an app holding
photo evidence of counted cash, that call is the difference between a backup
and a rumour.

`src/lib/photo.ts` is the one encoder every path uses (in-app camera, system
camera, file chooser). `photoFromBlob` is the entry point: it fits the longest
edge to `cfg.photoMax`, steps quality down from 0.88 to fit ~2 MB, and passes
the original bytes straight through when they already fit. It asks for
`imageOrientation: 'from-image'` explicitly, because `<img>` always applies EXIF
and `createImageBitmap`'s default has varied by engine.

**Cloud backup is bring-your-own-bucket, with no server of ours.** The browser
signs SigV4 itself (`src/lib/sigv4.ts`) and talks to an S3-compatible bucket
directly. Presigned query params, not an `Authorization` header — the reason
that decides it is that only `host` gets signed, so the browser is free to add
`Origin`, `Referer` and `sec-fetch-*` without breaking the signature.
`bun run check:sigv4` diffs the signer against bun's native presigner and must
stay at 74/74.

Object layout, and the reasoning that is easy to undo by accident:

- `slots/<13-digit inverted ts>_<uuid>.json` and `photos/<uuid>.jpg`. Listings
  are ascending-only, so inverting the timestamp makes "newest N" a `max-keys`
  and "everything expired" one `start-after` range.
- **Keys carry nothing user-typed.** A key is immutable, so anything encoded
  there is frozen at write time.
- **Upload photo first, then JSON. Delete JSON first, then photo.** The JSON is
  the commit record either way: a crash must leave a collectable orphan, never a
  slot pointing at evidence that is gone.
- `s3List` returns every page or throws, never a partial. Orphan GC subtracts
  one listing from another, so a silently short listing there deletes live
  evidence. GC is additionally all-or-nothing and has a ratio fuse.
- The UI never deletes cloud objects; only the cloud retention window does. That
  is what makes this a backup rather than a mirror — but it is a **UI policy,
  not a token restriction**: the writer's token must have `DeleteObject` or
  retention cannot run.

`src/lib/cloud.svelte.ts` is loaded by dynamic import and only when credentials
exist, so an unconfigured device evaluates none of it — no fetch, no timer, no
listener. The upload queue is `$derived` from `Slot.syncedAt`, never stored, so
there is no outbox to keep in step and no way for one to hold a stale copy of a
photo. `CloudCfg.syncFrom` is stamped when sync is switched on so that pasting
credentials does not immediately push every existing slot over cellular.

**A background sync failure must never toast.** It fires right after `#commit`,
where it would paint over the "Saved · …" the user needs to see. Only a run the
user asked for passes `loud`. The failure still lands in `status`/`lastError`,
which the settings card renders.

**The cloud viewer is a screen, not a mode.** The archive gains a profile
picker; pointing it at another machine's bucket changes what that screen lists
and nothing else. The app keeps counting and saving normally — there is no
whole-app read-only state, no dimming and no viewer bar, because viewing another
till's records is not a reason to stop working.

- **Remote data lives in `viewer.svelte.ts` and only there.** It never reaches
  `app.slots`, so `#prune()` — which runs on save/load against the *local*
  retention window — can never see it, and no persistence path can write it here.
- `src/lib/remote.ts` exports `list` and `get` and **nothing else**. That absence
  is the read-only enforcement; a `readOnly: true` flag would only invite a
  future branch to ignore it. What it cannot enforce: whoever holds a viewer
  profile holds a bucket credential and can use it with curl. The real control is
  the token's scope, and the real revocation is rotating it on the source machine.
- **Two different PINs.** `app.lock.pin` is this device's. A source machine's PIN
  is read from its `meta/lock.json`, held in a local `const` for the length of
  `openRemote`, and discarded — never `$state`, never storage, never a profile.
  It gates the screen only, and the bucket's read key is a superset of it.
- Clearing a PIN writes `{"pin":""}` rather than deleting the object: deleting
  needs a scope the owner may not have, and it would collapse "no PIN set" and
  "this key cannot read meta/" into the same 404. Entry refuses on 403 and on
  network failure rather than failing open.
- `ec.cloud.key` is this device's read-write pair for its own bucket;
  `ec.remotes` holds read-only keys for other machines'. The viewer path never
  reads the former and the sync path never reads the latter.

**Offline is a hard requirement** for counting and saving: those must work with
no network, and sync is strictly additive on top. Sync never blocks a save. The
viewer is the one feature that genuinely cannot work offline — it must never
make an offline path *look* broken, but it is allowed to say it needs a
connection.
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
- The two photo file inputs live in `TotalBar.svelte` and are never wrapped in
  an `{#if}`. A file input only opens when `.click()` runs inside the tap that
  asked for it, so the whole chain from the PHOTO button — `openCamera` →
  `openSysCam`, plus `chooseCam` and `takePhoto` — is deliberately synchronous.
  One `await` in there and the system camera silently stops opening on iOS.
- The "allow skipping" toggle in settings needs two classes: `on` accents the
  track only while the requirement above it is on, `knob-on` moves the knob to
  whatever `allowSkip` actually is. The row is dimmed but never `disabled`,
  because tapping it while off is what produces the explaining toast.
- Keypad mode marks the quantity inputs `readonly` and `setMode('pad')` blurs
  the active element — that pair is what keeps the mobile soft keyboard down.
  Losing it makes pad mode unusable on a phone.
- Row navigation: Enter/ArrowDown go forward, **Space**/ArrowUp go back.
- `app.freshRow` implements "select all": it is set when the cursor lands on a
  row (NEXT/PREV, tap, focus) and cleared by the first key, so that key types
  over the old number instead of appending. Backspace and CLR count as editing.
- Saving a slot moves the photo to the slot and clears it from the workspace;
  quantities stay.
- Retention pruning happens on save/load, not on a timer. `#prune()` returns
  `{ kept, gone }` and the `gone` ids own photo blobs — dropping a slot without
  its photo refills the quota silently.
- **Never `await` between opening an IndexedDB transaction and issuing its
  requests.** The transaction goes inactive at the end of the creating task;
  Safari enforces it and the error is an opaque `TransactionInactiveError`.
- **Every value handed to IndexedDB must be `$state.snapshot()`ed first.**
  Structured clone throws `DataCloneError` on a Svelte proxy. `JSON.stringify`
  read through proxies happily, so the old code never had to think about it.
- IDB writes resolve on `tx.oncomplete`, never `req.onsuccess` — a quota failure
  arrives on the transaction abort, so resolving early reports success for a
  write that then rolled back.
- Shared CSS lives in `src/app.css`. `.head`, `.wide`, `.name` and the `.seg`
  sizing are scoped (`.card .head`, `.setting .name`) because Camera, Keypad,
  SlotDetail, SlotStrip, TotalBar and TopBar already own those names.
- **The PIN gate is `app.gate`, not an `app.view` value.** `view` is a single
  scalar, so `view = 'pin'` would unmount the Settings screen being gated and
  collapse `padOpen`. The sheet uses the global `.scrim` (z70) over Settings'
  `.screen` (z60); neither `.app` nor `.mid` makes a stacking context, so it
  composes. Keypad stays mounted behind it and the scrim eats the taps — which
  is why PinGate's key grid is `.pin-grid`, not `.grid`.
- Gating lives in state methods, not call sites: the public method is the guard
  and a private one does the work, the same shape as `commitSave()` → `#commit()`.
  `#closeGate()` is the only exit — a surviving `#pending` would make the *next*
  unlock run an action nobody asked for. Any success toast belongs **inside** the
  job, since a gated method returns before the user has typed anything.
- Unlock is a sliding five-minute window, and `#allow()` compares `Date.now()`
  rather than trusting the timer: a backgrounded PWA can freeze timers and fire
  them late, which would otherwise extend the window past its real expiry.
- The PIN is plaintext in `ec.lock` by decision — a mis-tap guard, not security.
  Setup says so in as many words; do not quietly "upgrade" it to a hash and
  imply protection it does not provide.

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
