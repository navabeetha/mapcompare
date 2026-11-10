/**
 * Export PNG: draws the comparison on screen into one image and downloads it.
 *
 * No screenshot library: we redraw each map's layers onto a canvas in the
 * same order the screen stacks them, using where each element sits on screen
 * (getBoundingClientRect already includes Leaflet's transforms):
 *
 *   map background → satellite tiles (tile pane, z 200)
 *   → MapLibre Map view (tile pane) → labels/borders (labels pane, z 350)
 *   → shapes (SVG, overlay pane, z 400) → scale grid (canvas, z 450)
 *   → measurement labels (HTML tooltips, z 650)
 *
 * The right map is clipped at the divider, as on screen. Buttons, search,
 * zoom, panels and shape handles (HTML markers) are simply never drawn.
 * Then city names, the divider and the footer (exportLayout.ts) go on.
 *
 * Reading pixels back needs every source to allow it (CORS): Esri tiles are
 * loaded with crossOrigin (tileLayers.ts); OpenFreeMap allows it too. A
 * MapLibre (WebGL) canvas is read inside a render; see drawGl.
 */
import L from 'leaflet';
import { LABELS_PANE } from './tileLayers';
import {
  exportFileName,
  fitPixelRatio,
  layoutFooter,
  mergeCredits,
  paneCrop,
  SITE,
  type FooterFont,
  type FooterLayout,
} from './exportLayout';

type Side = 'left' | 'right';

export interface ExportInput {
  /** The element holding both maps (.split-container). */
  container: HTMLElement;
  maps: Record<Side, L.Map>;
  splitPct: number;
  title: string;
  cities: Record<Side, { name: string; country: string }>;
}

/** The app's colours (Mantine dark), so the image matches the screen. */
const C = {
  text: '#f1f3f5',
  dim: '#909296',
  border: '#373a40',
  card: 'rgba(36, 36, 36, 0.88)',
  scale: '#adb5bd',
  divider: '#228be6',
};

export async function exportPng(input: ExportInput): Promise<void> {
  const { container, maps, splitPct, title, cities } = input;
  await waitForMaps([maps.left, maps.right]);

  const box = container.getBoundingClientRect();
  const W = Math.round(box.width);
  const H = Math.round(box.height);
  const family = getComputedStyle(document.body).fontFamily;
  const bg = getComputedStyle(document.body).backgroundColor || '#1f1f1f';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot make images.');

  const fonts: Record<FooterFont, string> = {
    title: `700 16px ${family}`,
    site: `500 12px ${family}`,
    credits: `400 11px ${family}`,
  };
  const measure = (s: string, f: FooterFont) => {
    ctx.font = fonts[f];
    return ctx.measureText(s).width;
  };
  const credits = mergeCredits(
    [...container.querySelectorAll('.leaflet-control-attribution')].map((e) => e.textContent ?? ''),
  );
  const footer = layoutFooter({ width: W, title, site: SITE, credits }, measure);

  const ratio = fitPixelRatio(W, H + footer.height, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round((H + footer.height) * ratio);
  ctx.scale(ratio, ratio);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H + footer.height);

  for (const side of ['left', 'right'] as const) {
    const pane = container.querySelector<HTMLElement>(`.map-pane--${side}`);
    const crop = paneCrop(side, splitPct, W);
    if (!pane || crop.width === 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(crop.x, 0, crop.width, H);
    ctx.clip();
    await drawPane(ctx, pane, maps[side], box);
    drawCityCard(ctx, cities[side], side === 'left' ? 12 : W - 12, side, family);
    ctx.restore();
  }

  // The divider, where the screen's splitter is.
  const at = paneCrop('left', splitPct, W).width;
  if (at > 0 && at < W) {
    ctx.fillStyle = C.divider;
    ctx.fillRect(at - 1, 0, 2, H);
  }

  drawFooter(ctx, footer, { W, H, family, fonts, container, cities });

  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  } catch {
    // A "tainted" canvas: some map image didn't allow being read back.
    throw new Error('The browser blocked reading one of the map images. Reload the page and try again.');
  }
  if (!blob) throw new Error('The image could not be made.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ------------------------------------------------------------ waiting

/** A promise that settles on the event or after `ms`, whichever is first. */
function onceOr(target: { once: (ev: string, fn: () => void) => unknown }, ev: string, ms: number): Promise<void> {
  return new Promise((res) => {
    const t = setTimeout(res, ms);
    target.once(ev, () => {
      clearTimeout(t);
      res();
    });
  });
}

type GlMap = import('maplibre-gl').Map;

/** The MapLibre maps inside a Leaflet map (Map view, labels/borders overlay). */
function glMapsOf(map: L.Map): GlMap[] {
  const out: GlMap[] = [];
  map.eachLayer((l) => {
    const gl = (l as Partial<{ getMaplibreMap: () => GlMap }>).getMaplibreMap?.();
    if (gl) out.push(gl);
  });
  return out;
}

/** Waits (up to a few seconds) for tiles still loading, so none come out blank. */
async function waitForMaps(maps: L.Map[]): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const map of maps) {
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer && l.isLoading()) waits.push(onceOr(l, 'load', 5000));
    });
    for (const gl of glMapsOf(map)) if (!gl.areTilesLoaded()) waits.push(onceOr(gl, 'idle', 5000));
  }
  await Promise.all(waits);
}

// ------------------------------------------------------------ one map

async function drawPane(ctx: CanvasRenderingContext2D, pane: HTMLElement, map: L.Map, box: DOMRect): Promise<void> {
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
  };
  const all = <T extends Element>(sel: string) => [...pane.querySelectorAll<T>(sel)];

  const mapEl = pane.querySelector('.leaflet-container');
  if (mapEl) {
    const r = at(mapEl);
    ctx.fillStyle = getComputedStyle(mapEl).backgroundColor;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // Satellite tiles, including any older zoom level still showing beneath.
  for (const img of all<HTMLImageElement>('.leaflet-tile-pane img.leaflet-tile')) {
    if (!img.complete || img.naturalWidth === 0) continue;
    const alpha = opacityOf(img, pane);
    if (alpha <= 0) continue;
    const r = at(img);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }
  ctx.globalAlpha = 1;

  // MapLibre: the Map view (tile pane), then labels and borders (labels pane).
  // Panes come from Leaflet itself (class names are Leaflet's business).
  const gls = new Map(glMapsOf(map).map((gl) => [gl.getCanvas(), gl] as const));
  for (const paneName of ['tilePane', LABELS_PANE]) {
    for (const c of map.getPane(paneName)?.querySelectorAll('canvas') ?? []) {
      const gl = gls.get(c);
      if (gl) await drawGl(ctx, c, gl, at(c));
    }
  }

  // Shapes (Leaflet's SVG renderer).
  for (const svg of all<SVGSVGElement>('.leaflet-overlay-pane svg')) await drawSvg(ctx, svg, at(svg));

  // Scale grid: a plain 2D canvas.
  for (const c of all<HTMLCanvasElement>('canvas.grid-overlay')) {
    const r = at(c);
    if (c.width && c.height) ctx.drawImage(c, r.x, r.y, r.w, r.h);
  }

  // Measurement labels: HTML, so drawn as pills with the same text and style.
  for (const tip of all<HTMLElement>('.leaflet-tooltip-pane .shape-tip')) drawPill(ctx, tip, at(tip));
}

/** An element's opacity including its ancestors' (Leaflet fades tiles and tile levels). */
function opacityOf(el: Element, stop: Element): number {
  let a = 1;
  for (let n: Element | null = el; n && n !== stop; n = n.parentElement) a *= parseFloat(getComputedStyle(n).opacity || '1');
  return a;
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * A WebGL canvas is cleared after each frame, so read it during a render.
 * This avoids `preserveDrawingBuffer`, which would slow every frame.
 */
function drawGl(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, gl: GlMap, r: Box): Promise<void> {
  if (r.w === 0) return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(res, 1500); // never hang the export on a stalled map
    gl.once('render', () => {
      clearTimeout(t);
      ctx.drawImage(canvas, r.x, r.y, r.w, r.h);
      res();
    });
    gl.triggerRepaint();
  });
}

async function drawSvg(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, r: Box): Promise<void> {
  if (r.w === 0 || r.h === 0 || !svg.querySelector('path')) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(r.w));
  clone.setAttribute('height', String(r.h));
  clone.removeAttribute('style'); // its on-screen transform is already in r
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawPill(ctx: CanvasRenderingContext2D, el: HTMLElement, r: Box): void {
  const cs = getComputedStyle(el);
  ctx.fillStyle = cs.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, parseFloat(cs.borderTopLeftRadius) || 3);
  ctx.fill();
  const size = parseFloat(cs.fontSize) || 11;
  const lineH = parseFloat(cs.lineHeight) || size * 1.4;
  const lines = el.innerText.split('\n').filter(Boolean);
  ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = r.y + r.h / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, r.x + r.w / 2, top + i * lineH));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** City name and country in the top corner, like the on-screen city cards. */
function drawCityCard(
  ctx: CanvasRenderingContext2D,
  city: { name: string; country: string },
  edgeX: number,
  side: Side,
  family: string,
): void {
  const nameFont = `600 14px ${family}`;
  const countryFont = `400 12px ${family}`;
  ctx.font = nameFont;
  const nw = ctx.measureText(city.name).width;
  ctx.font = countryFont;
  const cw = city.country ? ctx.measureText(city.country).width : 0;
  const w = Math.max(nw, cw) + 20;
  const h = city.country ? 46 : 30;
  const x = side === 'left' ? edgeX : edgeX - w;
  const y = 12;
  ctx.fillStyle = C.card;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.text;
  ctx.font = nameFont;
  ctx.fillText(city.name, x + 10, y + 20);
  if (city.country) {
    ctx.fillStyle = C.dim;
    ctx.font = countryFont;
    ctx.fillText(city.country, x + 10, y + 37);
  }
}

// ------------------------------------------------------------ footer

function drawFooter(
  ctx: CanvasRenderingContext2D,
  f: FooterLayout,
  o: {
    W: number;
    H: number;
    family: string;
    fonts: Record<FooterFont, string>;
    container: HTMLElement;
    cities: Record<Side, { name: string; country: string }>;
  },
): void {
  const { W, H, fonts, container, cities, family } = o;
  ctx.fillStyle = C.border;
  ctx.fillRect(0, H, W, 1);

  // Title, and the site address on the right.
  let y = H + f.pad + 16;
  ctx.font = fonts.title;
  ctx.fillStyle = C.text;
  ctx.fillText(f.title, f.pad, y);
  ctx.font = fonts.site;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.fillText(SITE, W - f.pad, y);
  ctx.textAlign = 'left';

  // Each map's scale bars, read from Leaflet's own (so they match the screen).
  const top = H + f.pad + f.titleH + 4;
  for (const side of ['left', 'right'] as const) {
    const lines = [...container.querySelectorAll<HTMLElement>(`.map-pane--${side} .leaflet-control-scale-line`)].map(
      (l) => ({ text: l.textContent ?? '', w: l.offsetWidth }),
    );
    drawScaleBars(ctx, lines, cities[side].name, side, side === 'left' ? f.pad : W - f.pad, top, family);
  }

  // Credits: required, never cut, wrapped by layoutFooter.
  y = H + f.pad + f.titleH + f.scaleH + 11;
  ctx.font = fonts.credits;
  ctx.fillStyle = C.dim;
  for (const line of f.creditLines) {
    ctx.fillText(line, f.pad, y);
    y += f.creditLineH;
  }
}

/** Leaflet-style stacked bars: metric on top, imperial below, labelled with the city. */
function drawScaleBars(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; w: number }[],
  city: string,
  side: Side,
  edgeX: number,
  top: number,
  family: string,
): void {
  if (lines.length === 0) return;
  const barH = 13;
  const maxW = Math.max(...lines.map((l) => l.w));
  ctx.font = `600 12px ${family}`;
  const cityW = ctx.measureText(city).width;
  // Left: "City  [bars]". Right: "[bars]  City".
  const barsX = side === 'left' ? edgeX + cityW + 10 : edgeX - cityW - 10 - maxW;
  ctx.fillStyle = C.text;
  ctx.fillText(city, side === 'left' ? edgeX : edgeX - cityW, top + barH + 4);

  ctx.strokeStyle = C.scale;
  ctx.lineWidth = 1;
  ctx.font = `500 11px ${family}`;
  lines.forEach((l, i) => {
    const x = side === 'left' ? barsX : barsX + (maxW - l.w);
    const y = top + i * barH;
    ctx.beginPath();
    if (i === 0) {
      // Metric: open at the top, like Leaflet.
      ctx.moveTo(x + 0.5, y);
      ctx.lineTo(x + 0.5, y + barH - 0.5);
      ctx.lineTo(x + l.w - 0.5, y + barH - 0.5);
      ctx.lineTo(x + l.w - 0.5, y);
    } else {
      // Imperial: open at the bottom.
      ctx.moveTo(x + 0.5, y + barH);
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.lineTo(x + l.w - 0.5, y + 0.5);
      ctx.lineTo(x + l.w - 0.5, y + barH);
    }
    ctx.stroke();
    ctx.fillStyle = C.scale;
    ctx.fillText(l.text, x + 4, y + barH - 3);
  });
}
