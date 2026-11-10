import type { CityPreset } from './presets';

/**
 * The v1 saved-comparison record, superseded by `Project` in `projects.ts`.
 *
 * It survives for two reasons: the seven curated comparisons in
 * older published lists were written in this shape, and drafts saved before
 * the schema change are still in localStorage. `migrateProject` upgrades both
 * on read, so nothing had to be rewritten by hand.
 *
 * Don't author new data against this type — write a `Project`.
 */
export interface SavedView {
  id: string;
  title: string;
  /** In v1 the preset's own lat/lng/zoom doubled as the pane's view. */
  left: CityPreset;
  right: CityPreset;
  splitPct?: number;
  createdAt: number;
}
