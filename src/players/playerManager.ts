/**
 * ZylarPixel Player Session & Permissions Manager
 * Loads and saves player profiles permanently to disk
 * Manages player island allocations and permissions
 */

import * as nbt from 'prismarine-nbt';
import { RANKS, getRank, formatPlayerName, RankDefinition } from '../config/ranks';
import { sendScoreboardTeam } from '../core/scoreboard';
import { loadPlayerData, savePlayerData, allocateIslandForPlayer } from '../storage/diskStorage';
import { PlayerSession, IslandData } from '../types';
import { loadPlayerProfile, savePlayerProfile } from '../storage/sharedProfile';

import { createDefaultStats } from '../stats/statsManager';

export const players = new Map<number, any>();

export function createPlayerSession(client: any, is119: boolean): any {
  const username = client.username;
  const isMasterUser = (username.toLowerCase() === 'arnavjava');

  // 1. Attempt to load from disk
  const saved = loadPlayerData(username);

  let initialRank: RankDefinition;
  let initialOp: boolean;
  const inventory = new Map<number, any>();
  let purse = 60.0;
  let bank = 0;
  let bankTransactions: any[] = [];
  let bits = 0;
  let island: IslandData;
  let stats = createDefaultStats();

  const sharedProf = loadPlayerProfile(username);

  if (saved) {
    initialRank = getRank((saved as any).rankId || saved.rank);
    initialOp = (typeof saved.isOp === 'boolean') ? saved.isOp : isMasterUser;
    purse = (typeof (saved as any).purse === 'number') ? (saved as any).purse : (typeof sharedProf.coins === 'number' ? sharedProf.coins : 60.0);
    bank = (typeof (saved as any).bank === 'number') ? (saved as any).bank : (typeof sharedProf.bank === 'number' ? sharedProf.bank : 0);
    bankTransactions = Array.isArray((saved as any).bankTransactions) ? (saved as any).bankTransactions : (Array.isArray(sharedProf.bankTransactions) ? sharedProf.bankTransactions : []);
    bits = (saved as any).bits || 0;
    island = saved.island || allocateIslandForPlayer(username);
    if ((saved as any).stats) {
      stats = createDefaultStats((saved as any).stats);
    }
    stats.speed = 100; // Base speed is strictly 100

    if (Array.isArray((saved as any).inventory)) {
      (saved as any).inventory.forEach((item: any) => {
        inventory.set(item.slot, item);
      });
    }
  } else {
    // Brand new player
    initialRank = isMasterUser ? RANKS.owner : RANKS.default;
    initialOp = isMasterUser;
    island = allocateIslandForPlayer(username);
    bank = typeof sharedProf.bank === 'number' ? sharedProf.bank : 0;
    bankTransactions = Array.isArray(sharedProf.bankTransactions) ? sharedProf.bankTransactions : [];
    if (typeof sharedProf.coins === 'number') {
      purse = sharedProf.coins;
    }
    stats.speed = 100;
  }

  const pData: any = {
    client,
    username,
    is119,
    entityId: 100 + players.size,
    island,
    x: island.spawnX,
    y: island.spawnY,
    z: island.spawnZ,
    rank: initialRank,
    isOp: initialOp,
    purse,
    bank,
    bankTransactions,
    bits,
    selectedSlot: 0,
    inventory,
    openWindowId: 0,
    currentGuiItems: null,
    targetPlayerForRank: null, // For Admin GUI player rank selection
    spawnedPlayers: new Set<number>(), // Set of other player entityIds spawned for this client
    lastPortalNotice: 0,
    loadedChunks: new Set<string>(),
    currentChunkX: 0,
    currentChunkZ: 0,
    teleportLockUntil: 0,
    voidImmunityUntil: 0,
    pendingTeleportId: undefined,
    lastBroadcastX: undefined,
    lastBroadcastY: undefined,
    lastBroadcastZ: undefined,
    stats,
    baseSpeed: 100,
    activeBuffs: sharedProf.activeBuffs || {}
  };

  players.set(client.id, pData);

  // Save to disk immediately
  persistPlayerSession(pData);

  return pData;
}

export function persistPlayerSession(pData: any): void {
  const invArray: any[] = [];
  for (const [slot, item] of pData.inventory) {
    invArray.push({
      slot,
      name: item.name,
      itemId: item.itemId,
      count: item.count,
      nbtData: item.nbtData
    });
  }

  // Base speed is strictly protected: temporary speed buffs are NEVER saved as permanent base stats!
  const baseSpeed = pData.baseSpeed !== undefined ? pData.baseSpeed : 100;
  const statsToPersist = {
    ...pData.stats,
    speed: baseSpeed
  };

  savePlayerData(pData.username, {
    username: pData.username,
    uuid: pData.client.uuid,
    rank: pData.rank.id,
    isOp: pData.isOp,
    island: pData.island,
    lastLogin: new Date().toISOString(),
    stats: statsToPersist,
    ...( {
      rankId: pData.rank.id,
      purse: pData.purse,
      bank: pData.bank,
      bankTransactions: pData.bankTransactions,
      bits: pData.bits,
      inventory: invArray,
      lastSeen: Date.now()
    } as any)
  });

  // Sync directly to the cross-server Shared Profile
  try {
    const prof = loadPlayerProfile(pData.username);
    prof.coins = pData.purse;
    prof.bank = pData.bank;
    prof.bankTransactions = pData.bankTransactions;
    prof.inventory = invArray;
    prof.stats = {
      health: pData.stats.health,
      maxHealth: pData.stats.maxHealth,
      defense: pData.stats.defense,
      strength: pData.stats.strength,
      speed: baseSpeed,
      intelligence: pData.stats.intelligence,
      maxMana: pData.stats.maxMana,
      critChance: pData.stats.critChance,
      critDamage: pData.stats.critDamage
    };
    if (pData.speedBoostExpiresAt && pData.speedBoostExpiresAt > Date.now()) {
      if (!prof.activeBuffs) prof.activeBuffs = {};
      prof.activeBuffs.speedBoostUntil = pData.speedBoostExpiresAt;
    } else if (prof.activeBuffs) {
      delete prof.activeBuffs.speedBoostUntil;
    }
    prof.rank = pData.rank.id;
    prof.isOp = pData.isOp;
    savePlayerProfile(prof);
  } catch (e) {}
}

export function getPlayerSession(clientId: number): any {
  return players.get(clientId);
}

export function findPlayerByName(username: string): any {
  const target = (username || '').toLowerCase();
  for (const [_, p] of players) {
    if (p.username.toLowerCase() === target) {
      return p;
    }
  }
  return null;
}

export function removePlayerSession(clientId: number): void {
  const pData = players.get(clientId);
  if (pData) {
    if (pData.speedBoostTimer) {
      clearTimeout(pData.speedBoostTimer);
      pData.speedBoostTimer = undefined;
    }
    persistPlayerSession(pData);
    players.delete(clientId);

    // Broadcast Tablist removal to all other players
    for (const [_, other] of players) {
      try {
        if (other.is119) {
          other.client.write('player_info', {
            action: 'remove_player',
            data: [{ uuid: pData.client.uuid }]
          });
        }
        if (other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          other.spawnedPlayers.delete(pData.entityId);
          other.client.write('entity_destroy', { entityIds: [pData.entityId] });
        }
      } catch (e) {}
    }
  }
}

export function setPlayerRank(pData: any, newRank: RankDefinition): void {
  pData.rank = newRank;

  // 1. Broadcast Tablist display name & team across ALL online players
  for (const [_, observer] of players) {
    try {
      if (observer.is119) {
        observer.client.write('player_info', {
          action: 'update_display_name',
          data: [{
            uuid: pData.client.uuid,
            displayName: JSON.stringify({ text: `§8[§aIsland§8] ${formatPlayerName(newRank, pData.username)}` })
          }]
        });
      }
      sendScoreboardTeam(observer.client, pData.username, newRank, observer.is119);
    } catch (e) {}
  }

  // 3. Play note block sound effect WITH SEED: [0, 0]
  try {
    pData.client.write('named_sound_effect', {
      soundName: 'block.note_block.pling',
      soundCategory: 0,
      x: Math.floor(pData.x * 8),
      y: Math.floor(pData.y * 8),
      z: Math.floor(pData.z * 8),
      volume: 1.0,
      pitch: 1.5,
      seed: [0, 0]
    });
  } catch (e) {}

  sendSystemMessage(pData.client, `§7[§dZylarPixel§7] §aYour rank has been updated to ${newRank.prefix}§a!`, pData.is119);

  // 4. Save to disk permanently
  persistPlayerSession(pData);
}

export function setOfflinePlayerRank(username: string, newRank: RankDefinition): any {
  const data: any = loadPlayerData(username) || {
    username,
    isOp: false,
    purse: 60,
    bits: 0,
    island: allocateIslandForPlayer(username)
  };
  data.rankId = newRank.id;
  data.rank = newRank.id;
  savePlayerData(username, data);
  return data;
}

export function sendSystemMessage(client: any, text: string, is119: boolean): void {
  try {
    if (is119) {
      client.write('system_chat', {
        content: JSON.stringify({ text }),
        isActionBar: false
      });
    } else {
      client.write('system_chat', {
        content: nbt.comp({ text: nbt.string(text) }),
        isActionBar: false
      });
    }
  } catch (e) {}
}

export const islandPvpSettings = new Map<string, boolean>();
