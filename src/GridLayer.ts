import L from 'leaflet';

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const TILE_SIZE_PX = 256;
const TARGET_PX_SPACING = 100;

function niceNumber(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exp);
  let nice: number;
  if (fraction < 1.5) nice = 1;
  else if (fraction < 3.5) nice = 2;
  else if (fraction < 7.5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

class ScaleGridLayer extends L.GridLayer {
  constructor() {
    super({ pane: 'overlayPane' });
  }

  createTile(coords: L.Coords): HTMLElement {
    const canvas = document.createElement('canvas');
    const tileSize = this.getTileSize();
    canvas.width = tileSize.x;
    canvas.height = tileSize.y;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Get the map this layer is attached to (internal Leaflet field).
    const map = (this as unknown as { _map: L.Map | null })._map;
    if (!map) return canvas;

    // World-pixel position of this tile's top-left corner at coords.z.
    const tileWorldNw = coords.scaleBy(tileSize);
    const nwLatLng = map.unproject(tileWorldNw, coords.z);
    const seLatLng = map.unproject(tileWorldNw.add(tileSize), coords.z);
    const centerLat = (nwLatLng.lat + seLatLng.lat) / 2;

    const mPerPx =
      (Math.cos((centerLat * Math.PI) / 180) * EARTH_CIRCUMFERENCE_M) /
      (TILE_SIZE_PX * Math.pow(2, coords.z));

    const targetMeters = mPerPx * TARGET_PX_SPACING;
    const stepMeters = niceNumber(targetMeters);
    const stepPx = stepMeters / mPerPx;
    if (!isFinite(stepPx) || stepPx <= 0) return canvas;

    // Align the first lines to world-pixel multiples of stepPx so adjacent
    // tiles' lines connect seamlessly.
    const firstX = Math.ceil(tileWorldNw.x / stepPx) * stepPx - tileWorldNw.x;
    const firstY = Math.ceil(tileWorldNw.y / stepPx) * stepPx - tileWorldNw.y;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = firstX; x < tileSize.x; x += stepPx) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, tileSize.y);
    }
    for (let y = firstY; y < tileSize.y; y += stepPx) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(tileSize.x, py);
    }

    ctx.stroke();
    return canvas;
  }
}

export function createScaleGridLayer(): L.GridLayer {
  return new ScaleGridLayer();
}
