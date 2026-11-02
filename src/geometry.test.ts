import { describe, expect, it } from 'vitest';
import L from 'leaflet';
import {
  bearingBetween,
  destinationPoint,
  formatArea,
  geodesicArea,
  pathLength,
} from './geometry';

/**
 * A stand-in for the Leaflet map that only provides `distance`, which is all the
 * geometry helpers use it for. Built on L.CRS.Earth so it computes exactly what a
 * real map would, without needing a rendered map in jsdom.
 */
const map = {
  distance: (a: L.LatLngExpression, b: L.LatLngExpression) =>
    L.CRS.Earth.distance(L.latLng(a), L.latLng(b)),
} as unknown as L.Map;

/** Rectangle of a given ground size, built east and south from a corner. */
function groundRect(origin: L.LatLng, widthM: number, heightM: number) {
  const ne = destinationPoint(origin, widthM, 90);
  const se = destinationPoint(ne, heightM, 180);
  const sw = destinationPoint(origin, heightM, 180);
  return [origin, ne, se, sw];
}

describe('geodesicArea', () => {
  it('matches width × height for a rectangle', () => {
    // The case verified by hand in the browser: a 4388 m × 2194 m box over Tokyo
    // read 9.63 km², against 9.627 km² computed as width × height.
    const rect = groundRect(L.latLng(35.68, 139.65), 4388, 2194);
    expect(geodesicArea(rect)).toBeCloseTo(4388 * 2194, -4); // within ~10,000 m²
  });

  it('is independent of winding order', () => {
    const rect = groundRect(L.latLng(48.86, 2.35), 3000, 2000);
    expect(geodesicArea([...rect].reverse())).toBeCloseTo(geodesicArea(rect), 3);
  });

  it('holds up at high latitude, where Mercator distortion is worst', () => {
    const rect = groundRect(L.latLng(64.15, -21.94), 5000, 5000);
    expect(geodesicArea(rect)).toBeCloseTo(5000 * 5000, -5); // within ~100,000 m²
  });

  it('agrees with the perimeter on the same sphere', () => {
    // Guards the radius constant: area and length must use one radius. A 4 km
    // square has a 16 km perimeter and a 16 km² area.
    const side = 4000;
    const rect = groundRect(L.latLng(20, 100), side, side);
    expect(pathLength(rect, map, true)).toBeCloseTo(side * 4, -2);
    expect(geodesicArea(rect)).toBeCloseTo(side * side, -5);
  });

  it('returns 0 for degenerate rings', () => {
    expect(geodesicArea([])).toBe(0);
    expect(geodesicArea([L.latLng(0, 0)])).toBe(0);
    expect(geodesicArea([L.latLng(0, 0), L.latLng(1, 1)])).toBe(0);
  });
});

describe('pathLength', () => {
  it('sums the legs of an open path', () => {
    const a = L.latLng(35.68, 139.65);
    const b = destinationPoint(a, 1000, 90);
    const c = destinationPoint(b, 2000, 90);
    expect(pathLength([a, b, c], map)).toBeCloseTo(3000, 0);
  });

  it('adds the closing leg when asked', () => {
    const a = L.latLng(0, 0);
    const b = destinationPoint(a, 1000, 90);
    const c = destinationPoint(b, 1000, 180);
    const open = pathLength([a, b, c], map);
    const closed = pathLength([a, b, c], map, true);
    expect(closed - open).toBeCloseTo(map.distance(c, a), 3);
  });

  it('returns 0 for fewer than two points', () => {
    expect(pathLength([], map)).toBe(0);
    expect(pathLength([L.latLng(1, 1)], map)).toBe(0);
  });
});

describe('destinationPoint / bearingBetween', () => {
  it('lands the requested distance away', () => {
    const from = L.latLng(35.68, 139.65);
    for (const bearing of [0, 45, 90, 180, 270, 315]) {
      const to = destinationPoint(from, 5000, bearing);
      expect(map.distance(from, to)).toBeCloseTo(5000, 0);
    }
  });

  it('round-trips through bearingBetween', () => {
    const from = L.latLng(48.86, 2.35);
    for (const bearing of [10, 90, 200, 350]) {
      const to = destinationPoint(from, 3000, bearing);
      expect(bearingBetween(from, to)).toBeCloseTo(bearing, 4);
    }
  });

  it('places a due-east point at the same latitude', () => {
    // This is what seats a circle's radius handle, so it must not drift north.
    const from = L.latLng(52.37, 4.9);
    const east = destinationPoint(from, 2000, 90);
    expect(east.lat).toBeCloseTo(from.lat, 4);
    expect(east.lng).toBeGreaterThan(from.lng);
  });
});

describe('formatArea', () => {
  it.each([
    [0, '0 m²'],
    [850, '850 m²'],
    [9_999, '9,999 m²'],
    [10_000, '1.00 ha'],
    [250_000, '25.00 ha'],
    [1_000_000, '1.00 km²'],
    [9_630_000, '9.63 km²'],
    [45_200_000, '45.2 km²'],
    [1_234_000_000, '1,234 km²'],
  ])('formats %i m² as %s', (value, expected) => {
    expect(formatArea(value)).toBe(expected);
  });

  it('guards against nonsense input', () => {
    expect(formatArea(NaN)).toBe('—');
    expect(formatArea(-1)).toBe('—');
    expect(formatArea(Infinity)).toBe('—');
  });
});
