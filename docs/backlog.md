# Backlog

Everything planned but not built, in one place. Read this when picking the
next piece of work; it isn't needed for day-to-day changes. Each item is
short; a detailed design, if there is one, is in `docs/plans/`.

When an item ships, delete it here and note it in its plan's status line.
When a new idea comes up, add it here rather than in a plan's "later" section.

## Ready to build (designed)

### Embed code in the Share modal
Designed 2026-11-10. Waiting on four decisions: how much readers can do,
whether Explore embeds follow later edits, size options, mouse wheel.
Plan: [`plans/embed.md`](plans/embed.md).

## Next up (not designed yet)

### Author notes on the map
- The author places short text notes on either map, for example "Old city
  walls" or "Same size as Central Park". They're saved with the comparison
  and shown to readers.
- Probably a new shape kind, `note`: one point plus text. It reuses the shape
  layer, the save format and the mirror-to-other-map behaviour.
- Layers → Annotations should hide notes along with the shapes.
- Readers see notes but can't edit them, unless public saving arrives.
- Ties in with an Explore "deep dive" for each comparison.

## Parked

### City limits (parked 2026-11-10)
- A per-map "City limits" button lists the boundary relations Nominatim
  returns for that place (`polygon_geojson=1`, keep `category == boundary`).
- The author picks the right one. It's added as an outline shape with its
  area, simplified and saved with the comparison.
- Known data gaps: Mumbai returns only a point; Tokyo returns the whole
  prefecture, islands included. The Borders layer's "Cities" group covers
  some of this when zoomed in.

### Public saving with curation
Visitors submit comparisons and the author approves them. Needs a real
backend (Supabase, Firebase or similar), because a public page can't safely
hold a write token.

### More image export options
Other formats (SVG, PDF), a custom image size, and the sizes panel in the
image. PNG and JPEG are done.

### A test layer for the Leaflet code
`ShapeLayer.ts`, `MapPane.tsx` and `App.tsx` have no automated tests (see
Known gaps in `CLAUDE.md`). Options: mount Leaflet under jsdom, or add
Playwright.

## To confirm in real use

Small checks that haven't happened yet, not features:
- The phone notice on a real phone: Copy link and Share, and "Continue
  anyway".

Confirmed by Neela on 2026-11-10: Copy link, Copy image, a view link on a
phone (it worked but was unusable, hence the phone notice) and "Save and
update Explore" from the live site.
