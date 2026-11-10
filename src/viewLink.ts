/**
 * Links to any view: the whole comparison on screen, packed into the URL.
 *
 * Format: `https://<site>/#v=1.<code>`
 * - `1.` is the format version, so the encoding can change later without
 *   breaking links already shared.
 * - `<code>` is the view as a Project (projects.ts) minus its id and dates,
 *   as JSON with every number rounded to 6 decimal places (~10 cm), then
 *   deflate-compressed and base64url-encoded.
 * - It lives in the hash, not the query: browsers never send the hash to a
 *   server, so a shared view stays between the people who have the link.
 *
 * Opening one runs the decoded project through `migrateProject`, the same
 * gate as drafts and the Explore list, plus a few type checks here, because
 * anyone can hand-craft a link. Anything odd opens nothing (null), never throws.
 */
import { SITE } from './exportLayout';
import { createProjectId, migrateProject, type PaneState, type Project } from './projects';

const VERSION = '1';

/** Cap on the unpacked JSON. Real views are a few KB; this stops a "zip bomb". */
export const MAX_VIEW_BYTES = 256 * 1024;

export async function encodeView(project: Project): Promise<string> {
  // The recipient gets their own copy: no id or dates to carry.
  const { id: _id, createdAt: _createdAt, ...view } = project;
  void _id;
  void _createdAt;
  const json = JSON.stringify(view, (_key, value) =>
    typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value
  );
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return `${VERSION}.${toBase64Url(packed)}`;
}

export async function decodeView(code: string): Promise<Project | null> {
  try {
    const dot = code.indexOf('.');
    if (dot < 0 || code.slice(0, dot) !== VERSION) return null;
    const bytes = fromBase64Url(code.slice(dot + 1));
    if (!bytes || bytes.length === 0) return null;
    const json = await inflateCapped(bytes, MAX_VIEW_BYTES);
    if (json === null) return null;
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || !isPane(raw.left) || !isPane(raw.right)) return null;
    if (typeof raw.title !== 'string' || !isFiniteNumber(raw.splitPct)) return null;
    return migrateProject({ ...raw, id: createProjectId(), createdAt: Date.now() });
  } catch {
    return null;
  }
}

/** The public link for a code from `encodeView`. */
export function viewLink(code: string): string {
  return `https://${SITE}/#v=${code}`;
}

/** The code in a `#v=` hash, if there is one. */
export function readViewHash(hash: string): string | null {
  const match = /^#v=(.+)$/.exec(hash);
  return match ? match[1] : null;
}

// ------------------------------------------------------------ checks

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPane(v: unknown): v is PaneState {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<PaneState>;
  return (
    isFiniteNumber(p.lat) &&
    isFiniteNumber(p.lng) &&
    isFiniteNumber(p.zoom) &&
    !!p.city &&
    typeof p.city.name === 'string' &&
    Array.isArray(p.shapes) &&
    p.shapes.every((s) => s && Array.isArray(s.points) && s.points.every((pt) => Array.isArray(pt) && pt.every(isFiniteNumber)))
  );
}

// ------------------------------------------------------------ bytes

/** Run bytes through a (de)compression stream. `Response` turns them into a stream jsdom can read too. */
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(bytes as Uint8Array<ArrayBuffer>).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Inflate, stopping as soon as the output passes `cap` bytes. Null if it does, or if the data is broken. */
async function inflateCapped(bytes: Uint8Array, cap: number): Promise<string | null> {
  const reader = new Response(bytes as Uint8Array<ArrayBuffer>).body!.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
