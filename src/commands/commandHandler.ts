/**
 * ZylarPixel Command Router
 * Handles /admin, /op (exclusive to ARNAVJAVA), /deop, /is, /island, /visit, /rank, /reset, /restart
 */

import { RANKS, getRank, formatPlayerName } from '../config/ranks';
import {
  setPlayerRank,
  setOfflinePlayerRank,
  findPlayerByName,
  sendSystemMessage,
  persistPlayerSession,
  islandPvpSettings
} from '../players/playerManager';
import { openAdminMenu } from '../gui/adminMenu';
import { openStatsMenu } from '../gui/statsMenu';
import { openSkyBlockMenu } from '../gui/skyblockMenu';
import { openCraftingTableMenu } from '../gui/craftingTableMenu';
import {
  clearPlayerIslandModifications,
  loadPlayerData,
  savePlayerData,
  getAllDiskPlayerNames,
  allocateIslandForPlayer
} from '../storage/diskStorage';
import { loadPlayerProfile, savePlayerProfile } from '../storage/sharedProfile';
import { generatePlayerIsland } from '../world/islandGenerator';
import { dumpChunkPacket } from '../world/worldManager';
import { updatePlayerScoreboardLocation, updatePlayerScoreboardPurse, updatePlayerScoreboardBits } from '../core/scoreboard';
import { COIN_ICON, BITS_ICON } from '../config/currencyIcons';
import { sendDeclaredCommands } from './commandRegistry';
import { parseCoinInput, formatCoins } from '../gui/bankMenu';
import { mcData1192, mcData1211 } from '../world/worldManager';
import { createItem, getSkyBlockItem, getAllItemIds } from '../items';
import { handlePlayerDeath, resetPlayerHazardState } from '../combat/deathManager';
import { openAdminTimeMenu } from '../gui/adminTimeMenu';
import {
  getWorldTimeState,
  parseTimeInput,
  setWorldTimeFrozen,
  setWorldTimeTicks
} from '../world/timeManager';

let teleportCounter = 1;

export function teleportPlayerWithChunks(pData: any, targetX: number, targetY: number, targetZ: number): void {
  const client = pData.client;
  const is119 = pData.is119;

  // 1. Cleanly despawn this player for everyone else before jumping
  const { players: allPlayers } = require('../players/playerManager');
  for (const [_, other] of allPlayers) {
    if (other.client.id !== client.id) {
      if (other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
        other.spawnedPlayers.delete(pData.entityId);
        try {
          other.client.write('entity_destroy', { entityIds: [pData.entityId] });
        } catch (e) {}
      }
      if (pData.spawnedPlayers && pData.spawnedPlayers.has(other.entityId)) {
        pData.spawnedPlayers.delete(other.entityId);
        try {
          client.write('entity_destroy', { entityIds: [other.entityId] });
        } catch (e) {}
      }
    }
  }

  pData.x = targetX;
  pData.y = targetY;
  pData.z = targetZ;

  const targetCx = Math.floor(targetX / 16);
  const targetCz = Math.floor(targetZ / 16);
  pData.currentChunkX = targetCx;
  pData.currentChunkZ = targetCz;

  try {
    client.write('update_view_position', { chunkX: targetCx, chunkZ: targetCz });
  } catch (e) {}

  pData.loadedChunks = new Set<string>();
  if (!is119) {
    try { client.write('chunk_batch_start', {}); } catch (e) {}
  }
  const isHub = (pData.currentWorld === 'zylarpixel:hub');
  const { dumpHubChunkPacket } = require('../world/hubRegionProvider');

  for (let cx = targetCx - 3; cx <= targetCx + 3; cx++) {
    for (let cz = targetCz - 3; cz <= targetCz + 3; cz++) {
      pData.loadedChunks.add(`${cx},${cz}`);
      try {
        const chunkData = isHub ? dumpHubChunkPacket(cx, cz, is119) : dumpChunkPacket(cx, cz, is119);
        client.write('map_chunk', chunkData);
      } catch (e) {}
    }
  }
  if (!is119) {
    try { client.write('chunk_batch_finished', { batchSize: 49 }); } catch (e) {}
  }

  const tpId = ++teleportCounter;
  pData.pendingTeleportId = tpId;
  pData.teleportLockUntil = Date.now() + 1500;
  pData.voidImmunityUntil = Date.now() + 2500; // 2.5s immunity against void rubberband loops!
  resetPlayerHazardState(pData, targetY);

  client.write('position', {
    x: targetX,
    y: targetY,
    z: targetZ,
    yaw: 0.0,
    pitch: 0.0,
    flags: is119 ? 0x00 : {},
    teleportId: tpId,
    dismountVehicle: false
  });
}

export function handleCommand(
  pData: any,
  msg: string,
  reGenerateWorldFn?: (client: any) => void,
  restartServerFn?: () => void,
  syncNearbyFn?: (pData: any) => void
): void {
  const clean = msg.trim();
  const lower = clean.toLowerCase();
  const parts = clean.split(/\s+/);
  const cmd = parts[0].startsWith('/') ? parts[0].slice(1).toLowerCase() : parts[0].toLowerCase();
  const client = pData.client;
  const is119 = pData.is119;
  const isMaster = (pData.username.toLowerCase() === 'arnavjava');

  console.log(`[CMD] <${pData.username}> ${clean}`);

  // 1. Personal Island Teleport (/is, /island)
  if (cmd === 'is' || cmd === 'island') {
    pData.currentWorld = 'zylarpixel:islands';
    const spawnX = pData.island ? pData.island.spawnX : 0.5;
    const spawnY = pData.island ? pData.island.spawnY : 101.0;
    const spawnZ = pData.island ? pData.island.spawnZ : 0.5;

    teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
    if (typeof syncNearbyFn === 'function') {
      syncNearbyFn(pData);
      setTimeout(() => syncNearbyFn(pData), 350);
      setTimeout(() => syncNearbyFn(pData), 800);
    }
    updatePlayerScoreboardLocation(client, is119, 'Your Island');

    sendSystemMessage(client, '§aTeleported to your Island spawn point!', is119);
    return;
  }

  // 1b. Authentic Village Hub Teleport (/hub, /warphub, /spawn, /warp hub)
  if (cmd === 'hub' || cmd === 'warphub' || cmd === 'spawn' || (cmd === 'warp' && parts[1]?.toLowerCase() === 'hub')) {
    pData.currentWorld = 'zylarpixel:hub';
    const { HUB_SPAWN_X, HUB_SPAWN_Y, HUB_SPAWN_Z } = require('../world/hubRegionProvider');
    teleportPlayerWithChunks(pData, HUB_SPAWN_X, HUB_SPAWN_Y, HUB_SPAWN_Z);
    if (typeof syncNearbyFn === 'function') {
      syncNearbyFn(pData);
      setTimeout(() => syncNearbyFn(pData), 350);
      setTimeout(() => syncNearbyFn(pData), 800);
    }
    updatePlayerScoreboardLocation(client, is119, 'Village');
    sendSystemMessage(client, '§aWarped to the authentic Hypixel Hub Village Portal!', is119);
    return;
  }

  // Stats Menu (/stats)
  if (cmd === 'stats') {
    openStatsMenu(client, pData);
    return;
  }

  // SkyBlock Menu (/sbmenu, /menu)
  if (cmd === 'sbmenu' || cmd === 'menu') {
    openSkyBlockMenu(client, pData);
    return;
  }

  // Crafting Table (/craft, /workbench)
  if (cmd === 'craft' || cmd === 'workbench') {
    openCraftingTableMenu(client, pData);
    return;
  }


  // Help Menu (/help)
  if (cmd === 'help') {
    sendSystemMessage(client, '§d§m--------------------------------------------------', is119);
    sendSystemMessage(client, '§e§l              ZYLARPIXEL HELP & COMMANDS', is119);
    sendSystemMessage(client, '§7               Hypixel SkyBlock Modular Engine', is119);
    sendSystemMessage(client, '§d§m--------------------------------------------------', is119);
    sendSystemMessage(client, '§a/is §7or §a/island §8- §fTeleport to your private island', is119);
    sendSystemMessage(client, '§b/visit <player> §8- §fVisit any player island', is119);
    sendSystemMessage(client, '§a/craft §7or §a/workbench §8- §fOpen your portable crafting table', is119);
    sendSystemMessage(client, '§e/stats §8- §fView your complete 8 SkyBlock Stats GUI', is119);
    sendSystemMessage(client, '§e/help §8- §fDisplay this command help menu', is119);
    sendSystemMessage(client, '§6/reset §8- §fReset your personal island blocks', is119);
    if (pData.isOp || isMaster) {
      sendSystemMessage(client, '§7--- §cOperator Commands §7---', is119);
      sendSystemMessage(client, '§c/admin §8- §fOpen Master Staff Admin GUI', is119);
      sendSystemMessage(client, '§6/rank [player] [rank] §8- §fAssign rank via chat or GUI', is119);
      sendSystemMessage(client, '§e/bypass §8- §fToggle Admin Guest Build Bypass', is119);
      sendSystemMessage(client, '§c/restart §8- §fInstant in-memory hot reboot (250ms)', is119);
      sendSystemMessage(client, '§c/op <player> §8| §c/deop <player> §8- §fManage operator status', is119);
    }
    sendSystemMessage(client, '§d§m--------------------------------------------------', is119);
    return;
  }

  // 2. Island Visiting System (/visit <player>)
  if (cmd === 'visit') {
    const targetQuery = parts[1];
    if (!targetQuery) {
      sendSystemMessage(client, '§eUsage: §f/visit <player>', is119);
      return;
    }

    if (targetQuery.toLowerCase() === pData.username.toLowerCase()) {
      sendSystemMessage(client, '§eYou are visiting your own island! Use §a/is§e.', is119);
      return;
    }

    // A. Check online players first
    let targetPData = findPlayerByName(targetQuery);
    let targetUsername = targetQuery;
    let targetIsland: any = null;

    if (targetPData) {
      targetUsername = targetPData.username;
      targetIsland = targetPData.island;
    } else {
      // B. Scan player names from disk
      const diskNames = getAllDiskPlayerNames();
      const matched = diskNames.find(n => n.toLowerCase() === targetQuery.toLowerCase());
      if (matched) {
        const diskData = loadPlayerData(matched);
        if (diskData) {
          targetUsername = diskData.username || matched;
          targetIsland = diskData.island || allocateIslandForPlayer(targetUsername);
        }
      }
    }

    if (!targetIsland) {
      sendSystemMessage(client, `§cPlayer "${targetQuery}" not found on ZylarPixel!`, is119);
      return;
    }

    // Ensure target's island voxels are generated in world chunks
    generatePlayerIsland(targetUsername, targetIsland.originX, targetIsland.originZ);

    // Teleport visitor with chunks streamed so collision is 100% solid!
    teleportPlayerWithChunks(pData, targetIsland.spawnX, targetIsland.spawnY, targetIsland.spawnZ);
    if (typeof syncNearbyFn === 'function') {
      syncNearbyFn(pData);
      setTimeout(() => syncNearbyFn(pData), 350);
      setTimeout(() => syncNearbyFn(pData), 800);
    }
    updatePlayerScoreboardLocation(client, is119, `${targetUsername}'s Island`);

    // Play teleport sound
    try {
      client.write('named_sound_effect', {
        soundName: 'entity.enderman.teleport',
        soundCategory: 0,
        x: Math.floor(targetIsland.spawnX * 8),
        y: Math.floor(targetIsland.spawnY * 8),
        z: Math.floor(targetIsland.spawnZ * 8),
        volume: 1.0,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (e) {}

    sendSystemMessage(client, `§7[§dZylarPixel§7] §aWarping you to §f${targetUsername}'s §aIsland...`, is119);

    // Notify target if online
    if (targetPData && targetPData.client) {
      sendSystemMessage(targetPData.client, `§7[§dZylarPixel§7] §f${pData.username} §ehas visited your island!`, targetPData.is119);
    }
    return;
  }

  // 3. Admin Guest Build Bypass Toggle (/bypass)
  if (cmd === 'bypass') {
    if (!pData.isOp && !isMaster) {
      sendSystemMessage(client, '§cYou do not have permission to use this command.', is119);
      return;
    }
    pData.bypassGuestProtection = !pData.bypassGuestProtection;
    sendSystemMessage(client, `§7[§dZylarPixel§7] §eAdmin Build Bypass is now: ${pData.bypassGuestProtection ? '§aENABLED §7(You can build anywhere)' : '§cDISABLED §7(Guest rules apply)'}`, is119);
    return;
  }

  // 3. /op Command (Self-OP or /op <player>)
  if (cmd === 'op') {
    const targetArg = parts[1] ? parts[1].trim() : undefined;

    // Sub-case A: /op with no arguments -> Self-OP for Server Owner / authorized staff
    if (!targetArg) {
      if (isMaster || pData.isOp) {
        pData.isOp = true;
        persistPlayerSession(pData);
        sendDeclaredCommands(client, true, isMaster);
        sendSystemMessage(client, `§7[§dZylarPixel§7] §aOperator status granted to ${formatPlayerName(pData.rank || RANKS.default, pData.username)}§a!`, is119);
        sendSystemMessage(client, `§7Type §e/admin §7to open the Admin Control Panel.`, is119);
      } else {
        sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      }
      return;
    }

    // Sub-case B: /op <player> -> Grant OP to another player (Requires Master or OP)
    if (!isMaster && !pData.isOp) {
      sendSystemMessage(client, '§cYou must be an Operator or Server Owner to grant operator status!', is119);
      return;
    }

    // 1. Check if target is online
    const targetPData = findPlayerByName(targetArg);
    if (targetPData) {
      targetPData.isOp = true;
      persistPlayerSession(targetPData);
      sendDeclaredCommands(targetPData.client, true, (targetPData.username || '').toLowerCase() === 'arnavjava');
      sendSystemMessage(targetPData.client, `§7[§dZylarPixel§7] §aYou have been granted Operator status by §e${pData.username}§a!`, targetPData.is119);
      sendSystemMessage(targetPData.client, `§7Type §e/admin §7to open the Admin Control Panel.`, targetPData.is119);
      sendSystemMessage(client, `§7[§dZylarPixel§7] §aOperator status granted to §e${targetPData.username}§a!`, is119);
      return;
    }

    // 2. Target is offline: update disk storage & shared profile
    const diskData = loadPlayerData(targetArg);
    if (diskData) {
      diskData.isOp = true;
      savePlayerData(targetArg, diskData);
      try {
        const prof = loadPlayerProfile(targetArg);
        prof.isOp = true;
        savePlayerProfile(prof);
      } catch (_) {}
      sendSystemMessage(client, `§7[§dZylarPixel§7] §aOperator status granted to §e${targetArg} §7(Offline)§a!`, is119);
    } else {
      sendSystemMessage(client, `§cPlayer "${targetArg}" was not found!`, is119);
    }
    return;
  }

  // 4. /deop Command (Self-DEOP or /deop <player>)
  if (cmd === 'deop') {
    const targetArg = parts[1] ? parts[1].trim() : undefined;

    // Sub-case A: /deop with no arguments -> Self-DEOP for testing regular player permissions
    if (!targetArg) {
      if (isMaster || pData.isOp) {
        pData.isOp = false;
        persistPlayerSession(pData);
        sendDeclaredCommands(client, false, isMaster);
        sendSystemMessage(client, `§7[§dZylarPixel§7] §cOperator status removed. You are now in regular player mode.`, is119);
      } else {
        sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      }
      return;
    }

    // Sub-case B: /deop <player> -> Revoke OP from another player (Requires Master or OP)
    if (!isMaster && !pData.isOp) {
      sendSystemMessage(client, '§cYou must be an Operator or Server Owner to revoke operator status!', is119);
      return;
    }

    // Protection: Server Owner cannot be de-opped by others
    if (targetArg.toLowerCase() === 'arnavjava' && !isMaster) {
      sendSystemMessage(client, '§cYou cannot revoke Operator status from the Server Owner!', is119);
      return;
    }

    // 1. Check if target is online
    const targetPData = findPlayerByName(targetArg);
    if (targetPData) {
      targetPData.isOp = false;
      persistPlayerSession(targetPData);
      sendDeclaredCommands(targetPData.client, false, (targetPData.username || '').toLowerCase() === 'arnavjava');
      sendSystemMessage(targetPData.client, `§7[§dZylarPixel§7] §cYour Operator status was revoked by §e${pData.username}§c.`, targetPData.is119);
      sendSystemMessage(client, `§7[§dZylarPixel§7] §cRemoved Operator status from §e${targetPData.username}§c.`, is119);
      return;
    }

    // 2. Target is offline: update disk storage & shared profile
    const diskData = loadPlayerData(targetArg);
    if (diskData) {
      diskData.isOp = false;
      savePlayerData(targetArg, diskData);
      try {
        const prof = loadPlayerProfile(targetArg);
        prof.isOp = false;
        savePlayerProfile(prof);
      } catch (_) {}
      sendSystemMessage(client, `§7[§dZylarPixel§7] §cRemoved Operator status from §e${targetArg} §7(Offline)§c.`, is119);
    } else {
      sendSystemMessage(client, `§cPlayer "${targetArg}" was not found!`, is119);
    }
    return;
  }

  // 5. Admin Control Panel (/admin)
  if (cmd === 'admin') {
    if (pData.isOp) {
      openAdminMenu(client, pData);
    } else {
      sendSystemMessage(client, '§cYou must be an Operator to use this command! (Type /op if you are ARNAVJAVA)', is119);
    }
    return;
  }

  // 6. Direct Rank Changer Command (/rank [player] <rank>)
  if (cmd === 'rank') {
    if (!pData.isOp) {
      sendSystemMessage(client, '§cYou must be an Operator to change ranks.', is119);
      return;
    }

    if (parts.length < 2) {
      sendSystemMessage(client, '§eUsage: §f/rank <rank> §7(for self) OR §f/rank <player> <rank>', is119);
      return;
    }

    let targetPlayerName: string | null = null;
    let targetRankQuery: string | null = null;

    if (parts.length === 2) {
      targetPlayerName = pData.username;
      targetRankQuery = parts[1];
    } else {
      targetPlayerName = parts[1];
      targetRankQuery = parts[2];
    }

    const newRank = getRank(targetRankQuery);
    if (!newRank) {
      sendSystemMessage(client, `§c[!] No rank exists with that name! Valid ranks: owner, admin, developer, mod, helper, mvp++, mvp+, mvp, vip+, vip, default`, is119);
      return;
    }

    const onlineTarget = findPlayerByName(targetPlayerName);
    if (onlineTarget) {
      setPlayerRank(onlineTarget, newRank);
      if (onlineTarget !== pData) {
        sendSystemMessage(client, `§7[§dZylarPixel§7] §aSuccessfully updated §f${onlineTarget.username}'s §arank to ${newRank.prefix}§a!`, is119);
      }
    } else {
      setOfflinePlayerRank(targetPlayerName, newRank);
      sendSystemMessage(client, `§7[§dZylarPixel§7] §aUpdated offline player §f${targetPlayerName} §ato ${newRank.prefix} §7(Saved to disk)!`, is119);
    }
    return;
  }

  // 7. Reset Personal Island Command (/reset)
  if (cmd === 'reset') {
    if (pData.currentWorld === 'zylarpixel:hub') {
      sendSystemMessage(client, '§c[!] You cannot reset your island from the Hub! Use §e/is §cto warp to your island first.', is119);
      return;
    }

    sendSystemMessage(client, '§eResetting island to pristine starter state...', is119);
    clearPlayerIslandModifications(pData.username);
    if (typeof reGenerateWorldFn === 'function') {
      reGenerateWorldFn(client);
    }
    const spawnX = pData.island ? pData.island.spawnX : 0.5;
    const spawnY = pData.island ? pData.island.spawnY : 101.0;
    const spawnZ = pData.island ? pData.island.spawnZ : 0.5;

    teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
    if (typeof syncNearbyFn === 'function') syncNearbyFn(pData);

    sendSystemMessage(client, '§aIsland reset successfully!', is119);
    return;
  }

  // 8. Server Restart Command (/restart)
  if (cmd === 'restart') {
    if (!pData.isOp) {
      sendSystemMessage(client, '§cYou must be an Operator to restart the server.', is119);
      return;
    }

    sendSystemMessage(client, `§7[§dZylarPixel§7] §c§lServer restart initiated by ${pData.username}...`, is119);
    console.log(`[RESTART] Server restart initiated by ${pData.username}`);

    if (typeof restartServerFn === 'function') {
      restartServerFn();
    }
    return;
  }

  // 9. Manage Player Purse Coins or Bits (/coins, /money, /coin, /bits <player> <set|add|remove> <amount>)
  if (cmd === 'coins' || cmd === 'money' || cmd === 'coin' || cmd === 'bits') {
    const isBitsCmd = cmd === 'bits';
    if (!pData.isOp && !isMaster) {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      return;
    }

    if (parts.length < 4) {
      sendSystemMessage(client, `§eUsage: §f/${cmd} <player> <set|add|remove> <amount>`, is119);
      return;
    }

    const targetName = parts[1];
    const action = parts[2].toLowerCase();
    const parsedAmount = parseCoinInput(parts[3]);

    if (!['set', 'add', 'remove'].includes(action)) {
      sendSystemMessage(client, `§cInvalid action: ${parts[2]}. Choose from: §eset§c, §eadd§c, §eremove§c.`, is119);
      return;
    }

    if (parsedAmount === null || isNaN(parsedAmount)) {
      sendSystemMessage(client, `§cInvalid ${isBitsCmd ? 'Bits' : 'coin'} amount: "${parts[3]}"! (Examples: 500, 10k, 2.5m)`, is119);
      return;
    }

    const amount = isBitsCmd ? Math.max(0, Math.floor(parsedAmount)) : parsedAmount;
    const onlineTarget = findPlayerByName(targetName);
    const computeNext = (cur: number) => {
      if (action === 'set') return amount;
      if (action === 'add') return isBitsCmd ? Math.floor(cur + amount) : Math.round((cur + amount) * 100) / 100;
      return isBitsCmd ? Math.max(0, Math.floor(cur - amount)) : Math.max(0, Math.round((cur - amount) * 100) / 100);
    };

    let newBalance = 0;
    if (onlineTarget) {
      const cur = isBitsCmd
        ? (typeof onlineTarget.bits === 'number' ? onlineTarget.bits : 0)
        : (typeof onlineTarget.purse === 'number' ? onlineTarget.purse : 0);
      newBalance = computeNext(cur);
      if (isBitsCmd) {
        onlineTarget.bits = newBalance;
        updatePlayerScoreboardBits(onlineTarget);
      } else {
        onlineTarget.purse = newBalance;
        updatePlayerScoreboardPurse(onlineTarget);
      }
      persistPlayerSession(onlineTarget);
    } else {
      const saved = loadPlayerData(targetName);
      const prof = loadPlayerProfile(targetName);
      const cur = isBitsCmd
        ? (typeof (saved as any)?.bits === 'number' ? (saved as any).bits : (typeof prof?.bits === 'number' ? prof.bits : 0))
        : (typeof (saved as any)?.purse === 'number' ? (saved as any).purse : (typeof prof?.coins === 'number' ? prof.coins : 0));
      newBalance = computeNext(cur);

      if (saved) {
        if (isBitsCmd) (saved as any).bits = newBalance;
        else (saved as any).purse = newBalance;
        savePlayerData(targetName, saved);
      }
      if (prof) {
        if (isBitsCmd) prof.bits = newBalance;
        else prof.coins = newBalance;
        savePlayerProfile(prof);
      }
    }

    const icon = isBitsCmd ? BITS_ICON : COIN_ICON;
    const col = isBitsCmd ? '§b' : '§6';
    const unit = isBitsCmd ? 'Bits' : 'coins';
    const balanceType = isBitsCmd ? 'Bits' : 'purse';

    if (action === 'set') {
      sendSystemMessage(client, `§a[Admin] Set §e${targetName}'s §a${balanceType} to ${icon} ${col}${formatCoins(newBalance)} ${unit}§a!`, is119);
    } else if (action === 'add') {
      sendSystemMessage(client, `§a[Admin] Added ${icon} ${col}${formatCoins(amount)} ${unit} §ato §e${targetName}'s §a${balanceType}! (New Balance: ${icon} ${col}${formatCoins(newBalance)} ${unit}§a)`, is119);
    } else {
      sendSystemMessage(client, `§a[Admin] Removed ${icon} ${col}${formatCoins(amount)} ${unit} §afrom §e${targetName}'s §a${balanceType}! (New Balance: ${icon} ${col}${formatCoins(newBalance)} ${unit}§a)`, is119);
    }
    return;
  }

  // 15. SkyBlock Custom Item Spawner (/item <id> [count] or /give [player] <id> [count])
  if (cmd === 'item' || cmd === 'give') {
    if (!pData.isOp && !isMaster) {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      return;
    }

    let targetPData = pData;
    let itemId = '';
    let count = 1;

    if (cmd === 'item') {
      if (parts.length < 2) {
        sendSystemMessage(client, '§eUsage: §f/item <itemId> [count]', is119);
        return;
      }
      itemId = parts[1].toUpperCase();
      if (parts[2]) count = parseInt(parts[2], 10) || 1;
    } else {
      if (parts.length < 2) {
        sendSystemMessage(client, '§eUsage: §f/give [player] <itemId> [count]', is119);
        return;
      }
      if (parts.length === 2) {
        itemId = parts[1].toUpperCase();
      } else {
        const found = findPlayerByName(parts[1]);
        if (found) {
          targetPData = found;
          itemId = parts[2].toUpperCase();
          if (parts[3]) count = parseInt(parts[3], 10) || 1;
        } else {
          itemId = parts[1].toUpperCase();
          count = parseInt(parts[2], 10) || 1;
        }
      }
    }

    const itemDef = getSkyBlockItem(itemId);
    if (!itemDef) {
      sendSystemMessage(client, `§cUnknown SkyBlock item ID: "${itemId}". Available: §e${getAllItemIds().join(', ')}`, is119);
      return;
    }

    const itemStack = createItem(itemId, { count });
    let placedSlot = -1;
    for (let s = 36; s < 44; s++) {
      if (!targetPData.inventory.has(s)) {
        placedSlot = s;
        break;
      }
    }
    if (placedSlot === -1) {
      for (let s = 9; s < 36; s++) {
        if (!targetPData.inventory.has(s)) {
          placedSlot = s;
          break;
        }
      }
    }

    if (placedSlot === -1) {
      sendSystemMessage(client, `§c${targetPData.username}'s inventory is completely full!`, is119);
      return;
    }

    const mcData = targetPData.is119 ? mcData1192 : mcData1211;
    const def = mcData.items[itemStack.itemId];
    targetPData.inventory.set(placedSlot, {
      slot: placedSlot,
      name: def ? def.name : 'unknown',
      itemId: itemStack.itemId,
      count: itemStack.itemCount,
      nbtData: itemStack.nbtData
    });

    try {
      targetPData.client.write('set_slot', {
        windowId: 0,
        stateId: 1,
        slot: placedSlot,
        item: itemStack
      });
      targetPData.client.write('named_sound_effect', {
        soundName: 'entity.item.pickup',
        soundCategory: 0,
        x: Math.floor(targetPData.x * 8),
        y: Math.floor(targetPData.y * 8),
        z: Math.floor(targetPData.z * 8),
        volume: 0.8,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (_) {}

    persistPlayerSession(targetPData);

    sendSystemMessage(client, `§a[Admin] Gave §e${count}x §f${itemDef.name} §ato §e${targetPData.username}§a!`, is119);
    return;
  }

  // 16. Kill Player (/kill [player]) -> triggers universal death & 50% coin penalty
  if (cmd === 'kill') {
    if (!pData.isOp && !isMaster) {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      return;
    }

    const targetName = parts[1];
    let targetPData = pData;
    if (targetName) {
      const found = findPlayerByName(targetName);
      if (!found) {
        sendSystemMessage(client, `§cPlayer "${targetName}" is not currently online on this server.`, is119);
        return;
      }
      targetPData = found;
    }

    handlePlayerDeath(pData.server, targetPData, {
      cause: 'COMMAND',
      killerName: targetPData === pData ? undefined : pData.username
    });
    return;
  }

  // 17. World Time Management (/time set <value>, freeze, resume, query, gui)
  if (cmd === 'time') {
    if (!pData.isOp && !isMaster) {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
      return;
    }

    const sub = (parts[1] || 'query').toLowerCase();

    if (sub === 'gui' || sub === 'menu') {
      openAdminTimeMenu(client, pData, 0);
      return;
    }

    if (sub === 'freeze' || sub === 'pause') {
      const st = setWorldTimeFrozen(true);
      pData.server?.syncWorldTimeBroadcast?.();
      sendSystemMessage(client, `§b[Time] §fSkyBlock clock §cfrozen §fat §e${st.slot.spacedLabel} ${st.isNight ? '§b☽' : '§e☀'}§f.`, is119);
      return;
    }

    if (sub === 'resume' || sub === 'unfreeze' || sub === 'start') {
      const st = setWorldTimeFrozen(false);
      pData.server?.syncWorldTimeBroadcast?.();
      sendSystemMessage(client, `§b[Time] §fSkyBlock clock §aresumed §fat §e${st.slot.spacedLabel} ${st.isNight ? '§b☽' : '§e☀'}§f.`, is119);
      return;
    }

    if (sub === 'query' || sub === 'check') {
      const st = getWorldTimeState();
      const cycleTag = st.isNight ? '§b☽ Night (Zombie Villagers Active)' : '§e☀ Day (Graveyard Zombie Only)';
      const freezeTag = st.frozen ? ' §3[FROZEN]' : '';
      sendSystemMessage(
        client,
        `§e[Time] §f${st.slot.spacedLabel} ${cycleTag}${freezeTag} §8| §b${st.seasonName} ${st.ordinalDay} §8(${st.dayTick}/24000 ticks)`,
        is119
      );
      return;
    }

    const rawTimeArg = sub === 'set' ? parts.slice(2).join(' ') : parts.slice(1).join(' ');
    const parsed = parseTimeInput(rawTimeArg);
    if (!parsed.ok) {
      sendSystemMessage(client, `§c${(parsed as { error: string }).error}`, is119);
      sendSystemMessage(client, '§7Usage: §e/time set <550|1850|8:30am|18:30|day|night|gui>', is119);
      return;
    }

    const st = setWorldTimeTicks(parsed.rawTicks);
    pData.server?.syncWorldTimeBroadcast?.();
    sendSystemMessage(
      client,
      `§a[Time] Set time to §e${st.slot.spacedLabel} ${st.isNight ? '§b☽ Night' : '§e☀ Day'} §8(${st.dayTick} ticks · ${parsed.matchedFormat})§a!`,
      is119
    );
    return;
  }

  // Unknown command
  sendSystemMessage(client, `§cUnknown command: /${cmd}. Type /island, /visit <player>, or /admin.`, is119);
}
