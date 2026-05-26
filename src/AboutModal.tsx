import { useEffect } from 'react';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="about-title">About MapCompare</h2>

        <h3>What this is</h3>
        <p>
          A split-screen map tool for comparing the true physical size of cities
          side-by-side. Standard web maps use the Web Mercator projection, which
          inflates landmasses the farther you get from the equator — Greenland
          looks as big as Africa even though Africa is ~14× larger.
        </p>
        <p>
          MapCompare cancels this distortion <em>between</em> the two panes: when
          you zoom one map, the other's zoom is recomputed so that one pixel
          represents the same physical distance on both. The math is{' '}
          <code>z_target = z_source + log₂(cos(lat_target) / cos(lat_source))</code>.
          A city near the equator and a city at 60° latitude end up at visibly
          different zoom levels, but identical scale.
        </p>

        <h3>Current limitations</h3>
        <ul>
          <li>
            <strong>Each individual map is still Web Mercator.</strong> The
            equalization happens at the map center. Within a single pane,
            features farther from the center latitude still have Mercator
            stretch. At city zoom (z ≥ 11) this is fractions of a percent —
            invisible. Zoomed out to continent scale, it becomes noticeable.
          </li>
          <li>
            Panning is fully independent — only zoom is synced. This is by
            design (it lets you align Times Square with Shibuya manually) but
            means scale equality is only guaranteed when both centers are set.
          </li>
          <li>
            Tile providers used here (OSM, Esri imagery, OpenTopoMap) only serve
            Web Mercator tiles, which constrains the projection options below.
          </li>
        </ul>

        <h3>Planned next steps</h3>
        <ul>
          <li>
            <strong>Full equal-area projection</strong> within each pane — likely
            via <code>proj4leaflet</code> with a Lambert Azimuthal or Albers CRS,
            or switching to MapLibre + vector tiles which can be reprojected
            client-side.
          </li>
          <li>A live meters-per-pixel readout per pane to verify equalization.</li>
          <li>A measurement tool (click two points to get true ground distance).</li>
          <li>A reference grid overlay showing geographic spacing.</li>
        </ul>

        <p className="modal-foot">
          Source on GitHub. Built with React, Leaflet, OpenStreetMap, and
          Nominatim — all open source.
        </p>
      </div>
    </div>
  );
}
