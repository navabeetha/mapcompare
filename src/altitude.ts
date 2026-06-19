const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const TILE_SIZE_PX = 256;
const FOV_DEG = 35; // matches Google Earth's default field-of-view

const DEG_TO_RAD = Math.PI / 180;

export function metersPerPixel(zoom: number, latitudeDeg: number): number {
  return (
    (Math.cos(latitudeDeg * DEG_TO_RAD) * EARTH_CIRCUMFERENCE_M) /
    (TILE_SIZE_PX * Math.pow(2, zoom))
  );
}

/**
 * Eye altitude that, with FOV_DEG vertical field-of-view, would frame the
 * given viewport height at the current scale. The metric is symmetric across
 * scale-synced panes since it only depends on m/px and the shared viewport.
 */
export function eyeAltitudeMeters(
  zoom: number,
  latitudeDeg: number,
  viewportHeightPx: number
): number {
  const mPerPx = metersPerPixel(zoom, latitudeDeg);
  const fovRad = FOV_DEG * DEG_TO_RAD;
  return (viewportHeightPx * mPerPx) / (2 * Math.tan(fovRad / 2));
}

/** Compact ground-distance label, e.g. "850 m", "1.2 km", "37 km". */
export function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters < 0) return '—';
  if (meters < 1_000) return `${Math.round(meters)} m`;
  if (meters < 10_000) return `${(meters / 1_000).toFixed(2)} km`;
  if (meters < 100_000) return `${(meters / 1_000).toFixed(1)} km`;
  return `${Math.round(meters / 1_000).toLocaleString()} km`;
}

export function formatAltitude(meters: number): string {
  if (!isFinite(meters) || meters <= 0) return '—';
  if (meters < 1_000) return `${Math.round(meters)} m`;
  if (meters < 10_000) return `${(meters / 1_000).toFixed(2)} km`;
  if (meters < 100_000) return `${(meters / 1_000).toFixed(1)} km`;
  if (meters < 10_000_000) {
    return `${Math.round(meters / 1_000).toLocaleString()} km`;
  }
  return `${(meters / 1_000_000).toFixed(1)} Mm`;
}
