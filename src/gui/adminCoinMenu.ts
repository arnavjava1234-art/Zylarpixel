/**
 * ZylarPixel Admin Coin & Economy Manager GUI
 * 
 * Features:
 * - 54-Slot Player Selector (WindowId = 11) displaying active online players
 * - Excludes NPCs (Banker, Holograms, etc.)
 * - Toggle button (Slot 50) to switch between Online Only vs Online + Offline Players
 * - 36-Slot Action Sub-GUI (WindowId = 12) with Set, Add, Remove actions
 * - Real Vanilla Oak Sign Editor GUI for typing coin values (50k, 2.5m, etc.)
 * - Instant live update to memory, sidebar scoreboard, and disk storage
 * - Private feedback sent strictly to the admin
 */

import { createGuiItem, openAdminMenu, createAdminBaseSlots } from './adminMenu';
import { createPlayerSkullItem } from '../storage/skinService';
import { formatPlayerName } from '../config/ranks';
import { loadPlayerData, savePlayerData, getAllDiskPlayerNames } from '../storage/diskStorage';
import { loadPlayerProfile, savePlayerProfile } from '../storage/sharedProfile';
import { findPlayerByName, persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { updatePlayerScoreboardPurse } from '../core/scoreboard';
import { parseCoinInput, formatCoins, playSound, restoreSignBlock } from './bankMenu';

export const ADMIN_COIN_SELECTOR_WINDOW_ID = 11;
export const ADMIN_COIN_ACTION_WINDOW_ID = 12;

export function openCoinPlayerSelector(
  client: any,
  pData: any,
  playersMap: Map<number, any>,
  showOffline: boolean = false
): void {
  pData.openWindowId = ADMIN_COIN_SELECTOR_WINDOW_ID;

  client.write('open_window', {
    windowId: ADMIN_COIN_SELECTOR_WINDOW_ID,
    inventoryType: 5, // generic_9x6 (54 slots)
    windowTitle: JSON.stringify({ text: '§8Manage Coins: Select Player' })
  });

  const items = createAdminBaseSlots(54);

  const slotPlayerMap = new Map<number, { username: string; isOnline: boolean; purse: number; targetPData?: any }>();
  const availableSlots = [
    10, 11, 12, 13, 14, 15, 16,
    19, 20, 21, 22, 23, 24, 25,
    28, 29, 30, 31, 32, 33, 34,
    37, 38, 39, 40, 41, 42, 43
  ];

  let slotIdx = 0;

  if (!showOffline) {
    // Mode 1: Online Only (Excluding NPCs)
    for (const [_, p] of playersMap) {
      if (!p || !p.username || p.username.toLowerCase() === 'banker' || p.entityId === 8888) {
        continue;
      }
      if (slotIdx >= availableSlots.length) break;

      const slot = availableSlots[slotIdx++];
      const isSelf = p.username === pData.username;
      const purse = typeof p.purse === 'number' ? p.purse : 0;

      slotPlayerMap.set(slot, {
        username: p.username,
        isOnline: true,
        purse,
        targetPData: p
      });

      items[slot] = createPlayerSkullItem(
        p.username,
        formatPlayerName(p.rank, p.username) + (isSelf ? ' §7(You)' : ''),
        [
          `§7Username: §f${p.username}`,
          '§7Status: §aOnline',
          `§7Purse: §6${formatCoins(purse)} coins`,
          ' ',
          '§eClick to manage purse! §b▶'
        ]
      );
    }
  } else {
    // Mode 2: Online + Offline Players from Disk
    const nameMap = new Map<string, string>();
    for (const diskName of getAllDiskPlayerNames()) {
      if (diskName && diskName.toLowerCase() !== 'banker') {
        nameMap.set(diskName.toLowerCase(), diskName);
      }
    }
    for (const [_, p] of playersMap) {
      if (p && p.username && p.username.toLowerCase() !== 'banker' && p.entityId !== 8888) {
        nameMap.set(p.username.toLowerCase(), p.username);
      }
    }

    const allNames = Array.from(nameMap.values());
    for (const name of allNames) {
      if (slotIdx >= availableSlots.length) break;

      const slot = availableSlots[slotIdx++];
      const onlineTarget = findPlayerByName(name);
      const isOnline = !!onlineTarget;
      const isSelf = name === pData.username;

      let purse = 0;
      if (isOnline) {
        purse = typeof onlineTarget.purse === 'number' ? onlineTarget.purse : 0;
      } else {
        const saved = loadPlayerData(name);
        const prof = loadPlayerProfile(name);
        purse = typeof (saved as any)?.purse === 'number' ? (saved as any).purse : (typeof prof?.coins === 'number' ? prof.coins : 0);
      }

      slotPlayerMap.set(slot, {
        username: name,
        isOnline,
        purse,
        targetPData: onlineTarget
      });

      items[slot] = createPlayerSkullItem(
        name,
        `§f${name}` + (isSelf ? ' §7(You)' : ''),
        [
          `§7Username: §f${name}`,
          `§7Status: ${isOnline ? '§aOnline' : '§7Offline'}`,
          `§7Purse: §6${formatCoins(purse)} coins`,
          ' ',
          '§eClick to manage purse! §b▶'
        ]
      );
    }
  }

  // Slot 49: Back to Admin Control Panel
  items[49] = createGuiItem(
    'arrow',
    1,
    '§a§l◀ Back to Admin Control Panel',
    ['§7Return to the main admin control panel.']
  );

  // Slot 50: Toggle Offline Players
  items[50] = createGuiItem(
    showOffline ? 'redstone_torch' : 'lever',
    1,
    showOffline ? '§eShow Offline Players: §a[ON]' : '§eShow Offline Players: §c[OFF]',
    [
      showOffline ? '§7Currently displaying: §fOnline + Offline Players' : '§7Currently displaying: §aActive Online Players Only',
      ' ',
      '§eClick to toggle! §b▶'
    ]
  );

  pData.currentGuiItems = items;
  pData.adminCoinSelectorState = {
    showOffline,
    slotPlayerMap
  };

  try {
    client.write('window_items', {
      windowId: ADMIN_COIN_SELECTOR_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

export function openCoinActionMenu(
  client: any,
  pData: any,
  targetUsername: string,
  targetPData?: any
): void {
  pData.openWindowId = ADMIN_COIN_ACTION_WINDOW_ID;

  client.write('open_window', {
    windowId: ADMIN_COIN_ACTION_WINDOW_ID,
    inventoryType: 3, // generic_9x4 (36 slots)
    windowTitle: JSON.stringify({ text: `§8Purse: ${targetUsername}` })
  });

  const items = new Array(36).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8', [])
  );

  // Fetch current purse
  let currentPurse = 0;
  let isOnline = false;
  const onlineTarget = targetPData || findPlayerByName(targetUsername);

  if (onlineTarget) {
    isOnline = true;
    currentPurse = typeof onlineTarget.purse === 'number' ? onlineTarget.purse : 0;
  } else {
    const saved = loadPlayerData(targetUsername);
    const prof = loadPlayerProfile(targetUsername);
    currentPurse = typeof (saved as any)?.purse === 'number' ? (saved as any).purse : (typeof prof?.coins === 'number' ? prof.coins : 0);
  }

  // Slot 4: Player Head Overview
  items[4] = createPlayerSkullItem(
    targetUsername,
    `§e§l${targetUsername}`,
    [
      `§7Status: ${isOnline ? '§aOnline' : '§7Offline'}`,
      `§7Current Purse: §6${formatCoins(currentPurse)} coins`,
      ' ',
      '§7Choose an action below to modify',
      '§7their purse balance.'
    ]
  );

  // Slot 11: Add Coins (Emerald)
  items[11] = createGuiItem(
    'emerald',
    1,
    '§a§lAdd Coins',
    [
      `§7Add coins directly to §e${targetUsername}'s §7purse.`,
      '§7Supports k, m, b, and decimals (e.g. 50k, 2.5m).',
      ' ',
      '§eClick to type amount on Sign! §b▶'
    ]
  );

  // Slot 13: Set Purse (Anvil)
  items[13] = createGuiItem(
    'anvil',
    1,
    '§e§lSet Purse',
    [
      `§7Set §e${targetUsername}'s §7purse to an exact amount.`,
      '§7Supports k, m, b, and decimals (e.g. 1m, 1000).',
      ' ',
      '§eClick to type amount on Sign! §b▶'
    ]
  );

  // Slot 15: Remove Coins (Redstone)
  items[15] = createGuiItem(
    'redstone',
    1,
    '§c§lRemove Coins',
    [
      `§7Deduct coins from §e${targetUsername}'s §7purse.`,
      '§7Balance will not drop below 0 coins.',
      ' ',
      '§eClick to type amount on Sign! §b▶'
    ]
  );

  // Slot 31: Go Back Arrow
  items[31] = createGuiItem(
    'arrow',
    1,
    '§a§l◀ Back to Player List',
    ['§7Return to the player selection menu.']
  );

  pData.currentGuiItems = items;
  pData.adminCoinActionTarget = {
    targetUsername,
    targetPData: onlineTarget
  };

  try {
    client.write('window_items', {
      windowId: ADMIN_COIN_ACTION_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

export function promptAdminOakSignGui(
  client: any,
  pData: any,
  action: 'set' | 'add' | 'remove',
  targetUsername: string
): void {
  pData.openWindowId = 0;
  pData.currentGuiItems = null;

  try {
    client.write('close_window', { windowId: ADMIN_COIN_ACTION_WINDOW_ID });
  } catch (_) {}

  const loc = {
    x: Math.floor(pData.x || pData.pos?.x || 0),
    y: 1, // Bedrock depth - 100% invisible to player
    z: Math.floor(pData.z || pData.pos?.z || 0)
  };

  const is119 = pData.is119;
  const signBlockStateId = is119 ? 3637 : 4303;

  try {
    client.write('block_change', {
      location: loc,
      type: signBlockStateId
    });
  } catch (_) {}

  try {
    if (is119) {
      client.write('open_sign_entity', { location: loc });
    } else {
      client.write('open_sign_entity', { location: loc, isFrontText: true });
    }
  } catch (_) {}

  const safetyTimeout = setTimeout(() => {
    if (pData.pendingAdminSignPrompt && pData.pendingAdminSignPrompt.location) {
      restoreSignBlock(client, pData, pData.pendingAdminSignPrompt.location);
      pData.pendingAdminSignPrompt = null;
    }
  }, 45000);

  pData.pendingAdminSignPrompt = {
    action,
    targetUsername,
    location: loc,
    timeout: safetyTimeout
  };
}

export function handleAdminSignUpdate(
  client: any,
  pData: any,
  data: any,
  is119: boolean
): void {
  const prompt = pData.pendingAdminSignPrompt;
  if (!prompt) return;

  if (prompt.timeout) clearTimeout(prompt.timeout);
  pData.pendingAdminSignPrompt = null;

  restoreSignBlock(client, pData, prompt.location);

  const rawLines = [data.text1, data.text2, data.text3, data.text4]
    .map(t => (typeof t === 'string' ? t.trim() : ''))
    .filter(t => t.length > 0);

  const fullText = rawLines.join('');
  const amount = parseCoinInput(fullText);

  if (amount === null || isNaN(amount)) {
    playSound(client, pData, 'entity.villager.no', 1.0);
    sendSystemMessage(client, '§cThat is an invalid amount of coins!', is119);
    openCoinActionMenu(client, pData, prompt.targetUsername);
    return;
  }

  const targetName = prompt.targetUsername;
  const action = prompt.action;
  const onlineTarget = findPlayerByName(targetName);
  let newBalance = 0;

  if (onlineTarget) {
    const cur = typeof onlineTarget.purse === 'number' ? onlineTarget.purse : 0;
    if (action === 'set') newBalance = amount;
    else if (action === 'add') newBalance = Math.round((cur + amount) * 100) / 100;
    else if (action === 'remove') newBalance = Math.max(0, Math.round((cur - amount) * 100) / 100);

    onlineTarget.purse = newBalance;
    persistPlayerSession(onlineTarget);
    updatePlayerScoreboardPurse(onlineTarget);
  } else {
    const saved = loadPlayerData(targetName);
    const prof = loadPlayerProfile(targetName);
    const cur = typeof (saved as any)?.purse === 'number' ? (saved as any).purse : (typeof prof?.coins === 'number' ? prof.coins : 0);

    if (action === 'set') newBalance = amount;
    else if (action === 'add') newBalance = Math.round((cur + amount) * 100) / 100;
    else if (action === 'remove') newBalance = Math.max(0, Math.round((cur - amount) * 100) / 100);

    if (saved) {
      (saved as any).purse = newBalance;
      savePlayerData(targetName, saved);
    }
    if (prof) {
      prof.coins = newBalance;
      savePlayerProfile(prof);
    }
  }

  playSound(client, pData, 'entity.experience_orb.pickup', 1.0);

  if (action === 'set') {
    sendSystemMessage(client, `§a[Admin] Set §e${targetName}'s §apurse to §6${formatCoins(newBalance)} coins§a!`, is119);
  } else if (action === 'add') {
    sendSystemMessage(client, `§a[Admin] Added §6${formatCoins(amount)} coins §ato §e${targetName}'s §apurse! (New Balance: §6${formatCoins(newBalance)} coins§a)`, is119);
  } else if (action === 'remove') {
    sendSystemMessage(client, `§a[Admin] Removed §6${formatCoins(amount)} coins §afrom §e${targetName}'s §apurse! (New Balance: §6${formatCoins(newBalance)} coins§a)`, is119);
  }

  // Re-open action menu with updated purse value
  openCoinActionMenu(client, pData, targetName, onlineTarget);
}

export function handleAdminCoinMenuClick(
  client: any,
  pData: any,
  windowId: number,
  clickedSlot: number,
  playersMap: Map<number, any>,
  is119: boolean
): boolean {
  // Window 11: Player Selector
  if (windowId === ADMIN_COIN_SELECTOR_WINDOW_ID) {
    if (clickedSlot === 49) {
      // Back to Admin Menu
      playSound(client, pData, 'random.click', 1.0);
      openAdminMenu(client, pData);
      return true;
    }

    if (clickedSlot === 50) {
      // Toggle Offline Players
      const curState = pData.adminCoinSelectorState?.showOffline || false;
      playSound(client, pData, 'random.click', 1.2);
      openCoinPlayerSelector(client, pData, playersMap, !curState);
      return true;
    }

    const slotMap = pData.adminCoinSelectorState?.slotPlayerMap;
    if (slotMap && slotMap.has(clickedSlot)) {
      const entry = slotMap.get(clickedSlot)!;
      playSound(client, pData, 'random.click', 1.0);
      openCoinActionMenu(client, pData, entry.username, entry.targetPData);
      return true;
    }

    return true;
  }

  // Window 12: Action Sub-GUI
  if (windowId === ADMIN_COIN_ACTION_WINDOW_ID) {
    const target = pData.adminCoinActionTarget?.targetUsername;
    if (!target) return true;

    if (clickedSlot === 31) {
      // Go Back to Player List
      playSound(client, pData, 'random.click', 1.0);
      openCoinPlayerSelector(client, pData, playersMap, pData.adminCoinSelectorState?.showOffline || false);
      return true;
    }

    if (clickedSlot === 11) {
      // Add Coins
      playSound(client, pData, 'random.click', 1.0);
      promptAdminOakSignGui(client, pData, 'add', target);
      return true;
    }

    if (clickedSlot === 13) {
      // Set Purse
      playSound(client, pData, 'random.click', 1.0);
      promptAdminOakSignGui(client, pData, 'set', target);
      return true;
    }

    if (clickedSlot === 15) {
      // Remove Coins
      playSound(client, pData, 'random.click', 1.0);
      promptAdminOakSignGui(client, pData, 'remove', target);
      return true;
    }

    return true;
  }

  return false;
}
