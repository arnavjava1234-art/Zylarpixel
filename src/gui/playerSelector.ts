/**
 * ZylarPixel Online Player Selector GUI (54-Slot GUI)
 * Allows administrators to select which online player to modify ranks for
 */

import { createGuiItem, createAdminBaseSlots } from './adminMenu';
import { createPlayerSkullItem } from '../storage/skinService';
import { formatPlayerName } from '../config/ranks';
import { sendWindow } from './guiHelper';

export function openPlayerSelector(client: any, pData: any, playersMap: Map<number, any>): void {
  pData.openWindowId = 3;

  const items = createAdminBaseSlots(54);

  // Populate online players across row 2 (Slots 19..25)
  const onlineList = Array.from(playersMap.values());
  const startSlot = 20;

  pData.playerSelectorSlots = new Map<number, any>(); // slot -> targetPData

  onlineList.forEach((target: any, idx: number) => {
    const slot = startSlot + (idx * 2);
    if (slot < 35) {
      pData.playerSelectorSlots.set(slot, target);
      const isSelf = (target.username === pData.username);
      items[slot] = createPlayerSkullItem(
        target.username,
        formatPlayerName(target.rank, target.username) + (isSelf ? ' §7(You)' : ''),
        [
          `§7Username: §f${target.username}`,
          `§7Current Rank: ${target.rank ? target.rank.prefix : 'None'}`,
          `§7Island Origin: §e(${target.island ? target.island.originX : 0}, 100, 0)`,
          ' ',
          '§eClick to select this player! §b▶'
        ]
      );
    }
  });

  // Slot 49: Back to Admin Menu (Arrow)
  items[49] = createGuiItem(
    'arrow',
    1,
    '§a§l◀ Back to Admin Control Panel',
    ['§7Return to the main admin control panel.']
  );

  pData.currentGuiItems = items;
  sendWindow(client, 3, 5, '§8Select Player to Change Rank', items);
}
