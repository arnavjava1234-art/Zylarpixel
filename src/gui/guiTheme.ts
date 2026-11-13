/**
 * ZylarPixel Authentic Tavern Charred Timber GUI Theme
 * 
 * Provides Negative-Space Font Title Overlays for custom extended container borders.
 * Allows heavy charred oak timber beams and hand-forged black iron corner mounts
 * to extend 30px left and right past vanilla 176px container limits without being cut off!
 */

export const TAVERN_FRAME_6ROW = '\uE030'; // 54 slots (SkyBlock, Admin, Merchant)
export const TAVERN_FRAME_4ROW = '\uE031'; // 36 slots (Bank menus)
export const TAVERN_FRAME_3ROW = '\uE032'; // 27 slots (Stats, Reforge, Warps)

export const SHIFT_LEFT_38 = '\uF826';   // Shifts cursor -38px (from x=8 to x=-30)
export const SHIFT_RETURN_198 = '\uF8C6'; // Shifts cursor -198px (from x=206 back to default x=8)

/**
 * Formats a container window title with the extended Tavern Charred Timber frame
 * and resets the cursor so the text is rendered in the top wooden header.
 */
export function formatGuiTitle(rows: 3 | 4 | 5 | 6, rawTitle: string): string {
  let glyph = TAVERN_FRAME_6ROW;
  if (rows === 3) glyph = TAVERN_FRAME_3ROW;
  else if (rows === 4) glyph = TAVERN_FRAME_4ROW;
  else if (rows === 6) glyph = TAVERN_FRAME_6ROW;

  // Clean any leading formatting codes from rawTitle
  const cleanTitle = rawTitle.replace(/^[§&][0-9a-fk-or]/i, '');
  return `§f${SHIFT_LEFT_38}${glyph}${SHIFT_RETURN_198}§8${cleanTitle}`;
}
