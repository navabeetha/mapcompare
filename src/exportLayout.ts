/**
 * The pure half of Export PNG: names, crops, sizes and the footer layout.
 * `exportImage.ts` does the drawing, from the maps on screen.
 *
 * Footer layout (CSS px; the drawer scales it to the image's pixel ratio):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Title (bold)                      navabeetha.github.io/... │
 *   │ Tokyo  [3 km |1 mi]                    [2 km |1 mi]  Paris │
 *   │ Leaflet | Tiles © Esri — … © OpenStreetMap contributors    │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The credits row is never dropped or cut: OpenStreetMap's licence and Esri's
 * terms require attribution on images of their maps too. It wraps instead.
 */
import { displayTitle } from './projects';

export const SITE = 'navabeetha.github.io/mapcompare';

/** `mapcompare-tokyo-bay-vs-paris.png`; plain `mapcompare.png` if nothing usable is left. */
export function exportFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents, split off by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug ? `mapcompare-${slug}.png` : 'mapcompare.png';
}

/** The open comparison's name, or "Left vs Right". */
export function exportTitle(openTitle: string | null | undefined, left: string, right: string): string {
  return displayTitle(openTitle?.trim() ? openTitle : `${left} vs ${right}`);
}

/**
 * The visible strip of one map, in CSS px across the window: the left map
 * up to the divider, the right one after it. The two always add up to the
 * full width.
 */
export function paneCrop(side: 'left' | 'right', splitPct: number, width: number): { x: number; width: number } {
  const at = Math.round((Math.min(100, Math.max(0, splitPct)) / 100) * width);
  return side === 'left' ? { x: 0, width: at } : { x: at, width: width - at };
}

/** iOS Safari's canvas limit (4096²); desktop browsers allow more. */
const MAX_AREA = 16_777_216;
const MAX_SIDE = 16_384;

/** The screen's pixel ratio, lowered only if the image would be too big for a canvas. */
export function fitPixelRatio(width: number, height: number, dpr: number): number {
  let r = Math.max(1, dpr);
  r = Math.min(r, Math.sqrt(MAX_AREA / (width * height)), MAX_SIDE / width, MAX_SIDE / height);
  // Rounded down, so float error can't tip the area over the limit.
  return Math.max(1, Math.floor(r * 1000) / 1000);
}

/** Both maps' credit lines, each said once. */
export function mergeCredits(texts: string[]): string {
  const seen: string[] = [];
  for (const t of texts.map((s) => s.trim()).filter(Boolean)) if (!seen.includes(t)) seen.push(t);
  return seen.join(' · ');
}

/** Greedy word wrap. A word wider than the line is broken across lines. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  const pushWord = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = '';
    // A word too wide for a line on its own: break it by characters.
    let chunk = '';
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    line = chunk;
  };
  for (const w of text.split(/\s+/).filter(Boolean)) pushWord(w);
  if (line) lines.push(line);
  return lines;
}

export type FooterFont = 'title' | 'site' | 'credits';

export interface FooterLayout {
  pad: number;
  gap: number;
  title: string;
  titleH: number;
  scaleH: number;
  creditLines: string[];
  creditLineH: number;
  height: number;
}

export function layoutFooter(
  f: { width: number; title: string; site: string; credits: string },
  measure: (s: string, font: FooterFont) => number,
): FooterLayout {
  const pad = 16;
  const gap = 24;
  const titleH = 24;
  const scaleH = 34;
  const creditLineH = 15;
  const inner = f.width - 2 * pad;

  // The title gives way to the site address, never the other way round.
  const room = inner - gap - measure(f.site, 'site');
  let title = f.title;
  if (measure(title, 'title') > room) {
    while (title && measure(title + '…', 'title') > room) title = title.slice(0, -1);
    title = title.trimEnd() + '…';
  }

  const creditLines = wrapText(f.credits, inner, (s) => measure(s, 'credits'));
  const height = pad + titleH + scaleH + creditLines.length * creditLineH + pad;
  return { pad, gap, title, titleH, scaleH, creditLines, creditLineH, height };
}
