import type { SavedView } from './savedViews';

/**
 * Hand-curated comparisons that ship with the deployed app. Visitors see
 * these in the Comparisons dropdown but can't add to or remove from them.
 *
 * Authoring workflow:
 *   1. `npm run dev`
 *   2. Pan/zoom each pane to set up a comparison, then click Save
 *   3. Open Comparisons → "Export drafts to clipboard"
 *   4. Paste the JSON between the brackets below
 *   5. Commit and push — the deploy workflow ships it
 */
export const CURATED_VIEWS: SavedView[] = [];
