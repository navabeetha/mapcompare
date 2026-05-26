import type { CityPreset } from './presets';

const STORAGE_KEY = 'mapcompare:savedViews';

export interface SavedView {
  id: string;
  title: string;
  left: CityPreset;
  right: CityPreset;
  createdAt: number;
}

export function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(views: SavedView[]): void {
  // Throws on quota-exceeded or storage-disabled; callers surface the error.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}
