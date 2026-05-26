import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AppShell, Group, Title, Button, Badge, Switch, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MapPane, type MapPaneHandle } from './MapPane';
import { CITIES, type CityPreset } from './presets';
import { compensatedZoom } from './scale';
import { eyeAltitudeMeters, formatAltitude } from './altitude';
import { AboutModal } from './AboutModal';

const HEADER_HEIGHT = 56;
const paneHeightPx = () => window.innerHeight - HEADER_HEIGHT;

type Side = 'left' | 'right';

export default function App() {
  const [leftCity, setLeftCity] = useState<CityPreset>(CITIES.tokyo);
  const [rightCity, setRightCity] = useState<CityPreset>(CITIES.paris);
  const [splitPct, setSplitPct] = useState(50);
  const [gridVisible, setGridVisible] = useState(false);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [aboutOpened, { open: openAbout, close: closeAbout }] = useDisclosure(false);

  // Sync state: trigger lock + per-side interaction flags + debouncer.
  const syncTriggerRef = useRef<Side | null>(null);
  const isUserInteractingLeft = useRef(false);
  const isUserInteractingRight = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);

  const handleReady = useCallback((handle: MapPaneHandle) => {
    if (handle.side === 'left') {
      leftMapRef.current = handle.map;
      // Seed the altitude badge from the left pane's initial view.
      const z = handle.map.getZoom();
      const lat = handle.map.getCenter().lat;
      setAltitudeM(eyeAltitudeMeters(z, lat, paneHeightPx()));
    } else {
      rightMapRef.current = handle.map;
    }
  }, []);

  const handleInteraction = useCallback((side: Side, interacting: boolean) => {
    if (side === 'left') isUserInteractingLeft.current = interacting;
    else isUserInteractingRight.current = interacting;
  }, []);

  const handleUserZoom = useCallback(
    (side: Side, zoom: number, sourceLat: number) => {
      // Refresh the altitude badge on every zoom event from either pane.
      setAltitudeM(eyeAltitudeMeters(zoom, sourceLat, paneHeightPx()));

      if (syncTriggerRef.current && syncTriggerRef.current !== side) return;

      const target = side === 'left' ? rightMapRef.current : leftMapRef.current;
      if (!target) return;

      const targetSideInteracting =
        side === 'left' ? isUserInteractingRight.current : isUserInteractingLeft.current;
      if (targetSideInteracting) return;

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const targetLat = target.getCenter().lat;
        const compensated = compensatedZoom(zoom, sourceLat, targetLat);

        syncTriggerRef.current = side;
        target.setZoom(compensated, { animate: false });
        window.setTimeout(() => {
          syncTriggerRef.current = null;
        }, 50);
      }, 150);
    },
    []
  );

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(10, Math.min(90, pct)));
    }
    function onUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        leftMapRef.current?.invalidateSize();
        rightMapRef.current?.invalidateSize();
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    leftMapRef.current?.invalidateSize();
    rightMapRef.current?.invalidateSize();
  }, [splitPct]);

  // Recompute altitude on window resize since it depends on viewport height.
  useEffect(() => {
    function onResize() {
      const map = leftMapRef.current;
      if (!map) return;
      setAltitudeM(
        eyeAltitudeMeters(map.getZoom(), map.getCenter().lat, paneHeightPx())
      );
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Title order={4}>MapCompare</Title>
            <Badge variant="light" color="gray" size="sm" radius="sm">
              {altitudeM == null ? '—' : formatAltitude(altitudeM)}
            </Badge>
          </Group>
          <Group gap="md" wrap="nowrap">
            <Switch
              size="sm"
              checked={gridVisible}
              onChange={(e) => setGridVisible(e.currentTarget.checked)}
              label={
                <Text size="xs" c="dimmed">
                  Scale grid
                </Text>
              }
            />
            <Button variant="default" size="sm" onClick={openAbout}>
              About
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <div className="split-container" ref={splitContainerRef}>
          <div style={{ width: `${splitPct}%`, height: '100%' }}>
            <MapPane
              side="left"
              initialCity={CITIES.tokyo}
              city={leftCity}
              gridVisible={gridVisible}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={(_, c) => setLeftCity(c)}
            />
          </div>
          <div
            className="splitter"
            style={{ left: `${splitPct}%` }}
            onMouseDown={() => {
              draggingRef.current = true;
              document.body.style.cursor = 'ew-resize';
            }}
          />
          <div style={{ width: `${100 - splitPct}%`, height: '100%' }}>
            <MapPane
              side="right"
              initialCity={CITIES.paris}
              city={rightCity}
              gridVisible={gridVisible}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={(_, c) => setRightCity(c)}
            />
          </div>
        </div>
      </AppShell.Main>

      <AboutModal opened={aboutOpened} onClose={closeAbout} />
    </AppShell>
  );
}
