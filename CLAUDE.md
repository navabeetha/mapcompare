# MapCompare — working notes

Split-screen tool for comparing cities at **true scale**. Web Mercator inflates
landmasses with latitude; MapCompare cancels that distortion *between* the two
maps so one pixel covers the same ground distance on both sides.

## How work gets done here

**Test-first.** New behaviour starts with a failing test. Bug fixes start with a
regression test that fails on the current code — a fix without one is a fix you
can't prove worked. Run `/pod` to drive a change through the role agents
(`test-author` → `implementer` → `qa`), or do it inline for small changes, where
a pod costs more than it returns.

`src/geometry.ts`, `src/shapes.ts`, `src/scale.ts` and `src/altitude.ts` are pure
functions and fully testable — anything landing there should arrive with tests.
The Leaflet-facing modules (`ShapeLayer.ts`, `MapPane.tsx`, `App.tsx`) are mostly
verified by driving a real browser; see step 2 below.

Tests use vitest under jsdom (Leaflet touches `window` at import time, so even
pure geometry needs a DOM to be importable). `map.distance` is stubbed from
`L.CRS.Earth` rather than building a real map — see the top of
`src/geometry.test.ts`.

## Pre-push checklist

Run before every push. `npm run check` covers the automated part.

1. **`npm run check`** — typecheck + `vitest run` + production build. Must pass
   clean. `noUnusedLocals` and `noUnusedParameters` are on, so dead code fails
   the build.
2. **Exercise the change in a browser** — `npm run dev`, then check both
   `localhost:5173/` (tool) and `localhost:5173/?mode=view` (viewer). There are
   no tests, so this is the real verification step. Prefer measuring over
   eyeballing: read values off the Leaflet instances rather than trusting a
   screenshot.
3. **Check the browser console** is clean. Note that the console buffer replays
   stale entries across hot reloads — confirm a suspicious warning against a
   fresh load, or against the DOM, before believing it.
4. **`git status`** — no stray scratch files; `dist/` and `*.tsbuildinfo` stay
   ignored.
5. **Scan the diff** for debug leftovers.
6. **Remember that pushing to `main` publishes.** `.github/workflows/deploy.yml`
   deploys to GitHub Pages on every push to `main`, so a push is a release.
   Changes to default behaviour are immediately public.

## Invariants worth not breaking

- **Zoom is synced; panning is deliberately independent.** Hand-aligning
  landmarks between the two maps is the point. Don't "fix" independent panning.
- **`App` is the single writer of map view state.** Everything programmatic goes
  through `applyView`, which raises `suppressSyncRef` for the duration. That flag
  — not a timer — is the whole loop guard. `MapPane` reports what the user did
  and never moves itself.
- **`zoomSnap: 0` is required**, not a style choice. The latitude-compensated
  zoom is an arbitrary real number (`sourceZoom + log2(cos ratio)`); snapping it
  to a grid leaves the two maps up to ~9% apart in scale and breaks the premise.
- **The layout is a curtain, not two panes.** Both maps are full-viewport and
  superimposed; the right one is clipped at the splitter. Dragging the grip moves
  only the clip boundary, so neither map resizes or re-centres and the imagery
  stays pixel-locked. Each map's centre is therefore the screen centre, under the
  grip. `clip-path` also clips hit-testing, which is what routes clicks to the
  correct map.
- **Every `invalidateSize` must be paired with an explicit re-pin.** On its own,
  `pan: false` re-measures without compensating and the centre slides by half the
  size delta; `pan: true` applies its own correction that fights ours. Leaflet's
  `trackResize` is off for the same reason — `App` owns resize handling.
- **Shapes: the handle group is frozen during a drag.** Each drag frame round-
  trips through React (`mutate → onChange → setShapes`), and rebuilding handles
  there would delete the marker Leaflet is dragging.

## Scale bars

Both maps show the **same round distances**, and the km bar equals the scale
grid's cell length (`scaleBar.ts`, `ScaleControl.ts`; Leaflet's own scale
control is not used). The distance comes from the grid's reference (the
left map); each map draws it at its own metres per pixel, so bar lengths stay
true. A fixed grid length the author set is used while it gives a readable
bar (40–240 px), otherwise the automatic one.

## Schema

`Project` (`projects.ts`, `schemaVersion: 2`) is the unit of saved work: both
framings, `splitPct`, grid settings, per-pane tile style and all measurement
objects. `migrateProject` upgrades v1 records on read, covering both
localStorage drafts and the published list. Loading a project recomputes the second map's zoom from the first via
`compensatedZoom` rather than trusting the stored value, so comparisons authored
before `zoomSnap: 0` land exactly scale-matched.

## Publishing (Manage Explore)

The Explore list is `src/data/comparisons.json`, imported at build time. The
author edits it from Menu → Manage Explore (tool mode only): changes collect
in the modal and go out as **one commit** through the GitHub contents API
(`src/publish.ts`), which starts the Pages deploy (live in ~1–2 minutes). The
author's fine-grained token (Contents read/write on this repo only) lives in
that browser's localStorage under `mapcompare:githubToken`; it's never logged,
put in a URL or committed. A write names the sha it was based on; on a clash it
re-reads once and writes only if nothing else changed, otherwise it stops.
Hiding the screen in view mode is not the guard; the token is.

A comparison is **either a draft or in Explore, never both** (`pruneDrafts`
runs after each load and publish). To change an Explore comparison: open it
(play), edit, then Save view → "Save and update Explore" (publishes that one
comparison at once, same id) or "Save to drafts", which needs a name not in
Explore (`draftNameClash`).

## Share (image export)

Header → Share (both modes) opens `ShareModal.tsx`: a preview of the PNG with
Copy image and Download (the same blob as the preview). Later sections (link,
embed, more formats) go in this modal. `exportImage.ts` (`renderComparison`) redraws the maps
from the DOM onto a canvas in screen order (tiles → MapLibre → shapes SVG →
grid → measurement labels), clips the right map at the split, and adds a
footer (`exportLayout.ts`) with the title, both scale bars and the **map
credits, which must stay** (OSM licence, Esri terms). Reading pixels needs
CORS: the Esri layer has `crossOrigin: 'anonymous'`; don't remove it. A
MapLibre (WebGL) canvas is read inside its own `render` event.

## Known gaps

- **No linter or formatter.** Style is held by convention and review only.
- **The Leaflet-facing code is untested.** `ShapeLayer.ts`, `MapPane.tsx` and
  `App.tsx` carry most of the behaviour and all of the bugs found so far, but
  they need a real map to exercise. Testing them means either jsdom-mounting
  Leaflet or a Playwright layer — neither exists yet, so browser verification
  stands in.
- **Map views and labels.** Map view and the labels over satellite are vector
  layers from OpenFreeMap, drawn by MapLibre (`labels.ts`, `tileLayers.ts`).
  MapLibre is lazy-loaded, so satellite-only sessions never fetch it. Its worker
  URL must be set explicitly (`setWorkerUrl`), or Vite's bundling breaks it with
  "Worker failed to load". Both maps share one view (Satellite or Map), chosen
  in the Layers menu. The default is satellite with labels on. A Topo view
  (OpenTopoMap) was tried and dropped as hard to read. CARTO, the old Map
  view, now needs an API key and is gone.
- **No country borders, in any view.** This is a deliberate stand. The Borders
  layer (`vectorStyle.ts`) draws admin levels 3–8 only, and never admin_level 2,
  disputed, `claimed_by` or maritime lines. The Map view also strips all of
  Liberty's own boundary layers. Tests pin this; don't relax it.
- **First load is not scale-matched** in tool mode — both cities open at their
  preset zoom until you interact. A sync in `handleReady` would close it.
