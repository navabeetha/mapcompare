import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ActionIcon,
  Paper,
  SegmentedControl,
  Text,
  TextInput,
} from '@mantine/core';
import type { CityPreset } from './presets';
import { createTileLayer, type MapStyle } from './tileLayers';

type Side = 'left' | 'right';

export interface MapPaneHandle {
  map: L.Map;
  side: Side;
}

interface MapPaneProps {
  side: Side;
  initialCity: CityPreset;
  city: CityPreset;
  onReady: (handle: MapPaneHandle) => void;
  onUserZoom: (side: Side, zoom: number, lat: number) => void;
  onInteractionChange: (side: Side, interacting: boolean) => void;
  onSearchCity: (side: Side, city: CityPreset) => void;
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
  { label: 'TER', value: 'terrain' },
];

export function MapPane({
  side,
  initialCity,
  city,
  onReady,
  onUserZoom,
  onInteractionChange,
  onSearchCity,
}: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [style, setStyle] = useState<MapStyle>('roadmap');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

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

    const tile = createTileLayer('roadmap').addTo(map);
    tileLayerRef.current = tile;
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
    tileLayerRef.current = createTileLayer(style).addTo(map);
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([city.lat, city.lng], city.zoom, { animate: true });
  }, [city]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data: SearchResult[] = await res.json();
      if (data.length === 0) return;
      const hit = data[0];
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      onSearchCity(side, {
        name: hit.display_name.split(',')[0],
        country: hit.display_name.split(',').slice(-1)[0].trim(),
        lat,
        lng,
        zoom: 12,
        areaKm2: 0,
        population: 0,
        curio: hit.display_name,
      });
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="map-pane">
      <div className="pane-toolbar">
        <form
          onSubmit={runSearch}
          style={{ flex: '1 1 auto', maxWidth: 400, minWidth: 0 }}
        >
          <TextInput
            placeholder={`Search a place on the ${side} map...`}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            size="sm"
            rightSection={
              <ActionIcon
                type="submit"
                variant="filled"
                size="sm"
                loading={searching}
                aria-label="Search"
              >
                →
              </ActionIcon>
            }
            rightSectionWidth={36}
            rightSectionPointerEvents="all"
          />
        </form>
        <SegmentedControl
          value={style}
          onChange={(v) => setStyle(v as MapStyle)}
          data={STYLE_OPTIONS}
          size="sm"
          style={{ marginLeft: 'auto' }}
        />
      </div>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
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
        {city.areaKm2 > 0 && (
          <Text size="xs" c="dimmed">
            Area: {city.areaKm2.toLocaleString()} km²
          </Text>
        )}
        {city.population > 0 && (
          <Text size="xs" c="dimmed">
            Population: {(city.population / 1_000_000).toFixed(2)}M
          </Text>
        )}
        <Text size="xs" c="dimmed" fs="italic" mt={6}>
          {city.curio}
        </Text>
      </Paper>
    </div>
  );
}

