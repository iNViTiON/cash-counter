import { CENTS, dmy, money } from './format';
import { K, read, remove, write } from './storage';
import type {
	Cfg,
	MaxAge,
	Mode,
	PadKey,
	PadSide,
	PadSize,
	Qty,
	Quick,
	SaveDay,
	Slot,
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
	enabled: {}
};

const DAY_MS = 864e5;
const WS_DEBOUNCE_MS = 260;
const TOAST_MS = 2200;

const freshCfg = (): Cfg => ({ ...DEFAULT_CFG, labels: [...DEFAULT_LABELS], enabled: {} });

/**
 * The whole app. One instance, created at module load — the constructor only
 * sets defaults so it is safe during prerender; anything touching the browser
 * happens in `hydrate()`, called from the page's `onMount`.
 */
class CashCounter {
	/* ---------- persisted ---------- */
	qty = $state<Qty>({});
	photo = $state<string | null>(null);
	cfg = $state<Cfg>(freshCfg());
	slots = $state<Slot[]>([]);
	quick = $state<Quick | null>(null);

	/* ---------- session ---------- */
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
	toast = $state('');

	/** DOM handles, filled in by `bind:this`. */
	inputs = $state<(HTMLInputElement | null)[]>([]);
	scroller = $state<HTMLElement | null>(null);

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

	#dayDate(day: SaveDay): Date {
		const d = new Date();
		if (day === 'yesterday') d.setDate(d.getDate() - 1);
		return d;
	}

	/* ---------- lifecycle ---------- */

	hydrate(): void {
		const stored = read<Partial<Cfg> | null>(K.cfg, null);
		const ws = read<Workspace | null>(K.ws, null);
		const slots = read<Slot[]>(K.slots, []);
		const quick = read<Quick | null>(K.quick, null);

		const cfg = Object.assign(freshCfg(), stored ?? {});
		if (!Array.isArray(cfg.labels) || !cfg.labels.length) cfg.labels = [...DEFAULT_LABELS];
		if (!cfg.enabled || typeof cfg.enabled !== 'object') cfg.enabled = {};

		this.cfg = cfg;
		this.mode = cfg.mode ?? 'pad';
		this.padSide = cfg.padSide ?? 'right';
		this.qty = cfg.autoSave && ws?.qty ? ws.qty : {};
		this.photo = (cfg.autoSave && ws?.photo) || null;
		this.slots = Array.isArray(slots) ? slots : [];
		this.quick = quick;
		this.saveLabel = cfg.labels[0];
	}

	dispose(): void {
		clearTimeout(this.#toastTimer);
		clearTimeout(this.#wsTimer);
	}

	/* ---------- persistence ---------- */

	#write(key: string, value: unknown): boolean {
		if (write(key, value)) return true;
		this.say('Storage full — remove a photo or a slot');
		return false;
	}

	persistCfg(): void {
		this.#write(K.cfg, $state.snapshot(this.cfg));
	}

	/** Writes the working count so it survives a reload. No-op when auto-save is off. */
	saveWorkspace(): void {
		if (!this.cfg.autoSave) return;
		this.#write(K.ws, { qty: $state.snapshot(this.qty), photo: this.photo });
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

	/** Slots older than the retention window, dropped on the next save or load. */
	#prune(): Slot[] {
		const cut = Date.now() - this.cfg.maxAge * DAY_MS;
		return $state.snapshot(this.slots).filter((s) => s.ts >= cut);
	}

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

	commitSave(): void {
		const d = this.#dayDate(this.saveDay);
		const slot: Slot = {
			// Not the timestamp: two saves in the same millisecond would collide,
			// and a duplicate key is a hard error in a keyed `{#each}`.
			id: crypto.randomUUID(),
			label: `${this.saveLabel || 'Count'} ${dmy(d)}`,
			date: dmy(d),
			ts: Date.now(),
			total: this.totalCents,
			qty: $state.snapshot(this.qty),
			photo: this.photo
		};
		const next = [slot, ...this.#prune()];
		if (!this.#write(K.slots, next)) return;
		this.slots = next;
		this.view = null;
		// The evidence belongs to the slot now — the next count starts without it.
		this.photo = null;
		this.saveWorkspace();
		this.say(`Saved · ${money(slot.total)}`);
	}

	loadSlot(): void {
		const s = this.openSlot;
		if (!s) return;
		const kept = this.#prune();
		this.#write(K.slots, kept);
		this.slots = kept;
		this.qty = { ...s.qty };
		this.view = null;
		this.openId = null;
		this.saveWorkspace();
		this.say('Counts loaded');
	}

	deleteSlot(): void {
		this.removeSlot(this.openId);
		this.view = null;
		this.openId = null;
		this.say('Slot deleted');
	}

	removeSlot(id: string | null): void {
		if (!id) return;
		const next = $state.snapshot(this.slots).filter((s) => s.id !== id);
		this.#write(K.slots, next);
		this.slots = next;
	}

	dropAllSlots(): void {
		this.#write(K.slots, []);
		this.slots = [];
		this.say('All slots deleted');
	}

	quickSave(): void {
		const q: Quick = { qty: $state.snapshot(this.qty), ts: Date.now(), total: this.totalCents };
		const kept = this.#prune();
		this.#write(K.slots, kept);
		this.slots = kept;
		if (!this.#write(K.quick, q)) return;
		this.quick = q;
		this.say('Quick saved');
	}

	quickLoad(): void {
		if (!this.quick) return this.say('Quick slot is empty');
		const kept = this.#prune();
		this.#write(K.slots, kept);
		this.slots = kept;
		this.qty = { ...this.quick.qty };
		this.saveWorkspace();
		this.say('Quick loaded');
	}

	dropQuick(): void {
		remove(K.quick);
		this.quick = null;
		this.say('Quick slot cleared');
	}

	/* ---------- photo ---------- */

	setPhoto(dataUrl: string | null): void {
		this.photo = dataUrl;
		this.saveWorkspace();
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
		if (on) this.saveWorkspace();
		else remove(K.ws);
	}

	setDefaultMode(mode: Mode): void {
		this.cfg.mode = mode;
		this.persistCfg();
	}

	setMaxAge(days: MaxAge): void {
		this.cfg.maxAge = days;
		this.persistCfg();
	}

	setPadSize(size: PadSize): void {
		this.cfg.padSize = size;
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
