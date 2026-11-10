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
import { niceNumber } from './GridLayer';

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
const FOOT = 0.3048;
const MILE = 1609.344;

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
  const meters = gridPx >= MIN_PX && gridPx <= MAX_PX ? gridStepMeters : auto;

  const feet = (mpp * TARGET_PX) / FOOT;
  const imperial: ScaleStep =
    feet > 5280
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
