import type { CityPreset } from './presets';
import type { MapStyle } from './tileLayers';
import type { MeasureShape } from './shapes';
import type { SavedView } from './savedViews';
import type { Pin } from './pin';

/**
 * Historical key. Kept from the v1 "saved views" era so existing drafts survive
 * the schema change — anything stored under it is migrated on read.
 */
const STORAGE_KEY = 'mapcompare:savedViews';

export const SCHEMA_VERSION = 2;

/** Everything one pane needs to be reconstructed exactly. */
export interface PaneState {
  /** Name and country for the data card; its lat/lng/zoom are not the view. */
  city: CityPreset;
  lat: number;
  lng: number;
  zoom: number;
  style: MapStyle;
  shapes: MeasureShape[];
  /**
   * Where this map is pinned in its visible part of the screen, and the place
   * that sat on that spot when the author saved. Missing means centred, using
   * lat/lng above. lat/lng is still the centre on the author's screen.
   */
  pin?: Pin & { lat: number; lng: number };
}

/**
 * A complete authored comparison: both panes, the framing between them, the
 * grid settings and every measurement object. This is what the tool writes and
 * the viewer reads.
 */
export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  description?: string;
  /** Splitter position as a percentage of container width. */
  splitPct: number;
  grid: { visible: boolean; overrideMeters: number | null };
  left: PaneState;
  right: PaneState;
  createdAt: number;
}

export function createProjectId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function paneFromCity(city: CityPreset): PaneState {
  return {
    city,
    lat: city.lat,
    lng: city.lng,
    zoom: city.zoom,
    // Satellite was the hardcoded default before style became part of a
    // project, so that is what a v1 record was authored against.
    style: 'satellite',
    shapes: [],
  };
}

/**
 * Bring any stored or committed record up to the current schema.
 *
 * Runs over localStorage drafts *and* over the curated views compiled into the
 * build, which is why `curatedViews.ts` never had to be rewritten by hand when
 * the schema grew.
 *
 * Returns null for anything unrecognisable rather than throwing, so one corrupt
 * entry can't take out the whole list.
 */
export function migrateProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<Project> & Partial<SavedView>;
  if (!candidate.id || !candidate.left || !candidate.right) return null;

  if (candidate.schemaVersion === SCHEMA_VERSION) {
    const project = raw as Project;
    // Shapes and grid were added mid-v2 development; tolerate their absence so
    // a draft saved against an earlier build still opens.
    return {
      ...project,
      grid: project.grid ?? { visible: false, overrideMeters: null },
      left: { ...project.left, shapes: project.left.shapes ?? [] },
      right: { ...project.right, shapes: project.right.shapes ?? [] },
    };
  }

  // v1 → v2.
  const legacy = raw as SavedView;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: legacy.id,
    title: legacy.title,
    splitPct: legacy.splitPct ?? 50,
    grid: { visible: false, overrideMeters: null },
    left: paneFromCity(legacy.left),
    right: paneFromCity(legacy.right),
    createdAt: legacy.createdAt,
  };
}

/** Migrate a whole list, dropping entries that can't be read. */
export function migrateProjects(raw: unknown[]): Project[] {
  return raw
    .map(migrateProject)
    .filter((p): p is Project => p !== null);
}

export function loadProjects(): Project[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? migrateProjects(parsed) : [];
  } catch {
    return [];
  }
}

export function persistProjects(projects: Project[]): void {
  // Throws on quota-exceeded or storage-disabled; callers surface the error.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
