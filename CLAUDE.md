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

**The slot strip is the archive.** There is no archive screen and no `archive`
value in `View` — the strip shows this device's slots merged with its bucket,
or another machine's bucket when a profile is picked from the `▣ THIS DEVICE`
button beside it. `SHOW ALL` opens the same rows without the six-chip cap.

`app.rows` is the single row model behind the strip, the sheet and the detail.
Its fall-through is load-bearing: `viewer.active ? remote : link ? link.merged
: slots`, so **cloud configured but unreachable still yields every local slot**.
An offline launch paints the real list instead of an empty or spinning strip,
and a failed remote listing degrades to an inline note beside whatever is
already there. Never blank a populated rail — on a till an empty list reads as
data loss.

**Viewing another machine blocks the commit.** This reverses the earlier "a
screen, not a mode" decision, and the merge is what reversed it: with one list
on screen, a save made while browsing another till lands in a list nobody can
see, so refusing beats filing a count into thin air. `commitSave`,
`saveWithoutPhoto` and `quickSave` all return `blockSave()`, which names the
machine and how to leave. Counting, CLEAR and PHOTO are untouched — this is a
save block, not a read-only app. The SAVE button is greyed but **never
`disabled`**, and the save bar's lid is a transparent div rather than
`disabled` controls, because a silent tap is the wrong answer to a reasonable
thing to try.

A consequence worth knowing: `cloudCfg.defaultProfile` may name a remote, and
the first-run sheet offers exactly that, so **the app can launch into a state
where SAVE is dead**. `AskProfile` says so where the choice is made. The two
fields live on `CloudCfg`, not `Cfg`, so a device that never touched the cloud
keeps a byte-identical settings blob.

- **Remote data lives in `viewer.svelte.ts` and only there.** It never reaches
  `app.slots`, so `#prune()` — which runs on save/load against the *local*
  retention window — can never see it, and no persistence path can write it here.
- `src/lib/remote.ts` exports `list` and `get` and **nothing else**. That absence
  is the read-only enforcement; a `readOnly: true` flag would only invite a
  future branch to ignore it. What it cannot enforce: whoever holds a viewer
  profile holds a bucket credential and can use it with curl. The real control is
  the token's scope, and the real revocation is rotating it on the source machine.
- **Browsing a profile asks for no PIN, and there is only one PIN in the app.**
  There used to be two: the source machine published its own to
  `meta/lock.json` and `openRemote` checked it before listing. Both halves are
  gone, and the reasoning is worth keeping so it is not rebuilt. It protected
  nothing — whoever can reach that screen already holds the bucket's key and can
  read every object with curl, and the PIN sat *in the bucket that key opens*, so
  the check was a lock with its key taped to it. It cost something real — a
  plaintext PIN written into the user's bucket, and a read-only glance at another
  till's numbers made the most guarded action in the app. Adding or removing a
  profile is still gated, because handing out a bucket credential is the part
  worth guarding. A bucket written by an older build still holds `meta/lock.json`;
  it is inert and worth deleting from the console.
- `ec.cloud.key` is this device's read-write pair for its own bucket;
  `ec.remotes` holds read-only keys for other machines'. The viewer path never
  reads the former and the sync path never reads the latter.
- **A device cannot mint a read-only string from its own credentials.** It holds
  exactly one key — the read-write one it backs up with — so re-labelling that
  `viewer` would be a lie the receiving app cannot detect. `BUILD A STRING`
  (`encodeFor` in `cloudshare.ts`) wraps a key *you paste* around this device's
  endpoint, bucket, region and prefix. `kind` is a label for the receiving app,
  not a restriction; scope lives in the bucket policy and nothing here can check
  it.

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
- **Cloud settings are gated as a section, not per control.** `CloudCard` and
  `SettingsViewer` derive `locked = app.pinSet && !app.unlocked`; every mutating
  control routes through `edit()`, which hands the job to `app.guard` so one
  prompt both unlocks and runs the tap that triggered it. Gating each control
  separately made every button need pressing twice.
- Following from that: **never write `if (locked) return unlock();` in front of
  `app.guard(why, job)`.** `guard` already covers both states, and the extra
  branch hands the gate an *empty* job — so unlocking swallows the tap and the
  button needs pressing twice. This has been reintroduced once. `locked` is for
  rendering (`class:dim`, the LOCKED banner, `readonly` fields) and nothing else.
- The PIN card's copy must describe what `#allow()` actually guards. It is the
  only description of the policy anyone sees, so a shorter sentence that reads
  better but omits half the gated operations is a bug, not a style choice.
- PinGate takes **4–8 digits with an explicit OK**, and its dots are slots that
  grow past the minimum. A fixed four with auto-submit — which is what the design
  mocks up — would make an existing 5–8 digit PIN unenterable on a device that
  already has one.
- The credentials are the crown jewels, not the slots: they grant every photo in
  the bucket and repointing the endpoint silently redirects future backups. That
  is why reveal, edit, share and import are all gated while the keypad layout and
  camera choice are not.
- `cloudshare.ts` packs the whole cloud config into one `EC1.<base64url>.<sum>`
  token so the machine with Cloudflare access can hand it to the tablet in one
  paste. **It carries the secret key in clear** — deliberately not encrypted,
  because a shared passphrase would just be another secret to move, and base64
  dressed up as protection is worse than saying plainly that it is not. The
  checksum only exists so a truncated paste fails loudly instead of
  half-configuring a device.
- `loadCloudEngine()` exists separately from `startCloud()` because TEST
  CONNECTION has to work *before* the sync switch is on — otherwise the only way
  to check your keys is to commit to them first.
- `CloudCard`'s visible fields are seeded synchronously from `app.cloudCfg`, not
  from an `$effect`. An effect runs after mount, so anything calling
  `applyFields()` first wrote empty strings over a good endpoint and bucket.
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

**The template is truth; the `<script>` block is a mockup.** Markup, copy,
colours and state names in `<x-dc>` are authoritative. The script under it is a
localStorage-and-`setTimeout` fake of an app that predates IndexedDB, cloud sync
and the PIN — porting its logic would tear all three out. It writes slots to
`localStorage`, prunes without returning the `gone` ids that own photo blobs,
mints slot ids from `Date.now()`, fakes the connection probe with a timer, and
seeds mock buckets. Read it for *intent*, never copy it.

The corollary: **a design omission is not a deletion instruction.** The mockup
has no STORAGE card and no persistence claim because a mockup cannot have one.
Anything the design leaves out because it is not a real app, keep. Anything it
leaves out that weakens a guarantee — the narrower PIN gating, the fixed
four-digit entry — is a mockup artefact too; keep the guarantee and reword the
copy to match.

## Deployment

Cloudflare Pages, static assets only, Git-connected to `iNViTiON/cash-counter`
on `main`, live at `cash.invition.dev`.

- Build command: `bun install --frozen-lockfile && bun run build`
- Build output directory: `build`
- Framework preset: **None** (the SvelteKit preset assumes `adapter-cloudflare`)
- Env var: `BUN_VERSION` — Pages may not detect the text `bun.lock`, hence the
  explicit `bun install` in the build command

`static/_headers` sets the cache policy (immutable bundles and fonts,
never-cached shell/service worker). Both it and `static/_redirects` are plain
files copied into `build/`.

**`static/404.html` must exist.** Without it Cloudflare Pages assumes a SPA and
answers every unmatched path with `index.html` at status 200 — including a
hashed chunk that has not finished propagating during a deploy. `_headers` marks
`/_app/immutable/*` immutable for a year, so the edge then caches that HTML
under the JavaScript URL, `import()` gets HTML, and the app dies with
SvelteKit's opaque "500 Internal Error". This happened in production on two
separate chunks, and it recurs on every deploy because every deploy has that
window.

Emptying `_redirects` does **not** prevent it — the fallback is Pages' own
behaviour, not a redirect rule. That was tried and changed nothing. Only the
presence of `404.html` stops it. Deleting that file silently restores the
outage.

Recovering from a poisoned entry needs a Cloudflare **cache purge**; redeploying
does not clear it, because the asset URL and its cache key are unchanged.
