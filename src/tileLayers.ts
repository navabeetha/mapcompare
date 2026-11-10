import L from 'leaflet';
import { labelsOnlyStyle, loadLibertyStyle, OPENFREEMAP_ATTRIBUTION, withoutLabels } from './labels';

/**
 * The base view, shared by both maps. 'roadmap' is the Map view; the key is
 * kept because saved comparisons store it. A Topo view (OpenTopoMap) was tried
 * and dropped on 2026-11-10 as hard to read.
 */
export type MapStyle = 'roadmap' | 'satellite';

export const STYLE_LABELS: Record<MapStyle, string> = {
  roadmap: 'Map',
  satellite: 'Satellite',
};

/** Reads a stored style, so a value from a dropped view (e.g. 'topo') opens as satellite. */
export function toMapStyle(v: unknown): MapStyle {
  return v === 'roadmap' ? 'roadmap' : 'satellite';
}

/** Leaflet pane for the labels over satellite: above the imagery, below the
 *  measurement shapes (overlayPane is 400). MapPane creates it. */
export const LABELS_PANE = 'labelsPane';

/**
 * The satellite base view. Map view is not here: it's drawn from vector data by
 * createVectorLayer.
 */
export function createSatelliteLayer(): L.TileLayer {
  // Esri World Imagery. Free to use with attribution, but not open data. The
  // only open imagery (Sentinel-2, 10 m pixels) is too blurry at city zoom.
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics',
    }
  );
}

/**
 * A layer drawn by MapLibre from OpenFreeMap's vector tiles:
 *   - 'map': the full Map view, with or without its labels;
 *   - 'labels': place and water names only, to lay over satellite.
 *
 * MapLibre (~250 KB) is imported here on first use, so the default satellite
 * view never downloads it.
 */
export async function createVectorLayer(kind: 'map' | 'labels', labels: boolean): Promise<L.Layer> {
  const [{ maplibreGL }, { setWorkerUrl }, { default: workerUrl }, style] = await Promise.all([
    import('@maplibre/maplibre-gl-leaflet'),
    import('maplibre-gl'),
    // MapLibre finds its worker file next to its own script. Once Vite bundles
    // it (in dev and in the build) that file isn't there, so "Worker failed to
    // load". Point it at the worker file explicitly; Vite serves or emits it.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    loadLibertyStyle(),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  setWorkerUrl(workerUrl);
  const layer = maplibreGL({
    style: kind === 'labels' ? labelsOnlyStyle(style) : labels ? style : withoutLabels(style),
    // Leaflet shows the credit; MapLibre's own control would be a second copy.
    attributionControl: false,
    ...(kind === 'labels' ? { pane: LABELS_PANE } : {}),
  } as L.LeafletMaplibreGLOptions);
  // The plugin doesn't report a credit to Leaflet, and the OpenStreetMap licence
  // requires one. Leaflet adds and removes it with the layer.
  layer.getAttribution = () => OPENFREEMAP_ATTRIBUTION;
  return layer;
}
