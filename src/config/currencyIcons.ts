/**
 * ZylarPixel Custom Currency Font Glyphs
 * Mapped in resourcepack/assets/minecraft/font/default.json:
 *   \uE000 -> minecraft:font/coin.png
 *   \uE001 -> minecraft:font/bits.png
 *
 * Always prefix with §f so preceding §6 / §b / §a formatting does NOT tint the bitmap sprite.
 */

export const COIN_GLYPH = '\uE000';
export const BITS_GLYPH = '\uE001';

export const COIN_ICON = `§f${COIN_GLYPH}`;
export const BITS_ICON = `§f${BITS_GLYPH}`;

export function formatCoinAmountWithIcon(
  amountText: string | number,
  color: string = '§6',
  suffix: string = ' coins'
): string {
  return `${COIN_ICON} ${color}${amountText}${suffix}`;
}

export function formatBitsAmountWithIcon(
  amountText: string | number,
  color: string = '§b',
  suffix: string = ' Bits'
): string {
  return `${BITS_ICON} ${color}${amountText}${suffix}`;
}
