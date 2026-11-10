import { describe, expect, it } from 'vitest';
import { isPhoneSize } from './smallScreen';

describe('isPhoneSize: too small for two maps side by side', () => {
  it('phones, held either way', () => {
    expect(isPhoneSize(390, 844)).toBe(true); // iPhone 14, portrait
    expect(isPhoneSize(844, 390)).toBe(true); // and landscape
    expect(isPhoneSize(412, 915)).toBe(true); // a large Android
    expect(isPhoneSize(430, 932)).toBe(true); // iPhone Pro Max
  });
  it('tablets and computers', () => {
    expect(isPhoneSize(744, 1133)).toBe(false); // iPad mini
    expect(isPhoneSize(1024, 768)).toBe(false);
    expect(isPhoneSize(1440, 900)).toBe(false);
  });
  it('a desktop window squeezed narrow still counts as small', () => {
    expect(isPhoneSize(480, 900)).toBe(true);
  });
});
