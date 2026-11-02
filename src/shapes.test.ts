import { describe, expect, it } from 'vitest';
import L from 'leaflet';
import {
  centroid,
  measureShape,
  minPoints,
  mirrorShape,
  toLatLngs,
  type MeasureShape,
} from './shapes';
import { destinationPoint } from './geometry';

const map = {
  distance: (a: L.LatLngExpression, b: L.LatLngExpression) =>
    L.CRS.Earth.distance(L.latLng(a), L.latLng(b)),
} as unknown as L.Map;

const circle = (lat: number, lng: number, radiusM: number): MeasureShape => ({
  id: 'c1',
  kind: 'circle',
  points: [[lat, lng]],
  radiusM,
});

describe('measureShape — circle', () => {
  it('reports radius, circumference and area', () => {
    // The case verified in the browser: r 6.20 km read as 121 km².
    const m = measureShape(circle(35.68, 139.65, 6200), map);
    expect(m.radiusM).toBe(6200);
    expect(m.lengthM).toBeCloseTo(2 * Math.PI * 6200, 6);
    expect(m.areaM2).toBeCloseTo(Math.PI * 6200 ** 2, 6);
  });

  it('treats a missing radius as zero rather than NaN', () => {
    const m = measureShape({ id: 'x', kind: 'circle', points: [[0, 0]] }, map);
    expect(m.radiusM).toBe(0);
    expect(m.areaM2).toBe(0);
  });
});

describe('measureShape — polygon', () => {
  const square = (() => {
    const a = L.latLng(35.68, 139.65);
    const b = destinationPoint(a, 2000, 90);
    const c = destinationPoint(b, 2000, 180);
    const d = destinationPoint(a, 2000, 180);
    return [a, b, c, d].map((p): [number, number] => [p.lat, p.lng]);
  })();

  it('closes the ring when measuring the perimeter', () => {
    const m = measureShape({ id: 'p', kind: 'polygon', points: square }, map);
    expect(m.lengthM).toBeCloseTo(8000, -1);
  });

  it('reports the enclosed area', () => {
    const m = measureShape({ id: 'p', kind: 'polygon', points: square }, map);
    expect(m.areaM2).toBeCloseTo(4_000_000, -5);
  });
});

describe('measureShape — line', () => {
  it('reports length and no area', () => {
    const a = L.latLng(0, 0);
    const b = destinationPoint(a, 1500, 90);
    const m = measureShape(
      {
        id: 'l',
        kind: 'line',
        points: [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
      },
      map
    );
    expect(m.lengthM).toBeCloseTo(1500, 0);
    expect(m.areaM2).toBeUndefined();
  });
});

describe('mirrorShape', () => {
  it('carries a circle across at the same ground radius', () => {
    // The point of the feature: an equal-radius circle on the other map renders
    // at the same pixel size, because the panes are scale-locked.
    const source = circle(35.68, 139.65, 6200);
    const copy = mirrorShape(source, map, L.latLng(48.86, 2.35));

    expect(copy.kind).toBe('circle');
    expect(copy.radiusM).toBe(6200);
    expect(copy.points).toEqual([[48.86, 2.35]]);
    expect(copy.id).not.toBe(source.id);
  });

  it('preserves every vertex offset of a polygon in meters', () => {
    const origin = L.latLng(1.29, 103.83);
    const points = [0, 90, 200].map((bearing): [number, number] => {
      const p = destinationPoint(origin, 2500, bearing);
      return [p.lat, p.lng];
    });
    const source: MeasureShape = { id: 'p', kind: 'polygon', points };

    const target = L.latLng(64.15, -21.94); // far north, worst-case distortion
    const copy = mirrorShape(source, map, target);

    const sourceCentre = centroid(toLatLngs(source));
    const copyCentre = centroid(toLatLngs(copy));

    toLatLngs(source).forEach((p, i) => {
      const before = map.distance(sourceCentre, p);
      const after = map.distance(copyCentre, toLatLngs(copy)[i]);
      // Ground geometry is what must survive the trip, not pixel shape.
      expect(after).toBeCloseTo(before, 0);
    });
  });

  it('keeps a mirrored polygon the same size', () => {
    const origin = L.latLng(20, 100);
    const points = [0, 120, 240].map((bearing): [number, number] => {
      const p = destinationPoint(origin, 3000, bearing);
      return [p.lat, p.lng];
    });
    const source: MeasureShape = { id: 'p', kind: 'polygon', points };
    const copy = mirrorShape(source, map, L.latLng(-33.87, 151.21));

    const before = measureShape(source, map);
    const after = measureShape(copy, map);
    expect(after.areaM2! / before.areaM2!).toBeCloseTo(1, 2);
    expect(after.lengthM! / before.lengthM!).toBeCloseTo(1, 2);
  });
});

describe('minPoints', () => {
  it('states the floor each kind stays valid at', () => {
    expect(minPoints('polygon')).toBe(3);
    expect(minPoints('line')).toBe(2);
    expect(minPoints('circle')).toBe(1);
  });
});
