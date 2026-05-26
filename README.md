# MapCompare

A split-screen geo-spatial app for **true-scale** city comparison. Standard web maps (Web Mercator) distort landmass sizes by latitude — MapCompare corrects for it by syncing the two maps' zoom levels so that one pixel on the left represents the same physical distance as one pixel on the right.

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full feature spec, user stories, and design notes.

## Stack
- **Vite + React + TypeScript** — static client-only build
- **Mantine v9** — UI components
- **Leaflet** — map rendering (MIT)
- **CartoDB Voyager / Esri World Imagery** tiles — free public tile servers
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

## Author vs guest mode
The Comparisons dropdown ships with a hand-curated list in
[`src/curatedViews.ts`](./src/curatedViews.ts). Visitors of the deployed site
can browse and load these but can't add or remove them.

- **Dev mode (`npm run dev`)** — the Save button is visible, your own drafts
  appear in a "Drafts (local only)" section of the dropdown, and an "Export
  drafts to clipboard" action copies them as JSON ready to paste into
  `curatedViews.ts`.
- **Production (deployed build)** — Save button is hidden. Only the featured
  comparisons from `curatedViews.ts` show.

Authoring workflow:
1. `npm run dev`
2. Set up a comparison, click **Save**, give it a title
3. Repeat for each comparison you want featured
4. Open Comparisons → "Export drafts to clipboard"
5. Paste the JSON between the brackets in `src/curatedViews.ts`
6. Commit and push — the deployed site picks them up

Local drafts live in `localStorage` under `mapcompare:savedViews` and are
per-browser. They aren't part of the deployed app.

## Deploy free to GitHub Pages
1. Push this repo to GitHub.
2. In repo Settings → Pages, set **Source** to "GitHub Actions".
3. Push to `main`. The `.github/workflows/deploy.yml` workflow builds and
   publishes `dist/` automatically. The site appears at
   `https://<username>.github.io/<repo-name>/`.

The Vite `base: './'` config produces relative asset paths so the site works
under any subpath without further config.

### Manual one-off deploy
If you'd rather skip Actions:
```bash
npm run deploy   # uses gh-pages package to push dist/ to gh-pages branch
```

## Project layout
```
src/
  App.tsx          # top-level layout, splitter, sync controller, header
  MapPane.tsx      # one Leaflet map + per-pane toolbar (search, style)
  AboutModal.tsx   # about dialog content
  SaveViewModal.tsx # save-view title prompt
  scale.ts         # latitude-corrected zoom math
  altitude.ts      # eye-altitude + meters-per-pixel helpers
  GridLayer.ts     # scale-grid checkerboard renderer
  presets.ts       # initial city pair (Tokyo, Paris) + metadata
  curatedViews.ts  # featured comparisons that ship with the deployed app
  savedViews.ts    # localStorage helpers for local drafts
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
