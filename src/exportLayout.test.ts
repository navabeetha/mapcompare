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

describe('layoutFooter: scale row, then [logo] MapCompare + link on the left, credits on the right', () => {
  const base = { brand: 'MapCompare', site: 'navabeetha.github.io/mapcompare', logo: 14, credits: 'Leaflet | Tiles © Esri' };
  // With the fake 10 px-per-character measure: brand block = 14 + 6 + 100 + 8 + 310 = 438 px.

  it('wide: the credits sit on the brand row, at the right', () => {
    const f = layoutFooter({ ...base, width: 2000 }, measure);
    expect(f.creditsBeside).toBe(true);
    expect(f.creditLines).toEqual(['Leaflet | Tiles © Esri']);
  });

  it('medium: long credits wrap within the right-hand column, never over the brand', () => {
    const credits = 'Leaflet | Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, OpenFreeMap © OpenStreetMap contributors';
    const f = layoutFooter({ ...base, width: 1000, credits }, measure);
    expect(f.creditsBeside).toBe(true);
    expect(f.creditLines.length).toBeGreaterThan(1);
    expect(f.creditLines.every((l) => measure(l) <= f.creditWidth)).toBe(true);
    expect(f.brandWidth + f.gap + f.creditWidth).toBeLessThanOrEqual(1000 - 2 * f.pad);
    expect(f.creditLines.join(' ')).toBe(credits);
  });

  it('narrow: the credits move below the brand row and use the full width', () => {
    const credits = 'Leaflet | Tiles © Esri — Sources: Esri, Maxar';
    const f = layoutFooter({ ...base, width: 560, credits }, measure);
    expect(f.creditsBeside).toBe(false);
    expect(f.creditLines.join(' ')).toBe(credits);
  });

  it('grows taller as the credits need more lines', () => {
    const one = layoutFooter({ ...base, width: 2000 }, measure);
    const many = layoutFooter({ ...base, width: 400, credits: 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(4) }, measure);
    expect(many.height).toBeGreaterThan(one.height);
  });
});

import { imageInfo } from './exportLayout';

describe('imageInfo: the line under the Share preview', () => {
  it('gives format, pixel size and file size', () => {
    expect(imageInfo(3024, 1754, 1_234_567)).toBe('PNG · 3024 × 1754 px · 1.2 MB');
  });
  it('uses KB under a megabyte', () => {
    expect(imageInfo(800, 600, 245_000)).toBe('PNG · 800 × 600 px · 239 KB');
  });
});

import { shareLink } from './exportLayout';

describe('shareLink: the public link to an Explore comparison', () => {
  it('opens the public site on that comparison', () => {
    expect(shareLink('abc-123')).toBe('https://navabeetha.github.io/mapcompare/?project=abc-123');
  });
  it('encodes ids safely', () => {
    expect(shareLink('a b&c')).toBe('https://navabeetha.github.io/mapcompare/?project=a%20b%26c');
  });
});
