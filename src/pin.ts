/**
 * Frame pins. When the author saves, each map can be pinned to one of nine
 * spots in the part of the screen where that map shows. A reader on another
 * screen size then sees the pinned place on the same spot, instead of at the
 * screen centre.
 *
 * Example: Mumbai vs Nicobar pins the left map right-middle and the right map
 * left-middle, so the two islands sit next to each other by the split bar.
 *
 * Pure geometry in screen pixels. App.tsx does the Leaflet project/unproject.
 */

export type PinX = 'left' | 'center' | 'right';
export type PinY = 'top' | 'middle' | 'bottom';
export interface Pin {
  x: PinX;
  y: PinY;
}

export const CENTRE_PIN: Pin = { x: 'center', y: 'middle' };

/** No pin (projects saved before pins existed) counts as the centre. */
export function isCentrePin(pin: Pin | undefined): boolean {
  return !pin || (pin.x === 'center' && pin.y === 'middle');
}

export interface Frame {
  left: number;
  width: number;
  height: number;
}

/**
 * The part of the screen where one map shows. Both maps cover the whole map
 * area (the curtain layout), and the split decides which part of each one shows.
 */
export function visibleFrame(
  side: 'left' | 'right',
  splitPct: number,
  width: number,
  height: number
): Frame {
  const split = (width * splitPct) / 100;
  return side === 'left'
    ? { left: 0, width: split, height }
    : { left: split, width: width - split, height };
}

/** The frame is cut into thirds; each pin is the middle of its third. Pins are
 *  never on an edge, so a pinned place is never half hidden behind the split. */
const FRACTION = { left: 1 / 6, center: 1 / 2, right: 5 / 6, top: 1 / 6, middle: 1 / 2, bottom: 5 / 6 };

export function pinPoint(pin: Pin, frame: Frame): { x: number; y: number } {
  return {
    x: frame.left + frame.width * FRACTION[pin.x],
    y: frame.height * FRACTION[pin.y],
  };
}

/**
 * The map centre, in world pixels, that puts `pinned` (also world pixels) on
 * screen point `target`. `size` is the map's container size; its centre is
 * where the map centre shows.
 */
export function centreForPin(
  pinned: { x: number; y: number },
  target: { x: number; y: number },
  size: { x: number; y: number }
): { x: number; y: number } {
  return { x: pinned.x - target.x + size.x / 2, y: pinned.y - target.y + size.y / 2 };
}

/**
 * The middle of one map's visible part, in screen pixels. Searches land here
 * and the zoom buttons zoom around it. The maps are full-screen behind a
 * curtain, so a map's own centre is the split bar, right at the edge of what
 * you can see; this is the centre of what you actually see.
 */
export function frameCentre(
  side: 'left' | 'right',
  splitPct: number,
  width: number,
  height: number
): { x: number; y: number } {
  return pinPoint(CENTRE_PIN, visibleFrame(side, splitPct, width, height));
}
