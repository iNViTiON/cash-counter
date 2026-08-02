import { available } from './db';
import { CENTS, dmy, money } from './format';
import { migrate } from './migrate';
import { photoFromBlob } from './photo';
import {
	claimPersistence,
	dropAll,
	dropSlots,
	loadAll,
	saveQuick,
	saveSlot,
	saveWsPhoto,
	sweepOrphans,
	usage
} from './store';
import { K, read, remove, write } from './storage';
import type { EncodedPhoto } from './photo';
import type {
	Cam,
	Cfg,
	Gate,
	GateKind,
	GateStep,
	Lock,
	MaxAge,
	Mode,
	PadKey,
	PadSide,
	PadSize,
	PhotoMax,
	PhotoMeta,
	Qty,
	Quick,
	SaveDay,
	Slot,
	StorageInfo,
	View,
	Workspace
} from './types';

export const DEFAULT_LABELS = ['Open shift', 'Close shift', 'Adjust cash'];

export const DEFAULT_CFG: Cfg = {
	selectAll: true,
	autoSave: true,
	maxAge: 31,
	padSize: 50,
	labels: DEFAULT_LABELS,
	mode: 'pad',
	padSide: 'right',
	enabled: {},
	cam: 'system',
	camChosen: false,
	photoMax: 1800,
	needPhoto: false,
	allowSkip: true
};

export const PHOTO_SIZES: PhotoMax[] = [1280, 1800, 2400];

const DAY_MS = 864e5;
const WS_DEBOUNCE_MS = 260;
const TOAST_MS = 2200;
/** How long one unlock lasts. Slides forward on every gated action. */
const UNLOCK_MS = 3e5;
export const PIN_MIN = 4;
export const PIN_MAX = 8;
/** Wrong tries before the sheet offers the only real recovery path. */
const PIN_HINT_AFTER = 3;

const freshCfg = (): Cfg => ({ ...DEFAULT_CFG, labels: [...DEFAULT_LABELS], enabled: {} });

/**
 * The whole app. One instance, created at module load — the constructor only
 * sets defaults so it is safe during prerender; anything touching the browser
 * happens in `hydrate()`, called from the page's `onMount`.
 */
class CashCounter {
	/* ---------- persisted ---------- */
	qty = $state<Qty>({});
	/** Workspace photo *metadata*, in localStorage. The bytes are `photoBlob`. */
	photo = $state<PhotoMeta | null>(null);
	cfg = $state<Cfg>(freshCfg());
	slots = $state<Slot[]>([]);
	quick = $state<Quick | null>(null);

	/* ---------- session ---------- */
	/** Workspace photo bytes, read back from IndexedDB by `load()`. */
	photoBlob = $state<Blob | null>(null);
	/**
	 * False until the IndexedDB read lands. Load-bearing, not cosmetic: `#prune()`
	 * reads `slots`, and running it against the empty pre-load array would write
	 * that emptiness straight back over every saved slot.
	 */
	ready = $state(false);
	/** An async write is in flight — a second SAVE tap would file the count twice. */
	saving = $state(false);
	/** Null means the API is missing or would not say. */
	persisted = $state<boolean | null>(null);
	usage = $state<StorageInfo | null>(null);
	/** Set when this browser refuses IndexedDB outright; counting still works. */
	storageErr = $state<string | null>(null);

	/* ---------- lock ---------- */
	lock = $state<Lock>({ pin: '' });
	/** Session only, so a reload always re-locks. */
	gate = $state<Gate | null>(null);
	pinEntry = $state('');
	pinErr = $state('');
	/** Epoch ms the unlock window closes. Zero means locked. */
	unlockedUntil = $state(0);
	pinTries = $state(0);

	/** The job the gate is holding. Not `$state`: a closure in a deep proxy is a trap. */
	#pending: (() => void | Promise<void>) | null = null;
	/** First entry of a new PIN, held while the second is typed. */
	#draft = '';
	#lockTimer: ReturnType<typeof setTimeout> | undefined;

	mode = $state<Mode>('pad');
	padSide = $state<PadSide>('right');
	landscape = $state(false);
	/** Size of the area overlays fill, kept current by the page's `measure()`. */
	midW = $state(0);
	midH = $state(0);
	padRow = $state(62);
	padHdr = $state(true);
	active = $state(0);

	view = $state<View>(null);
	openId = $state<string | null>(null);
	saveLabel = $state<string>(DEFAULT_LABELS[0]);
	saveDay = $state<SaveDay>('today');
	newLabel = $state('');
	camErr = $state<string | null>(null);
	/** Live stream size, e.g. `1920×1080`, shown in the camera header. */
	camRes = $state('');
	toast = $state('');

	/** DOM handles, filled in by `bind:this`. */
	inputs = $state<(HTMLInputElement | null)[]>([]);
	scroller = $state<HTMLElement | null>(null);
	/**
	 * The two file inputs, always mounted in the total bar. A file input only
	 * opens when `.click()` runs inside the tap that asked for it, so they can
	 * never be created on demand.
	 */
	sysCamInput = $state<HTMLInputElement | null>(null);
	fileInput = $state<HTMLInputElement | null>(null);

	/** True until the first key is pressed on the row the cursor moved to. */
	freshRow = true;

	#toastTimer: ReturnType<typeof setTimeout> | undefined;
	#wsTimer: ReturnType<typeof setTimeout> | undefined;

	/* ---------- derived ---------- */

	/** Denominations that count towards the total. */
	live = $derived(CENTS.filter((c) => this.cfg.enabled[c] !== false));
	totalCents = $derived(
		this.live.reduce((t, c) => t + c * (parseInt(this.qty[c], 10) || 0), 0)
	);
	pieceCount = $derived(
		this.live.reduce((n, c) => n + (parseInt(this.qty[c], 10) || 0), 0)
	);
	/** The keypad replaces the system keyboard, so it hides behind any overlay. */
	padOpen = $derived(this.mode === 'pad' && this.view === null);
	openSlot = $derived(this.slots.find((s) => s.id === this.openId) ?? null);
	/** The denomination the keypad is currently typing into. */
	activeCents = $derived(this.live[Math.min(this.active, this.live.length - 1)]);
	/** Date the count is filed under, which is not necessarily today. */
	filedOn = $derived(dmy(this.#dayDate(this.saveDay)));
	/** Stored photo size, clamped to the three offered values. */
	photoMax = $derived<PhotoMax>(
		PHOTO_SIZES.includes(this.cfg.photoMax) ? this.cfg.photoMax : 1800
	);
	pinSet = $derived(this.lock.pin.length > 0);
	/** For the badge only — `#allow()` re-reads the wall clock regardless. */
	unlocked = $derived(this.unlockedUntil > 0);

	#dayDate(day: SaveDay): Date {
		const d = new Date();
		if (day === 'yesterday') d.setDate(d.getDate() - 1);
		return d;
	}

	/* ---------- lifecycle ---------- */

	/**
	 * Settings and the working count. Stays synchronous because `measure()` reads
	 * `cfg.padSize` on the same tick, and because a count restored a frame late
	 * would be a count the user could type over and lose.
	 */
	hydrate(): void {
		const stored = read<Partial<Cfg> | null>(K.cfg, null);
		const ws = read<Workspace | null>(K.ws, null);

		const cfg = Object.assign(freshCfg(), stored ?? {});
		if (!Array.isArray(cfg.labels) || !cfg.labels.length) cfg.labels = [...DEFAULT_LABELS];
		if (!cfg.enabled || typeof cfg.enabled !== 'object') cfg.enabled = {};

		this.cfg = cfg;
		this.mode = cfg.mode ?? 'pad';
		this.padSide = cfg.padSide ?? 'right';
		this.qty = cfg.autoSave && ws?.qty ? ws.qty : {};
		this.photo = (cfg.autoSave && ws?.photo) || null;
		this.saveLabel = cfg.labels[0];

		// Digits only and clamped: a hand-edited key must not leave a PIN the pad
		// cannot type, which would lock the user out of their own slots.
		const lock = read<Partial<Lock> | null>(K.lock, null);
		this.lock = { pin: String(lock?.pin ?? '').replace(/\D/g, '').slice(0, PIN_MAX) };
	}

	/**
	 * Everything in IndexedDB. Never awaited by the page — the count and the
	 * settings are already on screen; slots and evidence arrive a frame or two
	 * later, which is what `ready` guards.
	 */
	async load(): Promise<void> {
		if (!available()) {
			this.storageErr = 'This browser is blocking local storage — photos cannot be saved';
			this.ready = true;
			return;
		}
		try {
			await migrate();
			const { slots, quick, wsPhoto } = await loadAll();
			this.slots = slots;
			this.quick = quick;
			this.photoBlob = wsPhoto;
			// Metadata says there is a photo but the bytes are gone: heal, don't lie.
			if (this.photo && !wsPhoto) {
				this.photo = null;
				this.saveWorkspace();
			}
			void sweepOrphans(slots.map((s) => s.id));
		} catch {
			this.storageErr = 'This browser is blocking local storage — photos cannot be saved';
		} finally {
			this.ready = true;
		}
		void this.refreshStorage();
	}

	/** Claims persistence and reads the quota. Never blocks anything. */
	async refreshStorage(): Promise<void> {
		this.persisted = await claimPersistence();
		this.usage = await usage();
	}

	dispose(): void {
		// Flush rather than drop: the timer holds the only copy of the last digits.
		clearTimeout(this.#wsTimer);
		this.saveWorkspace();
		clearTimeout(this.#toastTimer);
		clearTimeout(this.#lockTimer);
		this.unlockedUntil = 0;
	}

	/* ---------- persistence ---------- */

	/**
	 * localStorage, which now holds only settings and the working count. Both are
	 * a few hundred bytes, so a failure here means something else on this origin
	 * has eaten the 5 MB — telling the user to delete a photo would be useless
	 * advice, since photos are not in this pool any more.
	 */
	#write(key: string, value: unknown): boolean {
		if (write(key, value)) return true;
		this.say('Could not save settings on this device');
		return false;
	}

	/**
	 * Every IndexedDB mutation goes through here, so a refused write is announced
	 * rather than swallowed. Nothing assigns to `$state` until this returns true —
	 * memory must never lead storage.
	 */
	async #save(run: () => Promise<void>): Promise<boolean> {
		try {
			await run();
			return true;
		} catch (e) {
			const full = e instanceof DOMException && e.name === 'QuotaExceededError';
			// With a share of the disk rather than 5 MB, "remove a photo" is no
			// longer useful advice: a real quota error means the device is full.
			this.say(full ? 'Device storage is full — free up space' : 'Could not save to this device');
			return false;
		}
	}

	persistCfg(): void {
		this.#write(K.cfg, $state.snapshot(this.cfg));
	}

	/** Writes the working count so it survives a reload. No-op when auto-save is off. */
	saveWorkspace(): void {
		if (!this.cfg.autoSave) return;
		this.#write(K.ws, { qty: $state.snapshot(this.qty), photo: $state.snapshot(this.photo) });
	}

	#queueWorkspace(): void {
		clearTimeout(this.#wsTimer);
		this.#wsTimer = setTimeout(() => this.saveWorkspace(), WS_DEBOUNCE_MS);
	}

	say(text: string): void {
		clearTimeout(this.#toastTimer);
		this.toast = text;
		this.#toastTimer = setTimeout(() => (this.toast = ''), TOAST_MS);
	}

	/**
	 * Splits the slots by the retention window, applied on the next save or load.
	 * `gone` matters as much as `kept`: those ids own photo blobs, and leaving
	 * them behind would quietly refill the quota this migration just enlarged.
	 */
	#prune(): { kept: Slot[]; gone: string[] } {
		const cut = Date.now() - this.cfg.maxAge * DAY_MS;
		const all = $state.snapshot(this.slots);
		return {
			kept: all.filter((s) => s.ts >= cut),
			gone: all.filter((s) => s.ts < cut).map((s) => s.id)
		};
	}

	/** Guards every path that prunes or writes slots against the pre-load window. */
	#notReady(): boolean {
		if (this.ready) return false;
		this.say('Still loading…');
		return true;
	}

	/* ---------- lock ---------- */

	persistLock(): void {
		this.#write(K.lock, $state.snapshot(this.lock));
	}

	/**
	 * Runs `job` now when no PIN is set or the window is open; otherwise raises
	 * the sheet and holds it. Same shape as `commitSave()` → `#commit()`: the
	 * public method checks a policy and opens an overlay, the private one works.
	 *
	 * `job` may be async, and any success toast belongs *inside* it — a gated
	 * method returns long before the user has finished typing.
	 */
	#allow(why: string, job: () => void | Promise<void>): void {
		if (!this.pinSet) {
			void job();
			return;
		}
		if (Date.now() < this.unlockedUntil) {
			this.#extend();
			void job();
			return;
		}
		this.#pending = job;
		this.#draft = '';
		this.pinEntry = '';
		this.pinErr = '';
		this.pinTries = 0;
		this.gate = { kind: 'unlock', why, step: 'verify' };
	}

	/**
	 * The single exit from the sheet — cancel, success and abandonment all come
	 * through here. A surviving `#pending` would make the *next* unlock run an
	 * action the user never asked for, so nothing may null `gate` directly.
	 */
	#closeGate(): void {
		this.gate = null;
		this.#pending = null;
		this.#draft = '';
		this.pinEntry = '';
		this.pinErr = '';
		this.pinTries = 0;
	}

	/**
	 * Opens the window and reschedules the close. The timer only keeps the badge
	 * honest; a backgrounded PWA can have its timers frozen and fire them late,
	 * which is why `#allow()` compares the wall clock instead of trusting this.
	 */
	#extend(): void {
		this.unlockedUntil = Date.now() + UNLOCK_MS;
		clearTimeout(this.#lockTimer);
		this.#lockTimer = setTimeout(() => (this.unlockedUntil = 0), UNLOCK_MS);
	}

	lockNow(): void {
		this.unlockedUntil = 0;
		clearTimeout(this.#lockTimer);
		this.say('Locked');
	}

	#openGate(kind: GateKind, why: string, step: GateStep): void {
		this.#closeGate();
		this.gate = { kind, why, step };
	}

	/** The switch reflects `pinSet`, so cancelling leaves it correctly un-flipped. */
	togglePin(): void {
		if (!this.pinSet) return this.#openGate('set', 'Set an admin PIN', 'new');
		this.#openGate('clear', 'Remove the admin PIN', 'verify');
	}

	changePin(): void {
		if (!this.pinSet) return this.say('No PIN set yet');
		this.#openGate('change', 'Change the admin PIN', 'verify');
	}

	pinKey(d: string): void {
		if (this.pinEntry.length >= PIN_MAX) return;
		this.pinEntry += d;
		this.pinErr = '';
	}

	pinDel(): void {
		this.pinEntry = this.pinEntry.slice(0, -1);
		this.pinErr = '';
	}

	pinCancel(): void {
		this.#closeGate();
	}

	pinSubmit(): void {
		const g = this.gate;
		if (!g) return;
		const entry = this.pinEntry;

		if (g.step === 'verify') {
			if (entry !== this.lock.pin) {
				this.pinEntry = '';
				this.pinTries += 1;
				this.pinErr = 'Wrong PIN';
				return;
			}
			if (g.kind === 'unlock') {
				const job = this.#pending;
				this.#extend();
				this.#closeGate();
				void job?.();
				return;
			}
			if (g.kind === 'clear') {
				this.lock = { pin: '' };
				this.persistLock();
				this.unlockedUntil = 0;
				this.#closeGate();
				this.say('PIN removed');
				return;
			}
			// change: verified the old one, now take the new one
			this.pinEntry = '';
			this.gate = { ...g, step: 'new' };
			return;
		}

		if (g.step === 'new') {
			if (entry.length < PIN_MIN) {
				this.pinErr = `At least ${PIN_MIN} digits`;
				return;
			}
			this.#draft = entry;
			this.pinEntry = '';
			this.gate = { ...g, step: 'confirm' };
			return;
		}

		if (entry !== this.#draft) {
			this.#draft = '';
			this.pinEntry = '';
			this.pinErr = 'Those did not match';
			this.gate = { ...g, step: 'new' };
			return;
		}
		this.lock = { pin: entry };
		this.persistLock();
		this.#extend();
		this.#closeGate();
		this.say('PIN set');
	}

	/** True once the sheet should stop pretending a retry is the way out. */
	pinStuck = $derived(this.pinTries >= PIN_HINT_AFTER);

	/* ---------- counting ---------- */

	setQty(cents: number, raw: string): void {
		const v = String(raw)
			.replace(/[^0-9]/g, '')
			.replace(/^0+(?=\d)/, '')
			.slice(0, 6);
		if (v === '') delete this.qty[cents];
		else this.qty[cents] = v;
		this.#queueWorkspace();
	}

	clearAll(): void {
		this.qty = {};
		this.saveWorkspace();
	}

	/**
	 * Marks a row as just-landed-on. With "select all" on, the next digit
	 * replaces what is there instead of appending to it — the keypad's
	 * equivalent of the system keyboard selecting the field's text.
	 */
	setActive(i: number): void {
		this.active = i;
		this.freshRow = true;
	}

	/** Moves the cursor, clamped to the visible denominations. */
	focusIdx(i: number, select = true): void {
		const last = this.live.length - 1;
		const next = Math.min(Math.max(i, 0), last < 0 ? 0 : last);
		this.setActive(next);
		this.reveal(next);
		const el = this.inputs[next];
		if (el && this.mode === 'sys') {
			el.focus();
			if (select && this.cfg.selectAll) {
				try {
					el.select();
				} catch {
					/* not selectable, no matter */
				}
			}
		}
	}

	/** Scrolls the active row just inside the list viewport. */
	reveal(i: number): void {
		const row = this.inputs[i]?.parentElement;
		const sc = this.scroller;
		if (!row || !sc) return;
		const r = row.getBoundingClientRect();
		const b = sc.getBoundingClientRect();
		if (r.top < b.top) sc.scrollTop += r.top - b.top - 8;
		else if (r.bottom > b.bottom) sc.scrollTop += r.bottom - b.bottom + 8;
	}

	press(key: PadKey): void {
		const cents = this.activeCents;
		if (key === 'next') return this.focusIdx(this.active + 1);
		if (key === 'prev') return this.focusIdx(this.active - 1);
		if (key === 'hide') return this.setMode('sys');
		if (cents === undefined) return;

		// First key on a row the cursor just landed on types over the old
		// number; everything after that appends to it.
		const replace = this.freshRow && this.cfg.selectAll;
		this.freshRow = false;

		if (key === 'clr') return this.setQty(cents, '');
		if (key === 'del') return this.setQty(cents, String(this.qty[cents] ?? '').slice(0, -1));
		this.setQty(cents, (replace ? '' : String(this.qty[cents] ?? '')) + key);
	}

	/* ---------- editor mode ---------- */

	setMode(mode: Mode): void {
		if (mode === 'pad' && document.activeElement instanceof HTMLElement) {
			// Drop the soft keyboard before the custom pad takes over.
			document.activeElement.blur();
		}
		this.mode = mode;
		this.cfg.mode = mode;
		this.persistCfg();
	}

	swapPadSide(): void {
		const side: PadSide = this.padSide === 'left' ? 'right' : 'left';
		this.padSide = side;
		this.cfg.padSide = side;
		this.persistCfg();
	}

	/* ---------- slots ---------- */

	async commitSave(): Promise<void> {
		if (this.#notReady() || this.saving) return;
		// Without evidence the count does not reach a slot; the gate offers the
		// camera, and a confirmed skip if the settings allow one.
		if (this.cfg.needPhoto && !this.photo) {
			this.view = 'needphoto';
			return;
		}
		const slot = await this.#commit(this.photo, this.photoBlob);
		if (slot) this.say(`Saved · ${money(slot.total)}`);
	}

	/** Only reachable from the gate, and only while `allowSkip` is on. */
	async saveWithoutPhoto(): Promise<void> {
		if (this.#notReady() || this.saving) return;
		const slot = await this.#commit(null, null);
		if (slot) this.say(`Saved without photo · ${money(slot.total)}`);
	}

	/** Files the count under a new slot. Null means storage refused the write. */
	async #commit(photo: PhotoMeta | null, blob: Blob | null): Promise<Slot | null> {
		const d = this.#dayDate(this.saveDay);
		const now = Date.now();
		const slot: Slot = {
			// Not the timestamp: two saves in the same millisecond would collide,
			// and a duplicate key is a hard error in a keyed `{#each}`.
			id: crypto.randomUUID(),
			label: `${this.saveLabel || 'Count'} ${dmy(d)}`,
			date: dmy(d),
			ts: now,
			total: this.totalCents,
			qty: $state.snapshot(this.qty),
			photo: $state.snapshot(photo),
			updatedAt: now
		};
		const { kept, gone } = this.#prune();

		this.saving = true;
		const ok = await this.#save(() => saveSlot(slot, blob, gone));
		this.saving = false;
		if (!ok) return null;

		this.slots = [slot, ...kept];
		this.view = null;
		// The evidence belongs to the slot now — the next count starts without it.
		this.photo = null;
		this.photoBlob = null;
		void saveWsPhoto(null);
		this.saveWorkspace();
		return slot;
	}

	async loadSlot(): Promise<void> {
		if (this.#notReady()) return;
		const s = this.openSlot;
		if (!s) return;
		// Read before the await: `openSlot` follows `openId`, which is cleared below.
		const qty = { ...s.qty };
		await this.#retire();
		this.qty = qty;
		this.view = null;
		this.openId = null;
		this.saveWorkspace();
		this.say('Counts loaded');
	}

	deleteSlot(): void {
		// Captured now: `openSlot` follows `openId`, which the dialog clears below.
		const id = this.openId;
		if (this.#notReady()) return;
		this.view = null;
		this.openId = null;
		this.#allow('Delete this slot', async () => {
			if (await this.#removeSlot(id)) this.say('Slot deleted');
		});
	}

	/** The settings list's ✕. Goes through `#removeSlot` so it gates exactly once. */
	removeSlot(id: string | null): void {
		if (this.#notReady() || !id) return;
		this.#allow('Delete this slot', () => void this.#removeSlot(id));
	}

	async #removeSlot(id: string | null): Promise<boolean> {
		if (!id) return false;
		if (!(await this.#save(() => dropSlots([id])))) return false;
		this.slots = this.slots.filter((s) => s.id !== id);
		return true;
	}

	dropAllSlots(): void {
		if (this.#notReady()) return;
		this.#allow('Delete every saved slot', async () => {
			if (!(await this.#save(dropAll))) return;
			this.slots = [];
			this.say('All slots deleted');
		});
	}

	async quickSave(): Promise<void> {
		if (this.#notReady() || this.saving) return;
		const q: Quick = { qty: $state.snapshot(this.qty), ts: Date.now(), total: this.totalCents };
		this.saving = true;
		const ok = await this.#save(() => saveQuick(q));
		this.saving = false;
		if (!ok) return;
		this.quick = q;
		await this.#retire();
		this.say('Quick saved');
	}

	async quickLoad(): Promise<void> {
		if (this.#notReady()) return;
		if (!this.quick) return this.say('Quick slot is empty');
		const qty = { ...this.quick.qty };
		await this.#retire();
		this.qty = qty;
		this.saveWorkspace();
		this.say('Quick loaded');
	}

	dropQuick(): void {
		if (this.#notReady()) return;
		this.#allow('Clear the quick slot', async () => {
			if (!(await this.#save(() => saveQuick(null)))) return;
			this.quick = null;
			this.say('Quick slot cleared');
		});
	}

	/**
	 * Applies the retention window. Failure is deliberately silent — expired
	 * slots surviving one more save is not worth interrupting the save that
	 * triggered the sweep.
	 */
	async #retire(): Promise<void> {
		const { kept, gone } = this.#prune();
		if (!gone.length) return;
		try {
			await dropSlots(gone);
			this.slots = kept;
		} catch {
			/* next save tries again */
		}
	}

	/* ---------- photo ---------- */

	/** Metadata is written synchronously; the bytes follow on their own. */
	setPhoto(p: EncodedPhoto | null): void {
		this.photo = p ? { bytes: p.blob.size, w: p.w, h: p.h } : null;
		this.photoBlob = p?.blob ?? null;
		this.saveWorkspace();
		void saveWsPhoto(p?.blob ?? null);
	}

	/** Closes whichever camera path produced the shot and keeps it. */
	attachPhoto(p: EncodedPhoto): void {
		this.camErr = null;
		this.camRes = '';
		this.view = null;
		this.setPhoto(p);
		this.say('Photo attached');
	}

	/**
	 * Routes the PHOTO button, and stays synchronous the whole way: the system
	 * path ends in `.click()`, which the browser only honours while the tap that
	 * triggered it is still being handled.
	 */
	openCamera(): void {
		if (!this.cfg.camChosen) {
			this.view = 'campick';
			return;
		}
		if (this.cfg.cam === 'app') this.view = 'camera';
		else this.openSysCam();
	}

	/** Hands off to the phone's own camera app. */
	openSysCam(): void {
		const el = this.sysCamInput;
		if (!el) {
			// Only reachable if the total bar ever stops being mounted. Said as a
			// toast rather than in the overlay, which clears its own error on open.
			this.say('System camera unavailable. Pick a file instead.');
			return;
		}
		// Re-picking the same file fires no change event unless the value is cleared.
		el.value = '';
		el.click();
	}

	pickAnyFile(): void {
		const el = this.fileInput;
		if (!el) return;
		el.value = '';
		el.click();
	}

	/** First-run answer: remembered as the default, then opened straight away. */
	chooseCam(which: Cam): void {
		this.cfg.cam = which;
		this.cfg.camChosen = true;
		this.persistCfg();
		this.view = null;
		if (which === 'app') this.view = 'camera';
		else this.openSysCam();
	}

	/** The gate's primary action. Dismisses it and shoots; the save is not resumed. */
	takePhoto(): void {
		this.view = null;
		this.openCamera();
	}

	/**
	 * Shared by both file inputs — the system camera returns a file like any
	 * other. Written with `.then`, not `async`: this file must stay free of
	 * `await` so none can drift into the `.click()` chain above.
	 */
	pickFile(input: HTMLInputElement): void {
		const file = input.files?.[0];
		if (!file) return;
		photoFromBlob(file, this.photoMax)
			.then((p) => this.attachPhoto(p))
			.catch(() => this.#photoFailed('That file is not a readable image.'));
	}

	/** The overlay shows its own error; the system-camera path has to be told. */
	#photoFailed(message: string): void {
		if (this.view === 'camera') this.camErr = message;
		else this.say(message);
	}

	/* ---------- settings ---------- */

	toggleDenom(cents: number): void {
		const on = this.cfg.enabled[cents] !== false;
		this.cfg.enabled[cents] = !on;
		this.active = 0;
		this.persistCfg();
	}

	toggleSelectAll(): void {
		this.cfg.selectAll = !this.cfg.selectAll;
		this.persistCfg();
	}

	toggleAutoSave(): void {
		const on = !this.cfg.autoSave;
		this.cfg.autoSave = on;
		this.persistCfg();
		if (on) return this.saveWorkspace();
		// The blob has to go with the key. `sweepOrphans` deliberately spares the
		// workspace photo, so nothing else would ever collect it.
		remove(K.ws);
		void saveWsPhoto(null);
	}

	setDefaultMode(mode: Mode): void {
		this.cfg.mode = mode;
		this.persistCfg();
	}

	setMaxAge(days: MaxAge): void {
		// Only shortening destroys anything. Written as a comparison rather than
		// `days === 7` so it stays correct if the choices ever change.
		if (days >= this.cfg.maxAge) return this.#setMaxAge(days);
		this.#allow(`Shorten retention to ${days} days`, () => this.#setMaxAge(days));
	}

	#setMaxAge(days: MaxAge): void {
		this.cfg.maxAge = days;
		this.persistCfg();
	}

	setPadSize(size: PadSize): void {
		this.cfg.padSize = size;
		this.persistCfg();
	}

	/** Answering here counts as choosing, so the first-run picker stays away. */
	setCam(cam: Cam): void {
		this.cfg.cam = cam;
		this.cfg.camChosen = true;
		this.persistCfg();
	}

	/** Turning this off removes the evidence requirement outright, so it is gated. */
	toggleNeedPhoto(): void {
		this.#allow('Change the photo requirement', () => {
			this.cfg.needPhoto = !this.cfg.needPhoto;
			this.persistCfg();
		});
	}

	toggleAllowSkip(): void {
		// The row stays tappable while dimmed so it can say why it does nothing.
		// This check comes first, so tapping a dimmed row never asks for a PIN.
		if (!this.cfg.needPhoto) return this.say('Turn on “Require photo evidence” first');
		this.#allow('Change the photo-skip policy', () => {
			this.cfg.allowSkip = !this.cfg.allowSkip;
			this.persistCfg();
		});
	}

	setPhotoMax(max: PhotoMax): void {
		this.cfg.photoMax = max;
		this.persistCfg();
	}

	addLabel(): void {
		const name = this.newLabel.trim();
		if (!name) return;
		if (!this.cfg.labels.includes(name)) this.cfg.labels.push(name);
		this.newLabel = '';
		this.persistCfg();
	}

	removeLabel(i: number): void {
		this.cfg.labels.splice(i, 1);
		if (!this.cfg.labels.length) this.cfg.labels = [...DEFAULT_LABELS];
		if (!this.cfg.labels.includes(this.saveLabel)) this.saveLabel = this.cfg.labels[0];
		this.persistCfg();
	}
}

export const app = new CashCounter();
