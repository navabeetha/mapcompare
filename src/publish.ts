/**
 * Publishing the Explore list straight from the app.
 *
 * The featured comparisons live in `src/data/comparisons.json` in the repo.
 * Publishing means committing a new version of that one file through the
 * GitHub contents API. The push to `main` starts the Pages deploy, and the
 * site has the change about 1–2 minutes later.
 *
 * The author's GitHub token is kept only in this browser (localStorage). It
 * is never logged, put in a URL or committed. Without it, nothing here can
 * change anything; hiding the Manage screen in view mode is not the guard.
 *
 * The top half is pure (list edits, file format, base64, commit message) and
 * tested. The bottom half is the thin network layer.
 */
import { migrateProjects, type Project } from './projects';

// ---------------------------------------------------------------- list edits
// All return a new list and leave the one they're given alone.

/** Adds at the top, or replaces in place if the id is already published. */
export function publishItem(list: Project[], item: Project): Project[] {
  const i = list.findIndex((p) => p.id === item.id);
  if (i === -1) return [item, ...list];
  return list.map((p, j) => (j === i ? item : p));
}

export function removeItem(list: Project[], id: string): Project[] {
  return list.filter((p) => p.id !== id);
}

export function renameItem(list: Project[], id: string, title: string): Project[] {
  const t = title.trim();
  if (!t) return list;
  return list.map((p) => (p.id === id ? { ...p, title: t } : p));
}

/** Moves one place up (-1) or down (+1); does nothing at the ends. */
export function moveItem(list: Project[], id: string, dir: -1 | 1): Project[] {
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------------------------------------------------------------- the file

/** Indented with a final newline, so the commit diff on GitHub is readable. */
export function serializeComparisons(list: Project[]): string {
  return JSON.stringify(list, null, 2) + '\n';
}

/** Reads the file. Entries that can't be read are dropped, not fatal. */
export function parseComparisons(text: string): Project[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error('comparisons.json is not a list');
  return migrateProjects(raw);
}

/** UTF-8 safe base64, as the contents API wants it. */
export function encodeContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** GitHub sends base64 wrapped at 60 characters; the line breaks are noise. */
export function decodeContent(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** A one-line commit message that says what changed in the list. */
export function describeChanges(before: Project[], after: Project[]): string {
  const was = new Map(before.map((p) => [p.id, p]));
  const now = new Map(after.map((p) => [p.id, p]));
  const parts: string[] = [];
  for (const p of after) if (!was.has(p.id)) parts.push(`publish "${p.title}"`);
  for (const p of before) if (!now.has(p.id)) parts.push(`unpublish "${p.title}"`);
  for (const p of after) {
    const old = was.get(p.id);
    if (old && old.title !== p.title) parts.push(`rename "${old.title}" to "${p.title}"`);
    else if (old && JSON.stringify(old) !== JSON.stringify(p)) parts.push(`update "${p.title}"`);
  }
  // Reordered: the comparisons in both lists aren't in the same order.
  const kept = (l: Project[]) => l.filter((p) => was.has(p.id) && now.has(p.id)).map((p) => p.id).join();
  if (kept(before) !== kept(after)) parts.push('reorder');
  return parts.length ? `Explore: ${parts.join(', ')}` : 'Explore: no changes';
}

// ---------------------------------------------------------------- GitHub

export const REPO = 'navabeetha/mapcompare';
export const FILE_PATH = 'src/data/comparisons.json';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const TOKEN_KEY = 'mapcompare:githubToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the token just isn't remembered */
  }
}

/** Errors worded for the author, never echoing the token. */
export class PublishError extends Error {
  /** True when GitHub rejected the token itself (expired or revoked). */
  constructor(message: string, readonly tokenRejected = false) {
    super(message);
  }
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function failure(r: Response): Promise<PublishError> {
  if (r.status === 401)
    return new PublishError('GitHub refused the token. It may have expired or been revoked. Paste a new one.', true);
  if (r.status === 403)
    return new PublishError(`The token can't write to ${REPO}. It needs Contents: read and write on that repo.`);
  // The repo is public, so a 404 here means the file itself is missing on
  // main (e.g. the code that added it hasn't been pushed yet), not the token.
  if (r.status === 404)
    return new PublishError(`GitHub couldn't find ${FILE_PATH} on ${BRANCH} in ${REPO}. Has it been pushed?`);
  return new PublishError(`GitHub said ${r.status}. Try again in a moment.`);
}

export interface RemoteList {
  list: Project[];
  /** The file version this list was read from; a write must name it. */
  sha: string;
}

/** The published list as it is on GitHub now (fresher than the deployed site). */
export async function fetchPublished(token: string): Promise<RemoteList> {
  // no-store: right after a commit, a cached read would hand back the old sha.
  const r = await fetch(`${API}?ref=${BRANCH}`, { headers: headers(token), cache: 'no-store' });
  if (!r.ok) throw await failure(r);
  const body = (await r.json()) as { content: string; sha: string };
  return { list: parseComparisons(decodeContent(body.content)), sha: body.sha };
}

/**
 * Commits `next` as the published list. `base` is what the author was editing
 * from. If the file changed on GitHub meanwhile (another tab, another device),
 * that's a clash: re-read once and, only if it still matches `base`, write.
 * Otherwise stop and say so, rather than overwrite someone's newer change.
 */
export async function savePublished(token: string, base: RemoteList, next: Project[]): Promise<RemoteList> {
  const write = async (sha: string) =>
    fetch(API, {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: describeChanges(base.list, next),
        content: encodeContent(serializeComparisons(next)),
        sha,
        branch: BRANCH,
      }),
    });

  let r = await write(base.sha);
  if (r.status === 409 || r.status === 422) {
    const fresh = await fetchPublished(token);
    if (serializeComparisons(fresh.list) !== serializeComparisons(base.list)) {
      throw new PublishError('The published list changed somewhere else since you opened it. Reload it and make your changes again.');
    }
    r = await write(fresh.sha);
  }
  if (!r.ok) throw await failure(r);
  const body = (await r.json()) as { content: { sha: string } };
  return { list: next, sha: body.content.sha };
}
