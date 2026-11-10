import { describe, expect, it } from 'vitest';
import comparisons from './data/comparisons.json';
import { migrateProjects, SCHEMA_VERSION, type Project } from './projects';
import { decodeView, encodeView, readViewHash, viewLink, MAX_VIEW_BYTES } from './viewLink';

const explore = migrateProjects(comparisons as unknown[]);

/** A view with many shapes, the worst case for link length. */
function busyView(): Project {
  const shape = (i: number) => ({
    id: `s${i}`,
    kind: 'polygon' as const,
    points: Array.from({ length: 6 }, (_, k): [number, number] => [52.37 + i * 0.001 + k * 0.0001234567, 4.89 + k * 0.0007654321]),
  });
  return {
    ...explore[0],
    left: { ...explore[0].left, shapes: Array.from({ length: 10 }, (_, i) => shape(i)) },
  };
}

describe('encodeView / decodeView: the whole view survives the trip', () => {
  it('round-trips every Explore comparison', async () => {
    for (const p of explore) {
      const back = await decodeView(await encodeView(p));
      expect(back).not.toBeNull();
      expect(back!.left.city.name).toBe(p.left.city.name);
      expect(back!.right.city.country).toBe(p.right.city.country);
      expect(back!.splitPct).toBeCloseTo(p.splitPct, 5);
      expect(back!.left.zoom).toBeCloseTo(p.left.zoom, 5);
      expect(back!.left.lat).toBeCloseTo(p.left.lat, 5);
      expect(back!.left.shapes.length).toBe(p.left.shapes.length);
      expect(back!.grid).toEqual(p.grid);
      expect(back!.title).toBe(p.title);
    }
  });

  it('keeps shapes to within about 10 cm (6 decimal places)', async () => {
    const p = busyView();
    const back = await decodeView(await encodeView(p));
    const a = p.left.shapes[3].points[2];
    const b = back!.left.shapes[3].points[2];
    expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-6);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-6);
  });

  it('comes back as a current-schema project with a fresh id', async () => {
    const back = await decodeView(await encodeView(explore[0]));
    expect(back!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(back!.id).toBeTruthy();
    expect(back!.id).not.toBe(explore[0].id);
  });
});

describe('encodeView: a link that pastes cleanly', () => {
  it('uses only URL-safe characters, after a version prefix', async () => {
    const code = await encodeView(busyView());
    expect(code).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  });

  it('stays short: a plain comparison under 1000 characters, a busy one under 2000', async () => {
    expect((await encodeView(explore[0])).length).toBeLessThan(1000);
    expect((await encodeView(busyView())).length).toBeLessThan(2000);
  });
});

describe('decodeView: a bad or hostile link opens nothing, never throws', () => {
  it('rejects garbage, a wrong version and truncated codes', async () => {
    expect(await decodeView('')).toBeNull();
    expect(await decodeView('hello')).toBeNull();
    expect(await decodeView('9.AAAA')).toBeNull();
    const good = await encodeView(explore[0]);
    expect(await decodeView(good.slice(0, good.length / 2))).toBeNull();
  });

  it('rejects valid JSON that is not a view', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    const packed = new Uint8Array(
      await new Response(new Response(bytes).body!.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    );
    const b64 = btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeView(`1.${b64}`)).toBeNull();
  });

  it('refuses a "zip bomb" that unpacks past the size cap', async () => {
    const huge = new TextEncoder().encode(' '.repeat(MAX_VIEW_BYTES + 10));
    const packed = new Uint8Array(
      await new Response(new Response(huge).body!.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    );
    let bin = '';
    for (const byte of packed) bin += String.fromCharCode(byte);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeView(`1.${b64}`)).toBeNull();
  });
});

describe('viewLink / readViewHash', () => {
  it('puts the view in the hash of the public site, so it never reaches a server', () => {
    expect(viewLink('1.abc')).toBe('https://navabeetha.github.io/mapcompare/#v=1.abc');
  });
  it('reads the code back from a hash', () => {
    expect(readViewHash('#v=1.abc')).toBe('1.abc');
    expect(readViewHash('')).toBeNull();
    expect(readViewHash('#other')).toBeNull();
  });
});
