import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CloseButton,
  Combobox,
  Loader,
  LoadingOverlay,
  Paper,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { CityPreset } from './presets';
import type { BorderLevel } from './vectorStyle';
import { createSatelliteLayer, createVectorLayer, LABELS_PANE, type MapStyle } from './tileLayers';
import { drawScaleGrid } from './GridLayer';
import { ShapeLayer } from './ShapeLayer';
import { HarmonizedScaleControl } from './ScaleControl';
import type { HarmonizedScale } from './scaleBar';
import { metersPerPixel } from './altitude';
import type { MeasureShape, ShapeMode } from './shapes';

type Side = 'left' | 'right';

export interface MapPaneHandle {
  map: L.Map;
  side: Side;
}

interface MapPaneProps {
  side: Side;
  initialCity: CityPreset;
  city: CityPreset;
  gridVisible: boolean;
  gridStepPx: number;
  /** Owned by App so it can be captured in a saved project. */
  style: MapStyle;
  /** Place names on. Both maps share this, and the base view. */
  labels: boolean;
  /** Border groups to draw. Never disputed borders; see vectorStyle.ts. */
  borders: BorderLevel[];
  /** Active shape tool for this pane. 'off' makes existing shapes read-only. */
  shapeMode: ShapeMode;
  /** Shows the per-pane search and tile-style picker. */
  showControls: boolean;
  shapes: MeasureShape[];
  /** Scale bar distances shared by both maps and the grid (App, scaleBar.ts). */
  scale: HarmonizedScale;
  /** The Layers menu's Annotations switch: false hides every shape. */
  shapesVisible: boolean;
  selectedShapeId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onReady: (handle: MapPaneHandle) => void;
  onUserZoom: (side: Side, zoom: number, lat: number) => void;
  onInteractionChange: (side: Side, interacting: boolean) => void;
  onSearchCity: (side: Side, city: CityPreset) => void;
  onShapesChange: (side: Side, shapes: MeasureShape[]) => void;
  onSelectShape: (side: Side, id: string | null) => void;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

/**
 * Wheel-zoom response curve.
 *
 * Leaflet's built-in wheel zoom runs a fixed, heavily damped formula whose
 * per-burst gain saturates at about four zoom levels, and it leaned on
 * zoomSnap's round-up to make small gestures register at all. With snapping off
 * (needed for exact scale matching) a trackpad swipe produced a tiny fraction of
 * a level, so getting from a continent down to a street took dozens of swipes.
 *
 * Zoom is logarithmic, so a constant levels-per-scroll already means a constant
 * *ratio* change of scale. This ramp sits on top of that: far out a gesture
 * should cross several levels so a continent-to-city trip is quick, while close
 * in it should move a fraction of a level so a building can be framed. Between
 * the two bounds the rate interpolates linearly in zoom.
 *
 * Calibration: a firm trackpad swipe is roughly 500px of accumulated deltaY, so
 * the fast rate crosses ~3 zoom levels per swipe and the slow rate ~1.2. One
 * notch of a wheel mouse (~100px) moves 0.65 levels out wide and 0.25 up close,
 * which is fine enough to frame a building.
 */
const ZOOM_RAMP_START = 5; // at/below this zoom, scroll at the fast rate
const ZOOM_RAMP_END = 16; // at/above this zoom, scroll at the slow rate
const ZOOM_LEVELS_PER_100PX_FAST = 0.65;
const ZOOM_LEVELS_PER_100PX_SLOW = 0.25;

function zoomLevelsPerPixel(zoom: number): number {
  const t = Math.min(
    1,
    Math.max(0, (zoom - ZOOM_RAMP_START) / (ZOOM_RAMP_END - ZOOM_RAMP_START))
  );
  const per100 =
    ZOOM_LEVELS_PER_100PX_FAST +
    (ZOOM_LEVELS_PER_100PX_SLOW - ZOOM_LEVELS_PER_100PX_FAST) * t;
  return per100 / 100;
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16; // lines
  if (e.deltaMode === 2) return e.deltaY * 400; // pages
  return e.deltaY;
}

function resultToCity(hit: SearchResult): CityPreset {
  return {
    name: hit.display_name.split(',')[0],
    country: hit.display_name.split(',').slice(-1)[0].trim(),
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    zoom: 12,
    areaKm2: 0,
    population: 0,
    curio: hit.display_name,
  };
}

export function MapPane({
  side,
  initialCity,
  city,
  gridVisible,
  gridStepPx,
  style,
  labels,
  borders,
  shapeMode,
  showControls,
  shapes,
  shapesVisible,
  scale,
  selectedShapeId,
  query,
  onQueryChange,
  onReady,
  onUserZoom,
  onInteractionChange,
  onSearchCity,
  onShapesChange,
  onSelectShape,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  /** The base view and, over satellite, the labels and borders. Swapped together. */
  const baseLayersRef = useRef<L.Layer[]>([]);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const firstLoadDoneRef = useRef(false);
  const shapeLayerRef = useRef<ShapeLayer | null>(null);
  const scaleCtlRef = useRef<HarmonizedScaleControl | null>(null);
  // Read by the map's move handler, which is set up once.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // The shape layer is built once and then driven by props. Its callbacks are
  // read through refs so the layer never has to be torn down and rebuilt just
  // because a parent handler got a new identity — a rebuild mid-drag would drop
  // the handle under the cursor.
  const onShapesChangeRef = useRef(onShapesChange);
  const onSelectShapeRef = useRef(onSelectShape);
  onShapesChangeRef.current = onShapesChange;
  onSelectShapeRef.current = onSelectShape;
  const [tilesLoading, setTilesLoading] = useState(true);

  // Search autocomplete state.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [debouncedQuery] = useDebouncedValue(query, 350);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [initialCity.lat, initialCity.lng],
      zoom: initialCity.zoom,
      zoomControl: side === 'left',
      // No zoom snapping. The whole premise is that one pixel covers the same
      // ground distance on both panes, and the compensated zoom that achieves
      // that is an arbitrary real number (sourceZoom + log2(cos ratio)). Snapping
      // it to a 0.25 grid quantised the correction and left the panes up to
      // 2^0.125 — about 9% — apart in scale, which is visible when comparing
      // equal-sized shapes. zoomDelta still governs the +/- and keyboard steps,
      // so stepped zooming feels the same; only wheel zoom becomes continuous.
      zoomSnap: 0,
      zoomDelta: 0.5,
      // Replaced by the wheel handler below, which ramps the rate by zoom level.
      scrollWheelZoom: false,
      // Added explicitly below so its corner can depend on the side.
      attributionControl: false,
      // App owns resize handling. Leaflet's own tracker calls invalidateSize
      // with pan:true on a requestAnimationFrame, which nudges the view by half
      // the size delta — exactly the shift App is re-pinning away. With both
      // running they fight, and the pane ends up framed somewhere between the
      // two. See pinView in App.tsx.
      trackResize: false,
    });
    // Both maps are superimposed and full-width, so the left map's bottom-right
    // corner sits underneath the right map's visible half and anything placed
    // there would be hidden. Each pane keeps its controls in its own outer
    // corner instead. The attribution control is built here rather than via the
    // attributionControl option for the same reason — it must be added before
    // the tile layer, which registers its attribution with it.
    const corner = side === 'left' ? 'bottomleft' : 'bottomright';
    L.control.attribution({ position: corner }).addTo(map);
    // Not Leaflet's own scale: ours shows the same distances on both maps.
    const scaleCtl = new HarmonizedScaleControl({ position: corner }).addTo(map);
    const updateScale = () => scaleCtl.set(scaleRef.current, metersPerPixel(map.getZoom(), map.getCenter().lat));
    map.on('move zoom', updateScale);
    scaleCtlRef.current = scaleCtl;
    updateScale();
    // Labels over satellite sit above the imagery but below the shapes, and
    // never catch clicks meant for the map or a shape.
    const labelsPane = map.createPane(LABELS_PANE);
    labelsPane.style.zIndex = '350';
    labelsPane.style.pointerEvents = 'none';
    mapRef.current = map;

    const handleZoomEnd = () => {
      const z = map.getZoom();
      const lat = map.getCenter().lat;
      onUserZoom(side, z, lat);
    };
    const startInteract = () => onInteractionChange(side, true);
    const endInteract = () => onInteractionChange(side, false);

    map.on('zoomstart', startInteract);
    map.on('zoomend', () => {
      handleZoomEnd();
      endInteract();
    });
    map.on('movestart', startInteract);
    map.on('moveend', endInteract);

    onReady({ map, side });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bordersKey = borders.join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const l of baseLayersRef.current) map.removeLayer(l);
    baseLayersRef.current = [];

    // Drive the loading overlay only until the first view paints; ignoring
    // later loads keeps it from flickering on pan/zoom.
    const firstPaintDone = () => {
      if (!firstLoadDoneRef.current) {
        firstLoadDoneRef.current = true;
        setTilesLoading(false);
      }
    };
    // The vector layers load asynchronously. If the view or the labels switch
    // changes meanwhile, or the pane goes away, the late layer is dropped.
    let stale = false;
    const addVector = (kind: 'map' | 'overlay') => {
      createVectorLayer(kind, { labels, borders })
        .then((layer) => {
          if (stale || mapRef.current !== map) return;
          layer.addTo(map);
          baseLayersRef.current.push(layer);
          if (kind === 'map') {
            (layer as L.MaplibreGL).getMaplibreMap().once('idle', firstPaintDone);
          }
        })
        .catch(() => {
          // Style fetch failed (offline, or OpenFreeMap down). The map stays
          // usable without labels; don't leave the loading veil up.
          firstPaintDone();
        });
    };

    if (style === 'roadmap') {
      addVector('map');
    } else {
      const tile = createSatelliteLayer();
      tile.on('load', firstPaintDone);
      tile.addTo(map);
      baseLayersRef.current.push(tile);
      if (labels || borders.length > 0) addVector('overlay');
    }
    return () => {
      stale = true;
    };
    // bordersKey stands in for `borders`: a new array with the same groups
    // must not rebuild the layers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, labels, bordersKey]);

  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas || !gridVisible) return;

    const redraw = () => drawScaleGrid(canvas, gridStepPx);

    // ResizeObserver fires once on observe (covering the initial draw, when
    // useEffect can otherwise run before the canvas has layout dimensions)
    // and again on any size change (splitter drag, window resize).
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [gridVisible, gridStepPx]);

  // Wheel/pinch zoom, replacing Leaflet's (disabled in the map options above).
  // Deltas are accumulated and applied once per animation frame, so a fast
  // trackpad flick becomes one zoom step per painted frame instead of dozens of
  // tiny ones.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();

    let accumulated = 0;
    let anchor: L.Point | null = null;
    let frame: number | null = null;

    const apply = () => {
      frame = null;
      const target = mapRef.current;
      if (!target || !anchor) return;
      const delta = accumulated;
      accumulated = 0;
      const zoom = target.getZoom();
      // Scrolling away from you (positive deltaY) zooms out.
      const next = zoom - delta * zoomLevelsPerPixel(zoom);
      // setZoomAround keeps the point under the cursor pinned, which is what
      // makes wheel zoom feel like it aims where you point. It clamps to the
      // layer's min/max zoom for us.
      target.setZoomAround(anchor, next, { animate: false });
    };

    const onWheel = (e: WheelEvent) => {
      // Must preventDefault: a Mac trackpad pinch arrives as ctrl+wheel, and
      // left alone the browser would zoom the whole page instead of the map.
      e.preventDefault();
      accumulated += wheelPixels(e);
      anchor = map.mouseEventToContainerPoint(e);
      if (frame == null) frame = requestAnimationFrame(apply);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, []);

  // Build the shape layer once per map, then keep it in sync through the three
  // effects below. It is deliberately not rebuilt on prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = new ShapeLayer(map, {
      onChange: (next) => onShapesChangeRef.current(side, next),
      onSelect: (id) => onSelectShapeRef.current(side, id),
    });
    shapeLayerRef.current = layer;

    return () => {
      layer.destroy();
      shapeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    shapeLayerRef.current?.setShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    shapeLayerRef.current?.setMode(shapeMode);
  }, [shapeMode]);

  useEffect(() => {
    shapeLayerRef.current?.setVisible(shapesVisible);
  }, [shapesVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) scaleCtlRef.current?.set(scale, metersPerPixel(map.getZoom(), map.getCenter().lat));
  }, [scale]);

  useEffect(() => {
    shapeLayerRef.current?.select(selectedShapeId);
  }, [selectedShapeId]);

  // Debounced geocoding: fetch suggestions as the user types.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
    fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then((res) => res.json())
      .then((data: SearchResult[]) => {
        setResults(data);
        if (data.length > 0) combobox.openDropdown();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Search failed', err);
      })
      .finally(() => setSearching(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  function handleOptionSubmit(value: string) {
    const hit = results[Number(value)];
    if (!hit) return;
    onSearchCity(side, resultToCity(hit));
    onQueryChange(hit.display_name.split(',')[0]);
    combobox.closeDropdown();
  }

  const rightSection = searching ? (
    <Loader size="xs" />
  ) : query ? (
    <CloseButton
      size="sm"
      aria-label="Clear search"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onQueryChange('');
        setResults([]);
        combobox.closeDropdown();
      }}
    />
  ) : null;

  return (
    <div className={`map-pane map-pane--${side}`}>
      {showControls && (
      <div className="pane-toolbar">
        <div style={{ flex: '1 1 auto', maxWidth: 400, minWidth: 0 }}>
          <Combobox store={combobox} onOptionSubmit={handleOptionSubmit}>
            <Combobox.Target>
              <TextInput
                placeholder={`Search a place on the ${side} map...`}
                value={query}
                onChange={(e) => {
                  onQueryChange(e.currentTarget.value);
                  combobox.openDropdown();
                }}
                onFocus={() => {
                  if (results.length > 0) combobox.openDropdown();
                }}
                onBlur={() => combobox.closeDropdown()}
                size="sm"
                rightSection={rightSection}
                rightSectionPointerEvents={query && !searching ? 'all' : 'none'}
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options>
                {results.length === 0 ? (
                  <Combobox.Empty>No matches</Combobox.Empty>
                ) : (
                  results.map((r, i) => (
                    <Combobox.Option value={String(i)} key={i}>
                      <Text size="sm" lineClamp={1}>
                        {r.display_name}
                      </Text>
                    </Combobox.Option>
                  ))
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </div>
      </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <LoadingOverlay
        visible={tilesLoading}
        zIndex={460}
        overlayProps={{ blur: 1, backgroundOpacity: 0.35 }}
      />
      {gridVisible && (
        <canvas
          ref={gridCanvasRef}
          className="grid-overlay"
          aria-hidden="true"
        />
      )}
      <Paper
        className="data-card"
        shadow="md"
        p="sm"
        radius="md"
        withBorder
      >
        <Text fw={600} size="sm">
          {city.name}
        </Text>
        <Text size="xs" c="dimmed">
          {city.country}
        </Text>
      </Paper>
    </div>
  );
}
