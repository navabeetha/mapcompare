import { describe, expect, it } from 'vitest';
import type { Project } from './projects';
import {
  decodeContent,
  describeChanges,
  encodeContent,
  moveItem,
  parseComparisons,
  publishItem,
  removeItem,
  renameItem,
  serializeComparisons,
} from './publish';

const p = (id: string, title = id): Project =>
  ({
    schemaVersion: 2,
    id,
    title,
    splitPct: 50,
    grid: { visible: false, overrideMeters: null },
    left: { city: { name: 'A', country: 'X', lat: 1, lng: 2, zoom: 9 }, lat: 1, lng: 2, zoom: 9, style: 'satellite', shapes: [] },
    right: { city: { name: 'B', country: 'Y', lat: 3, lng: 4, zoom: 9 }, lat: 3, lng: 4, zoom: 9, style: 'satellite', shapes: [] },
    createdAt: 1,
  }) as unknown as Project;

const ids = (l: Project[]) => l.map((x) => x.id);

describe('list edits never change the list they are given', () => {
  const list = [p('a'), p('b'), p('c')];
  it('publishItem adds a new comparison at the top', () => {
    expect(ids(publishItem(list, p('d')))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });
  it('publishItem replaces one with the same id, in place', () => {
    const out = publishItem(list, p('b', 'new title'));
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out[1].title).toBe('new title');
  });
  it('removeItem drops by id', () => {
    expect(ids(removeItem(list, 'b'))).toEqual(['a', 'c']);
  });
  it('renameItem changes only the title', () => {
    const out = renameItem(list, 'c', '  Paris vs Tokyo ');
    expect(out[2].title).toBe('Paris vs Tokyo');
    expect(out[2].left).toBe(list[2].left);
  });
  it('renameItem ignores a blank title', () => {
    expect(renameItem(list, 'c', '   ')[2].title).toBe('c');
  });
  it('moveItem moves up and down, and stops at the ends', () => {
    expect(ids(moveItem(list, 'b', -1))).toEqual(['b', 'a', 'c']);
    expect(ids(moveItem(list, 'b', 1))).toEqual(['a', 'c', 'b']);
    expect(ids(moveItem(list, 'a', -1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveItem(list, 'c', 1))).toEqual(['a', 'b', 'c']);
  });
});

describe('the comparisons file', () => {
  it('round-trips through serialize and parse', () => {
    const list = [p('a'), p('b')];
    expect(parseComparisons(serializeComparisons(list))).toEqual(list);
  });
  it('ends with a newline and is indented, so diffs on GitHub stay readable', () => {
    const text = serializeComparisons([p('a')]);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  {');
  });
  it('rejects a file that is not a list', () => {
    expect(() => parseComparisons('{"a":1}')).toThrow();
  });
  it('drops entries it cannot read rather than failing the whole list', () => {
    expect(ids(parseComparisons(JSON.stringify([p('a'), { nonsense: true }])))).toEqual(['a']);
  });
});

describe('GitHub base64 content', () => {
  it('round-trips non-ASCII text (city names with accents, CJK, emoji)', () => {
    const text = 'São Paulo vs 東京 — 🏙️\n';
    expect(decodeContent(encodeContent(text))).toBe(text);
  });
  it('decodes GitHub\'s line-wrapped base64', () => {
    const wrapped = encodeContent('hello world').replace(/(.{4})/g, '$1\n');
    expect(decodeContent(wrapped)).toBe('hello world');
  });
});

describe('describeChanges: the commit message', () => {
  it('names what was published, unpublished, renamed and reordered', () => {
    const before = [p('a', 'Alpha'), p('b', 'Beta'), p('c', 'Gamma')];
    const after = [p('d', 'Delta'), p('c', 'Gamma'), p('a', 'Alpha 2')];
    const msg = describeChanges(before, after);
    expect(msg).toMatch(/^Explore: /);
    expect(msg).toContain('publish "Delta"');
    expect(msg).toContain('unpublish "Beta"');
    expect(msg).toContain('rename "Alpha" to "Alpha 2"');
    expect(msg).toContain('reorder');
  });
  it('says so when nothing changed', () => {
    const list = [p('a')];
    expect(describeChanges(list, list)).toBe('Explore: no changes');
  });
});

// ---------------------------------------------------------------- network
// The GitHub calls, against a fake fetch: what gets sent, and the clash rule.
import { afterEach, vi } from 'vitest';
import { fetchPublished, savePublished } from './publish';

type Call = { url: string; init?: RequestInit };
function fakeGitHub(file: Project[], sha = 'sha1', putStatus: number[] = [200]) {
  const calls: Call[] = [];
  let state = { file, sha };
  const puts = [...putStatus];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (!init?.method) {
      return new Response(JSON.stringify({ content: encodeContent(serializeComparisons(state.file)), sha: state.sha }), { status: 200 });
    }
    const status = puts.shift() ?? 200;
    if (status !== 200) return new Response('{}', { status });
    const body = JSON.parse(String(init.body));
    state = { file: parseComparisons(decodeContent(body.content)), sha: state.sha + '+' };
    return new Response(JSON.stringify({ content: { sha: state.sha } }), { status: 200 });
  });
  return { calls, setRemote: (f: Project[], s: string) => (state = { file: f, sha: s }) };
}
afterEach(() => vi.unstubAllGlobals());

describe('fetchPublished / savePublished', () => {
  it('reads the list and its sha, sending the token only as a header', async () => {
    const gh = fakeGitHub([p('a')], 'abc');
    const r = await fetchPublished('TOKEN');
    expect(r).toEqual({ list: [p('a')], sha: 'abc' });
    expect(gh.calls[0].url).not.toContain('TOKEN');
    expect((gh.calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
  });

  it('writes one commit naming the base sha, with a message describing the change', async () => {
    const gh = fakeGitHub([p('a')], 'abc');
    const saved = await savePublished('TOKEN', { list: [p('a')], sha: 'abc' }, [p('b', 'Beta'), p('a')]);
    const put = gh.calls.find((c) => c.init?.method === 'PUT')!;
    const body = JSON.parse(String(put.init!.body));
    expect(body.sha).toBe('abc');
    expect(body.branch).toBe('main');
    expect(body.message).toBe('Explore: publish "Beta"');
    expect(saved.sha).toBe('abc+');
  });

  it('on a clash, retries once if the file on GitHub still matches what was edited', async () => {
    const gh = fakeGitHub([p('a')], 'new-sha', [409, 200]);
    await savePublished('TOKEN', { list: [p('a')], sha: 'old-sha' }, [p('a'), p('b')]);
    const puts = gh.calls.filter((c) => c.init?.method === 'PUT').map((c) => JSON.parse(String(c.init!.body)).sha);
    expect(puts).toEqual(['old-sha', 'new-sha']);
  });

  it('on a clash with a real change made elsewhere, stops instead of overwriting it', async () => {
    const gh = fakeGitHub([p('a'), p('z')], 'new-sha', [409]);
    await expect(savePublished('TOKEN', { list: [p('a')], sha: 'old-sha' }, [p('a'), p('b')])).rejects.toThrow(/changed somewhere else/);
    expect(gh.calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(1);
  });

  it('explains a refused token without echoing it', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(fetchPublished('SECRET-123')).rejects.toThrow(/refused the token/);
    await expect(fetchPublished('SECRET-123')).rejects.not.toThrow(/SECRET/);
  });
});

describe('a missing file is not blamed on the token', () => {
  it('404 says the list file was not found on main', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    await expect(fetchPublished('T')).rejects.toThrow(/couldn't find src\/data\/comparisons\.json/);
  });
  it('403 still points at the token permissions', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 403 }));
    await expect(fetchPublished('T')).rejects.toThrow(/Contents: read and write/);
  });
});

describe('a rejected token is flagged so the screen can ask for a new one', () => {
  it('401 sets tokenRejected; a permissions problem does not', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(fetchPublished('T')).rejects.toMatchObject({ tokenRejected: true });
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 403 }));
    await expect(fetchPublished('T')).rejects.toMatchObject({ tokenRejected: false });
  });
});
