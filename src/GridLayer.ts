import { metersPerPixel } from './altitude';
import { gridIsDrawable, niceNumber } from './gridUnits';

const TARGET_PX_SPACING = 100;
const CHECKER_ALPHA = 0.1;

/**
 * Single source of truth for the on-screen grid cell size. Computed once
 * (from a canonical zoom+lat, normally the left pane's) and reused on both
 * panes so the two checkerboards always match exactly. Returns both the
 * on-screen pixel size and the ground distance (meters) it represents.
 */
export function computeGridStep(
  zoom: number,
  latitudeDeg: number
): { stepPx: number; stepMeters: number } {
  const mPerPx = metersPerPixel(zoom, latitudeDeg);
  if (!isFinite(mPerPx) || mPerPx <= 0) {
    return { stepPx: 100, stepMeters: 100 };
  }
  const stepMeters = niceNumber(mPerPx * TARGET_PX_SPACING);
  return { stepPx: stepMeters / mPerPx, stepMeters };
}

export function computeGridStepPx(zoom: number, latitudeDeg: number): number {
  return computeGridStep(zoom, latitudeDeg).stepPx;
}

/**
 * Draws a checkerboard over the canvas, anchored at the pane center. "Light"
 * cells (where col+row is even) get a faint white fill; "dark" cells stay
 * transparent so the map shows through.
 */
export function drawScaleGrid(canvas: HTMLCanvasElement, stepPx: number): void {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Too fine to see: draw nothing rather than millions of sub-pixel cells
  // (a 5 m grid while zoomed out froze the page).
  if (!gridIsDrawable(stepPx)) return;

  const cx = cssWidth / 2;
  const cy = cssHeight / 2;

  const minCol = Math.floor((0 - cx) / stepPx);
  const maxCol = Math.ceil((cssWidth - cx) / stepPx);
  const minRow = Math.floor((0 - cy) / stepPx);
  const maxRow = Math.ceil((cssHeight - cy) / stepPx);

  ctx.fillStyle = `rgba(255, 255, 255, ${CHECKER_ALPHA})`;

  for (let col = minCol; col < maxCol; col++) {
    for (let row = minRow; row < maxRow; row++) {
      if (((col + row) & 1) !== 0) continue;
      const x = cx + col * stepPx;
      const y = cy + row * stepPx;
      ctx.fillRect(x, y, stepPx, stepPx);
    }
  }
}
