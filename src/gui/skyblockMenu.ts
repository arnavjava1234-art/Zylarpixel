/**
 * ZylarPixel Authentic Hypixel SkyBlock Menu GUI (/sbmenu, /menu, Nether Star)
 * 54-Slot (minecraft:generic_9x6) double-chest layout, 1:1 mirror of Hypixel.
 */

import { mcData1192, mcData1211 } from '../world/worldManager';
import { formatSlotForClient } from '../items';
import { createGuiItem, openStatsMenu } from './statsMenu';
import { openBankMainMenu } from './bankMenu';
import { openCraftingTableMenu } from './craftingTableMenu';
import { sendWindow } from './guiHelper';

export const SKYBLOCK_MENU_WINDOW_ID = 6;
export const HOTBAR_NETHER_STAR_SLOT = 44; // Slot index 8 in hotbar (36 + 8)

export function createNetherStarItem(is119: boolean = true): any {
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.itemsByName.nether_star;
  const loreStrings = [
    JSON.stringify({ text: '§7View all of your SkyBlock' }),
    JSON.stringify({ text: '§7progress, including your Skills,' }),
    JSON.stringify({ text: '§7Collections, Recipes, and more!' }),
    JSON.stringify({ text: ' ' }),
    JSON.stringify({ text: '§eClick to open!' })
  ];

  return {
    present: true,
    itemId: itemDef.id,
    itemCount: 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: {
        display: {
          type: 'compound',
          value: {
            Name: { type: 'string', value: JSON.stringify({ text: '§aSkyBlock Menu §7(Right Click)' }) },
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
  };
}

export function giveNetherStar(client: any): void {
  try {
    const is119 = (client.protocolVersion === 760 || client.version === '1.19.2');
    const netherStar = createNetherStarItem(is119);
    client.write('set_slot', {
      windowId: 0,
      stateId: 1,
      slot: HOTBAR_NETHER_STAR_SLOT,
      item: formatSlotForClient(netherStar, is119)
    });
  } catch (_) {}
}

export function openSkyBlockMenu(client: any, pSession: any): void {
  pSession.openWindowId = SKYBLOCK_MENU_WINDOW_ID;

  // Base fillers: dark gray / black glass pane
  const items = new Array(54).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  // Row 2 Center
  items[13] = createGuiItem(
    'player_head',
    1,
    '§aYour SkyBlock Profile',
    [
      '§7View your equipment, stats,',
      '§7accessories, and more!',
      ' ',
      '§eClick to view!'
    ]
  );

  // Row 3 (Slots 19 to 25)
  items[19] = createGuiItem(
    'diamond_sword',
    1,
    '§aYour Skills',
    [
      '§7View your Skill progression and',
      '§7rewards!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[20] = createGuiItem(
    'painting',
    1,
    '§aCollection',
    [
      '§7View all of the items available',
      '§7in SkyBlock. Collect items to',
      '§7unlock Minions, Recipes, and',
      '§7more!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[21] = createGuiItem(
    'book',
    1,
    '§aRecipe Book',
    [
      '§7Through your adventure, you will',
      '§7unlock recipes for all kinds of',
      '§7unique items!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[22] = createGuiItem(
    'emerald',
    1,
    '§aTrades',
    [
      '§7View your unlocked trades and',
      '§7trade items with coins!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[23] = createGuiItem(
    'writable_book',
    1,
    '§aQuest Log',
    [
      '§7View your active quests and',
      '§7progress towards rewards!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[24] = createGuiItem(
    'clock',
    1,
    '§aCalendar and Events',
    [
      '§7View the SkyBlock Calendar,',
      '§7upcoming events, and active',
      '§7festivals!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[25] = createGuiItem(
    'chest',
    1,
    '§aStorage',
    [
      '§7Store items in your Ender',
      '§7Chest, Backpacks, and more!',
      ' ',
      '§eClick to view!'
    ]
  );

  // Row 4 (Slots 30 to 33)
  items[30] = createGuiItem(
    'bone',
    1,
    '§aPets',
    [
      '§7View and manage your pets!',
      '§7Equip pets to gain powerful',
      '§7stat buffs and perks.',
      ' ',
      '§eClick to view!'
    ]
  );

  items[31] = createGuiItem(
    'crafting_table',
    1,
    '§aCrafting Table',
    [
      '§7Opens a 3x3 crafting grid.',
      ' ',
      '§eClick to craft!'
    ]
  );

  items[32] = createGuiItem(
    'leather_chestplate',
    1,
    '§aWardrobe',
    [
      '§7Store and quickly swap armor',
      '§7sets anywhere!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[33] = createGuiItem(
    'gold_block',
    1,
    '§aPersonal Bank',
    [
      '§7Access your Bank account from',
      '§7anywhere!',
      ' ',
      '§eClick to open!'
    ]
  );

  // Row 6 (Slots 47 to 51)
  items[47] = createGuiItem(
    'compass',
    1,
    '§aFast Travel',
    [
      '§7Teleport to islands and warps',
      '§7across SkyBlock!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[48] = createGuiItem(
    'name_tag',
    1,
    '§aProfile Management',
    [
      '§7Switch profiles, manage co-op',
      '§7members, and settings!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[49] = createGuiItem(
    'barrier',
    1,
    '§cClose',
    [
      '§eClick to close!'
    ]
  );

  items[50] = createGuiItem(
    'redstone_torch',
    1,
    '§aSettings',
    [
      '§7Configure your SkyBlock game',
      '§7settings and preferences!',
      ' ',
      '§eClick to view!'
    ]
  );

  items[51] = createGuiItem(
    'cookie',
    1,
    '§aBooster Cookie',
    [
      '§7Obtain powerful perks including',
      '§7+20% Skill XP, keep coins on',
      '§7death, and more!',
      ' ',
      '§eClick to view!'
    ]
  );

  pSession.currentGuiItems = items;
  sendWindow(client, SKYBLOCK_MENU_WINDOW_ID, 5, '§8SkyBlock Menu', items);
}

export const SKYBLOCK_MENU_FEATURE_SLOTS = new Set([
  19, 20, 21, 22, 23, 24, 25, 30, 32, 47, 48, 50, 51
]);

export function handleSkyBlockMenuClick(
  client: any,
  pSession: any,
  clickedSlot: number,
  sendSystemMessage: (client: any, msg: string, is119?: boolean) => void,
  is119?: boolean
): void {
  if (clickedSlot === 49) {
    // Close button
    pSession.openWindowId = 0;
    try {
      client.write('close_window', { windowId: SKYBLOCK_MENU_WINDOW_ID });
    } catch (_) {}
    return;
  }

  if (clickedSlot === 13) {
    // Your SkyBlock Profile -> opens Stats menu!
    openStatsMenu(client, pSession);
    return;
  }

  if (clickedSlot === 31) {
    // Crafting Table - Opens 1:1 Hypixel 3x3 Crafting Table GUI
    openCraftingTableMenu(client, pSession);
    return;
  }

  if (clickedSlot === 33) {
    // Personal Bank - Instant access, 0 requirements, 0 cooldown!
    openBankMainMenu(client, pSession);
    return;
  }

  if (SKYBLOCK_MENU_FEATURE_SLOTS.has(clickedSlot)) {
    sendSystemMessage(client, '§cThis feature is not available yet!', is119);
    try {
      client.write('named_sound_effect', {
        soundName: 'entity.villager.no',
        soundCategory: 0,
        x: Math.floor((pSession.x || pSession.pos?.x || 0) * 8),
        y: Math.floor((pSession.y || pSession.pos?.y || 0) * 8),
        z: Math.floor((pSession.z || pSession.pos?.z || 0) * 8),
        volume: 0.8,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (_) {}
  }
}
