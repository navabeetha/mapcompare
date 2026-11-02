# QA log

Durable record of what was verified, what was found, and what remains unchecked.
Appended by the `qa` agent (and by hand). Newest first.

Agents forget everything between runs, so this file — along with the test suite —
is the only continuous memory the process has. Write entries for someone reading
them in six months with no context.

---

## 2026-11-02 — Test infrastructure introduced

**Changed:** Added vitest + jsdom; 42 tests across `scale.test.ts`,
`geometry.test.ts`, `shapes.test.ts`. `npm run check` now runs typecheck → tests
→ build.

**Verified:**
- Full gate passes: 42/42 tests, typecheck clean, build clean.
- `compensatedZoom` holds equal meters-per-pixel across six latitude pairs to
  9 decimal places — the app's core invariant is now pinned by test.
- `geodesicArea` agrees with width × height for ground-built rectangles at
  latitudes 20°, 35° and 64°, and is winding-order independent.
- `mirrorShape` preserves every vertex's ground offset from the centroid when
  copied to 64°N, the worst-case distortion.

**Found:**
1. *(fixed)* `compensatedZoom` returned **−43.36** instead of the intended
   fallback for a latitude of exactly 90°. The guard tested `cos <= 0`, but
   `Math.cos(90°)` is `6.12e-17` in floating point, so an exact pole slipped
   through into `log2(~1e-16)`. Now guarded against a `MIN_COS` epsilon. Only
   reachable via malformed data — Web Mercator stops at ±85.05° — but it would
   have silently zoomed the map to the whole world.
2. *(fixed)* `geometry.ts` computed area on the equatorial radius (6378137) while
   `map.distance` uses the mean radius (6371008.8), so a polygon's area and its
   perimeter were on different spheres, ~0.4% apart. Unified on Leaflet's value.
   Found by trying to write an assertion relating the two.

**Not verified / still manual:** everything Leaflet-facing. `ShapeLayer`,
`MapPane` and `App` have no automated coverage — handle dragging, wheel-zoom
ramp, curtain clipping, pointer routing through `clip-path`, and the
pane-resize re-pin were all verified by driving a real browser and reading values
off the live Leaflet instances. A regression in any of them would currently ship.
