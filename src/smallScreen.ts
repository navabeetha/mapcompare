/**
 * Phones are too small for MapCompare: two maps side by side leave each one a
 * sliver, and the tools don't fit. On a phone-sized screen main.tsx shows
 * PhoneNotice instead of the app, so no map tiles load.
 *
 * The test is the screen's shorter side, so a phone held sideways still
 * counts. 500 px sits between the largest phones (~430) and the smallest
 * tablet (iPad mini, 744).
 */
export const PHONE_MAX_SHORT_SIDE = 500;

export function isPhoneSize(width: number, height: number): boolean {
  return Math.min(width, height) < PHONE_MAX_SHORT_SIDE;
}
