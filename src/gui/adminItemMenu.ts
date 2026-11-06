/**
 * ZylarPixel Admin Item & Combat Spawner GUI
 * 
 * Features:
 * - 54-Slot Chest Window (WindowId = 13)
 * - Premium black stained glass borders
 * - Multi-page pagination (28 items per page)
 * - Smart-arrow navigation (left arrow hidden on page 1, right arrow hidden on last page)
 * - Page indicator book showing current page and total item count
 * - Real SkyBlock item rendering with authentic lore, stats, and rarity badges
 * - Instant 1-click spawning into player hotbar/inventory with audio feedback
 */

import { createGuiItem, openAdminMenu, createAdminBaseSlots } from './adminMenu';
import { getAllRegisteredItems, createSkyBlockItemStack, SkyBlockItemDefinition, formatSlotForClient } from '../items';
import { mcData1192, mcData1211 } from '../world/worldManager';
import { persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { playSound } from './bankMenu';
import { sendWindow } from './guiHelper';

export const ADMIN_ITEM_SPAWNER_WINDOW_ID = 13;
export const ITEMS_PER_PAGE = 28;

// 4 rows of 7 slots in center of 54-slot chest
export const GRID_SLOTS = [
  10, 11, 12, 13, 14, 15, 16,
  19, 20, 21, 22, 23, 24, 25,
  28, 29, 30, 31, 32, 33, 34,
  37, 38, 39, 40, 41, 42, 43
];

export function openAdminItemSpawner(
  client: any,
  pData: any,
  page: number = 0
): void {
  pData.openWindowId = ADMIN_ITEM_SPAWNER_WINDOW_ID;

  const allItems = getAllRegisteredItems();
  const totalPages = Math.max(1, Math.ceil(allItems.length / ITEMS_PER_PAGE));
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));

  client.write('open_window', {
    windowId: ADMIN_ITEM_SPAWNER_WINDOW_ID,
    inventoryType: 5, // generic_9x6 (54 slots)
    windowTitle: JSON.stringify({
      text: totalPages > 1
        ? `§8Item Spawner (${currentPage + 1}/${totalPages})`
        : '§8Item & Combat Spawner'
    })
  });

  // 1. Fill slots: Outer border = Black Stained Glass, Inner = Gray Stained Glass
  const items = createAdminBaseSlots(54);

  const slotItemMap = new Map<number, SkyBlockItemDefinition>();
  const pageItems = allItems.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  // 2. Populate inner 28 grid slots with authentic SkyBlock items
  pageItems.forEach((itemDef, idx) => {
    if (idx < GRID_SLOTS.length) {
      const slot = GRID_SLOTS[idx];
      slotItemMap.set(slot, itemDef);

      // Create authentic SkyBlock item stack
      const stack = createSkyBlockItemStack(itemDef);

      // Append clean instruction to lore
      try {
        const loreList = stack.nbtData.value.display.value.Lore.value.value;
        loreList.push(JSON.stringify({ text: ' ' }));
        loreList.push(JSON.stringify({ text: '§eClick to spawn into inventory! §b▶' }));
      } catch (_) {}

      items[slot] = stack;
    }
  });

  // 3. Navigation Controls (Row 5)

  // Slot 45: Previous Page Arrow (Only if page > 0)
  if (currentPage > 0) {
    items[45] = createGuiItem(
      'arrow',
      1,
      `§a§l◀ Previous Page §7(Page ${currentPage})`,
      [
        `§7Jump back to page ${currentPage}.`,
        ' ',
        '§eClick to navigate! §b◀'
      ]
    );
  } else {
    items[45] = createGuiItem('black_stained_glass_pane', 1, '§8 ', []);
  }

  // Slot 49: Back to Admin Control Panel
  items[49] = createGuiItem(
    'barrier',
    1,
    '§c§l◀ Back to Admin Control Panel',
    ['§7Return to the main admin control panel.']
  );

  // Slot 50: Page Indicator (Book)
  items[50] = createGuiItem(
    'book',
    1,
    `§e§lPage ${currentPage + 1} of ${totalPages}`,
    [
      `§7Total Items: §f${allItems.length}`,
      `§7Current Page: §a${currentPage + 1} / ${totalPages}`,
      ' ',
      '§7Click any item to spawn it',
      '§7directly into your hotbar!'
    ]
  );

  // Slot 53: Next Page Arrow (Only if more pages exist)
  if (currentPage < totalPages - 1) {
    items[53] = createGuiItem(
      'arrow',
      1,
      `§a§lNext Page ▶ §7(Page ${currentPage + 2})`,
      [
        `§7Jump forward to page ${currentPage + 2}.`,
        ' ',
        '§eClick to navigate! §b▶'
      ]
    );
  } else {
    items[53] = createGuiItem('black_stained_glass_pane', 1, '§8 ', []);
  }

  pData.currentGuiItems = items;
  pData.adminItemSpawnerState = {
    page: currentPage,
    totalPages,
    slotItemMap
  };

  try {
    client.write('window_items', {
      windowId: ADMIN_ITEM_SPAWNER_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

export function handleAdminItemSpawnerClick(
  client: any,
  pData: any,
  clickedSlot: number,
  is119: boolean
): boolean {
  const state = pData.adminItemSpawnerState;
  if (!state) return true;

  // 1. Back Arrow (Slot 49)
  if (clickedSlot === 49) {
    playSound(client, pData, 'random.click', 1.0);
    openAdminMenu(client, pData);
    return true;
  }

  // 2. Previous Page (Slot 45)
  if (clickedSlot === 45 && state.page > 0) {
    playSound(client, pData, 'random.click', 1.2);
    openAdminItemSpawner(client, pData, state.page - 1);
    return true;
  }

  // 3. Next Page (Slot 53)
  if (clickedSlot === 53 && state.page < state.totalPages - 1) {
    playSound(client, pData, 'random.click', 1.2);
    openAdminItemSpawner(client, pData, state.page + 1);
    return true;
  }

  // 4. Clicked an Item Slot
  const slotMap = state.slotItemMap as Map<number, SkyBlockItemDefinition>;
  if (slotMap && slotMap.has(clickedSlot)) {
    const itemDef = slotMap.get(clickedSlot)!;

    // Find free slot in hotbar first (36..43), then main inventory (9..35)
    let targetSlot = -1;
    for (let s = 36; s < 44; s++) {
      if (!pData.inventory.has(s)) {
        targetSlot = s;
        break;
      }
    }
    if (targetSlot === -1) {
      for (let s = 9; s < 36; s++) {
        if (!pData.inventory.has(s)) {
          targetSlot = s;
          break;
        }
      }
    }

    if (targetSlot === -1) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMessage(client, '§cYour inventory is completely full!', is119);
      return true;
    }

    // Build the authentic item stack
    const itemStack = createSkyBlockItemStack(itemDef);
    const mcData = is119 ? mcData1192 : mcData1211;
    const mcDef = mcData.items[itemStack.itemId];

    pData.inventory.set(targetSlot, {
      slot: targetSlot,
      name: mcDef ? mcDef.name : 'unknown',
      itemId: itemStack.itemId,
      count: itemStack.itemCount,
      nbtData: itemStack.nbtData
    });

    try {
      client.write('set_slot', {
        windowId: 0,
        stateId: 1,
        slot: targetSlot,
        item: itemStack
      });
      client.write('named_sound_effect', {
        soundName: 'entity.item.pickup',
        soundCategory: 0,
        x: Math.floor((pData.x || 0) * 8),
        y: Math.floor((pData.y || 70) * 8),
        z: Math.floor((pData.z || 0) * 8),
        volume: 0.9,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (_) {}

    persistPlayerSession(pData);

    sendSystemMessage(
      client,
      `§a[Admin] Spawned 1x §f${itemDef.name} §ainto your inventory!`,
      is119
    );
    return true;
  }

  return true;
}
