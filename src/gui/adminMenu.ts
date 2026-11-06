/**
 * ZylarPixel Master Admin Control Panel (54-Slot GUI)
 * Core hub for server administration, rank changing, and island management
 */

import { mcData1192 } from '../world/worldManager';
import { formatSlotForClient } from '../items';
import { sendWindow } from './guiHelper';

export function createGuiItem(itemName: string, count: number, displayName: string, loreArray: string[] = []): any {
  if (!itemName || count <= 0) return { itemCount: 0 };
  const itemDef = mcData1192.itemsByName[itemName] || mcData1192.itemsByName.stone;
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));

  return formatSlotForClient({
    present: true,
    itemId: itemDef.id,
    itemCount: count || 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: {
        display: {
          type: 'compound',
          value: {
            Name: { type: 'string', value: JSON.stringify({ text: displayName }) },
            Lore: {
              type: 'list',
              value: {
                type: 'string',
                value: loreStrings
              }
            }
          }
        }
      }
    }
  }, false);
}

export function createAdminBaseSlots(totalSlots: number = 54): any[] {
  const items = new Array(totalSlots);
  const rows = Math.floor(totalSlots / 9);
  for (let i = 0; i < totalSlots; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const isBorder = (r === 0 || r === rows - 1 || c === 0 || c === 8);
    if (isBorder) {
      items[i] = createGuiItem('black_stained_glass_pane', 1, '§8', []);
    } else {
      items[i] = createGuiItem('gray_stained_glass_pane', 1, '§7', []);
    }
  }
  return items;
}

export function openAdminMenu(client: any, pData: any): void {
  pData.openWindowId = 1;

  // 1. Open 54-slot chest window
  client.write('open_window', {
    windowId: 1,
    inventoryType: 5, // generic_9x6
    windowTitle: JSON.stringify({ text: '§8ZylarPixel Admin Control Panel' })
  });

  // 2. Populate 54 slots (Outer border: Black Stained Glass, Inner background: Gray Stained Glass)
  const items = createAdminBaseSlots(54);

  // Slot 8: Server Restart Tool (Redstone Block, Top-Right Corner)
  items[8] = createGuiItem(
    'redstone_block',
    1,
    '§c§lRestart Server ⚡',
    [
      '§7Reboots the backend server and',
      '§7hot-reloads all new code from disk!',
      ' ',
      '§e⚡ Players are held safely in Proxy Limbo',
      '§e   and reconnected automatically in ~2s.',
      ' ',
      '§cClick to trigger instant restart! ⚠'
    ]
  );

  // Slot 19: Island & World Tools (Compass)
  items[19] = createGuiItem(
    'compass',
    1,
    '§a§lIsland & World Tools',
    [
      '§7Control starter islands & world physics.',
      '§7Feature: §fComing Soon in Next Phase'
    ]
  );

  // Slot 21: Rank Manager (Nether Star)
  items[21] = createGuiItem(
    'nether_star',
    1,
    '§e§lRank Manager',
    [
      '§7Manage and switch player ranks.',
      '§7Current Ranks: §f11 Authentic Tiers',
      ' ',
      '§eClick to open Rank Selector! §b▶'
    ]
  );

  // Slot 23: Purse & Economy Manager (Gold Ingot)
  items[23] = createGuiItem(
    'gold_ingot',
    1,
    '§6§lPurse & Economy Manager',
    [
      '§7Manage coins for any player.',
      '§7Actions: §fSet, Add, Remove',
      '§7Supports: §aOnline §7& §cOffline §7players',
      ' ',
      '§eClick to open Player Selector! §b▶'
    ]
  );

  // Slot 25: Item & Combat Tools (Diamond Sword)
  items[25] = createGuiItem(
    'diamond_sword',
    1,
    '§c§lItem & Combat Spawner',
    [
      '§7Browse & spawn custom SkyBlock items.',
      '§7Supports multi-page catalog.',
      ' ',
      '§eClick to open Item Spawner! §b▶'
    ]
  );

  // Slot 49: Close Menu (Barrier)
  items[49] = createGuiItem(
    'barrier',
    1,
    '§c§lClose Menu',
    ['§7Click to exit the admin menu.']
  );

  pData.currentGuiItems = items;

  client.write('window_items', {
    windowId: 1,
    stateId: 1,
    items,
    carriedItem: { present: false }
  });
}
