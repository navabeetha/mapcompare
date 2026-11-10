import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import L from 'leaflet';
import {
  AppShell,
  Group,
  Title,
  Badge,
  Paper,
  Text,
  Divider,
  Menu,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  MdClose,
  MdCompareArrows,
  MdDeleteOutline,
  MdOpenWith,
  MdOutlinePentagon,
  MdPolyline,
  MdRadioButtonUnchecked,
} from 'react-icons/md';
import { LuShare2, LuInfo, LuListChecks, LuMaximize, LuMenu, LuSave, LuX } from 'react-icons/lu';
// Lucide pair for the map-controls toggle: a wireframe with top bar and side
// panel (controls showing) vs the same frame left empty (clean canvas).
import { LuPanelsTopLeft, LuSquare } from 'react-icons/lu';
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
import { harmonizedScale } from './scaleBar';
import { formatArea } from './geometry';
import {
  measureShape,
  mirrorShape,
  type MeasureShape,
  type ShapeMode,
} from './shapes';
import { AboutModal } from './AboutModal';
import { SaveViewModal } from './SaveViewModal';
import { ManageExploreModal } from './ManageExploreModal';
import { LayersMenu } from './LayersMenu';
import { ExploreMenu } from './ExploreMenu';
import {
  createProjectId,
  loadProjects,
  migrateProjects,
  persistProjects,
  SCHEMA_VERSION,
  displayTitle,
  draftNameClash,
  type PaneState,
  type Project,
} from './projects';
import comparisonsJson from './data/comparisons.json';
import type { AppMode } from './mode';
import { CENTRE_PIN, centreForPin, isCentrePin, pinPoint, visibleFrame, type Pin } from './pin';
import { toMapStyle, type MapStyle } from './tileLayers';
import { renderComparison } from './exportImage';
import { ShareModal } from './ShareModal';
import { exportTitle } from './exportLayout';
import { fetchPublished, getToken, publishItem, PublishError, savePublished } from './publish';
import { ALL_BORDER_LEVELS, type BorderLevel } from './vectorStyle';

/**
 * The comparisons that ship with the build. They are still authored in the v1
 * shape, so they come through the same migration as anything in localStorage.
 */
/**
 * The published Explore list as built into this deploy. The Manage screen
 * (author only) edits it through GitHub; App keeps a live copy in state so
 * the author sees a publish at once, before the redeploy lands.
 */
const BUILT_PUBLISHED: Project[] = migrateProjects(comparisonsJson as unknown[]);

const HEADER_HEIGHT = 56;
/** The header is gone in full screen; see `fullscreen` in App. */
let headerShown = true;
const paneHeightPx = () => window.innerHeight - (headerShown ? HEADER_HEIGHT : 0);

type Side = 'left' | 'right';

interface Anchor {
  center: L.LatLng;
  zoom: number | null;
  pin?: { spot: Pin; place: L.LatLng; splitPct: number };
}

/**
 * The shape toolbar. 'edit' selects and reshapes what's already drawn; the rest
 * arm a drawing gesture. Clicking the active tool again returns to 'off'.
 */
const SHAPE_TOOLS = [
  { mode: 'edit', label: 'Select and reshape', Icon: MdOpenWith },
  { mode: 'line', label: 'Measure a path', Icon: MdPolyline },
  { mode: 'circle', label: 'Draw a circle', Icon: MdRadioButtonUnchecked },
  { mode: 'polygon', label: 'Draw a polygon', Icon: MdOutlinePentagon },
] as const satisfies readonly { mode: ShapeMode; label: string; Icon: unknown }[];

interface ShapeTotals {
  count: number;
  lengthM: number;
  areaM2: number;
}

function totalsFor(shapes: MeasureShape[], map: L.Map | null): ShapeTotals {
  const totals: ShapeTotals = { count: shapes.length, lengthM: 0, areaM2: 0 };
  if (!map) return totals;
  for (const shape of shapes) {
    const m = measureShape(shape, map);
    totals.lengthM += m.lengthM ?? 0;
    totals.areaM2 += m.areaM2 ?? 0;
  }
  return totals;
}

/** Larger over smaller, so the figure always reads as "N× bigger". */
function ratioOf(a: number, b: number): number | null {
  if (a <= 0 || b <= 0) return null;
  return Math.max(a, b) / Math.min(a, b);
}

interface AppProps {
  mode: AppMode;
  /** Project to open on load, from `?project=`. Viewer falls back to the first curated one. */
  initialProjectId: string | null;
}

export default function App({ mode, initialProjectId }: AppProps) {
  // The two modes have the same tools: grid, shapes, per-map search and tile
  // style. The only difference is that the tool can save. Save and the local
  // Drafts list are reserved for the author for now. Letting the public save,
  // probably with curation, is a later decision.
  const isAuthor = mode === 'tool';

  const [leftCity, setLeftCity] = useState<CityPreset>(CITIES.tokyo);
  const [rightCity, setRightCity] = useState<CityPreset>(CITIES.paris);
  /** Base view for both maps (Layers menu). Satellite with labels by default. */
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  /** Title/description of the project currently on screen, shown in view mode. */
  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [leftQuery, setLeftQuery] = useState('');
  const [rightQuery, setRightQuery] = useState('');
  const [splitPct, setSplitPct] = useState(50);
  // Bumped to force the relayout effect to run even when splitPct itself is
  // unchanged — loading a view whose split happens to match the current one
  // would otherwise be a no-op state update and never apply its anchor.
  const [pinToken, setPinToken] = useState(0);
  const [gridVisible, setGridVisible] = useState(false);
  /** Place-name labels on both maps (Layers menu). Saved with a project. */
  const [labelsVisible, setLabelsVisible] = useState(true);
  // Annotations (shapes now, notes later): a viewing switch, not saved with a
  // comparison, so hiding them never hides an author's shapes from readers.
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  /** Hides the on-map controls (search, city cards, zoom) for a clean view.
   *  Not saved: it's a viewing preference, not part of a comparison. */
  const [mapUiHidden, setMapUiHidden] = useState(false);
  /**
   * Full screen: just the two maps. The header and the map controls go, and
   * the browser goes full screen where it can. A soft close button (or Esc)
   * returns to exactly the state before, including the controls toggle.
   */
  const [fullscreen, setFullscreen] = useState(false);
  const [shareOpened, { open: openShare, close: closeShare }] = useDisclosure(false);
  headerShown = !fullscreen;

  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    // Not every browser allows it (iPhone Safari doesn't); the in-page full
    // screen still works without it.
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);
  // Esc (or the browser's own exit) leaves browser full screen; follow it.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // Esc leaves full screen. In browser full screen the browser usually takes
  // Esc itself (and fullscreenchange above follows it); this covers the
  // in-page full screen and any Esc that does reach the page.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    // Capture phase: focus is often still on the (hidden) Full screen button,
    // and its tooltip stops Esc from bubbling up to window.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen, exitFullscreen]);
  // The header coming or going changes the maps' height, even when the browser
  // window doesn't resize (in-page full screen). Re-measure and re-pin, the
  // same way a window resize does.
  const firstFullscreenRun = useRef(true);
  useEffect(() => {
    if (firstFullscreenRun.current) {
      firstFullscreenRun.current = false;
      return;
    }
    setPinToken((t) => t + 1);
  }, [fullscreen]);
  /** Border groups on both maps (Layers menu). Off by default. Never country borders. */
  const [borders, setBorders] = useState<BorderLevel[]>([]);
  const [gridStepPx, setGridStepPx] = useState(100);
  const [gridStepMeters, setGridStepMeters] = useState(100);
  const [gridOverrideMeters, setGridOverrideMeters] = useState<number | null>(null);
  // Metres per pixel of the grid's reference (left map). The scale bars on
  // both maps use the grid's distance, so bars and grid always agree.
  const [scaleMpp, setScaleMpp] = useState(20);
  const scale = useMemo(() => harmonizedScale({ mpp: scaleMpp, gridStepMeters }), [scaleMpp, gridStepMeters]);
  const [shapeMode, setShapeMode] = useState<ShapeMode>('off');
  const [leftShapes, setLeftShapes] = useState<MeasureShape[]>([]);
  const [rightShapes, setRightShapes] = useState<MeasureShape[]>([]);
  // At most one shape is selected across both panes, so the mirror and delete
  // actions always have an unambiguous target.
  const [selected, setSelected] = useState<{ side: Side; id: string } | null>(null);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  // Welcome flow: the modal opens on every load and pauses over the maps while
  // they fetch tiles in the background. The header About button reopens it.
  const [aboutOpened, { open: openAbout, close: closeAbout }] = useDisclosure(true);
  const [saveOpened, { open: openSave, close: closeSave }] = useDisclosure(false);
  const [manageOpened, { open: openManage, close: closeManage }] = useDisclosure(false);
  /** The Explore list: as built, then as last published from Manage. */
  const [published, setPublished] = useState<Project[]>(BUILT_PUBLISHED);
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [pendingTitle, setPendingTitle] = useState('');

  // Sync state: suppression flag + per-side interaction flags + debouncer.
  // applyView raises suppressSyncRef for the duration of every programmatic
  // move, which is the whole loop guard — see handleUserZoom.
  const suppressSyncRef = useRef(false);
  const isUserInteractingLeft = useRef(false);
  const isUserInteractingRight = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);

  // Mirror of gridOverrideMeters readable from the stable map callbacks below
  // without making them depend on (and go stale against) the state value.
  const gridOverrideRef = useRef<number | null>(null);

  // Where each pane should be re-centred after its size changes. Captured once
  // at the start of a resize (or set explicitly when loading a view) and then
  // restored verbatim on every subsequent frame, which is what keeps the
  // framing stable — see pinView below. `zoom: null` means "keep whatever zoom
  // the pane currently has". A `pin` (only set when loading a pinned project)
  // puts that place on its pin spot instead of putting `center` in the middle.
  const anchorRef = useRef<{
    left: Anchor;
    right: Anchor;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  function mapFor(side: Side): L.Map | null {
    return side === 'left' ? leftMapRef.current : rightMapRef.current;
  }

  /**
   * The single writer of map view state. Everything that moves a map
   * programmatically goes through here; the panes themselves only ever report
   * what the user did.
   *
   * With `animate: false` Leaflet finishes the whole move before setView
   * returns — the animated-zoom path bails out on `animate === false`, and the
   * pan path ends in a synchronous `_rawPanBy` + `fire('moveend')` — so
   * zoomend/moveend have already been dispatched by the time the flag is
   * lowered. That is why this needs no timer, unlike the 100 ms suppression
   * window it replaced.
   */
  const applyView = useCallback(
    (side: Side, center: L.LatLngExpression, zoom: number) => {
      const map = mapFor(side);
      if (!map) return;

      // Drop any sync the user's last gesture had queued: we are about to
      // define both panes' state, and letting a stale timer fire afterwards
      // would undo it.
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      suppressSyncRef.current = true;
      try {
        map.setView(center, zoom, { animate: false });
      } finally {
        suppressSyncRef.current = false;
      }
    },
    []
  );

  /**
   * Re-measure a pane whose container changed size, then put `center` back
   * exactly at the new pane centre.
   *
   * `invalidateSize()` defaults to `pan: true`, which applies its own
   * half-the-size-delta correction. Running that once per pointermove during a
   * splitter drag is what made the framing creep away from where the user left
   * it. Passing `pan: false` and re-pinning to a centre that was captured once
   * is drift-free however many times it runs, because the error is always
   * measured against the same fixed anchor rather than against the previous
   * (already nudged) position.
   */
  const pinView = useCallback(
    (side: Side, anchor: Anchor) => {
      const map = mapFor(side);
      if (!map) return;
      map.invalidateSize({ pan: false });
      const zoom = anchor.zoom ?? map.getZoom();
      let center = anchor.center;
      // A pinned project: work out the centre that puts the pinned place on its
      // spot, now that the container has its real size.
      if (anchor.pin) {
        const size = map.getSize();
        const target = pinPoint(
          anchor.pin.spot,
          visibleFrame(side, anchor.pin.splitPct, size.x, size.y)
        );
        const c = centreForPin(map.project(anchor.pin.place, zoom), target, size);
        center = map.unproject(L.point(c.x, c.y), zoom);
      }
      applyView(side, center, zoom);
    },
    [applyView]
  );

  /** Snapshot both panes' current centres as the anchor for a resize. */
  const captureAnchors = useCallback(() => {
    const left = leftMapRef.current;
    const right = rightMapRef.current;
    if (!left || !right) return;
    anchorRef.current = {
      left: { center: left.getCenter(), zoom: null },
      right: { center: right.getCenter(), zoom: null },
    };
  }, []);

  const repinAnchors = useCallback(() => {
    const anchors = anchorRef.current;
    if (!anchors) return;
    pinView('left', anchors.left);
    pinView('right', anchors.right);
  }, [pinView]);

  const recomputeGrid = useCallback((zoom: number, lat: number) => {
    const override = gridOverrideRef.current;
    const mPerPx = metersPerPixel(zoom, lat);
    if (isFinite(mPerPx) && mPerPx > 0) setScaleMpp(mPerPx);
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

  const handleShapesChange = useCallback((side: Side, next: MeasureShape[]) => {
    if (side === 'left') setLeftShapes(next);
    else setRightShapes(next);
  }, []);

  const handleSelectShape = useCallback((side: Side, id: string | null) => {
    setSelected((prev) => {
      if (id) return { side, id };
      // A pane reporting "nothing selected" should only clear a selection that
      // belongs to it. The other pane deselecting is just a side effect of this
      // one taking over, and must not wipe the new selection.
      return prev && prev.side === side ? null : prev;
    });
  }, []);

  const clearShapes = useCallback(() => {
    setLeftShapes([]);
    setRightShapes([]);
    setSelected(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const drop = (list: MeasureShape[]) => list.filter((s) => s.id !== selected.id);
    if (selected.side === 'left') setLeftShapes(drop);
    else setRightShapes(drop);
    setSelected(null);
  }, [selected]);

  /**
   * Copy the selected shape to the opposite pane at the same ground size,
   * centred on that pane's current view. Comparing "this much area, over there"
   * is the whole reason the panes are scale-locked.
   */
  const mirrorSelected = useCallback(() => {
    if (!selected) return;
    const fromMap = mapFor(selected.side);
    const toSide: Side = selected.side === 'left' ? 'right' : 'left';
    const toMap = mapFor(toSide);
    if (!fromMap || !toMap) return;

    const source = (selected.side === 'left' ? leftShapes : rightShapes).find(
      (s) => s.id === selected.id
    );
    if (!source) return;

    const copy = mirrorShape(source, fromMap, toMap.getCenter());
    if (toSide === 'left') setLeftShapes((s) => [...s, copy]);
    else setRightShapes((s) => [...s, copy]);
    setSelected({ side: toSide, id: copy.id });
  }, [selected, leftShapes, rightShapes]);

  const readySyncFrameRef = useRef<number | null>(null);
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

      // Once both maps exist, scale-match them: the right map takes the zoom
      // that shows the left map's metres-per-pixel at its own latitude (the
      // same rule as every zoom sync). Without this, each opened at its preset
      // city's zoom and stayed ~25% off until the first interaction. A
      // comparison loaded at start-up re-frames afterwards with the same rule.
      // Deferred a frame and read from the refs then: in dev, StrictMode
      // creates, removes and re-creates each map, so a map handed to us here
      // may already be gone by the time the other side reports in.
      if (readySyncFrameRef.current != null) return;
      readySyncFrameRef.current = requestAnimationFrame(() => {
        readySyncFrameRef.current = null;
        const left = leftMapRef.current;
        const right = rightMapRef.current;
        if (!left || !right) return;
        const centre = right.getCenter();
        applyView('right', centre, compensatedZoom(left.getZoom(), left.getCenter().lat, centre.lat));
      });
    },
    [recomputeGrid, applyView]
  );

  const handleInteraction = useCallback((side: Side, interacting: boolean) => {
    if (side === 'left') isUserInteractingLeft.current = interacting;
    else isUserInteractingRight.current = interacting;
  }, []);

  /**
   * Picking a search result recentres *only* the pane that was searched, and it
   * keeps the comparison the user had set up: the searched pane takes whatever
   * zoom shows the same meters-per-pixel as the other pane does at the new
   * latitude. The other pane is not touched at all.
   *
   * Previously the pane moved itself to the geocoder's hardcoded zoom 12, whose
   * zoomend then dragged the opposite pane along with it — so searching a second
   * place threw away the first pane's framing.
   */
  const handleSearchCity = useCallback(
    (side: Side, city: CityPreset) => {
      if (side === 'left') setLeftCity(city);
      else setRightCity(city);

      const other = mapFor(side === 'left' ? 'right' : 'left');
      const self = mapFor(side);
      const zoom = other
        ? compensatedZoom(other.getZoom(), other.getCenter().lat, city.lat)
        : // No opposite pane yet (first paint): hold this pane's own zoom.
          self?.getZoom() ?? city.zoom;

      applyView(side, [city.lat, city.lng], zoom);
    },
    [applyView]
  );

  const handleUserZoom = useCallback(
    (side: Side, zoom: number, sourceLat: number) => {
      setAltitudeM(eyeAltitudeMeters(zoom, sourceLat, paneHeightPx()));
      recomputeGrid(zoom, sourceLat);

      if (suppressSyncRef.current) return;

      const targetSide: Side = side === 'left' ? 'right' : 'left';
      const target = mapFor(targetSide);
      if (!target) return;

      const targetSideInteracting =
        side === 'left' ? isUserInteractingRight.current : isUserInteractingLeft.current;
      if (targetSideInteracting) return;

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const targetCenter = target.getCenter();
        const compensated = compensatedZoom(zoom, sourceLat, targetCenter.lat);
        // Go through applyView so the suppression flag is what stops the
        // target's own zoomend from syncing straight back. This used to be a
        // 50 ms timing window, which was already fragile and becomes untenable
        // with zoomSnap off: zoom is now continuous, so these events fire on
        // every frame of a wheel gesture rather than once per quarter step.
        applyView(targetSide, targetCenter, compensated);
      }, 150);
    },
    [recomputeGrid, applyView]
  );

  // Measurements depend only on the shapes themselves — map.distance is a fixed
  // spherical calculation, independent of zoom — so these recompute on edit
  // rather than on every pan.
  const leftTotals = useMemo(
    () => totalsFor(leftShapes, leftMapRef.current),
    [leftShapes]
  );
  const rightTotals = useMemo(
    () => totalsFor(rightShapes, rightMapRef.current),
    [rightShapes]
  );

  const selectedDetail = useMemo(() => {
    if (!selected) return null;
    const map = mapFor(selected.side);
    const shape = (selected.side === 'left' ? leftShapes : rightShapes).find(
      (s) => s.id === selected.id
    );
    if (!map || !shape) return null;
    return { shape, metrics: measureShape(shape, map) };
  }, [selected, leftShapes, rightShapes]);

  /**
   * Keyboard affordances aren't discoverable, so the active tool spells out what
   * the gestures and keys do. Phrased for whatever is currently possible rather
   * than listing every shortcut at once.
   */
  const shapeHint = useMemo(() => {
    if (shapeMode === 'off') return null;

    if (shapeMode === 'edit') {
      return selected
        ? 'Drag a square handle to reshape, a round one to add a point · Delete to remove'
        : 'Click a shape to select it';
    }

    const drawing =
      shapeMode === 'circle'
        ? 'Click the centre, then click again to set the radius'
        : shapeMode === 'polygon'
          ? 'Click to add corners · Enter or double-click to close'
          : 'Click to add points · Enter or double-click to finish';

    // A shape stays selected after it is drawn and the tool stays armed, so the
    // delete shortcut is worth mentioning without repeating the reshape advice.
    return selected
      ? `${drawing} · Esc to cancel · Delete removes the selected shape`
      : `${drawing} · Esc to cancel`;
  }, [shapeMode, selected]);

  const areaRatio = ratioOf(leftTotals.areaM2, rightTotals.areaM2);
  const lengthRatio = ratioOf(leftTotals.lengthM, rightTotals.lengthM);
  // Shape controls and totals only while the shapes themselves are showing.
  const hasShapes = annotationsVisible && (leftShapes.length > 0 || rightShapes.length > 0);

  // Delete removes the selected shape. Ignored while typing in a search box so
  // it can't eat a backspace mid-query.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (!selected) return;
      e.preventDefault();
      deleteSelected();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected, deleteSelected]);

  // Open a project on first paint. `?project=<id>` names one explicitly; failing
  // that the viewer falls back to the first curated comparison, because view
  // mode with no project loaded would just be two unrelated default cities.
  // The tool opens empty so authoring starts from a blank slate.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const requested = initialProjectId
      ? published.find((p) => p.id === initialProjectId) ??
        projects.find((p) => p.id === initialProjectId)
      : null;
    const target = requested ?? (isAuthor ? null : published[0]);
    if (target) loadProject(target);
    // Runs once; `projects` and `loadProject` are read at boot and not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, isAuthor]);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  /** Where the pointer went down, to tell a click apart from a swipe. */
  const dragOriginXRef = useRef(0);

  const startSplitDrag = useCallback((e: ReactPointerEvent) => {
    draggingRef.current = true;
    dragOriginXRef.current = e.clientX;
    document.body.style.cursor = 'ew-resize';
  }, []);

  // Pointer events rather than mouse events so the grip works under touch and
  // pen input too. Dragging only moves the clip boundary — neither map changes
  // size or centre — so unlike the old resizing layout there is nothing to
  // re-measure or re-pin here.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(0, Math.min(100, pct)));
    }
    function onUp(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      // A press that never really moved is a click, not a swipe: snap back to
      // centre. This is the main way back after swiping right over to one side.
      if (Math.abs(e.clientX - dragOriginXRef.current) < 4) setSplitPct(50);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Re-measure and re-pin after something actually changed the panes' size or
  // framing — a window resize, or a project being loaded. Splitter drags no
  // longer belong here: under the curtain layout they only move a clip
  // boundary, leaving both maps exactly where they were.
  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      // Every invalidateSize MUST be followed by a pin. On its own, `pan: false`
      // re-measures without compensating, so the pane keeps its pixel origin and
      // the geographic centre slides by half the size delta — the very drift
      // this effect exists to prevent. If no anchor was captured (a size change
      // we didn't initiate), take one now: getCenter() still reports against the
      // old cached size, so it names the point currently in the middle of the
      // pane, which is exactly what should stay there.
      if (!anchorRef.current) captureAnchors();
      repinAnchors();
      // A one-shot pin (loading a view, or the final pin after a drag) is
      // consumed here; a live drag keeps its anchor until pointerup.
      if (!draggingRef.current) anchorRef.current = null;
    });
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [pinToken, captureAnchors, repinAnchors]);

  // Window resize. Leaflet's own trackResize is switched off in MapPane, so
  // this is the only thing re-measuring the panes; see the note there for why
  // we took it over rather than letting both run.
  useEffect(() => {
    let timer: number | null = null;
    function onResize() {
      const map = leftMapRef.current;
      if (map) {
        setAltitudeM(
          eyeAltitudeMeters(map.getZoom(), map.getCenter().lat, paneHeightPx())
        );
      }
      // Capture on the first event of a burst only: by the second event the
      // centre has already shifted, and anchoring to that would bake the drift
      // in rather than undo it.
      if (timer == null) captureAnchors();
      else window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        repinAnchors();
        anchorRef.current = null;
      }, 120);
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [captureAnchors, repinAnchors]);

  // The comparison on screen, if it was opened from Explore. Saving it then
  // offers "Save and update Explore" as well as "Save to drafts".
  const openFromExplore = openProject ? published.find((x) => x.id === openProject.id) ?? null : null;
  const [updatingExplore, setUpdatingExplore] = useState(false);

  function handleSaveClick() {
    const left = leftQuery.trim() || leftCity.name;
    const right = rightQuery.trim() || rightCity.name;
    // An Explore comparison keeps its name for "update"; saving it as a draft
    // asks for a new one (draftNameClash).
    setPendingTitle(openFromExplore ? displayTitle(openFromExplore.title) : `${left} vs ${right}`);
    openSave();
  }

  /** Everything on screen as a Project: both framings, split, grid, layers, shapes, pins. */
  function captureProject(title: string, pins: { left: Pin; right: Pin }, id: string, createdAt: number): Project | null {
    const leftMap = leftMapRef.current;
    const rightMap = rightMapRef.current;
    if (!leftMap || !rightMap) return null;

    // The place under each map's pin spot on this screen, saved with the pin.
    const pinFor = (side: Side, map: L.Map): PaneState['pin'] => {
      const spot = pins[side];
      if (isCentrePin(spot)) return undefined;
      const size = map.getSize();
      const pt = pinPoint(spot, visibleFrame(side, splitPct, size.x, size.y));
      const place = map.containerPointToLatLng(L.point(pt.x, pt.y));
      return { ...spot, lat: place.lat, lng: place.lng };
    };

    // Capture the live state of everything a reader needs to see the same
    // comparison: both framings, the split between them, the grid, the tile
    // styles and every measurement object.
    return {
        schemaVersion: SCHEMA_VERSION,
        id,
        title,
        splitPct,
        grid: { visible: gridVisible, overrideMeters: gridOverrideMeters },
        labels: labelsVisible,
        borders,
        left: {
          city: leftCity,
          lat: leftMap.getCenter().lat,
          lng: leftMap.getCenter().lng,
          zoom: leftMap.getZoom(),
          style: mapStyle,
          shapes: leftShapes,
          pin: pinFor('left', leftMap),
        },
        right: {
          city: rightCity,
          lat: rightMap.getCenter().lat,
          lng: rightMap.getCenter().lng,
          zoom: rightMap.getZoom(),
          style: mapStyle,
          shapes: rightShapes,
          pin: pinFor('right', rightMap),
        },
        createdAt,
      };
  }

  function handleConfirmSave(title: string, pins: { left: Pin; right: Pin }) {
    // Belt and braces: the dialog already blocks a name that's in Explore.
    if (draftNameClash(title, published)) return;
    const project = captureProject(title, pins, createProjectId(), Date.now());
    if (!project) return;
    closeSave();
    try {
      const next = [project, ...projects];
      setProjects(next);
      persistProjects(next);
      setOpenProject(project);

      notifications.show({
        title: 'Draft saved',
        message: `"${title}" added to your drafts (Menu → Manage Explore).`,
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

  /**
   * "Save and update Explore": replaces the open Explore comparison with what's
   * on screen, as one commit straight away (live in ~1–2 minutes). Uses the
   * token connected in Manage Explore; reads the latest list first so it
   * never overwrites someone else's newer change.
   */
  async function handleUpdateExplore(title: string, pins: { left: Pin; right: Pin }) {
    const token = getToken();
    if (!token || !openFromExplore) return;
    const project = captureProject(title, pins, openFromExplore.id, openFromExplore.createdAt);
    if (!project) return;
    setUpdatingExplore(true);
    try {
      const remote = await fetchPublished(token);
      if (!remote.list.some((x) => x.id === project.id)) {
        throw new PublishError('This comparison is no longer in Explore, so there is nothing to update. Save it to drafts instead.');
      }
      const saved = await savePublished(token, remote, publishItem(remote.list, project));
      setPublished(saved.list);
      setOpenProject(project);
      closeSave();
      notifications.show({
        title: 'Explore updated',
        message: `"${displayTitle(title)}" is saved to GitHub. The public site updates in about 1–2 minutes.`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Not updated',
        message: err instanceof PublishError ? err.message : "Couldn't reach GitHub. Nothing was changed.",
        color: 'red',
      });
    } finally {
      setUpdatingExplore(false);
    }
  }

  /** Share → image: the comparison on screen, with a footer (exportImage.ts). */
  function renderShareImage() {
    const container = splitContainerRef.current;
    const left = leftMapRef.current;
    const right = rightMapRef.current;
    if (!container || !left || !right) return Promise.reject(new Error('The maps are still loading.'));
    return renderComparison({
      container,
      maps: { left, right },
      splitPct,
      title: exportTitle(openProject?.title, leftCity.name, rightCity.name),
      cities: { left: leftCity, right: rightCity },
    });
  }

  const loadProject = useCallback((project: Project) => {
    setOpenProject(project);
    setLeftCity(project.left.city);
    setRightCity(project.right.city);
    // One view for both maps now. Older saves stored one per map; the left
    // map's wins.
    setMapStyle(toMapStyle(project.left.style));
    setLeftShapes(project.left.shapes);
    setRightShapes(project.right.shapes);
    setSelected(null);
    setGridVisible(project.grid.visible);
    // Labels are on by default, including for comparisons saved before the
    // switch existed.
    setLabelsVisible(project.labels ?? true);
    setBorders((project.borders ?? []).filter((b) => ALL_BORDER_LEVELS.includes(b)));
    applyGridOverride(project.grid.overrideMeters);

    // Recompute the right pane's zoom from the left rather than trusting what
    // was stored. Projects authored while zoomSnap was 0.25 carry up to ~9% of
    // quantisation error in that second zoom; deriving it fresh makes every
    // saved comparison — including the seven curated ones — land exactly
    // scale-matched. The left pane's zoom is the authored intent and is used
    // verbatim.
    const rightZoom = compensatedZoom(
      project.left.zoom,
      project.left.lat,
      project.right.lat
    );

    // Queue the framing as a one-shot anchor and let the relayout effect apply
    // it next frame. Setting the view directly here would reframe the moment the
    // panes take their new widths — the restore has to land *after* the layout,
    // not before it.
    // Pins are applied once here, on load. A later window resize keeps
    // whatever is in the middle of each map, as before.
    const pinOf = (pane: Project['left']): Anchor['pin'] =>
      pane.pin && !isCentrePin(pane.pin)
        ? {
            spot: { x: pane.pin.x, y: pane.pin.y },
            place: L.latLng(pane.pin.lat, pane.pin.lng),
            splitPct: project.splitPct,
          }
        : undefined;
    anchorRef.current = {
      left: {
        center: L.latLng(project.left.lat, project.left.lng),
        zoom: project.left.zoom,
        pin: pinOf(project.left),
      },
      right: {
        center: L.latLng(project.right.lat, project.right.lng),
        zoom: rightZoom,
        pin: pinOf(project.right),
      },
    };
    setSplitPct(project.splitPct);
    setPinToken((t) => t + 1);
  }, [applyGridOverride]);

  function handleLoadView(id: string) {
    const project =
      published.find((p) => p.id === id) ||
      projects.find((p) => p.id === id);
    if (project) loadProject(project);
  }

  /** Drafts edited in Manage Explore (rename, delete, unpublish back). */
  function handleDraftsChange(next: Project[]) {
    setProjects(next);
    try {
      persistProjects(next);
    } catch (err) {
      notifications.show({
        title: 'Could not save drafts',
        message: err instanceof Error ? err.message : 'Could not write to local storage.',
        color: 'red',
      });
    }
  }

  return (
    <AppShell header={{ height: HEADER_HEIGHT, collapsed: fullscreen }} padding={0}>
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap={0} wrap="nowrap" align="center">
            {/* The "meta" actions (Save, About) live in this menu, so the header
                keeps to what you use on the maps. */}
            <Menu position="bottom-start" shadow="md" width={200} withArrow>
              <Menu.Target>
                <ActionIcon size="lg" variant="subtle" color="gray" mr={10} aria-label="Menu">
                  <LuMenu size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {isAuthor && (
                  <Menu.Item leftSection={<LuSave size={16} />} onClick={handleSaveClick}>
                    Save view…
                  </Menu.Item>
                )}
                {isAuthor && (
                  <Menu.Item leftSection={<LuListChecks size={16} />} onClick={openManage}>
                    Manage Explore…
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<LuInfo size={16} />} onClick={openAbout}>
                  About MapCompare
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Title order={4}>MapCompare</Title>
            {/* View mode leads with the title of the comparison that's open. */}
            {!isAuthor && openProject && (
              <Group gap={8} wrap="nowrap" align="baseline" ml={32}>
                <Text fw={600} size="sm">
                  {displayTitle(openProject.title)}
                </Text>
                {openProject.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {openProject.description}
                  </Text>
                )}
              </Group>
            )}
            <Group gap="sm" wrap="nowrap" align="center" ml={56}>
              <ExploreMenu
                isAuthor={isAuthor}
                curatedViews={published}
                onLoad={handleLoadView}
                onManage={openManage}
              />
              <LayersMenu
                gridVisible={gridVisible}
                onGridVisibleChange={setGridVisible}
                gridStepMeters={gridStepMeters}
                gridOverrideMeters={gridOverrideMeters}
                onGridOverride={applyGridOverride}
                labelsVisible={labelsVisible}
                onLabelsVisibleChange={setLabelsVisible}
                mapStyle={mapStyle}
                onMapStyleChange={setMapStyle}
                borders={borders}
                onBordersChange={setBorders}
                annotationsVisible={annotationsVisible}
                onAnnotationsVisibleChange={(on) => {
                  setAnnotationsVisible(on);
                  if (!on) {
                    setShapeMode('off');
                    setSelected(null);
                  }
                }}
              />
              {/* Yellow while hidden, so it's obvious the controls are tucked away. */}
              <Tooltip label={mapUiHidden ? 'Show map controls' : 'Hide map controls'} withArrow>
                <ActionIcon
                  size="lg"
                  ml={-4}
                  variant={mapUiHidden ? 'filled' : 'default'}
                  color={mapUiHidden ? 'yellow.4' : undefined}
                  c={mapUiHidden ? 'dark' : undefined}
                  onClick={() => setMapUiHidden((h) => !h)}
                  aria-label={mapUiHidden ? 'Show map controls' : 'Hide map controls'}
                  aria-pressed={mapUiHidden}
                >
                  {mapUiHidden ? <LuSquare size={18} /> : <LuPanelsTopLeft size={18} />}
                </ActionIcon>
              </Tooltip>
              <Divider
                orientation="vertical"
                style={{ height: 24, alignSelf: 'center' }}
              />
              <Group gap={4} wrap="nowrap" align="center">
                <Text fz={12} c="dimmed" mr={4}>
                  Draw
                </Text>
                {SHAPE_TOOLS.map(({ mode, label, Icon }) => (
                  <Tooltip key={mode} label={label} withArrow>
                    <ActionIcon
                      size="lg"
                      variant={shapeMode === mode ? 'filled' : 'default'}
                      onClick={() => {
                        // Picking a drawing tool shows annotations again.
                        setAnnotationsVisible(true);
                        setShapeMode((current) => (current === mode ? 'off' : mode));
                      }}
                      aria-label={label}
                      aria-pressed={shapeMode === mode}
                    >
                      <Icon size={18} />
                    </ActionIcon>
                  </Tooltip>
                ))}
                {selected && (
                  <>
                    <Tooltip
                      label="Copy to the other pane at the same ground size"
                      withArrow
                    >
                      <ActionIcon
                        size="lg"
                        variant="default"
                        onClick={mirrorSelected}
                        aria-label="Copy shape to the other pane"
                      >
                        <MdCompareArrows size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete selected shape (Del)" withArrow>
                      <ActionIcon
                        size="lg"
                        variant="subtle"
                        color="gray"
                        onClick={deleteSelected}
                        aria-label="Delete selected shape"
                      >
                        <MdDeleteOutline size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                )}
                {hasShapes && (
                  <Tooltip label="Clear all shapes" withArrow>
                    <ActionIcon
                      size="lg"
                      variant="subtle"
                      color="gray"
                      onClick={clearShapes}
                      aria-label="Clear all shapes"
                    >
                      <MdClose size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap" align="center">
            {/* A read-out, not a tool, so it sits with Full screen on the right. */}
            <Badge variant="light" color="gray" size="sm" radius="sm">
              Altitude: {altitudeM == null ? '—' : formatAltitude(altitudeM)}
            </Badge>
            <Tooltip label="Share: image" withArrow position="bottom-end">
              <ActionIcon size="lg" variant="default" onClick={openShare} aria-label="Share">
                <LuShare2 size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Full screen: just the maps" withArrow position="bottom-end">
              <ActionIcon size="lg" variant="default" onClick={enterFullscreen} aria-label="Full screen">
                <LuMaximize size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <div
          className="split-container"
          ref={splitContainerRef}
          data-map-ui-hidden={mapUiHidden || fullscreen || undefined}
          data-fullscreen={fullscreen || undefined}
        >
          {/* Both layers are full-size and superimposed; only the right one is
              clipped. Order matters — the right layer must paint over the left. */}
          <div className="map-layer">
            <MapPane
              side="left"
              initialCity={CITIES.tokyo}
              city={leftCity}
              gridVisible={gridVisible}
              gridStepPx={gridStepPx}
              style={mapStyle}
              labels={labelsVisible}
              borders={borders}
              showControls
              shapeMode={shapeMode}
              shapes={leftShapes}
              shapesVisible={annotationsVisible}
              scale={scale}
              selectedShapeId={selected?.side === 'left' ? selected.id : null}
              query={leftQuery}
              onQueryChange={setLeftQuery}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={handleSearchCity}
              onShapesChange={handleShapesChange}
              onSelectShape={handleSelectShape}
            />
          </div>
          <div
            className="map-layer"
            style={{ clipPath: `inset(0 0 0 ${splitPct}%)` }}
          >
            <MapPane
              side="right"
              initialCity={CITIES.paris}
              city={rightCity}
              gridVisible={gridVisible}
              gridStepPx={gridStepPx}
              style={mapStyle}
              labels={labelsVisible}
              borders={borders}
              showControls
              shapeMode={shapeMode}
              shapes={rightShapes}
              shapesVisible={annotationsVisible}
              scale={scale}
              selectedShapeId={selected?.side === 'right' ? selected.id : null}
              query={rightQuery}
              onQueryChange={setRightQuery}
              onReady={handleReady}
              onUserZoom={handleUserZoom}
              onInteractionChange={handleInteraction}
              onSearchCity={handleSearchCity}
              onShapesChange={handleShapesChange}
              onSelectShape={handleSelectShape}
            />
          </div>
          <div
            className="splitter"
            style={{ left: `${splitPct}%` }}
            data-off-centre={Math.abs(splitPct - 50) > 0.5}
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to swipe between the two maps, click to centre the split"
            title="Drag to swipe · click to snap back to 50%"
            onPointerDown={startSplitDrag}
          />
          <div className="readout-stack">
          {shapeHint && (
            <Paper className="shape-hint" shadow="md" px="sm" py={6} radius="md" withBorder>
              <Text size="xs" c="dimmed">
                {shapeHint}
              </Text>
            </Paper>
          )}
          {hasShapes && (
            <Paper
              className="measure-panel"
              shadow="md"
              p="sm"
              radius="md"
              withBorder
            >
              <Group gap="xl" wrap="nowrap" align="flex-start">
                {(
                  [
                    ['Left', leftTotals],
                    ['Right', rightTotals],
                  ] as const
                ).map(([label, totals]) => (
                  <div key={label}>
                    <Text size="xs" c="dimmed">
                      {label}
                    </Text>
                    <Text fw={600} size="sm">
                      {totals.count} shape{totals.count === 1 ? '' : 's'}
                    </Text>
                    {totals.areaM2 > 0 && (
                      <Text size="xs" c="dimmed">
                        {formatArea(totals.areaM2)}
                      </Text>
                    )}
                    {totals.lengthM > 0 && (
                      <Text size="xs" c="dimmed">
                        {formatDistance(totals.lengthM)}
                      </Text>
                    )}
                  </div>
                ))}

                {(areaRatio != null || lengthRatio != null) && (
                  <div>
                    <Text size="xs" c="dimmed">
                      Ratio
                    </Text>
                    {areaRatio != null && (
                      <Text fw={600} size="sm" c="blue">
                        {areaRatio.toFixed(2)}× area
                      </Text>
                    )}
                    {lengthRatio != null && (
                      <Text fw={600} size="sm" c="blue">
                        {lengthRatio.toFixed(2)}× length
                      </Text>
                    )}
                  </div>
                )}

                {selectedDetail && (
                  <div>
                    <Text size="xs" c="dimmed" tt="capitalize">
                      {selectedDetail.shape.kind} selected
                    </Text>
                    {selectedDetail.metrics.radiusM != null && (
                      <Text fw={600} size="sm">
                        r {formatDistance(selectedDetail.metrics.radiusM)}
                      </Text>
                    )}
                    {selectedDetail.metrics.areaM2 != null && (
                      <Text size="xs" c="dimmed">
                        {formatArea(selectedDetail.metrics.areaM2)}
                      </Text>
                    )}
                    {selectedDetail.metrics.lengthM != null && (
                      <Text size="xs" c="dimmed">
                        {formatDistance(selectedDetail.metrics.lengthM)}
                      </Text>
                    )}
                  </div>
                )}
              </Group>
            </Paper>
          )}
          </div>
        </div>
        {fullscreen && (
          <Tooltip label="Exit full screen (Esc)" withArrow position="bottom-end">
            <ActionIcon
              className="fullscreen-exit"
              size="xl"
              radius="xl"
              variant="default"
              onClick={exitFullscreen}
              aria-label="Exit full screen"
            >
              <LuX size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </AppShell.Main>

      {isAuthor && (
        <ManageExploreModal
          opened={manageOpened}
          onClose={closeManage}
          drafts={projects}
          onDraftsChange={handleDraftsChange}
          published={published}
          onPublished={setPublished}
          onOpen={loadProject}
        />
      )}
      <AboutModal
        opened={aboutOpened}
        onClose={closeAbout}
        comparisons={published}
        onPick={handleLoadView}
      />
      <ShareModal opened={shareOpened} onClose={closeShare} render={renderShareImage} />
      <SaveViewModal
        opened={saveOpened}
        defaultTitle={pendingTitle}
        defaultPins={{
          left: openProject?.left.pin ?? CENTRE_PIN,
          right: openProject?.right.pin ?? CENTRE_PIN,
        }}
        onSave={handleConfirmSave}
        onClose={closeSave}
        explore={published}
        fromExplore={!!openFromExplore}
        canUpdateExplore={!!getToken()}
        onUpdateExplore={handleUpdateExplore}
        updating={updatingExplore}
      />
    </AppShell>
  );
}
