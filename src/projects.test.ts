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
