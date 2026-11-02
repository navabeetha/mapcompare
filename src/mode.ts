/**
 * Which half of the app you're looking at.
 *
 * - `tool` is the authoring surface: shape tools, grid controls, per-pane tile
 *   style, Save, Drafts and the export-to-clipboard flow.
 * - `view` is the published artefact: the authored comparison, presented for
 *   reading, with the editing affordances removed.
 *
 * Both ship in the same bundle. There is nothing privileged to withhold — the
 * app has no backend and no keys, and "authoring" only writes to localStorage —
 * so a second entry point would buy no safety while letting the published half
 * drift away from the half that gets exercised during every authoring session.
 */
export type AppMode = 'tool' | 'view';

/**
 * An explicit `?mode=` always wins, which is what makes the published
 * experience previewable locally (`?mode=view` on the dev server) and the
 * authoring surface reachable on a deployed build. Otherwise dev defaults to
 * tool and a production build defaults to view.
 */
export function resolveMode(): AppMode {
  const requested = new URLSearchParams(window.location.search).get('mode');
  if (requested === 'tool' || requested === 'view') return requested;
  return import.meta.env.DEV ? 'tool' : 'view';
}

/** Project id to open on load, from `?project=<id>`. */
export function resolveProjectId(): string | null {
  return new URLSearchParams(window.location.search).get('project');
}
