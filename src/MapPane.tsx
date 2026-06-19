import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CloseButton,
  Combobox,
  Loader,
  LoadingOverlay,
  Paper,
  SegmentedControl,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { CityPreset } from './presets';
import { createTileLayer, type MapStyle } from './tileLayers';
import { drawScaleGrid } from './GridLayer';
import { formatDistance } from './altitude';

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
  measuring: boolean;
  clearToken: number;
  query: string;
  onQueryChange: (query: string) => void;
  onReady: (handle: MapPaneHandle) => void;
  onUserZoom: (side: Side, zoom: number, lat: number) => void;
  onInteractionChange: (side: Side, interacting: boolean) => void;
  onSearchCity: (side: Side, city: CityPreset) => void;
  onMeasure: (side: Side, meters: number | null) => void;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

const STYLE_OPTIONS = [
  { label: 'MAP', value: 'roadmap' },
  { label: 'SAT', value: 'satellite' },
];

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
  measuring,
  clearToken,
  query,
  onQueryChange,
  onReady,
  onUserZoom,
  onInteractionChange,
  onSearchCity,
  onMeasure,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const firstLoadDoneRef = useRef(false);
  // Measurement state, kept in refs so the clear effect and the live
  // rubber-band handler can reach the active layer/anchor without re-running.
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const measureStartRef = useRef<L.LatLng | null>(null);
  const measureRubberRef = useRef<L.Polyline | null>(null);
  const [style, setStyle] = useState<MapStyle>('satellite');
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
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelDebounceTime: 40,
      attributionControl: true,
    });
    L.control.scale({ position: 'bottomright', imperial: true, metric: true }).addTo(map);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const tile = createTileLayer(style);
    // Drive the loading overlay only until the first batch of tiles paints;
    // ignoring later 'loading' events keeps it from flickering on pan/zoom.
    tile.on('load', () => {
      if (!firstLoadDoneRef.current) {
        firstLoadDoneRef.current = true;
        setTilesLoading(false);
      }
    });
    tile.addTo(map);
    tileLayerRef.current = tile;
  }, [style]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([city.lat, city.lng], city.zoom, { animate: false });
  }, [city]);

  // Measurement mode: click a first point, then a live dashed line follows the
  // cursor until the second click commits the segment and reports the true
  // ground distance. A subsequent click starts a fresh line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measuring) return;

    const layer = L.layerGroup().addTo(map);
    measureLayerRef.current = layer;
    measureStartRef.current = null;
    measureRubberRef.current = null;
    map.getContainer().style.cursor = 'crosshair';

    const handleClick = (e: L.LeafletMouseEvent) => {
      const start = measureStartRef.current;
      if (start === null) {
        layer.clearLayers();
        measureRubberRef.current = null;
        onMeasure(side, null);
        measureStartRef.current = e.latlng;
        L.circleMarker(e.latlng, { radius: 5, color: '#4dabf7', weight: 2 }).addTo(layer);
      } else {
        const end = e.latlng;
        const meters = map.distance(start, end);
        if (measureRubberRef.current) {
          layer.removeLayer(measureRubberRef.current);
          measureRubberRef.current = null;
        }
        L.polyline([start, end], { color: '#4dabf7', weight: 3 }).addTo(layer);
        L.circleMarker(end, { radius: 5, color: '#4dabf7', weight: 2 })
          .bindTooltip(formatDistance(meters), { permanent: true, direction: 'top' })
          .addTo(layer);
        onMeasure(side, meters);
        measureStartRef.current = null;
      }
    };

    // Rubber-band preview: redraw a dashed line from the anchor to the cursor.
    const handleMove = (e: L.LeafletMouseEvent) => {
      const start = measureStartRef.current;
      if (!start) return;
      if (measureRubberRef.current) {
        measureRubberRef.current.setLatLngs([start, e.latlng]);
      } else {
        measureRubberRef.current = L.polyline([start, e.latlng], {
          color: '#4dabf7',
          weight: 2,
          opacity: 0.8,
          dashArray: '5,6',
        }).addTo(layer);
      }
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMove);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMove);
      map.removeLayer(layer);
      measureLayerRef.current = null;
      measureStartRef.current = null;
      measureRubberRef.current = null;
      map.getContainer().style.cursor = '';
      onMeasure(side, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

  // Clear the current measurement when the parent bumps the clear token,
  // staying in measure mode so the user can immediately draw a new line.
  useEffect(() => {
    if (clearToken === 0) return;
    const layer = measureLayerRef.current;
    if (layer) layer.clearLayers();
    measureStartRef.current = null;
    measureRubberRef.current = null;
    onMeasure(side, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearToken]);

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
    <div className="map-pane">
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
        <SegmentedControl
          value={style}
          onChange={(v) => setStyle(v as MapStyle)}
          data={STYLE_OPTIONS}
          size="sm"
          style={{ marginLeft: 'auto' }}
        />
      </div>
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
