/** Every euro denomination in circulation, in cents, smallest first. */
export const CENTS = [
	1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000
] as const;

/**
 * Amount formatting locale. The design renders every figure as `12 345,67 €`;
 * changing this one constant changes the whole app.
 */
export const LOCALE = 'et-EE';

const nf = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });

/** Cents to a display amount, e.g. `1234` -> `12,34 €`. */
export const money = (cents: number): string => nf.format((cents || 0) / 100);

/** Denomination label: `50` -> `50 ¢`, `500` -> `5 €`. */
export const denomLabel = (cents: number): string =>
	cents < 100 ? `${cents} ¢` : `${cents / 100} €`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `dd/mm/yyyy` — the stamp appended to every saved slot. */
export const dmy = (d: Date): string =>
	`${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** `hh:mm`. */
export const hm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** `1 piece` / `n pieces`. */
export const pieces = (n: number): string => `${n} ${n === 1 ? 'piece' : 'pieces'}`;
