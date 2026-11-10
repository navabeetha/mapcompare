import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { labelsOnlyStyle, withoutLabels } from './labels';

// A cut-down stand-in for the OpenFreeMap "Liberty" style: one of each kind of
// layer the transforms have to tell apart.
const STYLE = {
  version: 8,
  glyphs: 'https://example.test/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://example.test/sprite',
  sources: {
    shaded: { type: 'raster', tiles: ['https://example.test/{z}/{x}/{y}.png'], tileSize: 256 },
    openmaptiles: { type: 'vector', url: 'https://example.test/planet' },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eee' } },
    { id: 'hillshade', type: 'raster', source: 'shaded' },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'road-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: { 'text-field': '{name}' } },
    { id: 'poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', layout: { 'icon-image': 'shop', 'text-field': '{name}' } },
    { id: 'sea-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#469' } },
    { id: 'city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'icon-image': 'dot', 'text-field': '{name}' }, paint: { 'text-color': '#333' } },
    { id: 'country', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': '{name}' } },
  ],
} as unknown as StyleSpecification;

const ids = (s: StyleSpecification) => s.layers.map((l) => l.id);

describe('labelsOnlyStyle: the place names to lay over satellite', () => {
  const out = labelsOnlyStyle(STYLE);

  it('keeps only the place and water names: countries, regions, districts, cities, seas', () => {
    expect(ids(out)).toEqual(['sea-name', 'city', 'country']);
  });

  it('draws no background or ground, so the imagery shows through', () => {
    expect(out.layers.some((l) => l.type !== 'symbol')).toBe(false);
  });

  it('keeps only the sources the labels use', () => {
    expect(Object.keys(out.sources)).toEqual(['openmaptiles']);
  });

  it('drops the dot icons, leaving text only', () => {
    for (const l of out.layers) expect((l.layout as Record<string, unknown> | undefined)?.['icon-image']).toBeUndefined();
  });

  it('uses light text with a dark halo, readable on imagery', () => {
    for (const l of out.layers) {
      const paint = l.paint as Record<string, unknown>;
      expect(paint['text-color']).toBe('#ffffff');
      expect(String(paint['text-halo-color'])).toMatch(/^rgba\(0, ?0, ?0/);
      expect(paint['text-halo-width']).toBeGreaterThan(0);
    }
  });

  it('keeps the font and sprite settings the labels need', () => {
    expect(out.glyphs).toBe(STYLE.glyphs);
  });

  it('does not change the style it was given', () => {
    expect(ids(STYLE)).toHaveLength(9);
    expect((STYLE.layers[7].layout as Record<string, unknown>)['icon-image']).toBe('dot');
  });
});

describe('withoutLabels: the Map view with labels switched off', () => {
  const out = withoutLabels(STYLE);

  it('keeps every drawn layer and removes every label layer', () => {
    expect(ids(out)).toEqual(['background', 'hillshade', 'water', 'road']);
  });

  it('keeps all the sources', () => {
    expect(Object.keys(out.sources)).toEqual(['shaded', 'openmaptiles']);
  });
});
