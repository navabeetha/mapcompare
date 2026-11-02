import L from 'leaflet';
import {
  createShapeId,
  measureShape,
  minPoints,
  toLatLngs,
  type MeasureShape,
  type Point,
  type ShapeMode,
} from './shapes';
import { destinationPoint, formatArea } from './geometry';
import { formatDistance } from './altitude';

/** Matches the blue the original measure tool used, for visual continuity. */
const STROKE = '#4dabf7';

/** How close (in screen px) a click must land to a polygon's first vertex to close it. */
const CLOSE_SNAP_PX = 12;

export interface ShapeLayerOptions {
  /** Geometry changed — either drawn, dragged, or a vertex added/removed. */
  onChange: (shapes: MeasureShape[]) => void;
  /** Selection changed. Null when nothing is selected. */
  onSelect: (id: string | null) => void;
}

/** One rendered shape: its Leaflet geometry plus the snapshot we drew it from. */
interface Rendered {
  snapshot: MeasureShape;
  layer: L.Circle | L.Polygon | L.Polyline;
}

/**
 * Renders and edits the measurement shapes on a single pane.
 *
 * This is a class rather than a draw function (unlike GridLayer) because it owns
 * live state: which shape is selected, a half-finished drawing, and a set of
 * draggable handles that have to survive across React renders.
 *
 * React remains the owner of the shape *data*. The flow is one-directional with
 * an echo: a drag mutates the Leaflet layer for immediate feedback and reports
 * via onChange; React stores that and calls setShapes back; setShapes recognises
 * the geometry as already-rendered and does nothing. That echo is why
 * setShapes diffs rather than rebuilding — a rebuild would destroy the very
 * handle under the user's cursor.
 */
export class ShapeLayer {
  private map: L.Map;
  private opts: ShapeLayerOptions;

  /** Committed geometry. */
  private group: L.LayerGroup;
  /** Edit handles, kept separate so they can be cleared without touching geometry. */
  private handleGroup: L.LayerGroup;
  /** In-progress drawing preview. */
  private draftGroup: L.LayerGroup;

  private rendered = new Map<string, Rendered>();
  private shapes: MeasureShape[] = [];
  private mode: ShapeMode = 'off';
  private selectedId: string | null = null;

  /** Vertices clicked so far for the shape being drawn. */
  private draftPoints: L.LatLng[] = [];
  /** Coalesces onChange to one call per frame while dragging. */
  private pendingFrame: number | null = null;
  /**
   * True for the duration of a handle drag. The handle group is frozen while it
   * is set — see refreshHandles.
   */
  private dragging = false;

  constructor(map: L.Map, opts: ShapeLayerOptions) {
    this.map = map;
    this.opts = opts;
    this.group = L.layerGroup().addTo(map);
    this.handleGroup = L.layerGroup().addTo(map);
    this.draftGroup = L.layerGroup().addTo(map);

    map.on('click', this.onMapClick);
    map.on('mousemove', this.onMapMouseMove);
    map.on('dblclick', this.onMapDblClick);
    document.addEventListener('keydown', this.onKeyDown);
  }

  destroy(): void {
    this.map.off('click', this.onMapClick);
    this.map.off('mousemove', this.onMapMouseMove);
    this.map.off('dblclick', this.onMapDblClick);
    document.removeEventListener('keydown', this.onKeyDown);
    if (this.pendingFrame != null) cancelAnimationFrame(this.pendingFrame);
    this.map.removeLayer(this.group);
    this.map.removeLayer(this.handleGroup);
    this.map.removeLayer(this.draftGroup);
    this.rendered.clear();
  }

  // ---------------------------------------------------------------- mode

  /**
   * 'off' is the view-mode setting: shapes still render, but nothing responds to
   * input. The drawing kinds arm the draw gesture; 'edit' allows selection and
   * handle dragging only.
   */
  setMode(mode: ShapeMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.cancelDraft();

    // Clicking the map to place a vertex and double-clicking to finish both
    // collide with Leaflet's own double-click zoom, so it yields while drawing.
    if (mode === 'off' || mode === 'edit') this.map.doubleClickZoom.enable();
    else this.map.doubleClickZoom.disable();

    this.map.getContainer().style.cursor =
      mode === 'off' || mode === 'edit' ? '' : 'crosshair';

    if (mode === 'off') this.select(null);
    this.refreshHandles();
  }

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.refreshHandles();
    this.opts.onSelect(id);
  }

  // -------------------------------------------------------------- render

  /**
   * Bring the rendered geometry in line with `shapes`, touching as little as
   * possible. Anything whose snapshot still matches is left strictly alone so an
   * in-flight handle drag is never interrupted.
   */
  setShapes(shapes: MeasureShape[]): void {
    this.shapes = shapes;
    const seen = new Set<string>();

    for (const shape of shapes) {
      seen.add(shape.id);
      const existing = this.rendered.get(shape.id);

      if (!existing) {
        this.rendered.set(shape.id, {
          snapshot: clone(shape),
          layer: this.createLayer(shape),
        });
        continue;
      }
      if (sameGeometry(existing.snapshot, shape)) continue;

      this.updateLayer(existing.layer, shape);
      existing.snapshot = clone(shape);
      this.setTooltip(existing.layer, shape);
    }

    for (const [id, r] of this.rendered) {
      if (seen.has(id)) continue;
      this.group.removeLayer(r.layer);
      this.rendered.delete(id);
      if (this.selectedId === id) this.selectedId = null;
    }

    this.refreshHandles();
  }

  private createLayer(shape: MeasureShape): L.Circle | L.Polygon | L.Polyline {
    const pts = toLatLngs(shape);
    const style: L.PathOptions = {
      color: STROKE,
      weight: 3,
      fillOpacity: shape.kind === 'line' ? 0 : 0.12,
    };

    const layer =
      shape.kind === 'circle'
        ? L.circle(pts[0], { ...style, radius: shape.radiusM ?? 0 })
        : shape.kind === 'polygon'
          ? L.polygon(pts, style)
          : L.polyline(pts, style);

    layer.on('click', (e) => {
      // Don't let the map's own click handler also treat this as "clicked empty
      // space" (which would deselect) or as a new vertex.
      L.DomEvent.stopPropagation(e);
      if (this.mode === 'off') return;
      this.select(shape.id);
    });

    layer.addTo(this.group);
    this.setTooltip(layer, shape);
    return layer;
  }

  private updateLayer(layer: L.Layer, shape: MeasureShape): void {
    const pts = toLatLngs(shape);
    if (shape.kind === 'circle') {
      const c = layer as L.Circle;
      c.setLatLng(pts[0]);
      c.setRadius(shape.radiusM ?? 0);
    } else {
      (layer as L.Polyline).setLatLngs(pts);
    }
  }

  /** The headline number for a shape, shown permanently on the map. */
  private setTooltip(layer: L.Layer, shape: MeasureShape): void {
    const m = measureShape(shape, this.map);
    const label =
      shape.kind === 'circle'
        ? `r ${formatDistance(m.radiusM ?? 0)} · ${formatArea(m.areaM2 ?? 0)}`
        : shape.kind === 'polygon'
          ? formatArea(m.areaM2 ?? 0)
          : formatDistance(m.lengthM ?? 0);

    if (layer.getTooltip()) {
      layer.setTooltipContent(label);
      return;
    }
    layer.bindTooltip(label, {
      permanent: true,
      direction: 'center',
      className: 'shape-tip',
      // A circle's centre handle sits exactly where a centred tooltip would be,
      // hiding the only grip for moving the whole shape — so nudge the label
      // clear of it. Polygons and lines have no handle at their centroid.
      offset: shape.kind === 'circle' ? [0, 22] : [0, 0],
    });
  }

  // ------------------------------------------------------------- handles

  /**
   * Rebuild the handles for the selected shape. Handles exist only for the
   * selection, so a pane with several shapes doesn't turn into a field of dots.
   */
  private refreshHandles(): void {
    // Never rebuild mid-drag. Each drag frame runs mutate -> onChange -> React ->
    // setShapes, which lands back here; clearing the group at that moment would
    // delete the marker Leaflet is currently dragging and the gesture would stop
    // dead after a few pixels. Every handle releases this on dragend.
    if (this.dragging) return;

    this.handleGroup.clearLayers();
    if (this.mode === 'off' || !this.selectedId) return;

    const entry = this.rendered.get(this.selectedId);
    if (!entry) return;
    const shape = this.shapes.find((s) => s.id === this.selectedId);
    if (!shape) return;

    if (shape.kind === 'circle') this.buildCircleHandles(shape);
    else this.buildVertexHandles(shape);
  }

  private makeHandle(latlng: L.LatLng, variant: 'main' | 'mid'): L.Marker {
    const handle = L.marker(latlng, {
      draggable: true,
      keyboard: false,
      // zIndexOffset keeps handles above the shape fills so they stay grabbable.
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: variant === 'mid' ? 'shape-handle shape-handle--mid' : 'shape-handle',
        iconSize: variant === 'mid' ? [10, 10] : [14, 14],
      }),
    }).addTo(this.handleGroup);

    // Registered before any caller's own dragend, so `dragging` is already false
    // by the time a caller's handler asks for a rebuild.
    handle.on('dragstart', () => {
      this.dragging = true;
    });
    handle.on('dragend', () => {
      this.dragging = false;
    });

    return handle;
  }

  /** The live version of a shape, since handler closures capture a stale copy. */
  private current(id: string): MeasureShape | undefined {
    return this.shapes.find((s) => s.id === id);
  }

  /**
   * A circle gets two handles: the centre, which translates it, and a radius
   * handle sitting due east. The radius handle is re-seated onto the east
   * bearing on every drag so it can't drift off-axis — only the *distance* the
   * user drags it is meaningful, not the direction.
   */
  private buildCircleHandles(shape: MeasureShape): void {
    const id = shape.id;
    const centre = toLatLngs(shape)[0];
    const radius = shape.radiusM ?? 0;

    const centreHandle = this.makeHandle(centre, 'main');
    const rimHandle = this.makeHandle(destinationPoint(centre, radius, 90), 'main');

    centreHandle.on('drag', () => {
      const next = centreHandle.getLatLng();
      this.mutate(id, (s) => {
        s.points = [[next.lat, next.lng]];
      });
      // Read the radius live: a previous rim drag replaced the shape object, so
      // the one captured when these handles were built is out of date.
      const r = this.current(id)?.radiusM ?? radius;
      rimHandle.setLatLng(destinationPoint(next, r, 90));
    });

    rimHandle.on('drag', () => {
      // Only the distance from the centre is meaningful; the direction the user
      // happens to drag in is ignored. The handle is *not* re-seated onto the
      // east bearing here — writing to its position mid-drag fights Leaflet's
      // own dragging and makes it stutter. dragend rebuilds it in place instead.
      const c = centreHandle.getLatLng();
      this.mutate(id, (s) => {
        s.radiusM = this.map.distance(c, rimHandle.getLatLng());
      });
    });

    // Put both handles back on the canonical centre/due-east positions.
    centreHandle.on('dragend', () => this.refreshHandles());
    rimHandle.on('dragend', () => this.refreshHandles());
  }

  /**
   * Lines and polygons get a handle per vertex, plus a smaller handle at each
   * edge midpoint. Dragging a midpoint promotes it to a real vertex, which is
   * how you add detail without a separate "add point" mode. Alt-clicking or
   * right-clicking a vertex removes it, down to the kind's minimum.
   */
  private buildVertexHandles(shape: MeasureShape): void {
    const pts = toLatLngs(shape);
    const closed = shape.kind === 'polygon';

    pts.forEach((p, i) => {
      const h = this.makeHandle(p, 'main');
      h.on('drag', () => {
        const next = h.getLatLng();
        this.mutate(shape.id, (s) => {
          s.points[i] = [next.lat, next.lng];
        });
      });
      // Committing on dragend rebuilds the midpoint handles around the new
      // position; doing it on every drag frame would yank them under the cursor.
      h.on('dragend', () => this.refreshHandles());

      const remove = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (shape.points.length <= minPoints(shape.kind)) return;
        this.mutate(shape.id, (s) => {
          s.points.splice(i, 1);
        });
        this.refreshHandles();
      };
      h.on('contextmenu', remove);
      h.on('click', (e) => {
        if ((e.originalEvent as MouseEvent).altKey) remove(e);
        else L.DomEvent.stopPropagation(e);
      });
    });

    // Midpoints: one per edge, including the closing edge on a polygon.
    const edgeCount = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < edgeCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
      const h = this.makeHandle(mid, 'mid');
      let inserted = false;

      h.on('drag', () => {
        const next = h.getLatLng();
        this.mutate(shape.id, (s) => {
          if (!inserted) {
            s.points.splice(i + 1, 0, [next.lat, next.lng]);
            inserted = true;
          } else {
            s.points[i + 1] = [next.lat, next.lng];
          }
        });
      });
      h.on('dragend', () => this.refreshHandles());
    }
  }

  // -------------------------------------------------------------- drawing

  private onMapClick = (e: L.LeafletMouseEvent) => {
    if (this.mode === 'off') return;
    if (this.mode === 'edit') {
      // A click that reaches the map rather than a shape means empty space.
      this.select(null);
      return;
    }

    if (this.mode === 'circle') {
      if (this.draftPoints.length === 0) {
        this.draftPoints = [e.latlng];
        return;
      }
      const centre = this.draftPoints[0];
      this.commit({
        id: createShapeId(),
        kind: 'circle',
        points: [[centre.lat, centre.lng]],
        radiusM: this.map.distance(centre, e.latlng),
      });
      return;
    }

    // line / polygon: accumulate vertices, closing a polygon when the click
    // lands back on its first vertex.
    if (this.mode === 'polygon' && this.draftPoints.length >= 3) {
      const first = this.map.latLngToContainerPoint(this.draftPoints[0]);
      const here = this.map.latLngToContainerPoint(e.latlng);
      if (first.distanceTo(here) <= CLOSE_SNAP_PX) {
        this.finishDraft();
        return;
      }
    }
    this.draftPoints.push(e.latlng);
    this.drawDraft(e.latlng);
  };

  private onMapMouseMove = (e: L.LeafletMouseEvent) => {
    if (this.draftPoints.length === 0) return;
    this.drawDraft(e.latlng);
  };

  private onMapDblClick = (e: L.LeafletMouseEvent) => {
    if (this.mode !== 'line' && this.mode !== 'polygon') return;
    L.DomEvent.stop(e);
    // The two clicks that make up this double-click already pushed a vertex at
    // (or within a pixel or two of) this spot — drop it before finishing.
    if (this.draftPoints.length > minPoints(this.mode)) this.draftPoints.pop();
    this.finishDraft();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.draftPoints.length === 0) return;
    if (e.key === 'Escape') this.cancelDraft();
    if (e.key === 'Enter') this.finishDraft();
  };

  /** Live preview of the shape being drawn, following the cursor. */
  private drawDraft(cursor: L.LatLng): void {
    this.draftGroup.clearLayers();
    if (this.draftPoints.length === 0) return;

    const dashed: L.PathOptions = {
      color: STROKE,
      weight: 2,
      opacity: 0.85,
      dashArray: '5,6',
      fillOpacity: 0.08,
    };

    if (this.mode === 'circle') {
      const centre = this.draftPoints[0];
      const r = this.map.distance(centre, cursor);
      L.circle(centre, { ...dashed, radius: r }).addTo(this.draftGroup);
      L.tooltip({ permanent: true, direction: 'center', className: 'shape-tip' })
        .setLatLng(centre)
        .setContent(`r ${formatDistance(r)}`)
        .addTo(this.draftGroup);
      return;
    }

    const path = [...this.draftPoints, cursor];
    if (this.mode === 'polygon' && path.length >= 3) {
      L.polygon(path, dashed).addTo(this.draftGroup);
    } else {
      L.polyline(path, dashed).addTo(this.draftGroup);
    }
    for (const p of this.draftPoints) {
      L.circleMarker(p, { radius: 4, color: STROKE, weight: 2 }).addTo(this.draftGroup);
    }
  }

  private finishDraft(): void {
    const kind = this.mode;
    if (kind !== 'line' && kind !== 'polygon') return;
    if (this.draftPoints.length < minPoints(kind)) {
      this.cancelDraft();
      return;
    }
    this.commit({
      id: createShapeId(),
      kind,
      points: this.draftPoints.map((p): Point => [p.lat, p.lng]),
    });
  }

  private cancelDraft(): void {
    this.draftPoints = [];
    this.draftGroup.clearLayers();
  }

  /** Publish a finished shape and select it so its handles appear immediately. */
  private commit(shape: MeasureShape): void {
    this.cancelDraft();
    this.selectedId = shape.id;
    this.opts.onChange([...this.shapes, shape]);
    this.opts.onSelect(shape.id);
  }

  // --------------------------------------------------------------- edits

  /**
   * Apply an edit to one shape: update the Leaflet layer at once for responsive
   * dragging, then report upward at most once per animation frame. Without the
   * frame coalescing a drag would fire a React render per mousemove.
   */
  private mutate(id: string, edit: (shape: MeasureShape) => void): void {
    const next = this.shapes.map((s) => (s.id === id ? clone(s) : s));
    const target = next.find((s) => s.id === id);
    if (!target) return;
    edit(target);
    this.shapes = next;

    const entry = this.rendered.get(id);
    if (entry) {
      this.updateLayer(entry.layer, target);
      entry.snapshot = clone(target);
      this.setTooltip(entry.layer, target);
    }

    if (this.pendingFrame != null) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.opts.onChange(this.shapes);
    });
  }
}

function clone(shape: MeasureShape): MeasureShape {
  return { ...shape, points: shape.points.map((p): Point => [p[0], p[1]]) };
}

/** Cheap structural comparison — enough to spot the echo of our own edit. */
function sameGeometry(a: MeasureShape, b: MeasureShape): boolean {
  if (a.kind !== b.kind || a.radiusM !== b.radiusM) return false;
  if (a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i][0] !== b.points[i][0] || a.points[i][1] !== b.points[i][1]) return false;
  }
  return true;
}
