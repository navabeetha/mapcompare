import { describe, expect, it } from 'vitest';
import { gridIsDrawable, gridSystemOf, gridUnitFor, MIN_CELL_PX, toMeters, validateCell } from './gridUnits';
import { harmonizedScale } from './scaleBar';

describe('gridIsDrawable: the guard that stops the freeze', () => {
  it('regression: 5 m cells at ~20 m per pixel are a quarter pixel wide, so nothing is drawn', () => {
    expect(gridIsDrawable(5 / 20)).toBe(false);
  });
  it('draws normal cells', () => {
    expect(gridIsDrawable(100)).toBe(true);
    expect(gridIsDrawable(MIN_CELL_PX)).toBe(true);
  });
  it('rejects nonsense', () => {
    expect(gridIsDrawable(0)).toBe(false);
    expect(gridIsDrawable(NaN)).toBe(false);
    expect(gridIsDrawable(Infinity)).toBe(false);
  });
});

describe('gridUnitFor: m/km and ft/mi follow the zoom', () => {
  it('metric: m when zoomed in, km when zoomed out', () => {
    expect(gridUnitFor('metric', 2)).toBe('m'); // ~200 m cells
    expect(gridUnitFor('metric', 20)).toBe('km'); // ~2 km cells
  });
  it('imperial: ft when zoomed in, mi when zoomed out', () => {
    expect(gridUnitFor('imperial', 2)).toBe('ft');
    expect(gridUnitFor('imperial', 20)).toBe('mi');
  });
});

describe('toMeters', () => {
  it('converts each unit', () => {
    expect(toMeters(2, 'km')).toBe(2000);
    expect(toMeters(250, 'm')).toBe(250);
    expect(toMeters(1, 'mi')).toBeCloseTo(1609.344, 6);
    expect(toMeters(500, 'ft')).toBeCloseTo(152.4, 6);
  });
});

describe('validateCell: refuse a length too small to see at this zoom', () => {
  it('rejects 5 m at ~20 m per pixel and names the smallest that works', () => {
    expect(validateCell(5, 'm', 20)).toMatch(/at least/);
  });
  it('accepts a length that makes visible cells', () => {
    expect(validateCell(2, 'km', 20)).toBeNull();
    expect(validateCell(1, 'mi', 20)).toBeNull();
  });
  it('rejects empty, zero and negative', () => {
    expect(validateCell(0, 'km', 20)).not.toBeNull();
    expect(validateCell(-1, 'km', 20)).not.toBeNull();
    expect(validateCell(NaN, 'km', 20)).not.toBeNull();
  });
});

describe('gridSystemOf: a fixed length set in miles or feet stays imperial', () => {
  it('reads whole feet that are not whole metres as imperial', () => {
    expect(gridSystemOf(toMeters(1, 'mi'))).toBe('imperial');
    expect(gridSystemOf(toMeters(500, 'ft'))).toBe('imperial');
  });
  it('reads metric lengths as metric', () => {
    expect(gridSystemOf(2000)).toBe('metric');
    expect(gridSystemOf(250)).toBe('metric');
  });
});

describe('harmonizedScale with an imperial grid', () => {
  it('the mi bar matches a grid set in miles; the km bar stays a round automatic one', () => {
    const s = harmonizedScale({ mpp: 20, gridStepMeters: toMeters(1, 'mi') });
    expect(s.imperial.label).toBe('1 mi');
    expect(s.imperial.meters).toBeCloseTo(1609.344, 6);
    expect(s.metric).toEqual({ meters: 2000, label: '2 km' });
  });
});
