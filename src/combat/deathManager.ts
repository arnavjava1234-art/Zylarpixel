/**
 * ZylarPixel Universal Death & 50% Purse Penalty Manager
 *
 * Defines all player death causes across Hub and Islands (Void, Fall Damage,
 * Lava, Fire, Drowning, Suffocation, Cactus/Berry, PvP, Mob Combat, Command)
 * and enforces a universal 50% current coin purse penalty on death.
 */

import { players, persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { updatePlayerScoreboardPurse, updatePlayerHealthScore } from '../core/scoreboard';
import { applyDefense, syncVanillaHealthAndHunger } from '../stats/statsManager';
import { getHubBlockName } from '../world/hubRegionProvider';
import { getWorldBlockName } from '../world/worldManager';
import { formatCoins } from '../gui/bankMenu';
import { spawnDamageIndicator } from './damageIndicator';

export type DeathCause =
  | 'VOID'
  | 'FALL'
  | 'LAVA'
  | 'FIRE'
  | 'DROWNING'
  | 'SUFFOCATION'
  | 'CACTUS'
  | 'PVP'
  | 'MOB'
  | 'COMMAND'
  | 'GENERIC';

export interface DeathInfo {
  cause: DeathCause;
  killerName?: string;
}

export interface DeathCoinPenaltyResult {
  coinsLost: number;
  remainingPurse: number;
}

export const DEATH_CAUSE_MESSAGES: Record<DeathCause, string> = {
  VOID: 'fell into the void',
  FALL: 'fell from a high place',
  LAVA: 'burned to death in lava',
  FIRE: 'burned to death',
  DROWNING: 'drowned',
  SUFFOCATION: 'suffocated in a wall',
  CACTUS: 'was pricked to death',
  PVP: 'was slain',
  MOB: 'was killed',
  COMMAND: 'was struck down',
  GENERIC: 'died'
};

const DEATH_LOCK_MS = 2500;
const DEFAULT_AIR_LEVEL = 30; // 30 * 500ms = 15s underwater breath

const NON_SUFFOCATING_TOKENS = [
  'air',
  'water',
  'lava',
  'grass',
  'fern',
  'flower',
  'poppy',
  'dandelion',
  'rose',
  'tulip',
  'orchid',
  'allium',
  'azure',
  'lily',
  'mushroom',
  'sapling',
  'leaves',
  'wheat',
  'carrots',
  'potatoes',
  'nether_wart',
  'beetroots',
  'sugar_cane',
  'vine',
  'cobweb',
  'slab',
  'stairs',
  'fence',
  'wall',
  'glass',
  'pane',
  'bars',
  'door',
  'trapdoor',
  'gate',
  'carpet',
  'torch',
  'lantern',
  'sign',
  'banner',
  'snow',
  'scaffolding',
  'ladder',
  'rail',
  'button',
  'lever',
  'pressure_plate',
  'tripwire',
  'bed',
  'chest',
  'anvil',
  'cauldron',
  'hopper',
  'farmland',
  'path',
  'campfire',
  'fire',
  'cactus',
  'sweet_berry_bush',
  'skull',
  'head',
  'pot',
  'chain'
];

function isWritable(client: any): boolean {
  return !!(client && !client.ended && client.state !== 'closed');
}

function getBlockAtPlayerPos(server: any, x: number, y: number, z: number): string {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);
  if (by < 0 || by >= 256) return 'air';
  if (server?.config?.worldType === 'hub') {
    return getHubBlockName(bx, by, bz);
  }
  return getWorldBlockName(bx, by, bz, true);
}

function isSuffocatingSolidBlock(blockName: string): boolean {
  if (!blockName) return false;
  const clean = blockName.replace('minecraft:', '').toLowerCase();
  for (const token of NON_SUFFOCATING_TOKENS) {
    if (clean === token || clean.includes(token)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes exact 50% coin purse deduction rounded to SkyBlock 0.1 display precision.
 * Bank balance is never touched.
 */
export function calculateDeathCoinPenalty(currentPurse: number): DeathCoinPenaltyResult {
  const safePurse = Math.max(0, typeof currentPurse === 'number' && Number.isFinite(currentPurse) ? currentPurse : 0);
  if (safePurse <= 0) {
    return { coinsLost: 0, remainingPurse: 0 };
  }
  if (safePurse < 0.2) {
    const coinsLost = Math.round(safePurse * 10) / 10;
    return { coinsLost, remainingPurse: 0 };
  }
  const coinsLost = Math.round(safePurse * 0.5 * 10) / 10;
  const remainingPurse = Math.max(0, Math.round((safePurse - coinsLost) * 10) / 10);
  return { coinsLost, remainingPurse };
}

/**
 * Resets fall peak, breath, and burn state (must be called on join, teleports, and respawns).
 */
export function resetPlayerHazardState(pData: any, yOverride?: number): void {
  if (!pData) return;
  pData.fallPeakY = typeof yOverride === 'number' ? yOverride : pData.y;
  pData.airLevel = DEFAULT_AIR_LEVEL;
  pData.fireUntil = 0;
  pData.lastLavaDamageAt = 0;
  pData.lastFireDamageAt = 0;
  pData.lastDrownDamageAt = 0;
  pData.lastSuffocateDamageAt = 0;
  pData.lastCactusDamageAt = 0;
}

function buildDeathPhrase(info: DeathInfo): string {
  const base = DEATH_CAUSE_MESSAGES[info.cause] || DEATH_CAUSE_MESSAGES.GENERIC;
  if (info.killerName) {
    if (info.cause === 'PVP' || info.cause === 'MOB') {
      return `${base} by §c${info.killerName}`;
    }
    if (info.cause === 'COMMAND') {
      return `was struck down by §c${info.killerName}`;
    }
  }
  return base;
}

/**
 * Applies damage from any non-PvP source (fall, environmental hazards, mobs),
 * syncs HUD/observers, and routes lethal hits into handlePlayerDeath().
 */
export function applyPlayerDamage(
  server: any,
  pData: any,
  rawDamage: number,
  cause: DeathCause,
  options?: {
    killerName?: string;
    bypassDefense?: boolean;
    hurtSound?: string;
    showIndicator?: boolean;
  }
): number {
  if (!pData || !pData.stats || !isWritable(pData.client)) return 0;

  const now = Date.now();
  if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) return 0;
  if (pData.teleportLockUntil && now < pData.teleportLockUntil) return 0;

  const finalDamage = options?.bypassDefense
    ? Math.max(1, Math.round(rawDamage))
    : applyDefense(rawDamage, pData.stats.defense || 0);

  pData.stats.health = Math.max(0, pData.stats.health - finalDamage);
  syncVanillaHealthAndHunger(pData.client, pData.stats);

  for (const [_, p] of players) {
    if (!isWritable(p?.client)) continue;
    try {
      p.client.write('entity_status', {
        entityId: pData.entityId,
        entityStatus: 2 // Red hurt flash
      });
      updatePlayerHealthScore(p.client, pData.username, pData.stats.health, p.is119);
    } catch (_) {}
  }

  const hurtSound = options?.hurtSound || 'entity.player.hurt';
  for (const [_, p] of players) {
    if (!isWritable(p?.client)) continue;
    try {
      p.client.write('named_sound_effect', {
        soundName: hurtSound,
        soundCategory: 0,
        x: Math.floor((pData.x || 0) * 8),
        y: Math.floor((pData.y || 70) * 8),
        z: Math.floor((pData.z || 0) * 8),
        volume: 1.0,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (_) {}
  }

  if (options?.showIndicator) {
    const allClients = Array.from(players.values())
      .map(p => p.client)
      .filter(c => isWritable(c));
    spawnDamageIndicator(allClients, pData.x, pData.y, pData.z, finalDamage, false);
  }

  if (pData.stats.health <= 0) {
    handlePlayerDeath(server, pData, { cause, killerName: options?.killerName });
  }

  return finalDamage;
}

/**
 * Central death handler for EVERY death cause in Hub & Islands:
 * - Enforces idempotency lock so double hazards never double-charge 50%.
 * - Deducts 50% of current coin purse, updates scoreboard & saves immediately.
 * - Restores full SkyBlock HP/Mana & teleports safely back to spawn (inventory kept).
 */
export function handlePlayerDeath(server: any, pData: any, info: DeathInfo): void {
  if (!pData || !isWritable(pData.client)) return;

  const now = Date.now();
  if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) {
    return;
  }

  pData.lastDeathAt = now;
  pData.voidImmunityUntil = now + 2500;
  pData.teleportLockUntil = now + 1500;
  resetPlayerHazardState(pData);

  const client = pData.client;
  const is119 = pData.is119 !== false;

  // 1. Universal 50% Purse Penalty
  const { coinsLost, remainingPurse } = calculateDeathCoinPenalty(pData.purse || 0);
  pData.purse = remainingPurse;
  updatePlayerScoreboardPurse(pData);

  // 2. Restore Vitals
  pData.stats.health = pData.stats.maxHealth || 100;
  pData.stats.mana = pData.stats.maxMana || 100;
  syncVanillaHealthAndHunger(client, pData.stats);

  for (const [_, p] of players) {
    if (!isWritable(p?.client)) continue;
    updatePlayerHealthScore(p.client, pData.username, pData.stats.health, p.is119);
  }

  // 3. Persist Purse + Health immediately across Hub/Islands shared profile
  try {
    persistPlayerSession(pData);
  } catch (_) {}

  // 4. Personal & Broadcast Death Messages + Sound
  const phrase = buildDeathPhrase(info);
  const spawnLabel = server?.config?.worldType === 'hub' ? 'Hub Spawn' : 'your island';
  if (coinsLost > 0) {
    sendSystemMessage(
      client,
      `§c ☠ You ${phrase} §cand lost §6${formatCoins(coinsLost)} coins§c! §7(Respawned at ${spawnLabel})`,
      is119
    );
  } else {
    sendSystemMessage(
      client,
      `§c ☠ You ${phrase}§c! §7(Respawned at ${spawnLabel})`,
      is119
    );
  }

  for (const [_, p] of players) {
    if (!isWritable(p?.client) || p.client.id === client.id) continue;
    sendSystemMessage(p.client, `§c ☠ §e${pData.username} §7${phrase}§7!`, p.is119);
  }

  // 5. Respawn Player Safely at Spawn Point
  if (server && typeof server.respawnPlayerAfterDeath === 'function') {
    server.respawnPlayerAfterDeath(pData);
  }

  try {
    client.write('named_sound_effect', {
      soundName: 'entity.player.death',
      soundCategory: 0,
      x: Math.floor((pData.x || 0) * 8),
      y: Math.floor((pData.y || 70) * 8),
      z: Math.floor((pData.z || 0) * 8),
      volume: 1.0,
      pitch: 1.0,
      seed: [0, 0]
    });
  } catch (_) {}

  server?.log?.(
    'INFO',
    `[DEATH] ${pData.username} (${info.cause}) -> lost ${coinsLost} coins, purse=${remainingPurse}`
  );
}

/**
 * Tracks vertical peak across movement packets and applies fall damage upon landing (>3 blocks).
 */
export function trackFallDamageOnMove(
  server: any,
  pData: any,
  x: number,
  y: number,
  z: number,
  onGround: boolean
): void {
  if (!pData || !pData.stats) return;
  const now = Date.now();

  if (
    pData.isFlying ||
    (pData.teleportLockUntil && now < pData.teleportLockUntil) ||
    (pData.voidImmunityUntil && now < pData.voidImmunityUntil) ||
    (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS)
  ) {
    pData.fallPeakY = y;
    return;
  }

  const blockAtFeet = getBlockAtPlayerPos(server, x, y + 0.05, z);
  const blockBelow = getBlockAtPlayerPos(server, x, y - 0.15, z);
  if (
    blockAtFeet === 'water' ||
    blockAtFeet === 'lava' ||
    blockAtFeet === 'cobweb' ||
    blockBelow === 'slime_block' ||
    blockBelow === 'honey_block'
  ) {
    pData.fallPeakY = y;
    return;
  }

  if (!onGround) {
    if (typeof pData.fallPeakY !== 'number' || y > pData.fallPeakY) {
      pData.fallPeakY = y;
    }
    return;
  }

  const peakY = typeof pData.fallPeakY === 'number' ? pData.fallPeakY : y;
  const fallDist = peakY - y;
  pData.fallPeakY = y;

  if (fallDist > 3.0) {
    const scalePerBlock = Math.max(5, Math.round((pData.stats.maxHealth || 100) * 0.05));
    let rawDamage = Math.floor((fallDist - 3.0) * scalePerBlock);
    if (blockBelow === 'hay_block') {
      rawDamage = Math.max(1, Math.floor(rawDamage * 0.2));
    }
    if (rawDamage > 0) {
      applyPlayerDamage(server, pData, rawDamage, 'FALL', {
        hurtSound: fallDist > 7 ? 'entity.player.big_fall' : 'entity.player.small_fall'
      });
    }
  }
}

/**
 * 500ms Environmental Death Ticker: handles Lava, Fire, Drowning, Cactus/Berry, and Suffocation.
 */
export function tickEnvironmentalDeaths(server: any): void {
  const now = Date.now();
  for (const [_, pData] of players) {
    if (!pData || !pData.stats || !isWritable(pData.client)) continue;
    if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) continue;
    if (pData.teleportLockUntil && now < pData.teleportLockUntil) continue;
    if (pData.voidImmunityUntil && now < pData.voidImmunityUntil) continue;

    const x = pData.x || 0;
    const y = pData.y || 70;
    const z = pData.z || 0;

    const feetBlock = getBlockAtPlayerPos(server, x, y + 0.05, z);
    const bodyBlock = getBlockAtPlayerPos(server, x, y + 0.9, z);
    const chestBlock = getBlockAtPlayerPos(server, x, y + 1.15, z);
    const eyeBlock = getBlockAtPlayerPos(server, x, y + 1.62, z);
    const floorBlock = getBlockAtPlayerPos(server, x, y - 0.1, z);

    // 1. Lava
    if (feetBlock === 'lava' || bodyBlock === 'lava' || eyeBlock === 'lava') {
      pData.fireUntil = now + 3500;
      if (!pData.lastLavaDamageAt || now - pData.lastLavaDamageAt >= 500) {
        pData.lastLavaDamageAt = now;
        applyPlayerDamage(server, pData, 20, 'LAVA', { hurtSound: 'entity.player.hurt_on_fire' });
      }
      continue;
    }

    // 2. Water Extinguish & Drowning
    if (feetBlock === 'water' || bodyBlock === 'water') {
      pData.fireUntil = 0;
    }

    if (eyeBlock === 'water') {
      const air = typeof pData.airLevel === 'number' ? pData.airLevel : DEFAULT_AIR_LEVEL;
      pData.airLevel = Math.max(0, air - 1);
      if (pData.airLevel <= 0 && (!pData.lastDrownDamageAt || now - pData.lastDrownDamageAt >= 1000)) {
        pData.lastDrownDamageAt = now;
        applyPlayerDamage(server, pData, 20, 'DROWNING', {
          bypassDefense: true,
          hurtSound: 'entity.player.hurt_drown'
        });
      }
    } else {
      const air = typeof pData.airLevel === 'number' ? pData.airLevel : DEFAULT_AIR_LEVEL;
      pData.airLevel = Math.min(DEFAULT_AIR_LEVEL, air + 5);
    }

    if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) continue;

    // 3. Fire / Magma / Residual Burn
    const inFireBlock =
      feetBlock === 'fire' ||
      feetBlock === 'soul_fire' ||
      feetBlock === 'campfire' ||
      feetBlock === 'soul_campfire' ||
      floorBlock === 'magma_block';
    if (inFireBlock) {
      pData.fireUntil = now + 3000;
    }
    if (pData.fireUntil && now < pData.fireUntil) {
      if (!pData.lastFireDamageAt || now - pData.lastFireDamageAt >= 1000) {
        pData.lastFireDamageAt = now;
        applyPlayerDamage(server, pData, 10, 'FIRE', { hurtSound: 'entity.player.hurt_on_fire' });
      }
    }

    if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) continue;

    // 4. Cactus / Sweet Berry Bush
    if (
      feetBlock === 'cactus' ||
      bodyBlock === 'cactus' ||
      feetBlock === 'sweet_berry_bush' ||
      bodyBlock === 'sweet_berry_bush'
    ) {
      if (!pData.lastCactusDamageAt || now - pData.lastCactusDamageAt >= 500) {
        pData.lastCactusDamageAt = now;
        applyPlayerDamage(server, pData, 8, 'CACTUS', { hurtSound: 'entity.player.hurt_sweet_berry_bush' });
      }
    }

    if (pData.lastDeathAt && now - pData.lastDeathAt < DEATH_LOCK_MS) continue;

    // 5. Suffocation (requires both eye AND chest inside opaque full solid blocks)
    if (isSuffocatingSolidBlock(eyeBlock) && isSuffocatingSolidBlock(chestBlock)) {
      if (!pData.lastSuffocateDamageAt || now - pData.lastSuffocateDamageAt >= 1000) {
        pData.lastSuffocateDamageAt = now;
        applyPlayerDamage(server, pData, 10, 'SUFFOCATION', { bypassDefense: true });
      }
    }
  }
}
