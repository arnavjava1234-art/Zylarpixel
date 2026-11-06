/**
 * ZylarPixel Pure 1.21.8 GUI & Window Helper
 * Standardizes open_window, window_items, and set_slot for Protocol 772 Data Components.
 */

import * as nbt from 'prismarine-nbt';
import { formatSlotForClient } from '../items';

export function makeWindowTitle(title: string): any {
  return nbt.comp({ text: nbt.string(title) });
}

export function makeEmptySlot(): any {
  return { itemCount: 0 };
}

export function formatWindowItems(items: any[]): any[] {
  return items.map(it => formatSlotForClient(it, false));
}

export function sendWindow(
  client: any,
  windowId: number,
  inventoryType: number,
  title: string,
  items: any[]
): void {
  try {
    client.write('open_window', {
      windowId,
      inventoryType,
      windowTitle: makeWindowTitle(title)
    });
    client.write('window_items', {
      windowId,
      stateId: 1,
      items: formatWindowItems(items),
      carriedItem: makeEmptySlot()
    });
  } catch (_) {}
}

export function sendSlot(
  client: any,
  windowId: number,
  slot: number,
  item: any
): void {
  try {
    client.write('set_slot', {
      windowId,
      stateId: 1,
      slot,
      item: formatSlotForClient(item, false)
    });
  } catch (_) {}
}
