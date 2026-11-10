import L from 'leaflet';
import { barWidthPx, type HarmonizedScale } from './scaleBar';

/**
 * Stands in for Leaflet's scale control, with the distances chosen by App
 * (scaleBar.ts) so both maps show the same round numbers as each other and
 * as the grid. Each map draws them at its own scale. Same class names as
 * Leaflet's control, so the styling and Share's image export pick it up.
 */
export class HarmonizedScaleControl extends L.Control {
  private metricEl: HTMLDivElement | null = null;
  private imperialEl: HTMLDivElement | null = null;

  onAdd(): HTMLElement {
    const box = L.DomUtil.create('div', 'leaflet-control-scale');
    this.metricEl = L.DomUtil.create('div', 'leaflet-control-scale-line', box);
    this.imperialEl = L.DomUtil.create('div', 'leaflet-control-scale-line', box);
    return box;
  }

  /** `mpp`: this map's metres per pixel at its centre. */
  set(scale: HarmonizedScale, mpp: number): void {
    if (!this.metricEl || !this.imperialEl || !(mpp > 0)) return;
    this.metricEl.textContent = scale.metric.label;
    this.metricEl.style.width = `${Math.round(barWidthPx(scale.metric, mpp))}px`;
    this.imperialEl.textContent = scale.imperial.label;
    this.imperialEl.style.width = `${Math.round(barWidthPx(scale.imperial, mpp))}px`;
  }
}
