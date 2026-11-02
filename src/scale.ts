const DEG_TO_RAD = Math.PI / 180;

/**
 * Cosine below which a latitude counts as "at the pole" and no meaningful scale
 * correction exists.
 *
 * Testing `cos <= 0` is not enough: Math.cos(90 * DEG_TO_RAD) is 6.1e-17 rather
 * than exactly 0, so an exact pole slipped past that guard and produced a wildly
 * negative zoom (log2 of ~1e-16) instead of the intended fallback. Real use
 * never comes close — Web Mercator stops at ±85.05°, where the cosine is 0.086.
 */
const MIN_COS = 1e-6;

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
  if (sourceCos < MIN_COS || targetCos < MIN_COS) return sourceZoom;
  return sourceZoom + Math.log2(targetCos / sourceCos);
}
