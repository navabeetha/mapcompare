import { describe, expect, it } from 'vitest';
import { barWidthPx, formatMetric, harmonizedScale } from './scaleBar';

describe('formatMetric', () => {
  it('uses metres under a kilometre and km above', () => {
    expect(formatMetric(500)).toBe('500 m');
    expect(formatMetric(2000)).toBe('2 km');
    expect(formatMetric(20000)).toBe('20 km');
    expect(formatMetric(1000)).toBe('1 km');
  });
});

describe('harmonizedScale: one distance for both maps’ bars and the grid', () => {
  // ~20 m per pixel: the auto grid step at ~100 px is 2 km.
  const mpp = 20;

  it('the km bar is the grid’s cell length when the grid is automatic', () => {
    const s = harmonizedScale({ mpp, gridStepMeters: 2000 });
    expect(s.metric).toEqual({ meters: 2000, label: '2 km' });
  });

  it('follows a fixed grid length the author set, while it makes a readable bar', () => {
    const s = harmonizedScale({ mpp, gridStepMeters: 3000 }); // 150 px
    expect(s.metric).toEqual({ meters: 3000, label: '3 km' });
  });

  it('falls back to the automatic length when a fixed one would be unreadable', () => {
    expect(harmonizedScale({ mpp, gridStepMeters: 100 }).metric.meters).toBe(2000); // 5 px: too short
    expect(harmonizedScale({ mpp, gridStepMeters: 50_000 }).metric.meters).toBe(2000); // 2500 px: too long
  });

  it('gives a round imperial length: feet when short, miles when long', () => {
    expect(harmonizedScale({ mpp, gridStepMeters: 2000 }).imperial.label).toBe('1 mi');
    const close = harmonizedScale({ mpp: 1, gridStepMeters: 100 });
    expect(close.imperial.label).toBe('200 ft');
    expect(close.imperial.meters).toBeCloseTo(200 * 0.3048, 6);
  });

  it('is the same for both maps: the labels come from one call, only bar widths differ', () => {
    const s = harmonizedScale({ mpp, gridStepMeters: 2000 });
    // Same ground distance, drawn at each map's own scale.
    expect(barWidthPx(s.metric, 20)).toBe(100);
    expect(barWidthPx(s.metric, 20.4)).toBeCloseTo(98.04, 2);
  });
});
