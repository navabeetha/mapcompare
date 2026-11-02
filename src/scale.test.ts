import { describe, expect, it } from 'vitest';
import { compensatedZoom } from './scale';
import { metersPerPixel } from './altitude';

/**
 * The app's entire premise is that one pixel covers the same ground distance on
 * both maps. compensatedZoom is what delivers that, so these tests assert the
 * invariant directly rather than checking particular zoom numbers.
 */
describe('compensatedZoom', () => {
  const cases: [name: string, sourceLat: number, targetLat: number][] = [
    ['Tokyo → Paris', 35.68, 48.86],
    ['Tokyo → Reykjavik', 35.68, 64.15],
    ['Amsterdam → Venice', 52.37, 45.44],
    ['equator → high north', 0, 71],
    ['north → south', 55, -34],
    ['Singapore → Nicobar', 1.29, 7.06],
  ];

  it.each(cases)(
    'yields equal meters-per-pixel: %s',
    (_name, sourceLat, targetLat) => {
      const sourceZoom = 11.5;
      const targetZoom = compensatedZoom(sourceZoom, sourceLat, targetLat);

      const source = metersPerPixel(sourceZoom, sourceLat);
      const target = metersPerPixel(targetZoom, targetLat);

      // Exact to floating-point precision — this is the whole contract.
      expect(target).toBeCloseTo(source, 9);
    }
  );

  it('is the identity at the same latitude', () => {
    expect(compensatedZoom(13.25, 40, 40)).toBe(13.25);
  });

  it('round-trips back to the original zoom', () => {
    const there = compensatedZoom(12, 35.68, 48.86);
    const back = compensatedZoom(there, 48.86, 35.68);
    expect(back).toBeCloseTo(12, 10);
  });

  it('zooms out when moving toward a pole', () => {
    // Higher latitude means fewer meters per pixel at a given zoom, so matching
    // scale there requires a lower zoom.
    expect(compensatedZoom(12, 0, 60)).toBeLessThan(12);
  });

  it('zooms in when moving toward the equator', () => {
    expect(compensatedZoom(12, 60, 0)).toBeGreaterThan(12);
  });

  it('falls back to the source zoom at a pole rather than returning -Infinity', () => {
    // cos(90°) is 0, so the log2 ratio would blow up.
    expect(compensatedZoom(10, 45, 90)).toBe(10);
    expect(compensatedZoom(10, 90, 45)).toBe(10);
  });

  it('produces unsnapped fractional zooms', () => {
    // Regression guard: zoomSnap must stay 0. If anything re-introduces
    // quantisation, matched panes drift up to ~9% apart in scale.
    const z = compensatedZoom(11.5, 35.608932, 48.876443);
    expect(z % 0.25).not.toBe(0);
  });
});
