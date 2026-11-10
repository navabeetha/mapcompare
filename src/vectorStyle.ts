/**
 * Map labels and borders from OpenFreeMap (OpenStreetMap data, free, no key).
 *
 * OpenFreeMap serves vector tiles plus a full map style, "Liberty". We use it two
 * ways, both cut from the same style:
 *   - Map view: the full style, minus its label layers when labels are off.
 *   - Satellite view with labels on: only the place and water names, restyled as
 *     light text with a dark halo, laid over the Esri imagery.
 *
 * Doing this on vector data, not ready-made label pictures, is what lets us
 * change labels later: which kinds show, their colours, size or language.
 * That's the hook for customising labels.
 *
 * Pure functions on the style JSON. The Leaflet side is in tileLayers.ts.
 */
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

/**
 * The kinds of label shown over satellite. `place` covers countries, states and
 * regions, cities, towns, villages and districts; `water_name` covers seas, lakes
 * and bays. Roads, shops and transit are left out, because they crowd imagery.
 */
const LABEL_SOURCE_LAYERS = new Set(['place', 'water_name']);

const sourceLayerOf = (l: LayerSpecification): string | undefined =>
  (l as { 'source-layer'?: string })['source-layer'];

/** Only the place and water names, as light text that reads on imagery. */
export function labelsOnlyStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    .filter((l) => l.type === 'symbol' && LABEL_SOURCE_LAYERS.has(sourceLayerOf(l) ?? ''))
    .map((l) => {
      // Text only: the town and city dots look like stray specks on imagery.
      const { 'icon-image': _icon, ...layout } = (l.layout ?? {}) as Record<string, unknown>;
      return {
        ...l,
        layout,
        paint: {
          ...(l.paint ?? {}),
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.75)',
          'text-halo-width': 1.4,
          'text-halo-blur': 0.5,
        },
      } as LayerSpecification;
    });

  const used = new Set(layers.map((l) => (l as { source?: string }).source));
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([id]) => used.has(id)));
  return { ...style, sources, layers };
}

/** The full map with every label layer removed. */
export function withoutLabels(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.filter((l) => l.type !== 'symbol') };
}

// ---------------------------------------------------------------- borders

/**
 * Border groups in the Layers menu. OpenStreetMap's admin_level means different
 * things in different countries, so these are loose groups:
 *   - countries: 2 (national borders), minus disputed and claimed ones
 *   - states:    3–4 (states, provinces, regions)
 *   - districts: 5–6 (districts, counties, departments)
 *   - cities:    7–8 (cities, municipalities); only where mapped, close in
 */
export type BorderLevel = 'countries' | 'states' | 'districts' | 'cities';
export const ALL_BORDER_LEVELS: BorderLevel[] = ['countries', 'states', 'districts', 'cities'];

/**
 * Left out of every solid border line: disputed lines, lines one country
 * claims, and sea borders. Disputed and claimed *land* borders between
 * countries get their own dotted, fainter layer instead (DISPUTED_LAND, with
 * the Countries group), so the map shows that a border is contested without
 * drawing it as settled. Gibraltar–Spain is one: OpenStreetMap tags it
 * disputed, claimed by GB. Sea borders are never drawn.
 *
 * "Disputed" is what OpenStreetMap's mappers have tagged (OpenMapTiles'
 * `disputed` and `claimed_by`), so it's only as complete as that tagging.
 * A state line that runs along a national border is stored once, as level 2,
 * so it shows with the Countries group, not States.
 */
const EXCLUDED = [
  ['==', ['typeof', ['get', 'admin_level']], 'number'],
  ['!=', ['get', 'disputed'], 1],
  ['!', ['has', 'claimed_by']],
  ['!=', ['get', 'maritime'], 1],
];

/** Disputed or claimed land borders between countries: the dotted layer. */
const DISPUTED_LAND = [
  'all',
  ['==', ['get', 'admin_level'], 2],
  ['any', ['==', ['get', 'disputed'], 1], ['has', 'claimed_by']],
  ['!=', ['get', 'maritime'], 1],
];

interface GroupLook {
  min: number;
  max: number;
  /** MapLibre zoom (one less than Leaflet's) below which the group is hidden. */
  minzoom?: number;
  width: [number, number]; // at MapLibre zoom 3 and 12
  dash?: number[];
}

const GROUPS: Record<BorderLevel, GroupLook> = {
  countries: { min: 2, max: 2, width: [1, 2.6] },
  states: { min: 3, max: 4, width: [0.8, 2] },
  districts: { min: 5, max: 6, minzoom: 5, width: [0.6, 1.4], dash: [3, 2] },
  cities: { min: 7, max: 8, minzoom: 10, width: [0.6, 1.2], dash: [1, 1.5] },
};

const TONES = {
  // Over satellite: white lines on a soft dark casing, readable on any imagery.
  light: { color: '#ffffff', opacity: 0.85, casing: 'rgba(0, 0, 0, 0.45)' },
  // On the Map view: a muted purple-grey, like the style's own borders were.
  dark: { color: '#8a7a99', opacity: 0.9, casing: null },
} as const;

const width = (w: [number, number], extra = 0) =>
  ['interpolate', ['linear'], ['zoom'], 3, w[0] + extra, 12, w[1] + extra];

/** The line layers for the chosen border groups. */
export function bordersLayers(levels: BorderLevel[], tone: 'light' | 'dark'): LayerSpecification[] {
  const t = TONES[tone];
  return ALL_BORDER_LEVELS.filter((g) => levels.includes(g)).flatMap((g) => {
    const look = GROUPS[g];
    const base = {
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['>=', ['get', 'admin_level'], look.min], ['<=', ['get', 'admin_level'], look.max], ...EXCLUDED],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      ...(look.minzoom != null ? { minzoom: look.minzoom } : {}),
    };
    const line = {
      ...base,
      id: `mc-border-${g}`,
      type: 'line',
      paint: {
        'line-color': t.color,
        'line-opacity': t.opacity,
        'line-width': width(look.width),
        ...(look.dash ? { 'line-dasharray': look.dash } : {}),
      },
    };
    const casing = t.casing && {
      ...base,
      id: `mc-border-${g}-casing`,
      type: 'line',
      paint: { 'line-color': t.casing, 'line-width': width(look.width, 1.5), 'line-blur': 0.5 },
    };
    const layers = (casing ? [casing, line] : [line]) as LayerSpecification[];
    return g === 'countries' ? [...layers, ...disputedLayers(tone)] : layers;
  });
}

/**
 * Contested country borders: thinner, fainter and dotted, so they read as
 * "disputed" next to the solid settled ones.
 */
function disputedLayers(tone: 'light' | 'dark'): LayerSpecification[] {
  const t = TONES[tone];
  const w: [number, number] = [0.7, 1.6];
  const base = {
    source: 'openmaptiles',
    'source-layer': 'boundary',
    filter: DISPUTED_LAND,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  };
  const line = {
    ...base,
    id: 'mc-border-countries-disputed',
    type: 'line',
    paint: {
      'line-color': t.color,
      'line-opacity': t.opacity * 0.7,
      'line-width': width(w),
      'line-dasharray': [0.5, 2.5],
    },
  };
  const casing = t.casing && {
    ...base,
    id: 'mc-border-countries-disputed-casing',
    type: 'line',
    paint: { 'line-color': t.casing, 'line-width': width(w, 1.2), 'line-blur': 0.5, 'line-dasharray': [0.5, 2.5] },
  };
  return (casing ? [casing, line] : [line]) as LayerSpecification[];
}

export interface VectorOptions {
  labels: boolean;
  borders: BorderLevel[];
}

const isBoundary = (l: LayerSpecification) => sourceLayerOf(l) === 'boundary';

/**
 * What goes over satellite: our borders, then the labels on top. One style, so
 * each map keeps a single MapLibre layer (one WebGL context).
 */
export function overlayStyle(style: StyleSpecification, o: VectorOptions): StyleSpecification {
  const labels = o.labels ? labelsOnlyStyle(style) : { ...style, sources: {}, layers: [] };
  const borders = bordersLayers(o.borders, 'light');
  const sources =
    borders.length && style.sources.openmaptiles
      ? { ...labels.sources, openmaptiles: style.sources.openmaptiles }
      : labels.sources;
  return { ...labels, sources, layers: [...borders, ...labels.layers] };
}

/**
 * The Map view: the full style with all of its own border layers removed (its
 * country lines include disputed ones), our borders added under the labels, and
 * the labels removed when they're off.
 */
export function mapViewStyle(style: StyleSpecification, o: VectorOptions): StyleSpecification {
  const base = o.labels ? style : withoutLabels(style);
  const layers = base.layers.filter((l) => !isBoundary(l));
  const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
  const at = firstSymbol === -1 ? layers.length : firstSymbol;
  const borders = bordersLayers(o.borders, 'dark');
  return { ...base, layers: [...layers.slice(0, at), ...borders, ...layers.slice(at)] };
}

let libertyPromise: Promise<StyleSpecification> | null = null;

/** The Liberty style, fetched once per page load and shared by both maps. */
export function loadLibertyStyle(): Promise<StyleSpecification> {
  libertyPromise ??= fetch(LIBERTY_STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`Map style failed to load (${r.status})`);
    return r.json() as Promise<StyleSpecification>;
  });
  // A failed fetch isn't cached, so the next try asks again.
  libertyPromise.catch(() => {
    libertyPromise = null;
  });
  return libertyPromise;
}
