# MapCompare — working notes

Split-screen tool for comparing cities at **true scale**. Web Mercator inflates
landmasses with latitude; MapCompare cancels that distortion *between* the two
maps so one pixel covers the same ground distance on both sides.

## Pre-push checklist

Run before every push. `npm run check` covers the automated part.

1. **`npm run check`** — typecheck (`tsc -b --force`) + production build. This is
   the only automated gate in the repo; it must pass clean. `noUnusedLocals` and
   `noUnusedParameters` are on, so dead code fails the build.
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
5. **Scan the diff** for debug leftovers. One deliberate `console.log` exists in
   `handleExportDrafts` as a clipboard-failure fallback; that one is fine.
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

## Schema

`Project` (`projects.ts`, `schemaVersion: 2`) is the unit of saved work: both
framings, `splitPct`, grid settings, per-pane tile style and all measurement
objects. `migrateProject` upgrades v1 records on read, covering both
localStorage drafts and the curated comparisons compiled into the build — which
is why `curatedViews.ts` is still written in the v1 shape and need not be
rewritten. Loading a project recomputes the second map's zoom from the first via
`compensatedZoom` rather than trusting the stored value, so comparisons authored
before `zoomSnap: 0` land exactly scale-matched.

## Known gaps

- **No tests, linter or formatter.** `scale.ts`, `geometry.ts` and `shapes.ts`
  are pure functions and the most error-prone code here (area and radius maths) —
  the obvious place to start if tests are ever added.
- **The MAP basemap is broken.** CartoDB now gates its Voyager tiles behind an
  API key and serves "API KEY REQUIRED" watermarks. Only affects authoring; every
  curated project renders satellite. Fix is a keyless provider in `tileLayers.ts`.
- **First load is not scale-matched** in tool mode — both cities open at their
  preset zoom until you interact. A sync in `handleReady` would close it.
