import { describe, expect, it } from 'vitest';
import { displayTitle } from './projects';

describe('displayTitle', () => {
  it('capitalises words but keeps "vs" and small words lower case', () => {
    expect(displayTitle('amsterdam vs venice')).toBe('Amsterdam vs Venice');
    expect(displayTitle('amazon vs sunderbans')).toBe('Amazon vs Sunderbans');
    expect(displayTitle('the city of london')).toBe('The City of London');
    expect(displayTitle('  hong   kong vs singapore ')).toBe('Hong Kong vs Singapore');
  });
});

import comparisons from './data/comparisons.json';
import { migrateProjects } from './projects';

// The published Explore list. The Manage screen rewrites this file through
// GitHub, so guard what every build ships.
describe('src/data/comparisons.json', () => {
  const list = migrateProjects(comparisons as unknown[]);
  it('every entry reads as a current-schema comparison', () => {
    expect(list).toHaveLength((comparisons as unknown[]).length);
    for (const p of list) expect(p.schemaVersion).toBe(2);
  });
  it('ids are unique', () => {
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });
  it('is not empty, so the public page always has something to open', () => {
    expect(list.length).toBeGreaterThan(0);
  });
});
