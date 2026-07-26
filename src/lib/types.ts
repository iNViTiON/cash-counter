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
export type View = null | 'slot' | 'camera' | 'settings';
export type MaxAge = 7 | 31;
export type PadSize = 25 | 50 | 75 | 100;

export interface Slot {
	id: string;
	/** Label plus the `dd/mm/yyyy` the count is filed under. */
	label: string;
	date: string;
	/** When it was saved (not the date it is filed under). */
	ts: number;
	total: number;
	qty: Qty;
	photo: string | null;
}

export interface Quick {
	qty: Qty;
	ts: number;
	total: number;
}

export interface Workspace {
	qty: Qty;
	photo: string | null;
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
}
