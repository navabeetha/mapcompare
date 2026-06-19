import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AppShell,
  Group,
  Title,
  Button,
  Badge,
  Switch,
  Popover,
  NumberInput,
  SegmentedControl,
  Paper,
  Text,
  Divider,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { MdStraighten, MdClose } from 'react-icons/md';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { MapPane, type MapPaneHandle } from './MapPane';
import { CITIES, type CityPreset } from './presets';
import { compensatedZoom } from './scale';
import {
  eyeAltitudeMeters,
  formatAltitude,
  formatDistance,
  metersPerPixel,
} from './altitude';
import { computeGridStep } from './GridLayer';
import { AboutModal } from './AboutModal';
import { SaveViewModal } from './SaveViewModal';
import { ExploreMenu } from './ExploreMenu';
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
  const [gridStepMeters, setGridStepMeters] = useState(100);
  const [gridOverrideMeters, setGridOverrideMeters] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measureClearToken, setMeasureClearToken] = useState(0);
  const [leftMeasureM, setLeftMeasureM] = useState<number | null>(null);
  const [rightMeasureM, setRightMeasureM] = useState<number | null>(null);
  const [gridPopoverOpen, setGridPopoverOpen] = useState(false);
  const [gridInput, setGridInput] = useState<number | string>('');
  const [gridUnit, setGridUnit] = useState<'m' | 'km'>('km');
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  // Welcome flow: the modal opens on every load and pauses over the maps while
  // they fetch tiles in the background. The header About button reopens it.
  const [aboutOpened, { open: openAbout, close: closeAbout }] = useDisclosure(true);
  const [saveOpened, { open: openSave, close: closeSave }] = useDisclosure(false);
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

  // Mirror of gridOverrideMeters readable from the stable map callbacks below
  // without making them depend on (and go stale against) the state value.
  const gridOverrideRef = useRef<number | null>(null);

  const recomputeGrid = useCallback((zoom: number, lat: number) => {
    const override = gridOverrideRef.current;
    const mPerPx = metersPerPixel(zoom, lat);
    if (override != null && isFinite(mPerPx) && mPerPx > 0) {
      setGridStepPx(override / mPerPx);
      setGridStepMeters(override);
    } else {
      const { stepPx, stepMeters } = computeGridStep(zoom, lat);
      setGridStepPx(stepPx);
      setGridStepMeters(stepMeters);
    }
  }, []);

  const applyGridOverride = useCallback(
    (meters: number | null) => {
      gridOverrideRef.current = meters;
      setGridOverrideMeters(meters);
      const map = leftMapRef.current;
      if (map) recomputeGrid(map.getZoom(), map.getCenter().lat);
    },
    [recomputeGrid]
  );

  const handleMeasure = useCallback((side: Side, meters: number | null) => {
    if (side === 'left') setLeftMeasureM(meters);
    else setRightMeasureM(meters);
  }, []);

  const toggleMeasuring = useCallback(() => {
    setMeasuring((on) => !on);
  }, []);

  const clearMeasurements = useCallback(() => {
    setMeasureClearToken((t) => t + 1);
  }, []);

  const handleReady = useCallback(
    (handle: MapPaneHandle) => {
      if (handle.side === 'left') {
        leftMapRef.current = handle.map;
        const z = handle.map.getZoom();
        const lat = handle.map.getCenter().lat;
        setAltitudeM(eyeAltitudeMeters(z, lat, paneHeightPx()));
        recomputeGrid(z, lat);
      } else {
        rightMapRef.current = handle.map;
      }
    },
    [recomputeGrid]
  );

  const handleInteraction = useCallback((side: Side, interacting: boolean) => {
    if (side === 'left') isUserInteractingLeft.current = interacting;
    else isUserInteractingRight.current = interacting;
  }, []);

  const handleUserZoom = useCallback(
    (side: Side, zoom: number, sourceLat: number) => {
      setAltitudeM(eyeAltitudeMeters(zoom, sourceLat, paneHeightPx()));
      recomputeGrid(zoom, sourceLat);

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
    [recomputeGrid]
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
          <Group gap={0} wrap="nowrap" align="center">
            <Title order={4}>MapCompare</Title>
            <Group gap="sm" wrap="nowrap" align="center" ml={56}>
              <Group gap={6} wrap="nowrap" align="center">
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
                {gridVisible && (
                <Popover
                  opened={gridPopoverOpen}
                  onChange={setGridPopoverOpen}
                  position="bottom"
                  withArrow
                  shadow="md"
                >
                  <Popover.Target>
                    <Badge
                      variant={gridOverrideMeters != null ? 'filled' : 'light'}
                      color="blue"
                      size="sm"
                      radius="sm"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setGridInput(
                          gridStepMeters >= 1000
                            ? +(gridStepMeters / 1000).toFixed(2)
                            : Math.round(gridStepMeters)
                        );
                        setGridUnit(gridStepMeters >= 1000 ? 'km' : 'm');
                        setGridPopoverOpen((o) => !o);
                      }}
                    >
                      {formatDistance(gridStepMeters)}
                      {gridOverrideMeters != null ? ' (fixed)' : ''}
                    </Badge>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Group gap="xs" align="flex-end" wrap="nowrap">
                      <NumberInput
                        label="Grid length"
                        size="xs"
                        min={0}
                        w={110}
                        value={gridInput}
                        onChange={setGridInput}
                      />
                      <SegmentedControl
                        size="xs"
                        value={gridUnit}
                        onChange={(v) => setGridUnit(v as 'm' | 'km')}
                        data={[
                          { label: 'm', value: 'm' },
                          { label: 'km', value: 'km' },
                        ]}
                      />
                    </Group>
                    <Group gap="xs" mt="sm" justify="space-between">
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                          applyGridOverride(null);
                          setGridPopoverOpen(false);
                        }}
                      >
                        Reset to auto
                      </Button>
                      <Button
                        size="xs"
                        onClick={() => {
                          const meters =
                            Number(gridInput) * (gridUnit === 'km' ? 1000 : 1);
                          if (meters > 0) applyGridOverride(meters);
                          setGridPopoverOpen(false);
                        }}
                      >
                        Set
                      </Button>
                    </Group>
                  </Popover.Dropdown>
                </Popover>
                )}
              </Group>
              <Divider
                orientation="vertical"
                style={{ height: 24, alignSelf: 'center' }}
              />
              <Group gap="xs" wrap="nowrap" align="center">
                <Tooltip label="Measure distance" withArrow>
                  <ActionIcon
                    size="lg"
                    variant={measuring ? 'filled' : 'default'}
                    onClick={toggleMeasuring}
                    aria-label="Measure distance"
                  >
                    <MdStraighten size={18} />
                  </ActionIcon>
                </Tooltip>
                {measuring && (
                  <Tooltip label="Clear measurements" withArrow>
                    <ActionIcon
                      size="lg"
                      variant="subtle"
                      color="gray"
                      onClick={clearMeasurements}
                      aria-label="Clear measurements"
                    >
                      <MdClose size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
              <Divider
                orientation="vertical"
                style={{ height: 24, alignSelf: 'center' }}
              />
              <Badge variant="light" color="gray" size="sm" radius="sm">
                Altitude: {altitudeM == null ? '—' : formatAltitude(altitudeM)}
              </Badge>
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap" align="center">
            <ExploreMenu
              isAuthor={IS_AUTHOR}
              curatedViews={CURATED_VIEWS}
              draftViews={savedViews}
              onLoad={handleLoadView}
              onDeleteDraft={handleDeleteView}
              onExportDrafts={handleExportDrafts}
            />
            {IS_AUTHOR && (
              <Button variant="default" size="sm" onClick={handleSaveClick}>
                Save
              </Button>
            )}
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
              measuring={measuring}
              clearToken={measureClearToken}
              query={leftQuery}
              onQueryChange={setLeftQuery}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={(_, c) => setLeftCity(c)}
              onMeasure={handleMeasure}
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
              measuring={measuring}
              clearToken={measureClearToken}
              query={rightQuery}
              onQueryChange={setRightQuery}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={(_, c) => setRightCity(c)}
              onMeasure={handleMeasure}
            />
          </div>
          {measuring && leftMeasureM != null && rightMeasureM != null && (
            <Paper
              className="measure-panel"
              shadow="md"
              p="sm"
              radius="md"
              withBorder
            >
              <Group gap="lg" wrap="nowrap">
                <div>
                  <Text size="xs" c="dimmed">
                    Left
                  </Text>
                  <Text fw={600} size="sm">
                    {formatDistance(leftMeasureM)}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Right
                  </Text>
                  <Text fw={600} size="sm">
                    {formatDistance(rightMeasureM)}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Ratio
                  </Text>
                  <Text fw={600} size="sm" c="blue">
                    {(
                      Math.max(leftMeasureM, rightMeasureM) /
                      Math.max(1, Math.min(leftMeasureM, rightMeasureM))
                    ).toFixed(2)}
                    ×
                  </Text>
                </div>
              </Group>
            </Paper>
          )}
        </div>
      </AppShell.Main>

      <AboutModal opened={aboutOpened} onClose={closeAbout} />
      <SaveViewModal
        opened={saveOpened}
        defaultTitle={pendingTitle}
        onSave={handleConfirmSave}
        onClose={closeSave}
      />
    </AppShell>
  );
}
