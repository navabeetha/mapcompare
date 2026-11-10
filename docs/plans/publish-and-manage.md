# Plan: publish directly and manage Explore

Status: **steps 1–3 shipped 2026-11-10** (live; publishing tested end to
end with a reorder and its revert). Next stage starts at "Next" below.

## Shipped (2026-11-10)

- The Explore list is `src/data/comparisons.json`. Manage Explore (Menu, tool
  mode) publishes it as one commit with the author's fine-grained token.
- Manage Explore: drag to reorder, upload icon (draft → Explore), download
  icon (Explore → drafts), red delete with a confirm, copy drafts or the
  Explore list as JSON, Reload and Forget token in the GitHub badge menu.
- A comparison is a draft or in Explore, never both. To edit an Explore
  comparison: play, then edit, then Save view → "Save and update Explore"
  (publishes at once), or "Save to drafts" under a new name.
- Layers → Annotations hides all shapes and measurements. Notes join it.
- Still to see once in real use: a "Save and update Explore" commit.

## Next

1. **Export:** completes the cycle Featured → Explore → create → publish.
   Not yet designed.
2. **Embed:** only if it's cheap.
3. Step 4 (notes), then step 5 (city limits), below.

## Goal

The author publishes a comparison from the app itself, with no copying of JSON
and no code edit. One "Manage Explore" screen holds drafts and published
comparisons.

## Who sees what

- The manage screen and the Publish button show only in the author's tool mode
  (`localhost`, or the live site with `?mode=tool`). They never show on the
  public page.
- Hiding the screen is **not** the protection: anyone can type `?mode=tool`.
  The real gate is the GitHub token. It's typed only in the author's browser and
  kept in that browser's localStorage. Without it, the screen can't change
  anything.

## Step 1: the featured list becomes data

- Move `CURATED_VIEWS` out of `src/curatedViews.ts` into
  `public/comparisons.json`. The site fetches it on start.
  - The current entries move over as they are. `migrateProject` still upgrades
    v1 entries.
- Explore shows a short loading state. If the fetch fails, it shows the list
  baked in at build time, so it's never empty.
- `?project=<id>` waits for the list before it opens a comparison.
- Tests: parse and migrate the JSON file; fall back on a bad or missing file.

## Step 2: publishing to GitHub

- Settings, in tool mode only: paste a fine-grained GitHub token.
  - It's limited to the `navabeetha/mapcompare` repo, with Contents read/write
    only.
  - It's kept in localStorage. It's never logged, never put in a URL, and never
    in the repo.
  - A "Forget token" button removes it.
- Publish = read `public/comparisons.json` through the GitHub contents API (with
  its `sha`), change it, and write it back as one commit, for example "Publish:
  Mumbai vs Nicobar".
- The push to `main` starts the existing Pages deploy. The change is live in
  about 1 to 2 minutes, and the screen says so.
- Clashes: if the file changed since it was read (a `sha` mismatch), read it
  again, apply the change again, and try once more. Then show an error.
- Pure module (`publish.ts`) with tests: list edits such as add, remove, reorder
  and replace. Network calls go through a thin adapter.

## Step 3: the Manage Explore screen (modal, tool mode)

- **Drafts** (this browser): open, rename, delete, **Publish**.
- **Published** (the JSON file): open, rename, move up or down, **Unpublish**
  (moves it back to drafts in this browser), **Delete** (asks first).
- Each change to the published list is one commit.
- This replaces "Export drafts to clipboard". Keep a plain "Copy JSON" as a
  backup way out.

## Step 4: author notes on the map (with the Explore deep dive)

- The author places short text notes on either map, for example "Old city
  walls" or "Same size as Central Park". They're saved with the comparison and
  shown to readers.
- Probably a new shape kind, `note`: one point plus text. It reuses the shape
  layer, the save format and the mirror-to-other-map behaviour.
- Readers see the notes but can't edit them, unless public saving arrives.

## Step 5: city limits (parked 2026-11-10)

- A per-map "City limits" button lists the boundary relations Nominatim returns
  for that place (`polygon_geojson=1`, keep `category == boundary`).
- The author picks the right one. It's added as an outline shape with its
  area, simplified and saved with the comparison.
- Known data gaps: Mumbai returns only a point; Tokyo returns the whole
  prefecture, islands included. The Borders layer's "Cities" group covers
  some of this when zoomed in.

## Later, not in this plan

- Public saving with curation: visitors submit and the author approves. That
  needs a real backend (Supabase, Firebase or similar), because a public page
  can't safely hold a write token.

## Checks before shipping

- `npm run check` is green.
- In the browser: publish a test comparison, see it on the public page after
  the deploy, unpublish it, and see it gone.
- No token in the repo, console, URLs or commit messages.
