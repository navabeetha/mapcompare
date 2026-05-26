const DEG_TO_RAD = Math.PI / 180;

/**
 * Latitude-corrected zoom: returns the zoom level at `targetLat` that yields
 * the same meters-per-pixel as `sourceZoom` at `sourceLat`.
 *
 *   metersPerPixel(z, lat) = (cos(lat) * 2πR) / (256 * 2^z)
 *
 * Solving for equal scale across two latitudes:
 *   targetZoom = sourceZoom + log2(cos(targetLat) / cos(sourceLat))
 */
export function compensatedZoom(
  sourceZoom: number,
  sourceLat: number,
  targetLat: number
): number {
  const sourceCos = Math.cos(sourceLat * DEG_TO_RAD);
  const targetCos = Math.cos(targetLat * DEG_TO_RAD);
  if (sourceCos <= 0 || targetCos <= 0) return sourceZoom;
  return sourceZoom + Math.log2(targetCos / sourceCos);
}
