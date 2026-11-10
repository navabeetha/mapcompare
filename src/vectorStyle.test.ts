import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  ALL_BORDER_LEVELS,
  bordersLayers,
  labelsOnlyStyle,
  mapViewStyle,
  overlayStyle,
  withoutLabels,
} from './vectorStyle';

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
    // Liberty's own border layers: country lines, state lines, disputed lines.
    { id: 'boundary_2', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2] },
    { id: 'boundary_3', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['>=', ['get', 'admin_level'], 3] },
    { id: 'boundary_disputed', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['==', ['get', 'disputed'], 1] },
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
    expect(ids(STYLE)).toHaveLength(12);
    expect((STYLE.layers.find((l) => l.id === 'city')!.layout as Record<string, unknown>)['icon-image']).toBe('dot');
  });
});

describe('withoutLabels: the Map view with labels switched off', () => {
  const out = withoutLabels(STYLE);

  it('keeps every drawn layer and removes every label layer', () => {
    expect(ids(out)).toEqual(['background', 'hillshade', 'water', 'road', 'boundary_2', 'boundary_3', 'boundary_disputed']);
  });

  it('keeps all the sources', () => {
    expect(Object.keys(out.sources)).toEqual(['shaded', 'openmaptiles']);
  });
});

// ---------------------------------------------------------------- borders
// MapCompare never draws country borders (admin_level 2), disputed lines,
// claimed lines or sea borders, in any view. That is a deliberate stand.

/** Every filter expression in the output, flattened to one string to search. */
const filtersOf = (layers: StyleSpecification['layers']) => layers.map((l) => JSON.stringify((l as { filter?: unknown }).filter));
const boundaryLayers = (s: StyleSpecification) =>
  s.layers.filter((l) => (l as { 'source-layer'?: string })['source-layer'] === 'boundary');

describe('bordersLayers', () => {
  const all = bordersLayers(ALL_BORDER_LEVELS, 'light');

  it('draws one or more line layers per chosen group, on the boundary data', () => {
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const l of all) {
      expect(l.type).toBe('line');
      expect((l as { 'source-layer'?: string })['source-layer']).toBe('boundary');
    }
  });

  it('never matches country borders, disputed, claimed or sea lines', () => {
    for (const f of filtersOf(all)) {
      expect(f).toContain('"disputed"');
      expect(f).toContain('"claimed_by"');
      expect(f).toContain('"maritime"');
      // admin_level ranges start at 3 or higher, so level 2 never matches
      const mins = [...f.matchAll(/">=",\["get","admin_level"\],(\d+)/g)].map((m) => Number(m[1]));
      expect(mins.length).toBeGreaterThan(0);
      for (const m of mins) expect(m).toBeGreaterThanOrEqual(3);
    }
  });

  it('picks the admin levels of each group', () => {
    const states = filtersOf(bordersLayers(['states'], 'light')).join();
    const districts = filtersOf(bordersLayers(['districts'], 'light')).join();
    const cities = filtersOf(bordersLayers(['cities'], 'light')).join();
    expect(states).toMatch(/">=",\["get","admin_level"\],3\].*"<=",\["get","admin_level"\],4\]/);
    expect(districts).toMatch(/">=",\["get","admin_level"\],5\].*"<=",\["get","admin_level"\],6\]/);
    expect(cities).toMatch(/">=",\["get","admin_level"\],7\].*"<=",\["get","admin_level"\],8\]/);
  });

  it('draws nothing for no groups', () => {
    expect(bordersLayers([], 'light')).toEqual([]);
  });

  it('uses light lines over satellite and darker ones on the map', () => {
    const colour = (l: StyleSpecification['layers'][number]) => (l.paint as Record<string, unknown>)['line-color'];
    expect(bordersLayers(['states'], 'light').map(colour)).toContain('#ffffff');
    expect(bordersLayers(['states'], 'dark').map(colour)).not.toContain('#ffffff');
  });
});

describe('overlayStyle: what goes over satellite', () => {
  it('labels only, as before, when borders are off', () => {
    expect(ids(overlayStyle(STYLE, { labels: true, borders: [] }))).toEqual(ids(labelsOnlyStyle(STYLE)));
  });

  it('borders only, with no labels, when labels are off', () => {
    const out = overlayStyle(STYLE, { labels: false, borders: ['states'] });
    expect(out.layers.every((l) => l.type === 'line')).toBe(true);
    expect(out.layers.length).toBeGreaterThan(0);
  });

  it('puts the borders under the labels', () => {
    const out = overlayStyle(STYLE, { labels: true, borders: ALL_BORDER_LEVELS });
    const lastLine = out.layers.map((l) => l.type).lastIndexOf('line');
    const firstSymbol = out.layers.findIndex((l) => l.type === 'symbol');
    expect(lastLine).toBeLessThan(firstSymbol);
  });

  it('never includes the style\'s own country or disputed lines', () => {
    const out = overlayStyle(STYLE, { labels: true, borders: ALL_BORDER_LEVELS });
    expect(ids(out)).not.toContain('boundary_2');
    expect(ids(out)).not.toContain('boundary_disputed');
  });
});

describe('mapViewStyle: the Map view', () => {
  it('drops every one of the style\'s own border layers, even with borders off', () => {
    const out = mapViewStyle(STYLE, { labels: true, borders: [] });
    expect(boundaryLayers(out)).toEqual([]);
    expect(ids(out)).toContain('road');
  });

  it('adds our borders, dark, below the first label layer', () => {
    const out = mapViewStyle(STYLE, { labels: true, borders: ['states'] });
    const ours = boundaryLayers(out);
    expect(ours.length).toBeGreaterThan(0);
    const lastBorder = out.layers.lastIndexOf(ours[ours.length - 1]);
    const firstSymbol = out.layers.findIndex((l) => l.type === 'symbol');
    expect(lastBorder).toBeLessThan(firstSymbol);
  });

  it('strips labels when they are off, as before', () => {
    const out = mapViewStyle(STYLE, { labels: false, borders: [] });
    expect(out.layers.some((l) => l.type === 'symbol')).toBe(false);
  });

  it('does not change the style it was given', () => {
    mapViewStyle(STYLE, { labels: false, borders: ALL_BORDER_LEVELS });
    expect(ids(STYLE)).toContain('boundary_2');
  });
});
