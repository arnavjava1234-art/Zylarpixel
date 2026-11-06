/**
 * Authentic Hypixel SkyBlock Farm Merchant GUI (Window ID 16)
 * 54-Slot (minecraft:generic_9x6) double-chest layout, 1:1 mirror of Hypixel Classic Hub.
 * 
 * Features:
 * - 13 authentic commodities (Wheat, Carrot, Potato, Melon, Sugar Cane, Pumpkin, Cocoa, Mushrooms, Sand, Cactus)
 * - Anti-arbitrage guaranteed: Buy unit price > Sell unit price across every single commodity
 * - Contiguous under-development items at slots 23 & 24 (Enchanted Bone Meal with glint, Rookie Hoe)
 * - Clean lore with daily limit and countdown numbers stripped
 * - 640 daily purchase cap per commodity with universal 00:00 GMT lazy epoch rollover
 * - Interactive Click-to-Sell for agricultural commodities from player inventory (slots 54..89)
 * - Slot 48 Hopper: direct click instruction + shift-click bulk liquidation
 * - Slot 49 Barrier: clean menu closure
 */

import { mcData1192, mcData1211 } from '../world/worldManager';
import { playSound } from './bankMenu';
import { tagVanillaItemStack, formatSlotForClient } from '../items';
import { persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { updatePlayerScoreboardPurse } from '../core/scoreboard';
import { sendWindow, sendSlot, makeEmptySlot } from './guiHelper';

export const FARM_MERCHANT_WINDOW_ID = 16;
export const DAILY_MERCHANT_LIMIT = 640;

export interface CommodityItem {
  slot: number;
  name: string;
  vanillaItem: string;
  buyUnit: number;
  buyPrice: number;
  unitSellPrice: number;
  isUnderDev?: boolean;
  isEnchanted?: boolean;
  lore?: string[];
}

export const COMMODITIES: Record<number, CommodityItem> = {
  10: {
    slot: 10,
    name: 'Wheat',
    vanillaItem: 'wheat',
    buyUnit: 3,
    buyPrice: 7,
    unitSellPrice: 2.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§67 Coins', ' ', '§eClick to buy!']
  },
  11: {
    slot: 11,
    name: 'Carrot',
    vanillaItem: 'carrot',
    buyUnit: 3,
    buyPrice: 7,
    unitSellPrice: 1.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§67 Coins', ' ', '§eClick to buy!']
  },
  12: {
    slot: 12,
    name: 'Potato',
    vanillaItem: 'potato',
    buyUnit: 3,
    buyPrice: 7,
    unitSellPrice: 1.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§67 Coins', ' ', '§eClick to buy!']
  },
  13: {
    slot: 13,
    name: 'Melon Slice',
    vanillaItem: 'melon_slice',
    buyUnit: 10,
    buyPrice: 10,
    unitSellPrice: 0.2,
    lore: ['§8Collection Item', ' ', '§7Cost', '§610 Coins', ' ', '§eClick to buy!']
  },
  14: {
    slot: 14,
    name: 'Sugar Cane',
    vanillaItem: 'sugar_cane',
    buyUnit: 3,
    buyPrice: 15,
    unitSellPrice: 1.334,
    lore: ['§8Collection Item', ' ', '§7Cost', '§615 Coins', ' ', '§eClick to buy!']
  },
  15: {
    slot: 15,
    name: 'Pumpkin',
    vanillaItem: 'pumpkin',
    buyUnit: 1,
    buyPrice: 25,
    unitSellPrice: 10.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§625 Coins', ' ', '§eClick to buy!']
  },
  16: {
    slot: 16,
    name: 'Cocoa Beans',
    vanillaItem: 'cocoa_beans',
    buyUnit: 3,
    buyPrice: 7,
    unitSellPrice: 1.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§67 Coins', ' ', '§eClick to buy!']
  },
  19: {
    slot: 19,
    name: 'Red Mushroom',
    vanillaItem: 'red_mushroom',
    buyUnit: 1,
    buyPrice: 12,
    unitSellPrice: 10.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§612 Coins', ' ', '§eClick to buy!']
  },
  20: {
    slot: 20,
    name: 'Brown Mushroom',
    vanillaItem: 'brown_mushroom',
    buyUnit: 1,
    buyPrice: 12,
    unitSellPrice: 10.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§612 Coins', ' ', '§eClick to buy!']
  },
  21: {
    slot: 21,
    name: 'Sand',
    vanillaItem: 'sand',
    buyUnit: 2,
    buyPrice: 8,
    unitSellPrice: 1.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§68 Coins', ' ', '§eClick to buy!']
  },
  22: {
    slot: 22,
    name: 'Cactus',
    vanillaItem: 'cactus',
    buyUnit: 1,
    buyPrice: 10,
    unitSellPrice: 4.0,
    lore: ['§8Collection Item', ' ', '§7Cost', '§610 Coins', ' ', '§eClick to buy!']
  },
  23: {
    slot: 23,
    name: 'Enchanted Bone Meal',
    vanillaItem: 'bone_meal',
    buyUnit: 1,
    buyPrice: 6,
    unitSellPrice: 0.0,
    isUnderDev: true,
    isEnchanted: true,
    lore: [
      '§7Instantly grows all crops in',
      '§7a 5x5 area when placed!',
      ' ',
      '§cCurrently Under Development!'
    ]
  },
  24: {
    slot: 24,
    name: 'Rookie Hoe',
    vanillaItem: 'stone_hoe',
    buyUnit: 1,
    buyPrice: 10,
    unitSellPrice: 0.0,
    isUnderDev: true,
    lore: [
      '§7Farming Fortune: §a+5',
      '§7Drop bonus: §a50% chance §7to drop a seed',
      '§7when breaking crops.',
      ' ',
      '§f§lCOMMON HOE',
      ' ',
      '§cCurrently Under Development!'
    ]
  }
};

export const CROP_SELL_PRICES: Record<string, number> = {
  wheat: 2.0,
  carrot: 1.0,
  potato: 1.0,
  melon_slice: 0.2,
  melon: 1.0,
  sugar_cane: 1.334,
  pumpkin: 10.0,
  cocoa_beans: 1.0,
  red_mushroom: 10.0,
  brown_mushroom: 10.0,
  sand: 1.0,
  cactus: 4.0
};

/**
 * Universal lazy rollover at 00:00 GMT (Midnight UTC)
 */
export function checkAndRolloverDailyCaps(pData: any): void {
  const currentUtcDay = Math.floor(Date.now() / 86_400_000);
  if (pData.merchantLastResetDay !== currentUtcDay) {
    pData.merchantDailyPurchases = {};
    pData.merchantLastResetDay = currentUtcDay;
  }
  if (!pData.merchantDailyPurchases) {
    pData.merchantDailyPurchases = {};
  }
}

/**
 * Creates an authentic GUI NBT Item
 */
export function createMerchantGuiItem(
  itemName: string,
  count: number,
  displayName: string,
  loreArray: string[] = [],
  isEnchanted: boolean = false
): any {
  const itemDef = mcData1192.itemsByName[itemName] || mcData1192.blocksByName[itemName] || mcData1192.itemsByName.stone;
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));

  const nbtValue: any = {
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
  };

  if (isEnchanted) {
    nbtValue.Enchantments = {
      type: 'list',
      value: {
        type: 'compound',
        value: [{ id: { type: 'string', value: 'minecraft:unbreaking' }, lvl: { type: 'short', value: 1 } }]
      }
    };
    nbtValue.HideFlags = { type: 'int', value: 1 };
  }

  return {
    present: true,
    itemId: itemDef.id,
    itemCount: count || 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: nbtValue
    }
  };
}

/**
 * Synchronizes player inventory inside the open 54-slot chest window (slots 54..89)
 */
export function syncMerchantChestPlayerInventory(client: any, pData: any, is119: boolean = false): void {
  // Main inventory: slots 9..35 mapped to chest slots 54..80
  for (let s = 9; s < 36; s++) {
    const item = pData.inventory.get(s);
    const chestSlot = s - 9 + 54;
    sendSlot(client, FARM_MERCHANT_WINDOW_ID, chestSlot, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
  // Hotbar: slots 36..43 mapped to chest slots 81..88
  for (let s = 36; s < 44; s++) {
    const item = pData.inventory.get(s);
    const chestSlot = s - 36 + 81;
    sendSlot(client, FARM_MERCHANT_WINDOW_ID, chestSlot, item && item.count > 0 ? tagVanillaItemStack(item, is119) : null);
  }
}

/**
 * Adds purchased commodity to player inventory, stacking with existing non-full stacks first
 */
function addCommodityToPlayerInventory(pData: any, itemName: string, count: number, is119: boolean): boolean {
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.itemsByName[itemName] || mcData.blocksByName[itemName];
  if (!itemDef) return false;

  const candidateSlots: number[] = [];
  for (let s = 36; s < 44; s++) candidateSlots.push(s);
  for (let s = 9; s < 36; s++) candidateSlots.push(s);

  let remaining = count;

  // 1. Stack into existing non-full stacks
  for (const s of candidateSlots) {
    if (remaining <= 0) break;
    const existing = pData.inventory.get(s);
    if (existing && existing.itemId === itemDef.id && existing.count < 64) {
      const canAdd = Math.min(remaining, 64 - existing.count);
      existing.count += canAdd;
      remaining -= canAdd;

      const tagged = tagVanillaItemStack({
        present: true,
        itemId: existing.itemId,
        itemCount: existing.count,
        nbtData: existing.nbtData
      }, is119);
      existing.nbtData = tagged.nbtData;

      sendSlot(pData.client, 0, s, tagged);
    }
  }

  // 2. Place in empty slots
  for (const s of candidateSlots) {
    if (remaining <= 0) break;
    if (!pData.inventory.has(s)) {
      const canAdd = Math.min(remaining, 64);
      const tagged = tagVanillaItemStack({
        present: true,
        itemId: itemDef.id,
        itemCount: canAdd
      }, is119);

      pData.inventory.set(s, {
        slot: s,
        name: itemName,
        itemId: itemDef.id,
        count: canAdd,
        nbtData: tagged.nbtData
      });
      remaining -= canAdd;

      sendSlot(pData.client, 0, s, tagged);
    }
  }

  return remaining === 0;
}

/**
 * Checks if player inventory has space to receive items
 */
function hasInventorySpace(pData: any, itemName: string, count: number, is119: boolean): boolean {
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.itemsByName[itemName] || mcData.blocksByName[itemName];
  if (!itemDef) return false;

  let capacity = 0;
  for (let s = 36; s < 44; s++) {
    if (!pData.inventory.has(s)) {
      capacity += 64;
    } else {
      const it = pData.inventory.get(s);
      if (it && it.itemId === itemDef.id && it.count < 64) {
        capacity += (64 - it.count);
      }
    }
  }
  for (let s = 9; s < 36; s++) {
    if (!pData.inventory.has(s)) {
      capacity += 64;
    } else {
      const it = pData.inventory.get(s);
      if (it && it.itemId === itemDef.id && it.count < 64) {
        capacity += (64 - it.count);
      }
    }
  }
  return capacity >= count;
}

/**
 * Formats item names nicely (e.g. sugar_cane -> Sugar Cane)
 */
function formatItemName(raw: string): string {
  if (!raw) return 'Item';
  return raw.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Opens the Farm Merchant 54-slot chest GUI
 */
export function openFarmMerchantMenu(client: any, pData: any, is119: boolean = false): void {
  pData.openWindowId = FARM_MERCHANT_WINDOW_ID;
  checkAndRolloverDailyCaps(pData);

  // 1. Base fillers: gray stained glass panes
  const items = new Array(54).fill(null).map(() =>
    createMerchantGuiItem('gray_stained_glass_pane', 1, '§8 ', [])
  );

  // 2. Populate 13 Commodities
  for (const slotStr of Object.keys(COMMODITIES)) {
    const slot = parseInt(slotStr, 10);
    const c = COMMODITIES[slot];
    items[slot] = createMerchantGuiItem(
      c.vanillaItem,
      c.buyUnit,
      `§a${c.name}`,
      c.lore || [],
      c.isEnchanted || false
    );
  }

  // 3. Utility Slot 48: Hopper ("Sell Item")
  items[48] = createMerchantGuiItem(
    'hopper',
    1,
    '§aSell Item',
    [
      '§7Click an item in your inventory',
      '§7to sell it to this merchant!',
      ' ',
      '§8Shift-click to sell all crops.'
    ]
  );

  // 4. Utility Slot 49: Barrier ("Close")
  items[49] = createMerchantGuiItem(
    'barrier',
    1,
    '§cClose',
    [
      '§eClick to close!'
    ]
  );

  pData.currentGuiItems = items;

  // 5. Open window and write items via 1.21.8 Data Components
  sendWindow(client, FARM_MERCHANT_WINDOW_ID, 5, '§8Farm Merchant', items);

  // 6. Sync open chest player inventory slots
  syncMerchantChestPlayerInventory(client, pData, is119);

  playSound(client, pData, 'ui.button.click', 1.0);
}

/**
 * Handles all click interactions inside the Farm Merchant GUI
 */
export function handleFarmMerchantClick(
  client: any,
  pData: any,
  data: any,
  sendSystemMsg: (client: any, msg: string, is119?: boolean) => void,
  is119: boolean = true
): void {
  const clickedSlot = data.slot;
  checkAndRolloverDailyCaps(pData);

  // A. Close Button (Slot 49)
  if (clickedSlot === 49) {
    pData.openWindowId = 0;
    try {
      client.write('close_window', { windowId: FARM_MERCHANT_WINDOW_ID });
    } catch (_) {}
    playSound(client, pData, 'ui.button.click', 1.0);
    return;
  }

  // B. Hopper Utility Slot 48 (Sell Item)
  if (clickedSlot === 48) {
    // If shift-clicked (data.mode === 1): Bulk sell all crops in player inventory
    if (data.mode === 1) {
      let totalCropsSold = 0;
      let totalCoinsEarned = 0;

      for (let s = 9; s < 44; s++) {
        const it = pData.inventory.get(s);
        if (it && CROP_SELL_PRICES[it.name] !== undefined) {
          const unitPrice = CROP_SELL_PRICES[it.name];
          const coins = Math.max(1, Math.floor(it.count * unitPrice));
          totalCropsSold += it.count;
          totalCoinsEarned += coins;
          pData.inventory.delete(s);
          try {
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot: s,
              item: { present: false }
            });
          } catch (_) {}
        }
      }

      if (totalCropsSold > 0) {
        pData.purse += totalCoinsEarned;
        updatePlayerScoreboardPurse(pData);
        syncMerchantChestPlayerInventory(client, pData, is119);
        persistPlayerSession(pData);
        playSound(client, pData, 'entity.experience_orb.pickup', 1.2);
        sendSystemMsg(client, `§6[NPC] Farm Merchant: Sold §e${totalCropsSold} §6crops for §6+${totalCoinsEarned.toLocaleString()} Coins§6!`, is119);
      } else {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMsg(client, '§c[NPC] Farm Merchant: You do not have any sellable crops in your inventory!', is119);
      }
      return;
    }

    // Direct click: Prompt instructional message
    playSound(client, pData, 'ui.button.click', 1.0);
    sendSystemMsg(client, '§e[NPC] Farm Merchant: Click any crop in your inventory below to sell it to me!', is119);
    return;
  }

  // C. Top Container Slots 0..53 (Commodity Purchasing)
  if (clickedSlot >= 0 && clickedSlot < 54) {
    const commodity = COMMODITIES[clickedSlot];
    if (!commodity) return; // Filler glass pane or blank slot

    // 1. Under-development guard (Slots 23 & 24: Enchanted Bone Meal, Rookie Hoe)
    if (commodity.isUnderDev) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMsg(client, '§c[NPC] Farm Merchant: You cannot buy this item as it is currently under development!', is119);
      return;
    }

    // 2. Daily limit 640 check
    const currentPurchased = pData.merchantDailyPurchases[commodity.vanillaItem] || 0;
    if (currentPurchased + commodity.buyUnit > DAILY_MERCHANT_LIMIT) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMsg(client, `§c[NPC] Farm Merchant: You have reached your daily limit of ${DAILY_MERCHANT_LIMIT} for this item today!`, is119);
      return;
    }

    // 3. Purse balance check
    if (pData.purse < commodity.buyPrice) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMsg(client, '§cYou do not have enough coins!', is119);
      return;
    }

    // 4. Inventory capacity check
    if (!hasInventorySpace(pData, commodity.vanillaItem, commodity.buyUnit, is119)) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMsg(client, '§cYour inventory is full!', is119);
      return;
    }

    // 5. Execute Purchase
    pData.purse -= commodity.buyPrice;
    pData.merchantDailyPurchases[commodity.vanillaItem] = currentPurchased + commodity.buyUnit;

    addCommodityToPlayerInventory(pData, commodity.vanillaItem, commodity.buyUnit, is119);
    syncMerchantChestPlayerInventory(client, pData, is119);

    updatePlayerScoreboardPurse(pData);
    persistPlayerSession(pData);

    playSound(client, pData, 'entity.experience_orb.pickup', 1.4);
    sendSystemMsg(client, `§aYou bought §e${commodity.buyUnit}x ${commodity.name} §afor §6${commodity.buyPrice} Coins§a!`, is119);
    return;
  }

  // D. Bottom Player Inventory Slots 54..89 (Click-to-Sell)
  if (clickedSlot >= 54 && clickedSlot < 90) {
    let survivalSlot = -1;
    if (clickedSlot >= 54 && clickedSlot <= 80) {
      // Main inventory rows (slots 9..35)
      survivalSlot = clickedSlot - 54 + 9;
    } else if (clickedSlot >= 81 && clickedSlot <= 88) {
      // Hotbar slots (slots 36..43)
      survivalSlot = clickedSlot - 81 + 36;
    } else if (clickedSlot === 89) {
      // Hotbar Slot 9 (Nether star) -> Protected!
      return;
    }

    if (survivalSlot === -1 || !pData.inventory.has(survivalSlot)) {
      return;
    }

    const item = pData.inventory.get(survivalSlot);
    if (!item) return;

    const unitPrice = CROP_SELL_PRICES[item.name];
    if (unitPrice !== undefined && unitPrice > 0) {
      const earnedCoins = Math.max(1, Math.floor(item.count * unitPrice));
      const count = item.count;
      const itemName = formatItemName(item.name);

      pData.purse += earnedCoins;
      pData.inventory.delete(survivalSlot);

      // Clear slot in survival window 0 and open chest window
      sendSlot(client, 0, survivalSlot, null);
      sendSlot(client, FARM_MERCHANT_WINDOW_ID, clickedSlot, null);

      updatePlayerScoreboardPurse(pData);
      persistPlayerSession(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.2);
      sendSystemMsg(client, `§6You sold §e${count}x ${itemName} §6for §6+${earnedCoins.toLocaleString()} Coins§6!`, is119);
    } else {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMsg(client, '§c[NPC] Farm Merchant: I only buy farm commodities!', is119);
    }
  }
}
