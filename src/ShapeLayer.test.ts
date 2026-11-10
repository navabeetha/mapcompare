import { describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import { ShapeLayer } from './ShapeLayer';
import type { MeasureShape } from './shapes';

/**
 * The Annotations switch (Layers menu) hides every shape on a map. Leaflet
 * runs under jsdom here; nothing is measured, only which layers are on it.
 */
function setup() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const map = L.map(el, { center: [52.37, 4.9], zoom: 12 });
  const onChange = vi.fn();
  const layer = new ShapeLayer(map, { onChange, onSelect: vi.fn() });
  const line: MeasureShape = { id: 's1', kind: 'line', points: [[52.37, 4.9], [52.38, 4.91]] } as MeasureShape;
  layer.setShapes([line]);
  const count = () => {
    let n = 0;
    // Leaflet's SVG renderer is a layer too and stays put; count the rest.
    map.eachLayer((l) => void (l instanceof L.Renderer || n++));
    return n;
  };
  return { map, layer, onChange, count };
}

describe('ShapeLayer.setVisible (the Annotations switch)', () => {
  it('takes every shape off the map when hidden and puts it back when shown', () => {
    const { layer, count } = setup();
    const shown = count();
    layer.setVisible(false);
    expect(count()).toBeLessThan(shown);
    expect(count()).toBe(0);
    layer.setVisible(true);
    expect(count()).toBe(shown);
  });

  it('ignores map clicks while hidden, so nothing is drawn unseen', () => {
    const { map, layer, onChange } = setup();
    layer.setMode('line');
    layer.setVisible(false);
    map.fire('click', { latlng: L.latLng(52.36, 4.89) });
    map.fire('click', { latlng: L.latLng(52.35, 4.88) });
    map.fire('dblclick', { latlng: L.latLng(52.35, 4.88) });
    expect(onChange).not.toHaveBeenCalled();
  });
});
