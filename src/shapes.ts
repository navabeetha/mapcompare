import L from 'leaflet';
import { bearingBetween, destinationPoint, geodesicArea, pathLength } from './geometry';

/**
 * The measurement primitives. `line` is the generalisation of the original
 * two-click measure tool to N points.
 */
export type ShapeKind = 'line' | 'circle' | 'polygon';

/** Drawing/editing mode for a pane's shape layer. 'off' disables interaction. */
export type ShapeMode = 'off' | 'edit' | ShapeKind;

/** A lat/lng pair as plain numbers, so a shape serialises straight to JSON. */
export type Point = [lat: number, lng: number];

/**
 * A measurement object on one pane.
 *
 * `points` means different things per kind, which is why it stays a bare array
 * rather than separate fields — it keeps serialisation and the reconcile loop in
 * ShapeLayer uniform:
 *   - line:    the vertices, in order (>= 2)
 *   - polygon: the ring vertices, not repeating the first (>= 3)
 *   - circle:  exactly one point, the centre; the size lives in radiusM
 */
export interface MeasureShape {
  id: string;
  kind: ShapeKind;
  points: Point[];
  /** Circle radius in meters. Undefined for every other kind. */
  radiusM?: number;
}

/**
 * What a shape measures. Which fields are populated depends on the kind, so the
 * readout panel can ask for `areaM2` and simply get nothing for a line.
 */
export interface ShapeMetrics {
  /** Line length, polygon perimeter, or circle circumference. */
  lengthM?: number;
  /** Enclosed area. Polygons and circles only. */
  areaM2?: number;
  /** Circles only. */
  radiusM?: number;
}

export function createShapeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toLatLngs(shape: MeasureShape): L.LatLng[] {
  return shape.points.map(([lat, lng]) => L.latLng(lat, lng));
}

/** Smallest point count a kind stays valid at; editing refuses to go below it. */
export function minPoints(kind: ShapeKind): number {
  return kind === 'polygon' ? 3 : kind === 'line' ? 2 : 1;
}

/**
 * Measure a shape against a specific map.
 *
 * The map argument matters: distances come from map.distance, so a shape is
 * always measured on the pane it belongs to. That is what makes the left/right
 * ratio in the readout panel meaningful.
 */
export function measureShape(shape: MeasureShape, map: L.Map): ShapeMetrics {
  const pts = toLatLngs(shape);

  switch (shape.kind) {
    case 'line':
      return { lengthM: pathLength(pts, map) };

    case 'polygon':
      return {
        lengthM: pathLength(pts, map, true),
        areaM2: geodesicArea(pts),
      };

    case 'circle': {
      const r = shape.radiusM ?? 0;
      return {
        radiusM: r,
        lengthM: 2 * Math.PI * r,
        areaM2: Math.PI * r * r,
      };
    }
  }
}

/**
 * Copy a shape onto the opposite pane at identical ground dimensions, re-centred
 * on `newCentre`.
 *
 * This is the point of a true-scale comparison tool: draw a 5 km circle around
 * one city and drop the same 5 km circle on the other. A circle only needs its
 * radius carried over. A line or polygon is rebuilt by measuring each vertex's
 * bearing and distance from the original's centroid and replaying those same
 * offsets around the new centre, so the footprint keeps its real size and
 * orientation instead of its latitude-distorted pixel shape.
 */
export function mirrorShape(
  shape: MeasureShape,
  map: L.Map,
  newCentre: L.LatLng
): MeasureShape {
  if (shape.kind === 'circle') {
    return {
      id: createShapeId(),
      kind: 'circle',
      points: [[newCentre.lat, newCentre.lng]],
      radiusM: shape.radiusM,
    };
  }

  const pts = toLatLngs(shape);
  const origin = centroid(pts);
  const points: Point[] = pts.map((p) => {
    const moved = destinationPoint(
      newCentre,
      map.distance(origin, p),
      bearingBetween(origin, p)
    );
    return [moved.lat, moved.lng];
  });

  return { id: createShapeId(), kind: shape.kind, points };
}

/**
 * Arithmetic mean of the vertices. Good enough as a reference origin for
 * mirroring — it does not need to be the true area centroid, only a consistent
 * point to measure vertex offsets from.
 */
export function centroid(latlngs: L.LatLng[]): L.LatLng {
  if (latlngs.length === 0) return L.latLng(0, 0);
  let lat = 0;
  let lng = 0;
  for (const p of latlngs) {
    lat += p.lat;
    lng += p.lng;
  }
  return L.latLng(lat / latlngs.length, lng / latlngs.length);
}
