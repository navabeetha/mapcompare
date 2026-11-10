import { describe, expect, it } from 'vitest';
import { CENTRE_PIN, centreForPin, isCentrePin, pinPoint, visibleFrame } from './pin';

/**
 * A saved comparison can pin each map to one of nine spots in the part of the
 * screen that map is visible in. On another screen size, the pinned place lands
 * on the same spot of that map's visible part, rather than at the screen centre.
 */
describe('visibleFrame', () => {
  it('the left map shows from the left edge to the split', () => {
    expect(visibleFrame('left', 40, 1000, 600)).toEqual({ left: 0, width: 400, height: 600 });
  });
  it('the right map shows from the split to the right edge', () => {
    expect(visibleFrame('right', 40, 1000, 600)).toEqual({ left: 400, width: 600, height: 600 });
  });
});

describe('pinPoint', () => {
  const frame = { left: 400, width: 600, height: 600 };
  it('the centre pin is the middle of the visible part', () => {
    expect(pinPoint(CENTRE_PIN, frame)).toEqual({ x: 700, y: 300 });
  });
  it('the other pins sit at the middle of their third of the frame, never on an edge', () => {
    expect(pinPoint({ x: 'left', y: 'top' }, frame)).toEqual({ x: 500, y: 100 });
    expect(pinPoint({ x: 'right', y: 'bottom' }, frame)).toEqual({ x: 900, y: 500 });
  });
  it('left-middle of the right map sits near the split bar', () => {
    const p = pinPoint({ x: 'left', y: 'middle' }, frame);
    expect(p.x - frame.left).toBeLessThan(frame.width / 2);
    expect(p.y).toBe(300);
  });
});

describe('centreForPin', () => {
  it('puts the pinned place exactly on the target point', () => {
    const size = { x: 1000, y: 600 };
    const pinned = { x: 5230, y: 8810 }; // the place, in world pixels
    const target = { x: 300, y: 150 }; // where it should land on screen
    const c = centreForPin(pinned, target, size);
    // The screen point of the place, given that centre, is pinned - c + size/2.
    expect(pinned.x - c.x + size.x / 2).toBe(target.x);
    expect(pinned.y - c.y + size.y / 2).toBe(target.y);
  });
  it('a target at the screen centre leaves the place as the centre', () => {
    expect(centreForPin({ x: 10, y: 20 }, { x: 500, y: 300 }, { x: 1000, y: 600 })).toEqual({ x: 10, y: 20 });
  });
});

describe('isCentrePin', () => {
  it('is true only for centre-middle', () => {
    expect(isCentrePin(CENTRE_PIN)).toBe(true);
    expect(isCentrePin({ x: 'center', y: 'top' })).toBe(false);
    expect(isCentrePin(undefined)).toBe(true);
  });
});

import { frameCentre } from './pin';

describe('frameCentre: where searches land and the zoom buttons zoom around', () => {
  // A 1000 × 800 screen split at 40%: the left map shows 0–400, the right 400–1000.
  it('the middle of the left map’s visible part, not the split', () => {
    expect(frameCentre('left', 40, 1000, 800)).toEqual({ x: 200, y: 400 });
  });
  it('the middle of the right map’s visible part', () => {
    expect(frameCentre('right', 40, 1000, 800)).toEqual({ x: 700, y: 400 });
  });
});
