import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AppShell, Group, Title, Button, Badge, Switch } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { MapPane, type MapPaneHandle } from './MapPane';
import { CITIES, type CityPreset } from './presets';
import { compensatedZoom } from './scale';
import { eyeAltitudeMeters, formatAltitude } from './altitude';
import { computeGridStepPx } from './GridLayer';
import { AboutModal } from './AboutModal';
import { SaveViewModal } from './SaveViewModal';
import { ExploreModal } from './ExploreModal';
import {
  loadSavedViews,
  persistSavedViews,
  type SavedView,
} from './savedViews';
import { CURATED_VIEWS } from './curatedViews';

const IS_AUTHOR = import.meta.env.DEV;

const HEADER_HEIGHT = 56;
const paneHeightPx = () => window.innerHeight - HEADER_HEIGHT;

type Side = 'left' | 'right';

export default function App() {
  const [leftCity, setLeftCity] = useState<CityPreset>(CITIES.tokyo);
  const [rightCity, setRightCity] = useState<CityPreset>(CITIES.paris);
  const [leftQuery, setLeftQuery] = useState('');
  const [rightQuery, setRightQuery] = useState('');
  const [splitPct, setSplitPct] = useState(50);
  const [gridVisible, setGridVisible] = useState(false);
  const [gridStepPx, setGridStepPx] = useState(100);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [aboutOpened, { open: openAbout, close: closeAbout }] = useDisclosure(false);
  const [saveOpened, { open: openSave, close: closeSave }] = useDisclosure(false);
  const [exploreOpened, { open: openExplore, close: closeExplore }] = useDisclosure(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [pendingTitle, setPendingTitle] = useState('');

  // Sync state: trigger lock + per-side interaction flags + debouncer.
  const syncTriggerRef = useRef<Side | null>(null);
  const suppressSyncRef = useRef(false);
  const isUserInteractingLeft = useRef(false);
  const isUserInteractingRight = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);

  const handleReady = useCallback((handle: MapPaneHandle) => {
    if (handle.side === 'left') {
      leftMapRef.current = handle.map;
      const z = handle.map.getZoom();
      const lat = handle.map.getCenter().lat;
      setAltitudeM(eyeAltitudeMeters(z, lat, paneHeightPx()));
      setGridStepPx(computeGridStepPx(z, lat));
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
      setAltitudeM(eyeAltitudeMeters(zoom, sourceLat, paneHeightPx()));
      setGridStepPx(computeGridStepPx(zoom, sourceLat));

      if (suppressSyncRef.current) return;
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

  function handleSaveClick() {
    const left = leftQuery.trim() || leftCity.name;
    const right = rightQuery.trim() || rightCity.name;
    setPendingTitle(`${left} vs ${right}`);
    openSave();
  }

  function handleConfirmSave(title: string) {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return;

    closeSave();

    try {
      const view: SavedView = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,
        left: {
          ...leftCity,
          lat: leftMap.getCenter().lat,
          lng: leftMap.getCenter().lng,
          zoom: leftMap.getZoom(),
        },
        right: {
          ...rightCity,
          lat: rightMap.getCenter().lat,
          lng: rightMap.getCenter().lng,
          zoom: rightMap.getZoom(),
        },
        createdAt: Date.now(),
      };

      const next = [view, ...savedViews];
      setSavedViews(next);
      persistSavedViews(next);

      notifications.show({
        title: 'Draft saved',
        message: `"${title}" added to your drafts.`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Save failed',
        message:
          err instanceof Error
            ? err.message
            : 'Could not write to local storage.',
        color: 'red',
      });
    }
  }

  function handleLoadView(id: string) {
    const view =
      CURATED_VIEWS.find((v) => v.id === id) ||
      savedViews.find((v) => v.id === id);
    if (!view) return;
    suppressSyncRef.current = true;
    setLeftCity(view.left);
    setRightCity(view.right);
    window.setTimeout(() => {
      suppressSyncRef.current = false;
    }, 100);
  }

  function handleDeleteView(id: string) {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    try {
      persistSavedViews(next);
    } catch (err) {
      notifications.show({
        title: 'Delete failed',
        message:
          err instanceof Error
            ? err.message
            : 'Could not update local storage.',
        color: 'red',
      });
    }
  }

  function handleExportDrafts() {
    if (savedViews.length === 0) return;
    const code = JSON.stringify(savedViews, null, 2);
    navigator.clipboard
      .writeText(code)
      .then(() => {
        notifications.show({
          title: 'Copied to clipboard',
          message: `${savedViews.length} draft(s) — paste into src/curatedViews.ts`,
          color: 'blue',
        });
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.log('Drafts JSON (clipboard write failed):\n' + code);
        notifications.show({
          title: 'Copy failed',
          message: 'JSON logged to the browser console instead.',
          color: 'red',
        });
      });
  }

  return (
    <AppShell header={{ height: HEADER_HEIGHT }} padding={0}>
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" align="center">
            <Title order={4}>MapCompare</Title>
            <Button size="sm" onClick={openExplore}>
              Explore
            </Button>
            {IS_AUTHOR && (
              <Button variant="default" size="sm" onClick={handleSaveClick}>
                Save
              </Button>
            )}
          </Group>
          <Group gap="md" wrap="nowrap" align="center">
            <Switch
              size="sm"
              checked={gridVisible}
              onChange={(e) => setGridVisible(e.currentTarget.checked)}
              label="Scale grid"
              labelPosition="left"
              styles={{
                body: { alignItems: 'center' },
                labelWrapper: { display: 'flex', alignItems: 'center' },
                label: { fontSize: 12, color: 'var(--mantine-color-dimmed)' },
              }}
            />
            <Badge variant="light" color="gray" size="sm" radius="sm">
              Altitude: {altitudeM == null ? '—' : formatAltitude(altitudeM)}
            </Badge>
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
              gridStepPx={gridStepPx}
              query={leftQuery}
              onQueryChange={setLeftQuery}
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
              gridStepPx={gridStepPx}
              query={rightQuery}
              onQueryChange={setRightQuery}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={(_, c) => setRightCity(c)}
            />
          </div>
        </div>
      </AppShell.Main>

      <AboutModal opened={aboutOpened} onClose={closeAbout} />
      <SaveViewModal
        opened={saveOpened}
        defaultTitle={pendingTitle}
        onSave={handleConfirmSave}
        onClose={closeSave}
      />
      <ExploreModal
        opened={exploreOpened}
        onClose={closeExplore}
        isAuthor={IS_AUTHOR}
        curatedViews={CURATED_VIEWS}
        draftViews={savedViews}
        onLoad={handleLoadView}
        onDeleteDraft={handleDeleteView}
        onExportDrafts={handleExportDrafts}
      />
    </AppShell>
  );
}
