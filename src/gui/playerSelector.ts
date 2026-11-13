/**
 * ZylarPixel Online Player Selector GUI (54-Slot GUI)
 * Allows administrators to select which online player to modify ranks for
 */

import { createGuiItem, createAdminBaseSlots } from './adminMenu';
import { createPlayerSkullItem } from '../storage/skinService';
import { formatPlayerName } from '../config/ranks';
import { formatGuiTitle } from './guiTheme';

export function openPlayerSelector(client: any, pData: any, playersMap: Map<number, any>): void {
  pData.openWindowId = 3;

  client.write('open_window', {
    windowId: 3,
    inventoryType: 5, // generic_9x6
    windowTitle: JSON.stringify({ text: '§8Select Player to Change Rank' })
  });

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

  client.write('window_items', {
    windowId: 3,
    stateId: 1,
    items,
    carriedItem: { present: false }
  });
}
