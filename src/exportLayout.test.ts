import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  exportTitle,
  fitPixelRatio,
  layoutFooter,
  mergeCredits,
  paneCrop,
  wrapText,
} from './exportLayout';

describe('exportFileName', () => {
  it('slugs the title under a mapcompare- prefix', () => {
    expect(exportFileName('Tokyo Bay vs Paris')).toBe('mapcompare-tokyo-bay-vs-paris.png');
  });
  it('drops accents and punctuation, and collapses dashes', () => {
    expect(exportFileName('São Paulo  vs. Zürich!')).toBe('mapcompare-sao-paulo-vs-zurich.png');
  });
  it('falls back to mapcompare.png when nothing is left', () => {
    expect(exportFileName('')).toBe('mapcompare.png');
    expect(exportFileName('東京')).toBe('mapcompare.png');
  });
  it('keeps names to a sensible length', () => {
    const name = exportFileName('a'.repeat(200));
    expect(name.length).toBeLessThanOrEqual('mapcompare-'.length + 60 + '.png'.length);
  });
});

describe('exportTitle', () => {
  it('uses the open comparison’s title, as shown', () => {
    expect(exportTitle('amsterdam vs venice', 'Tokyo', 'Paris')).toBe('Amsterdam vs Venice');
  });
  it('otherwise names the two places', () => {
    expect(exportTitle(null, 'Tokyo', 'Paris')).toBe('Tokyo vs Paris');
  });
});

describe('paneCrop: the part of each map that shows', () => {
  it('splits the width at the divider with no gap or overlap', () => {
    const l = paneCrop('left', 37.3, 1001);
    const r = paneCrop('right', 37.3, 1001);
    expect(l.x).toBe(0);
    expect(r.x).toBe(l.x + l.width);
    expect(l.width + r.width).toBe(1001);
  });
  it('handles the extremes', () => {
    expect(paneCrop('left', 0, 800).width).toBe(0);
    expect(paneCrop('right', 100, 800).width).toBe(0);
  });
});

describe('fitPixelRatio: sharp, but within browser canvas limits', () => {
  it('keeps the screen density when it fits', () => {
    expect(fitPixelRatio(1480, 900, 2)).toBe(2);
  });
  it('lowers it for huge images (iOS Safari caps a canvas at ~16.7M pixels)', () => {
    const r = fitPixelRatio(3000, 2000, 3);
    expect(3000 * r * 2000 * r).toBeLessThanOrEqual(16_777_216);
    expect(r).toBeGreaterThan(1);
  });
  it('never goes above the screen density or below 1', () => {
    expect(fitPixelRatio(100, 100, 1)).toBe(1);
    expect(fitPixelRatio(20000, 20000, 2)).toBe(1);
  });
});

describe('mergeCredits: both maps’ credits, once each', () => {
  it('shows one line when both maps credit the same sources', () => {
    const t = 'Leaflet | Tiles © Esri — Sources: Esri, Maxar';
    expect(mergeCredits([t, ` ${t} `])).toBe(t);
  });
  it('keeps both when they differ', () => {
    expect(mergeCredits(['A © X', 'B © Y'])).toBe('A © X · B © Y');
  });
  it('drops empties', () => {
    expect(mergeCredits(['', 'A'])).toBe('A');
  });
});

// A fake text measurer: every character is 10 px wide.
const measure = (s: string) => s.length * 10;

describe('wrapText', () => {
  it('wraps at spaces and loses no words', () => {
    const lines = wrapText('one two three four five', 100, measure);
    expect(lines.every((l) => measure(l) <= 100)).toBe(true);
    expect(lines.join(' ')).toBe('one two three four five');
  });
  it('breaks a single word longer than the line', () => {
    const lines = wrapText('abcdefghijklmnop', 50, measure);
    expect(lines.join('')).toBe('abcdefghijklmnop');
    expect(lines.every((l) => measure(l) <= 50)).toBe(true);
  });
});

describe('layoutFooter: scale row, then "site | credits"', () => {
  const base = { site: 'navabeetha.github.io/mapcompare', credits: 'Leaflet | Tiles © Esri' };
  it('puts the site first, then " | ", then the credits', () => {
    const f = layoutFooter({ ...base, width: 2000 }, measure);
    expect(f.lines).toEqual(['navabeetha.github.io/mapcompare | Leaflet | Tiles © Esri']);
  });
  it('never drops the credits: they wrap on a narrow image', () => {
    const credits = 'Leaflet | Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics';
    const f = layoutFooter({ ...base, width: 400, credits }, measure);
    expect(f.lines.length).toBeGreaterThan(1);
    expect(f.lines.join(' ')).toBe(`${base.site} | ${credits}`);
  });
  it('grows taller as the bottom row wraps', () => {
    const one = layoutFooter({ ...base, width: 2000 }, measure);
    const many = layoutFooter({ ...base, width: 200 }, measure);
    expect(many.height).toBeGreaterThan(one.height);
  });
});
