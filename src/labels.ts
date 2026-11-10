/**
 * Map labels from OpenFreeMap (OpenStreetMap data, free, no key).
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
