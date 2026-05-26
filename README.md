# MapCompare

A split-screen geo-spatial app for **true-scale** city comparison. Standard web maps (Web Mercator) distort landmass sizes by latitude — MapCompare corrects for it by syncing the two maps' zoom levels so that one pixel on the left represents the same physical distance as one pixel on the right.

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full feature spec, user stories, and design notes.

## Stack
- **Vite + React + TypeScript** — static client-only build
- **Leaflet** — map rendering (MIT)
- **OpenStreetMap / Esri / OpenTopoMap** tiles — free public tile servers
- **Nominatim** — free OSM-hosted geocoding for search

All open source. No API keys required.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:5173.

## Build
```bash
npm run build
npm run preview
```

## Deploy free to GitHub Pages
1. Push this repo to GitHub.
2. In repo Settings → Pages, set **Source** to "GitHub Actions".
3. Push to `main`. The `.github/workflows/deploy.yml` workflow builds and publishes `dist/` automatically.

The Vite `base: './'` config produces relative asset paths so the site works under `https://<user>.github.io/<repo>/` without further config.

### Manual one-off deploy
If you'd rather skip Actions:
```bash
npm run deploy   # uses gh-pages package to push dist/ to gh-pages branch
```

## Project layout
```
src/
  App.tsx          # top-level layout, splitter, sync controller
  MapPane.tsx      # one Leaflet map + per-pane toolbar (search, style)
  scale.ts         # latitude-corrected zoom math
  presets.ts       # curated city pairs + metadata
  tileLayers.ts    # tile provider config
  styles.css       # app styling
```

## Tile attribution
The free tile providers used here require attribution, which Leaflet renders automatically in the bottom-right of each map. Don't remove it.

## Notes on the sync engine
The dual-map sync uses three primitives described in DOCUMENTATION.md §"Design & Synchronization Notes":
- `syncTriggerRef` — a single-writer lock identifying which side originated the current zoom transaction.
- `isUserInteractingLeft` / `isUserInteractingRight` — flags that suppress programmatic recentering while a user is actively dragging/zooming the other pane.
- 150 ms debounce + `{ animate: false }` on the programmatic `setZoom` — neutralizes feedback loops and visual jitter.

Panning is fully independent: only zoom is synchronized.
