/**
 * Units and limits for the scale grid's cell length (Layers menu).
 *
 * The author picks a system, km or mi; the small unit follows the zoom (m
 * when cells are under a kilometre, ft when under a mile). A fixed length is
 * stored in metres (`grid.overrideMeters`), as before.
 *
 * Cells narrower than MIN_CELL_PX are never drawn: a 5 m grid at ~20 m per
 * pixel meant millions of sub-pixel squares per frame and froze the page.
 */

export type GridSystem = 'metric' | 'imperial';
export type GridUnit = 'm' | 'km' | 'ft' | 'mi';

/** Rounds to 1, 2 or 5 × a power of ten: the grid's automatic cell sizes. */
export function niceNumber(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exp);
  let nice: number;
  if (fraction < 1.5) nice = 1;
  else if (fraction < 3.5) nice = 2;
  else if (fraction < 7.5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

export const MIN_CELL_PX = 8;
export const FOOT = 0.3048;
export const MILE = 1609.344;
const PER_UNIT: Record<GridUnit, number> = { m: 1, km: 1000, ft: FOOT, mi: MILE };

/** False for cells too small to see (or nonsense): the grid then draws nothing. */
export function gridIsDrawable(stepPx: number): boolean {
  return isFinite(stepPx) && stepPx >= MIN_CELL_PX;
}

/** m or km, ft or mi, whichever suits the automatic cell size at this zoom. */
export function gridUnitFor(system: GridSystem, mpp: number): GridUnit {
  const auto = niceNumber(mpp * 100);
  if (system === 'metric') return auto < 1000 ? 'm' : 'km';
  return auto / FOOT < 5280 ? 'ft' : 'mi';
}

export function toMeters(value: number, unit: GridUnit): number {
  return value * PER_UNIT[unit];
}

/** null when fine, otherwise a message for under the input. */
export function validateCell(value: number, unit: GridUnit, mpp: number): string | null {
  if (!(value > 0) || !isFinite(value)) return 'Enter a length above 0.';
  if (toMeters(value, unit) / mpp >= MIN_CELL_PX) return null;
  const min = (MIN_CELL_PX * mpp) / PER_UNIT[unit];
  // Rounded up to 2 significant figures, so the suggestion itself is allowed.
  const p = Math.pow(10, Math.floor(Math.log10(min)) - 1);
  const shown = +(Math.ceil(min / p) * p).toPrecision(2);
  return `Too small to see at this zoom: use at least ${shown} ${unit}.`;
}

/**
 * Which system a stored length was set in: whole feet that aren't whole
 * metres (1 mi = 1609.344 m, 500 ft = 152.4 m) were set in mi or ft.
 */
export function gridSystemOf(meters: number): GridSystem {
  const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  return near(meters / FOOT) && !near(meters) ? 'imperial' : 'metric';
}

/** "1 mi", "0.5 mi", "500 ft". */
export function formatImperial(meters: number): string {
  const feet = meters / FOOT;
  const miles = feet / 5280;
  if (miles >= 0.25 && Math.abs(miles * 100 - Math.round(miles * 100)) < 1e-6) return `${+miles.toFixed(2)} mi`;
  return `${Math.round(feet)} ft`;
}
