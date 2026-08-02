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
| Storage   | IndexedDB (slots, photos) + `localStorage` (settings, working count) |
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
src/lib/format.ts          denominations, money/date/size formatting
src/lib/storage.ts         localStorage read/write, quota-safe (settings + working count)
src/lib/db.ts              IndexedDB glue: lazy connection, promise wrappers
src/lib/store.ts           slots, photos and the quick slot on top of db.ts
src/lib/migrate.ts         one-time move of the old localStorage records into IndexedDB
src/lib/photo.ts           the one JPEG encoder every capture path uses
src/lib/bloburl.svelte.ts  object URL that revokes itself when the blob goes away
src/lib/sigv4.ts           AWS SigV4 presigner on WebCrypto (see `bun run check:sigv4`)
src/lib/s3.ts              PUT/GET/HEAD/DELETE/ListObjectsV2 over presigned URLs
src/lib/cloudcfg.ts        cloud settings, credentials, and the object-key layout
src/lib/cloud.svelte.ts    backup engine — upload queue, retention, orphan GC
src/lib/remote.ts          read-only access to another machine's bucket
src/lib/viewer.svelte.ts   cloud profiles and the remote listing behind the strip
src/lib/cloudshare.ts      EC1 config strings — share, build around a key, import
src/lib/state.svelte.ts    the whole app state as one runes class, exported as `app`
src/lib/components/        TopBar, DenomList, Keypad, SaveBar, TotalBar,
                           SlotStrip, AllSlots, SlotDetail, Camera, Settings,
                           PinGate, AskProfile, Toast
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
- **Photo evidence** is a downscaled JPEG `Blob` (longest edge 1280/1800/2400 by
  setting, quality stepped down from 0.88 to fit ~2 MB) kept in IndexedDB, keyed
  by the slot that owns it. Quota is a share of the disk rather than the 5 MB
  `localStorage` pool, so hundreds of photo slots fit where three or four used
  to. A genuine quota error still surfaces as a toast rather than losing a count.
- **Storage protection.** The app calls `navigator.storage.persist()` on every
  launch. Safari otherwise deletes script-created storage after seven days
  without user interaction, which for photo evidence is silent data loss. If the
  browser declines, Settings shows the current usage and a PROTECT STORAGE
  button; adding the app to the home screen is what usually flips it.
- **Retention**: slots older than the configured 7 or 31 days are pruned on the
  next save or load, not on a timer.
- **Cloud backup is optional and bring-your-own.** There is no server: the
  browser signs SigV4 itself and talks to a bucket you own (Cloudflare R2 by
  default, but any S3-compatible endpoint works). With nothing configured the app
  loads no cloud code at all. Settings carries a five-step setup guide and
  generates the CORS policy you need to paste on your bucket.
  - Deleting a slot here removes the **local** copy only. Cloud objects go when
    the separate cloud retention window passes, which is what makes this a backup
    rather than a mirror. That window only runs while a writer device has the app
    open — an R2 bucket lifecycle rule is the belt-and-braces version.
  - Credentials are stored on the device in plain text. **Scope the token to
    Object Read & Write on a single bucket**, never account-wide: anything that
    can read this browser's storage can read them, and no browser storage
    prevents that.
- **The slot strip is the archive.** It shows what is on the device and what is
  in the bucket in one list — `▣` for here, `☁` for the cloud, both when a slot
  is in both places. SHOW ALL opens the full list. With cloud backup on and a
  shorter local window than cloud window, a count keeps showing after the device
  has dropped it.
- **Cloud profiles** point the strip at another machine's bucket, read-only. Give
  them an **Object Read only** token. Handing someone a profile hands them that
  bucket's data until you rotate the token — the PIN check gates this app's
  screen, not the bucket. While a profile is open **SAVE is off**, because a
  count saved there would file into a list you are not looking at; counting,
  CLEAR and PHOTO carry on, and switching back to THIS DEVICE restores saving.
  Settings chooses which profile the app opens on.
  - A device only holds its own read-write key, so it cannot make a read-only
    string out of it. **BUILD A STRING** wraps a key you made in the bucket
    console around this device's endpoint and bucket. The scope is whatever you
    gave that key; the string only carries a label.
- **Admin PIN** sits in front of everything that loses data or hands out access:
  deleting slots, clearing the quick slot, shortening retention, changing the
  photo requirement, and every cloud credential. Choosing and switching profiles
  stay open — they only change what is read. It is stored in plain text and is a
  guard against a wrong tap, not a security control; the setup screen says so.
