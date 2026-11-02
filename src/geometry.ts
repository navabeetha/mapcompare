import L from 'leaflet';

const DEG_TO_RAD = Math.PI / 180;

/** WGS-84 equatorial radius, matching the sphere Leaflet's distance() assumes. */
const EARTH_RADIUS_M = 6_378_137;

/**
 * Area of a polygon on the sphere, in m².
 *
 * Derived from the spherical excess of the polygon: integrating around the
 * boundary, each edge contributes an amount proportional to its change in
 * longitude weighted by the mean sine of its endpoint latitudes. Summing the
 * signed contributions and halving gives the enclosed solid angle, which scales
 * by R² into an area.
 *
 *   area = R²/2 · Σ (λ₂ − λ₁) · (2 + sin φ₁ + sin φ₂)
 *
 * The sign of the sum encodes winding order, so the result is taken absolute —
 * callers don't care whether vertices run clockwise.
 *
 * Assumes a sphere, not the WGS-84 ellipsoid. At city scale the difference is
 * ~0.1%, far below the precision anyone reads off this UI, and it keeps the
 * result consistent with Leaflet's own map.distance().
 *
 * Self-intersecting rings are not meaningful here; the formula will return the
 * algebraic sum of the signed lobes rather than anything useful.
 */
export function geodesicArea(latlngs: L.LatLng[]): number {
  const n = latlngs.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = latlngs[i];
    // Wrap so the final edge closes the ring back to the first vertex.
    const p2 = latlngs[(i + 1) % n];
    sum +=
      (p2.lng - p1.lng) *
      DEG_TO_RAD *
      (2 + Math.sin(p1.lat * DEG_TO_RAD) + Math.sin(p2.lat * DEG_TO_RAD));
  }

  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/**
 * Total ground length along a sequence of points, in meters.
 *
 * Delegates each leg to map.distance so line lengths, polygon perimeters and
 * the existing two-point measure tool all agree to the metre — Leaflet's
 * distance() is the single source of truth for ground distance in this app.
 *
 * Pass `close: true` for a polygon, which adds the closing leg from the last
 * vertex back to the first.
 */
export function pathLength(
  latlngs: L.LatLng[],
  map: L.Map,
  close = false
): number {
  if (latlngs.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    total += map.distance(latlngs[i], latlngs[i + 1]);
  }
  if (close) {
    total += map.distance(latlngs[latlngs.length - 1], latlngs[0]);
  }
  return total;
}

/**
 * Compact ground-area label, tiered the same way formatDistance tiers lengths:
 * m² below a hectare, hectares up to a km², then km². Hectares matter here
 * because that's the unit parks and city blocks are usually quoted in.
 */
export function formatArea(squareMeters: number): string {
  if (!isFinite(squareMeters) || squareMeters < 0) return '—';
  if (squareMeters < 10_000) return `${Math.round(squareMeters).toLocaleString()} m²`;
  if (squareMeters < 1_000_000) return `${(squareMeters / 10_000).toFixed(2)} ha`;
  if (squareMeters < 10_000_000) return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
  if (squareMeters < 100_000_000) return `${(squareMeters / 1_000_000).toFixed(1)} km²`;
  return `${Math.round(squareMeters / 1_000_000).toLocaleString()} km²`;
}

/**
 * Move `from` by `distanceM` along a compass `bearingDeg`, on the sphere.
 *
 * Used for two things: placing a circle's radius handle due east of its centre,
 * and re-seating a shape's vertices around a new centre when it is mirrored to
 * the opposite pane. Both need "same ground offset, different origin", which is
 * exactly what a bearing-and-distance step gives.
 */
export function destinationPoint(
  from: L.LatLng,
  distanceM: number,
  bearingDeg: number
): L.LatLng {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = bearingDeg * DEG_TO_RAD;
  const lat1 = from.lat * DEG_TO_RAD;
  const lng1 = from.lng * DEG_TO_RAD;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return L.latLng(lat2 / DEG_TO_RAD, lng2 / DEG_TO_RAD);
}

/**
 * Initial bearing from `from` to `to`, in degrees clockwise from north.
 * The inverse of destinationPoint's bearing argument.
 */
export function bearingBetween(from: L.LatLng, to: L.LatLng): number {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const dLng = (to.lng - from.lng) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return ((Math.atan2(y, x) / DEG_TO_RAD) + 360) % 360;
}
