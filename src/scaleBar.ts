/**
 * Harmonised scale bars: both maps show the SAME round distance, and the km
 * bar matches the scale grid's cell length, so the bars, the grid and the two
 * maps all read alike. Leaflet's own scale control picks a round number per
 * map, so near a rounding edge one map said "3 km" and the other "2 km".
 *
 * The distance is chosen once (from the same reference as the grid, the left
 * map); each map then draws it at its own scale (barWidthPx), so the bar
 * lengths stay true even if the two scales differ slightly.
 */
import { FOOT, formatImperial, gridSystemOf, MILE, niceNumber } from './gridUnits';

export interface ScaleStep {
  meters: number;
  label: string;
}

export interface HarmonizedScale {
  metric: ScaleStep;
  imperial: ScaleStep;
}

/** Bars outside this width (px) are too short to read or too long to fit. */
const MIN_PX = 40;
const MAX_PX = 240;
/** Same target as the grid's automatic cell size. */
const TARGET_PX = 100;

export function formatMetric(meters: number): string {
  return meters >= 1000 ? `${+(meters / 1000).toFixed(3)} km` : `${+meters.toFixed(3)} m`;
}

/**
 * @param mpp metres per pixel of the reference map (the grid's: left map's centre)
 * @param gridStepMeters the grid's current cell length (automatic or set by the author)
 */
export function harmonizedScale({ mpp, gridStepMeters }: { mpp: number; gridStepMeters: number }): HarmonizedScale {
  const auto = niceNumber(mpp * TARGET_PX);
  const gridPx = gridStepMeters / mpp;
  const readable = gridPx >= MIN_PX && gridPx <= MAX_PX;
  // A grid set in mi or ft lines up with the imperial bar; otherwise the km bar.
  const imperialGrid = readable && gridSystemOf(gridStepMeters) === 'imperial';
  const meters = readable && !imperialGrid ? gridStepMeters : auto;

  const feet = (mpp * TARGET_PX) / FOOT;
  const imperial: ScaleStep = imperialGrid
    ? { meters: gridStepMeters, label: formatImperial(gridStepMeters) }
    : feet > 5280
      ? (() => {
          const mi = niceNumber(feet / 5280);
          return { meters: mi * MILE, label: `${mi} mi` };
        })()
      : (() => {
          const ft = niceNumber(feet);
          return { meters: ft * FOOT, label: `${ft} ft` };
        })();

  return { metric: { meters, label: formatMetric(meters) }, imperial };
}

/** The bar's length on one map, at that map's own metres per pixel. */
export function barWidthPx(step: ScaleStep, mpp: number): number {
  return step.meters / mpp;
}
