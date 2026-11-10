# Plan: export the comparison as a PNG

Status: **built 2026-11-10** (footer kept, sizes panel left out, per Neela).
Footer revised the same day: no title row; row 1 is each city with its scale
bars, row 2 is "site | credits". Then the button became **Share** (share
icon), opening a modal with a preview, Copy image and Download; it's where a
link, embed code and more formats will go.
Code: `src/exportLayout.ts` (pure, tested) and `src/exportImage.ts` (drawing).
One change from the plan: MapLibre's maps are found through Leaflet's own
layers and panes at export time, not through a registry.

## Goal

One click saves the comparison on screen as a PNG, ready to post or put in
a slide. It shows what you see: both maps cut at the split, at true scale,
with their shapes. A thin footer makes it stand on its own.

## What's in the image

- **Both maps as on screen,** cut at the split, with a thin divider line.
  Everything drawn on them comes along: satellite or map view, labels,
  borders, the scale grid if it's on, and shapes with their measurement
  labels if Annotations is on.
- **City names** in the top corners, like the city cards.
- **Footer band:**
  - the title (the open comparison's name, otherwise "Tokyo vs Paris");
  - both scale bars;
  - the map credits;
  - the site address.
  The credits are required: OpenStreetMap's licence and Esri's terms apply to
  images too, not only the live map.
- **Left out:** buttons, search bars, zoom, the sizes panel and the drawing
  hint.
- **Size:** the window size × screen density, so it's sharp on a retina
  screen (a 1480×810 window gives 2960×1620 plus the footer).
- **File name:** `mapcompare-tokyo-vs-paris.png`.

## Where the button goes

- Header, right side, next to Full screen: an "image download" icon.
- Available in both the public view and the author's version: export only
  reads, it saves nothing.

## How (no new library)

We draw our own image on a canvas, in the same layer order as the screen,
for each map:

1. **Satellite tiles:** each `<img>` drawn at its on-screen position.
   - The Esri layer gets `crossOrigin: 'anonymous'`, so the browser lets us
     read it. Checked: Esri sends `Access-Control-Allow-Origin: *`.
2. **Vector map and labels (MapLibre):** its WebGL canvas, read inside a
   render (`triggerRepaint` then `once('render')`).
   - This avoids `preserveDrawingBuffer`, which would slow down every frame.
   - Checked: OpenFreeMap also sends `Access-Control-Allow-Origin: *`.
3. **Scale grid:** it's already a canvas, so it's copied directly.
4. **Shapes:** Leaflet's SVG is serialised into an image and drawn.
5. **Measurement labels:** these are HTML, so we draw them ourselves as pills
   with the same text.

Then:
- the right map is clipped at the split;
- the city names and the divider are drawn;
- the footer is added;
- the canvas becomes a PNG, which downloads.

**Rejected: the `html-to-image` library.** It struggles with exactly what this
app is made of: the clip-path curtain, the WebGL canvas and Leaflet's CSS
transforms. It would also be a new dependency, for worse results.

## Tests (test first)

**Pure, unit-tested:**
- where each map's visible part lands, from the split and the window size;
- the footer layout: what fits on a narrow window, with the credits never
  dropped;
- the file name made from the title;
- the measurement-pill text.

**Checked in the browser:**
- sample pixels in the PNG: satellite on the left, the right map's imagery
  past the split, and shape strokes where the shapes are;
- the credits read correctly in the footer;
- both satellite and map views, with Annotations on and off;
- in the public view;
- no "tainted canvas" error in the console.

## Risks

- **First export after the change:** satellite tiles already cached without
  CORS may need reloading. Handled by setting `crossOrigin` from the start;
  only the very first visit after the release fetches them again.
- **A tile still loading** is blank in the image. Export waits for tiles to
  finish (Leaflet's `load` event) before drawing.
- **Very large windows:** canvas size limits are around 16k px a side, so we
  cap the density if needed.

## Not now

Other formats (JPEG, SVG, PDF), a custom size, the sizes panel in the image,
and embed.
