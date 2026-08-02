/** Quantity per denomination, keyed by cent value. Empty rows are absent. */
export type Qty = Record<number, string>;

/** Which denominations are shown. Absent key means enabled. */
export type EnabledMap = Record<number, boolean>;

export type Mode = 'pad' | 'sys';
/** Digits are appended verbatim; the rest are commands. */
export type PadKey =
	| '0'
	| '1'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '00'
	| 'del'
	| 'clr'
	| 'prev'
	| 'next'
	| 'hide';
export type PadSide = 'left' | 'right';
export type SaveDay = 'today' | 'yesterday';
export type View = null | 'slot' | 'camera' | 'settings' | 'campick' | 'needphoto';
export type MaxAge = 7 | 31;
export type PadSize = 25 | 50 | 75 | 100;
/** Where a photo comes from: the phone's own camera app, or the in-app overlay. */
export type Cam = 'system' | 'app';
/** Longest edge of the stored photo, in pixels. */
export type PhotoMax = 1280 | 1800 | 2400;

/**
 * What a stored photo is, apart from its bytes — those live in the photo store
 * under the owning slot's id. `w`/`h` are 0 when the size is not known, which
 * is every photo migrated out of localStorage: decoding a dozen 2 MP JPEGs to
 * fill them in would delay the first data paint for nothing, since
 * `SlotDetail`'s `onload` measures the real image anyway.
 */
export interface PhotoMeta {
	bytes: number;
	w: number;
	h: number;
}

export interface Slot {
	id: string;
	/** Label plus the `dd/mm/yyyy` the count is filed under. */
	label: string;
	date: string;
	/** When it was saved (not the date it is filed under). */
	ts: number;
	total: number;
	qty: Qty;
	photo: PhotoMeta | null;
	/** Last local change. Nothing reads it yet; cloud sync compares on it. */
	updatedAt: number;
}

/**
 * The admin PIN. Plaintext by decision: this is a mis-tap guard, not a security
 * control — anyone who can open devtools reads it in seconds, and the setup
 * screen says so. An empty string means no PIN is set and every gate is a
 * pass-through; there is deliberately no separate `enabled` flag, because a
 * retained-but-disabled PIN reads as off while the secret is still on disk.
 */
export interface Lock {
	pin: string;
}

export type GateKind = 'unlock' | 'set' | 'change' | 'clear';
export type GateStep = 'verify' | 'new' | 'confirm';

/**
 * Descriptor for the PIN sheet. Deliberately not a `View`: `view` is a single
 * scalar, so `view = 'pin'` would unmount Settings — the screen whose controls
 * need gating — and collapse `padOpen`. The global `.scrim` is z70 against
 * Settings' z60 and neither `.app` nor `.mid` makes a stacking context, so a
 * separate field paints over it for free.
 */
export interface Gate {
	kind: GateKind;
	/** Sentence naming what is about to happen: "Delete every saved slot". */
	why: string;
	step: GateStep;
}

/** Record-shape version and one-time migration state, stored in `kv` under `meta`. */
export interface StoredMeta {
	version: number;
	migratedAt?: number;
}

/** `navigator.storage.estimate()`, narrowed to the two fields that are always there. */
export interface StorageInfo {
	used: number;
	quota: number;
}

export interface Quick {
	qty: Qty;
	ts: number;
	total: number;
}

/**
 * Stays in localStorage even though slots moved to IndexedDB. `qty` is fifteen
 * short strings, and keeping it synchronous is what lets `saveWorkspace()` run
 * inside a `visibilitychange` handler and stops the 260 ms debounce racing
 * itself. Only the photo *bytes* moved; this holds the metadata.
 */
export interface Workspace {
	qty: Qty;
	photo: PhotoMeta | null;
}

export interface Cfg {
	selectAll: boolean;
	autoSave: boolean;
	maxAge: MaxAge;
	padSize: PadSize;
	labels: string[];
	mode: Mode;
	padSide: PadSide;
	enabled: EnabledMap;
	cam: Cam;
	/** False until the camera has been picked once — the flag that opens the picker. */
	camChosen: boolean;
	photoMax: PhotoMax;
	needPhoto: boolean;
	allowSkip: boolean;
}
