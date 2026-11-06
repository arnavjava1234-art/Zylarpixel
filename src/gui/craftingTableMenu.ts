/**
 * ZylarPixel Authentic Hypixel SkyBlock Crafting Table GUI
 * 54-Slot (minecraft:generic_9x6) double-chest layout, 1:1 mirror of Hypixel.
 * Accessible via /craft, /workbench, Slot 31 in /sbmenu, and world Crafting Table interactions!
 */

import { mcData1192, mcData1211 } from '../world/worldManager';
import { createGuiItem } from './statsMenu';
import { createNetherStarItem, giveNetherStar, HOTBAR_NETHER_STAR_SLOT } from './skyblockMenu';
import { playSound } from './bankMenu';
import { tagVanillaItemStack, formatSlotForClient } from '../items';
import { persistPlayerSession } from '../players/playerManager';
import { sendWindow, sendSlot, makeEmptySlot } from './guiHelper';

export const CRAFTING_TABLE_WINDOW_ID = 15;

// The 3x3 crafting grid mapped to 54-slot chest slots:
// Row 1: slots 10, 11, 12
// Row 2: slots 19, 20, 21
// Row 3: slots 28, 29, 30
export const CRAFT_GRID_SLOTS = [10, 11, 12, 19, 20, 21, 28, 29, 30] as const;
export const CRAFT_SLOT_MAP: Record<number, number> = {
  10: 0, 11: 1, 12: 2,
  19: 3, 20: 4, 21: 5,
  28: 6, 29: 7, 30: 8
};

export const QUICK_CRAFT_SLOTS = [16, 25, 34] as const;
export const OUTPUT_SLOT = 23;
export const CLOSE_SLOT = 49;

export interface CraftingItem {
  itemId: number;
  count: number;
  nbtData?: any;
}

interface ShapedRecipe {
  inShape: (number | null)[][];
  h: number;
  w: number;
  result: { id: number; count: number };
}

interface ShapelessRecipe {
  ingredients: number[];
  sorted: number[];
  result: { id: number; count: number };
}

// Pre-index recipes from minecraft-data for 0ms ultra-fast lookup
const shapedRecipes: ShapedRecipe[] = [];
const shapelessRecipes: ShapelessRecipe[] = [];

(function indexRecipes() {
  const recipesMap = mcData1192.recipes || {};
  for (const rList of Object.values(recipesMap) as any[]) {
    if (!Array.isArray(rList)) continue;
    for (const r of rList) {
      if (r.inShape && Array.isArray(r.inShape) && r.inShape.length > 0) {
        shapedRecipes.push({
          inShape: r.inShape,
          h: r.inShape.length,
          w: r.inShape[0].length,
          result: r.result
        });
      } else if (r.ingredients && Array.isArray(r.ingredients) && r.ingredients.length > 0) {
        shapelessRecipes.push({
          ingredients: r.ingredients,
          sorted: [...r.ingredients].sort((a, b) => a - b),
          result: r.result
        });
      }
    }
  }
})();

export function formatItemName(rawName: string): string {
  if (!rawName) return 'Item';
  return rawName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function createGuiItemById(
  itemId: number,
  count: number,
  displayName: string,
  loreArray: string[] = []
): any {
  if (!itemId || count <= 0) return { itemCount: 0 };
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));
  return formatSlotForClient({
    present: true,
    itemId,
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

/**
 * Matches a 9-element crafting grid array against all vanilla recipes (shaped and shapeless).
 */
export function matchRecipe(grid: (CraftingItem | null)[]): { result: { id: number; count: number } } | null {
  if (!grid || !Array.isArray(grid)) return null;

  let minRow = 3, maxRow = -1, minCol = 3, maxCol = -1;
  const nonNullItems: CraftingItem[] = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const item = grid[r * 3 + c];
      if (item && item.count > 0) {
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        nonNullItems.push(item);
      }
    }
  }

  if (nonNullItems.length === 0) return null;

  const h = maxRow - minRow + 1;
  const w = maxCol - minCol + 1;
  const gridIds = nonNullItems.map(i => i.itemId).sort((a, b) => a - b);

  // 1. Check Shapeless Recipes
  for (const recipe of shapelessRecipes) {
    if (recipe.ingredients.length === nonNullItems.length) {
      if (recipe.sorted.every((id, idx) => id === gridIds[idx])) {
        return recipe;
      }
    }
  }

  // 2. Check Shaped Recipes
  for (const recipe of shapedRecipes) {
    if (recipe.h === h && recipe.w === w) {
      let matchNormal = true;
      let matchMirrored = true;

      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const expectedId = recipe.inShape[r][c];
          const gridItem = grid[(minRow + r) * 3 + (minCol + c)];
          const actualId = gridItem && gridItem.count > 0 ? gridItem.itemId : null;

          if (expectedId !== actualId) matchNormal = false;

          const mirrorExpectedId = recipe.inShape[r][w - 1 - c];
          if (mirrorExpectedId !== actualId) matchMirrored = false;
        }
        if (!matchNormal && !matchMirrored) break;
      }

      if (matchNormal || matchMirrored) {
        return recipe;
      }
    }
  }

  return null;
}

export function createBarrierRecipeItem(): any {
  return createGuiItem(
    'barrier',
    1,
    '§cRecipe Required',
    [
      '§7Add the ingredients for a valid',
      '§7recipe in the crafting grid to',
      '§7the left.'
    ]
  );
}

export function createQuickCraftTeaserItem(): any {
  return createGuiItem(
    'red_stained_glass_pane',
    1,
    '§cQuick Crafting Slot',
    [
      '§7Quick Crafting allows you to',
      '§7instantly craft items without',
      '§7arranging recipes!',
      ' ',
      '§cRequires §a[VIP] §crank or higher!',
      '§8(Feature coming soon)'
    ]
  );
}

export function createCloseItem(): any {
  return createGuiItem('barrier', 1, '§cClose', ['§eClick to close!']);
}

/**
 * Adds items directly to player's survival inventory (hotbar 36..43 first, then 9..35).
 * Returns the quantity successfully added.
 */
export function addItemToPlayerInventory(pData: any, itemId: number, count: number, is119: boolean = true): number {
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.items[itemId];
  const itemName = itemDef ? itemDef.name : 'unknown';
  const maxStack = itemDef?.stackSize || 64;

  let remaining = count;

  const candidateSlots: number[] = [];
  for (let s = 36; s < 44; s++) candidateSlots.push(s);
  for (let s = 9; s < 36; s++) candidateSlots.push(s);

  // 1. Stack with existing non-full stacks
  for (const slot of candidateSlots) {
    if (remaining <= 0) break;
    const existing = pData.inventory.get(slot);
    if (existing && existing.itemId === itemId && existing.count < maxStack) {
      const canAdd = Math.min(remaining, maxStack - existing.count);
      existing.count += canAdd;
      remaining -= canAdd;
    }
  }

  // 2. Place in empty slots
  for (const slot of candidateSlots) {
    if (remaining <= 0) break;
    if (!pData.inventory.has(slot)) {
      const canAdd = Math.min(remaining, maxStack);
      pData.inventory.set(slot, {
        slot,
        name: itemName,
        itemId,
        count: canAdd
      });
      remaining -= canAdd;
    }
  }

  return count - remaining;
}

/**
 * Drops an item at player's feet if their inventory is completely full on window close.
 */
export function dropItemAtPlayerFeet(pData: any, itemId: number, count: number, is119: boolean = true): void {
  if (!pData || count <= 0) return;
  const server = pData.server;
  if (!server) return;

  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.items[itemId];
  const name = itemDef ? itemDef.name : 'item';
  const x = pData.x || 0;
  const y = pData.y || 70;
  const z = pData.z || 0;

  if (typeof server.spawnDroppedItem === 'function') {
    server.spawnDroppedItem(name, count, x, y, z);
  }
}

/**
 * Synchronizes player survival inventory (windowId 0)
 */
export function syncPlayerInventory(client: any, pData: any, is119: boolean = false): void {
  for (let s = 9; s < 44; s++) {
    const item = pData.inventory.get(s);
    sendSlot(client, 0, s, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
  giveNetherStar(client);
}

/**
 * Synchronizes player inventory portion in the open 54-slot chest window (slots 54..89)
 */
export function syncChestPlayerInventory(client: any, pData: any, is119: boolean = false): void {
  // Main inventory: slots 9..35 mapped to chest 54..80
  for (let s = 9; s < 36; s++) {
    const item = pData.inventory.get(s);
    const chestSlot = s - 9 + 54;
    sendSlot(client, CRAFTING_TABLE_WINDOW_ID, chestSlot, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
  // Hotbar: slots 36..43 mapped to chest 81..88
  for (let s = 36; s < 44; s++) {
    const item = pData.inventory.get(s);
    const chestSlot = s - 36 + 81;
    sendSlot(client, CRAFTING_TABLE_WINDOW_ID, chestSlot, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
  // Slot 89: Nether Star (hotbar slot 44)
  sendSlot(client, CRAFTING_TABLE_WINDOW_ID, 89, createNetherStarItem(is119));
}

/**
 * Synchronizes the 3x3 crafting grid slots (10, 11, 12, 19, 20, 21, 28, 29, 30)
 */
export function syncCraftingGridSlots(client: any, pData: any, is119: boolean = false): void {
  for (let i = 0; i < 9; i++) {
    const slot = CRAFT_GRID_SLOTS[i];
    const item = pData.craftingGrid ? pData.craftingGrid[i] : null;
    sendSlot(client, CRAFTING_TABLE_WINDOW_ID, slot, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
}

/**
 * Evaluates current grid and updates Slot 23 (Crafting Output Slot)
 */
export function updateCraftingOutputSlot(client: any, pData: any, is119: boolean = true): void {
  const recipe = matchRecipe(pData.craftingGrid);
  let outputItem: any;

  if (recipe) {
    const mcData = is119 ? mcData1192 : mcData1211;
    const def = mcData.items[recipe.result.id];
    const rawName = def ? def.name : 'item';
    const friendlyName = formatItemName(rawName);

    outputItem = createGuiItemById(
      recipe.result.id,
      recipe.result.count,
      `§a${friendlyName}`,
      [
        `§7Crafting: §a${recipe.result.count}x ${friendlyName}`,
        ' ',
        '§eClick to craft!',
        '§eShift-Click to craft all!'
      ]
    );
  } else {
    outputItem = createBarrierRecipeItem();
  }

  if (pData.currentGuiItems) {
    pData.currentGuiItems[OUTPUT_SLOT] = outputItem;
  }

  try {
    client.write('set_slot', {
      windowId: CRAFTING_TABLE_WINDOW_ID,
      stateId: 1,
      slot: OUTPUT_SLOT,
      item: outputItem
    });
  } catch (_) {}
}

/**
 * Opens the authentic 54-slot Hypixel Crafting Table container.
 */
export function openCraftingTableMenu(client: any, pData: any): void {
  const is119 = pData.is119 ?? true;
  pData.openWindowId = CRAFTING_TABLE_WINDOW_ID;

  if (!Array.isArray(pData.craftingGrid) || pData.craftingGrid.length !== 9) {
    pData.craftingGrid = new Array(9).fill(null);
  }

  // 1. Base fillers: black stained glass panes
  const items = new Array(54).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  // 3. Grid slots (10, 11, 12, 19, 20, 21, 28, 29, 30)
  for (let i = 0; i < 9; i++) {
    const slot = CRAFT_GRID_SLOTS[i];
    const gridItem = pData.craftingGrid[i];
    if (gridItem && gridItem.count > 0) {
      items[slot] = tagVanillaItemStack({
        present: true,
        itemId: gridItem.itemId,
        itemCount: gridItem.count,
        nbtData: gridItem.nbtData
      }, is119);
    } else {
      items[slot] = { present: false };
    }
  }

  // 4. Output Slot (Slot 23)
  const recipe = matchRecipe(pData.craftingGrid);
  if (recipe) {
    const mcData = is119 ? mcData1192 : mcData1211;
    const def = mcData.items[recipe.result.id];
    const rawName = def ? def.name : 'item';
    const friendlyName = formatItemName(rawName);
    items[OUTPUT_SLOT] = createGuiItemById(
      recipe.result.id,
      recipe.result.count,
      `§a${friendlyName}`,
      [
        `§7Crafting: §a${recipe.result.count}x ${friendlyName}`,
        ' ',
        '§eClick to craft!',
        '§eShift-Click to craft all!'
      ]
    );
  } else {
    items[OUTPUT_SLOT] = createBarrierRecipeItem();
  }

  // 5. Quick Craft VIP Teaser Slots (Slots 16, 25, 34)
  for (const qcSlot of QUICK_CRAFT_SLOTS) {
    items[qcSlot] = createQuickCraftTeaserItem();
  }

  // 6. Close Slot (Slot 49)
  items[CLOSE_SLOT] = createCloseItem();

  pData.currentGuiItems = items;
  sendWindow(client, CRAFTING_TABLE_WINDOW_ID, 5, '§8Crafting Table', items);
}

/**
 * Handles all clicks inside the Crafting Table GUI.
 */
export function handleCraftingTableClick(
  client: any,
  pData: any,
  data: any,
  sendSystemMessage: (client: any, msg: string, is119?: boolean) => void,
  is119: boolean = true
): void {
  const clickedSlot = data.slot;

  // 1. Close Button (Slot 49)
  if (clickedSlot === CLOSE_SLOT) {
    playSound(client, pData, 'random.click', 1.0);
    pData.openWindowId = 0;
    try {
      client.write('close_window', { windowId: CRAFTING_TABLE_WINDOW_ID });
    } catch (_) {}
    handleCraftingTableClose(client, pData, is119);
    return;
  }

  // 2. Quick Craft Teasers (Slots 16, 25, 34)
  if (QUICK_CRAFT_SLOTS.includes(clickedSlot as any)) {
    playSound(client, pData, 'entity.villager.no', 1.0);
    sendSystemMessage(client, '§cQuick Crafting requires §a[VIP] §crank or higher! (Feature coming soon)', is119);
    try {
      client.write('set_slot', {
        windowId: CRAFTING_TABLE_WINDOW_ID,
        stateId: data.stateId,
        slot: clickedSlot,
        item: createQuickCraftTeaserItem()
      });
      client.write('set_slot', {
        windowId: -1,
        stateId: data.stateId,
        slot: -1,
        item: { present: false }
      });
    } catch (_) {}
    return;
  }

  // 3. Decorative Black Glass Borders (< 54 and not grid, not output, not teaser, not close)
  if (
    clickedSlot >= 0 &&
    clickedSlot < 54 &&
    !CRAFT_GRID_SLOTS.includes(clickedSlot as any) &&
    clickedSlot !== OUTPUT_SLOT
  ) {
    try {
      client.write('set_slot', {
        windowId: CRAFTING_TABLE_WINDOW_ID,
        stateId: data.stateId,
        slot: clickedSlot,
        item: createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
      });
      client.write('set_slot', {
        windowId: -1,
        stateId: data.stateId,
        slot: -1,
        item: data.cursorItem || data.carriedItem || { present: false }
      });
    } catch (_) {}
    return;
  }

  // 4. Crafting Output Slot (Slot 23)
  if (clickedSlot === OUTPUT_SLOT) {
    const recipe = matchRecipe(pData.craftingGrid);

    if (!recipe) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      try {
        client.write('set_slot', {
          windowId: CRAFTING_TABLE_WINDOW_ID,
          stateId: data.stateId,
          slot: OUTPUT_SLOT,
          item: createBarrierRecipeItem()
        });
        client.write('set_slot', {
          windowId: -1,
          stateId: data.stateId,
          slot: -1,
          item: { present: false }
        });
      } catch (_) {}
      return;
    }

    // A. Shift-Click (Craft All Available Batches)
    if (data.mode === 1) {
      const nonNullGrid = pData.craftingGrid.filter((i: any) => i && i.count > 0);
      if (nonNullGrid.length === 0) return;

      const maxBatches = Math.min(...nonNullGrid.map((i: any) => i.count));

      // Calculate player inventory space
      const candidateSlots: number[] = [];
      for (let s = 36; s < 44; s++) candidateSlots.push(s);
      for (let s = 9; s < 36; s++) candidateSlots.push(s);

      let space = 0;
      for (const s of candidateSlots) {
        const existing = pData.inventory.get(s);
        if (!existing) {
          space += 64;
        } else if (existing.itemId === recipe.result.id && existing.count < 64) {
          space += (64 - existing.count);
        }
      }

      const batchesToCraft = Math.min(maxBatches, Math.floor(space / recipe.result.count));

      if (batchesToCraft <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYour inventory is completely full!', is119);
        try {
          client.write('set_slot', {
            windowId: -1,
            stateId: data.stateId,
            slot: -1,
            item: { present: false }
          });
        } catch (_) {}
        return;
      }

      // Deduct batches from grid
      for (let i = 0; i < 9; i++) {
        if (pData.craftingGrid[i]) {
          pData.craftingGrid[i].count -= batchesToCraft;
          if (pData.craftingGrid[i].count <= 0) {
            pData.craftingGrid[i] = null;
          }
        }
      }

      // Add crafted items to player inventory
      addItemToPlayerInventory(pData, recipe.result.id, recipe.result.count * batchesToCraft, is119);

      // Resync UI
      syncChestPlayerInventory(client, pData, is119);
      syncCraftingGridSlots(client, pData, is119);
      updateCraftingOutputSlot(client, pData, is119);
      playSound(client, pData, 'entity.item.pickup', 1.0);
      if (pData && pData.client) persistPlayerSession(pData);
      return;
    }

    // B. Normal Click (Craft 1 Batch)
    if (data.mode === 0 || data.mode === undefined) {
      let carried = data.cursorItem || data.carriedItem;
      const resultCount = recipe.result.count;
      const resultId = recipe.result.id;

      // Check if cursor can accept the crafted result
      if (carried && carried.present && carried.itemId !== resultId) {
        // Different item on cursor
        playSound(client, pData, 'entity.villager.no', 1.0);
        updateCraftingOutputSlot(client, pData, is119);
        return;
      }

      if (carried && carried.present && carried.itemCount + resultCount > 64) {
        // Cursor stack overflow
        playSound(client, pData, 'entity.villager.no', 1.0);
        updateCraftingOutputSlot(client, pData, is119);
        return;
      }

      // Deduct 1 from each non-null grid slot
      for (let i = 0; i < 9; i++) {
        if (pData.craftingGrid[i]) {
          pData.craftingGrid[i].count -= 1;
          if (pData.craftingGrid[i].count <= 0) {
            pData.craftingGrid[i] = null;
          }
        }
      }

      // Update cursor
      if (carried && carried.present) {
        carried.itemCount += resultCount;
      } else {
        carried = tagVanillaItemStack({
          present: true,
          itemId: resultId,
          itemCount: resultCount
        }, is119);
      }

      try {
        client.write('set_slot', {
          windowId: -1,
          stateId: data.stateId,
          slot: -1,
          item: carried
        });
      } catch (_) {}

      syncCraftingGridSlots(client, pData, is119);
      updateCraftingOutputSlot(client, pData, is119);
      playSound(client, pData, 'entity.item.pickup', 1.0);
      if (pData && pData.client) persistPlayerSession(pData);
      return;
    }
  }

  // 5. Grid or Player Inventory Slot Interaction
  if (Array.isArray(data.changedSlots)) {
    const mcData = is119 ? mcData1192 : mcData1211;

    for (const change of data.changedSlots) {
      const loc = change.location;
      const it = change.item;

      // Nether Star protection in slot 89
      if (loc === 89) {
        giveNetherStar(client);
        continue;
      }

      // Grid slot changed
      if (loc in CRAFT_SLOT_MAP) {
        const gridIdx = CRAFT_SLOT_MAP[loc];
        if (!it || !it.present || it.itemCount <= 0) {
          pData.craftingGrid[gridIdx] = null;
        } else {
          pData.craftingGrid[gridIdx] = {
            itemId: it.itemId,
            count: it.itemCount,
            nbtData: it.nbtData
          };
        }
        continue;
      }

      // Main inventory (54..80 -> 9..35)
      if (loc >= 54 && loc <= 80) {
        const invSlot = loc - 54 + 9;
        if (!it || !it.present || it.itemCount <= 0) {
          pData.inventory.delete(invSlot);
        } else {
          const tagged = tagVanillaItemStack(it, is119);
          const def = mcData.items[tagged.itemId];
          pData.inventory.set(invSlot, {
            slot: invSlot,
            name: def ? def.name : 'unknown',
            itemId: tagged.itemId,
            count: tagged.itemCount,
            nbtData: tagged.nbtData
          });
        }
        continue;
      }

      // Hotbar (81..88 -> 36..43)
      if (loc >= 81 && loc <= 88) {
        const invSlot = loc - 81 + 36;
        if (!it || !it.present || it.itemCount <= 0) {
          pData.inventory.delete(invSlot);
        } else {
          const tagged = tagVanillaItemStack(it, is119);
          const def = mcData.items[tagged.itemId];
          pData.inventory.set(invSlot, {
            slot: invSlot,
            name: def ? def.name : 'unknown',
            itemId: tagged.itemId,
            count: tagged.itemCount,
            nbtData: tagged.nbtData
          });
        }
        continue;
      }
    }

    // Sync cursor if cursorItem or carriedItem provided
    const cursor = data.cursorItem || data.carriedItem;
    if (cursor) {
      try {
        client.write('set_slot', {
          windowId: -1,
          stateId: data.stateId,
          slot: -1,
          item: cursor
        });
      } catch (_) {}
    }

    // Re-evaluate recipe and update output slot in real-time
    updateCraftingOutputSlot(client, pData, is119);
    if (pData && pData.client) persistPlayerSession(pData);
  }
}

/**
 * Handles window closure: safely returns any remaining grid items back to player inventory (or ground).
 */
export function handleCraftingTableClose(client: any, pData: any, is119: boolean = true): void {
  if (Array.isArray(pData.craftingGrid)) {
    for (let i = 0; i < 9; i++) {
      const item = pData.craftingGrid[i];
      if (item && item.count > 0) {
        const added = addItemToPlayerInventory(pData, item.itemId, item.count, is119);
        const leftover = item.count - added;
        if (leftover > 0) {
          dropItemAtPlayerFeet(pData, item.itemId, leftover, is119);
        }
      }
    }
    pData.craftingGrid = null;
  }
  pData.openWindowId = 0;
  syncPlayerInventory(client, pData, is119);
  giveNetherStar(client);
  if (pData && pData.client) persistPlayerSession(pData);
}
