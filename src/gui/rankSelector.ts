/**
 * ZylarPixel Rank Selector Sub-GUI (54-Slot GUI)
 * Centered layout:
 * - Row 1 (Slots 11..15): Staff Tiers (Owner, Admin, Dev, Mod, Helper)
 * - Row 2 (Slots 18..26): Gray Glass Pane divider
 * - Row 3 (Slots 29..34): Player/Donator Tiers (MVP++, MVP+, MVP, VIP+, VIP, Default)
 * - Row 5 (Slot 49): Back to Admin Menu Arrow
 */

import { createGuiItem, createAdminBaseSlots } from './adminMenu';
import { RANKS } from '../config/ranks';

export const RANK_SLOT_MAP: Record<number, string> = {
  // Staff Tiers (Centered in Row 1)
  11: 'owner',
  12: 'admin',
  13: 'developer',
  14: 'mod',
  15: 'helper',

  // Player / Donator Tiers (Centered in Row 3)
  29: 'mvp_plus_plus',
  30: 'mvp_plus',
  31: 'mvp',
  32: 'vip_plus',
  33: 'vip',
  34: 'default'
};

export function openRankSelector(client: any, pData: any, targetPlayer: any = null): void {
  const target = targetPlayer || pData;
  pData.openWindowId = 2;
  pData.targetPlayerForRank = target;

  const title = `§8Rank: ${target.username}`;

  // 1. Open 54-slot chest window
  client.write('open_window', {
    windowId: 2,
    inventoryType: 5, // generic_9x6
    windowTitle: JSON.stringify({ text: title })
  });

  // 2. Populate 54 slots (Outer border: Black Stained Glass, Inner background: Gray Stained Glass)
  const items = createAdminBaseSlots(54);

  // Populate Staff & Player Ranks
  for (const [slotStr, rankId] of Object.entries(RANK_SLOT_MAP)) {
    const slot = parseInt(slotStr);
    const rank = RANKS[rankId];
    if (rank) {
      const isCurrent = target.rank && target.rank.id === rank.id;
      const statusText = isCurrent ? '§a✔ Currently Active' : `§eClick to apply to ${target.username}!`;

      items[slot] = createGuiItem(
        rank.iconItem,
        1,
        `${rank.displayName} §fRank`,
        [
          `§7Target: §f${target.username}`,
          `§7Tier: §f${rank.name}`,
          `§7Prefix: ${rank.prefix}`,
          `§7Info: §f${rank.description}`,
          ' ',
          statusText
        ]
      );
    }
  }

  // Slot 4: Target player banner
  items[4] = createGuiItem(
    'player_head',
    1,
    `§b§lPlayer: §f${target.username}`,
    [
      `§7Current Rank: ${target.rank ? target.rank.prefix : 'None'}`,
      '§7Click a rank below to apply.'
    ]
  );

  // Slot 49: Back to Player Selector / Admin Menu (Arrow)
  items[49] = createGuiItem(
    'arrow',
    1,
    '§a§l◀ Back to Admin Control Panel',
    ['§7Return to the main admin control panel.']
  );

  // Cache items on session so clicks can never alter or steal them
  pData.currentGuiItems = items;

  client.write('window_items', {
    windowId: 2,
    stateId: 1,
    items,
    carriedItem: { present: false }
  });
}
