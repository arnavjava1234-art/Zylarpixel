/**
 * ZylarPixel Command Router
 * Handles /admin, /op (exclusive to ARNAVJAVA), /deop, /is, /island, /visit, /rank, /reset, /restart
 */

import { getRank } from '../config/ranks';
import {
  setPlayerRank,
  setOfflinePlayerRank,
  findPlayerByName,
  sendSystemMessage,
  persistPlayerSession,
  islandPvpSettings
} from '../players/playerManager';
import { openAdminMenu } from '../gui/adminMenu';
import {
  clearPlayerIslandModifications,
  loadPlayerData,
  getAllDiskPlayerNames,
  allocateIslandForPlayer
} from '../storage/diskStorage';
import { generatePlayerIsland } from '../world/islandGenerator';
import { dumpChunkPacket } from '../world/worldManager';
import { updatePlayerScoreboardLocation } from '../core/scoreboard';
import { sendDeclaredCommands } from './commandRegistry';

let teleportCounter = 1;

export function teleportPlayerWithChunks(pData: any, targetX: number, targetY: number, targetZ: number): void {
  const client = pData.client;
  const is119 = pData.is119;

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
  for (let cx = targetCx - 3; cx <= targetCx + 3; cx++) {
    for (let cz = targetCz - 3; cz <= targetCz + 3; cz++) {
      pData.loadedChunks.add(`${cx},${cz}`);
      try {
        client.write('map_chunk', dumpChunkPacket(cx, cz, is119));
      } catch (e) {}
    }
  }
  if (!is119) {
    try { client.write('chunk_batch_finished', { batchSize: 49 }); } catch (e) {}
  }

  const tpId = ++teleportCounter;
  pData.pendingTeleportId = tpId;
  pData.teleportLockUntil = Date.now() + 1000;

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
    const spawnX = pData.island ? pData.island.spawnX : 0.5;
    const spawnY = pData.island ? pData.island.spawnY : 101.0;
    const spawnZ = pData.island ? pData.island.spawnZ : 0.5;

    teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
    if (typeof syncNearbyFn === 'function') syncNearbyFn(pData);
    updatePlayerScoreboardLocation(client, is119, 'Your Island');

    sendSystemMessage(client, '§aTeleported to your Island spawn point! 🏝️', is119);
    return;
  }

  // Help Menu (/help)
  if (cmd === 'help') {
    sendSystemMessage(client, '§d§m--------------------------------------------------', is119);
    sendSystemMessage(client, '§e§l              ZYLARPIXEL HELP & COMMANDS', is119);
    sendSystemMessage(client, '§7               Hypixel SkyBlock Modular Engine', is119);
    sendSystemMessage(client, '§d§m--------------------------------------------------', is119);
    sendSystemMessage(client, '§a/is §7or §a/island §8- §fTeleport to your private island 🏝️', is119);
    sendSystemMessage(client, '§b/visit <player> §8- §fVisit any player island ✈️', is119);
    sendSystemMessage(client, '§e/help §8- §fDisplay this command help menu 📖', is119);
    sendSystemMessage(client, '§6/reset §8- §fReset your personal island blocks 🔄', is119);
    if (pData.isOp || isMaster) {
      sendSystemMessage(client, '§7--- §cOperator Commands §7---', is119);
      sendSystemMessage(client, '§c/admin §8- §fOpen Master Staff Admin GUI ⚙️', is119);
      sendSystemMessage(client, '§6/rank [player] [rank] §8- §fAssign rank via chat or GUI 🎖️', is119);
      sendSystemMessage(client, '§e/bypass §8- §fToggle Admin Guest Build Bypass 🔓', is119);
      sendSystemMessage(client, '§c/restart §8- §fInstant in-memory hot reboot (250ms) ⚡', is119);
      sendSystemMessage(client, '§c/op <player> §8| §c/deop <player> §8- §fManage operator status 🛡️', is119);
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
    if (typeof syncNearbyFn === 'function') syncNearbyFn(pData);
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

    sendSystemMessage(client, `§7[§dZylarPixel§7] §aWarping you to §f${targetUsername}'s §aIsland... ✈️`, is119);

    // Notify target if online
    if (targetPData && targetPData.client) {
      sendSystemMessage(targetPData.client, `§7[§dZylarPixel§7] §f${pData.username} §ehas visited your island! 🏝️`, targetPData.is119);
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

  // 3. Exclusive /op Command for ARNAVJAVA
  if (cmd === 'op') {
    if (isMaster) {
      pData.isOp = true;
      persistPlayerSession(pData);
      sendDeclaredCommands(client, true);
      sendSystemMessage(client, `§7[§dZylarPixel§7] §aOperator status granted to §c[OWNER] ${pData.username}§a!`, is119);
      sendSystemMessage(client, `§7Type §e/admin §7to open the Admin Control Panel.`, is119);
    } else {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
    }
    return;
  }

  // 4. /deop Command for testing regular player permissions
  if (cmd === 'deop') {
    if (isMaster) {
      pData.isOp = false;
      persistPlayerSession(pData);
      sendDeclaredCommands(client, false);
      sendSystemMessage(client, `§7[§dZylarPixel§7] §cOperator status removed. You are now in regular player mode.`, is119);
    } else {
      sendSystemMessage(client, '§cYou do not have permission to execute this command.', is119);
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
      sendSystemMessage(client, `§cInvalid rank "${targetRankQuery}". Valid: owner, admin, developer, mod, helper, mvp++, mvp+, mvp, vip+, vip, default`, is119);
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

  // Unknown command
  sendSystemMessage(client, `§cUnknown command: /${cmd}. Type /island, /visit <player>, or /admin.`, is119);
}
