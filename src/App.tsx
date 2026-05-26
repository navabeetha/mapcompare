import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPane, type MapPaneHandle } from './MapPane';
import { PRESETS, CITIES, type CityPreset } from './presets';
import { compensatedZoom } from './scale';

type Side = 'left' | 'right';

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;

  const [leftCity, setLeftCity] = useState<CityPreset>(preset.left);
  const [rightCity, setRightCity] = useState<CityPreset>(preset.right);
  const [splitPct, setSplitPct] = useState(50);

  // Sync state: trigger lock + per-side interaction flags + debouncer.
  const syncTriggerRef = useRef<Side | null>(null);
  const isUserInteractingLeft = useRef(false);
  const isUserInteractingRight = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);

  // Adopt new preset cities.
  useEffect(() => {
    setLeftCity(preset.left);
    setRightCity(preset.right);
  }, [preset]);

  const handleReady = useCallback((handle: MapPaneHandle) => {
    if (handle.side === 'left') leftMapRef.current = handle.map;
    else rightMapRef.current = handle.map;
  }, []);

  const handleInteraction = useCallback((side: Side, interacting: boolean) => {
    if (side === 'left') isUserInteractingLeft.current = interacting;
    else isUserInteractingRight.current = interacting;
  }, []);

  const handleUserZoom = useCallback(
    (side: Side, zoom: number, sourceLat: number) => {
      // If a programmatic zoom is in flight, ignore the resulting zoomend.
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
        // Release the trigger lock once the resulting zoomend has fired.
        window.setTimeout(() => {
          syncTriggerRef.current = null;
        }, 50);
      }, 150);
    },
    []
  );

  // Splitter drag.
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
        // Trigger Leaflet to recalc tile coverage for the resized panes.
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

  // Recompute leaflet sizes on splitPct slider changes too.
  useEffect(() => {
    leftMapRef.current?.invalidateSize();
    rightMapRef.current?.invalidateSize();
  }, [splitPct]);

  return (
    <div className="app">
      <div className="toolbar">
        <h1>🗺️ MapCompare</h1>
        <label style={{ fontSize: 13, color: 'var(--muted)' }}>Preset:</label>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 12 }}>
          Split: {splitPct.toFixed(0)}%
        </label>
        <input
          type="range"
          min={10}
          max={90}
          value={splitPct}
          onChange={(e) => setSplitPct(parseFloat(e.target.value))}
        />
        <div className="spacer" />
        <button
          onClick={() => {
            setLeftCity(CITIES.tokyo);
            setRightCity(CITIES.paris);
            setPresetId('sprawl');
          }}
          title="Reset to first preset"
        >
          Reset
        </button>
      </div>

      <div
        className="split-container"
        ref={splitContainerRef}
        style={{ position: 'relative' }}
      >
        <div style={{ width: `${splitPct}%`, height: '100%' }}>
          <MapPane
            side="left"
            initialCity={preset.left}
            city={leftCity}
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
            initialCity={preset.right}
            city={rightCity}
            onReady={handleReady}
            onUserZoom={handleUserZoom}
            onInteractionChange={handleInteraction}
            onSearchCity={(_, c) => setRightCity(c)}
          />
        </div>
      </div>
    </div>
  );
}
