/**
 * ZylarPixel Surface Graveyard Mob Engine (Hub Only)
 *
 * - 2 Mob Types ONLY:
 *   1) [Lv1] Graveyard Zombie  (minecraft:zombie, 100 HP, 20 DMG, +6 Combat XP, +2 Coins)
 *   2) [Lv1] Zombie Villager   (minecraft:zombie_villager, 120 HP, 24 DMG, +7 Combat XP, +3 Coins, Night-only)
 * - Global Cap: 20 active mobs across ~100+ invisible sky-exposed spawn pads (zero visual map changes).
 * - Night Mix: Up to 5 Zombie Villagers + 15 Graveyard Zombies at Night (7:00pm -> 5:59am); 20 Graveyard Zombies in Day.
 * - Respawns in 4 seconds >= 6 blocks away from players.
 * - 10Hz AI with solid-wall steering, step-up terrain following, melee attacks -> universal DeathManager (50% penalty),
 *   and 32-block tether / safe-zone rubber-band reset.
 */

import * as crypto from 'crypto';
import { getHubBlockName } from '../world/hubRegionProvider';
import { getWorldTimeState } from '../world/timeManager';
import { applyPlayerDamage } from './deathManager';
import { spawnDamageIndicator } from './damageIndicator';
import { calculateDamage, showActionBarMessage } from '../stats/statsManager';
import { updatePlayerScoreboardPurse } from '../core/scoreboard';
import { players, persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { loadPlayerProfile, savePlayerProfile } from '../storage/sharedProfile';
import { getSkyBlockExtraAttributes, getSkyBlockItem } from '../items';
import { COIN_ICON } from '../config/currencyIcons';

export const GRAVEYARD_MOB_CAP = 20;
export const GRAVEYARD_RESPAWN_MS = 4000;
export const GRAVEYARD_AGGRO_RANGE = 16;
export const GRAVEYARD_LEASH_RANGE = 32;
export const GRAVEYARD_MIN_PLAYER_SPAWN_DIST = 6;
export const GRAVEYARD_VIEW_DIST_SQ = 96 * 96;
export const GRAVEYARD_UNLOAD_DIST_SQ = 112 * 112;

export const GRAVEYARD_BOUNDS = {
  minX: -146,
  maxX: -74,
  minY: 66,
  maxY: 92,
  minZ: -158,
  maxZ: -50
};

// Safe buffer preventing zombies from chasing players into the main Village Square / Banker
const VILLAGE_SAFE_X = -62;
const VILLAGE_SAFE_Z = -38;

export type GraveyardMobKind = 'GRAVEYARD_ZOMBIE' | 'ZOMBIE_VILLAGER';

export interface MobDropEntry {
  itemName: string;
  chance: number;
  amount: number;
}

export interface GraveyardMobDef {
  kind: GraveyardMobKind;
  entityTypeId: number; // 1.19.2: 112 = zombie, 114 = zombie_villager
  displayName: string;
  level: number;
  maxHp: number;
  damage: number;
  chaseSpeed: number;  // blocks/sec
  wanderSpeed: number; // blocks/sec
  attackReach: number;
  attackCooldownMs: number;
  coinReward: number;
  drops: MobDropEntry[];
}

export const GRAVEYARD_MOBS: Record<GraveyardMobKind, GraveyardMobDef> = {
  GRAVEYARD_ZOMBIE: {
    kind: 'GRAVEYARD_ZOMBIE',
    entityTypeId: 112,
    displayName: 'Graveyard Zombie',
    level: 1,
    maxHp: 100,
    damage: 20,
    chaseSpeed: 3.0,
    wanderSpeed: 1.1,
    attackReach: 2.0,
    attackCooldownMs: 1000,
    coinReward: 2,
    drops: [
      { itemName: 'rotten_flesh', chance: 1.0, amount: 1 },
      { itemName: 'potato', chance: 0.01, amount: 1 },
      { itemName: 'carrot', chance: 0.01, amount: 1 },
      { itemName: 'poisonous_potato', chance: 0.01, amount: 1 }
    ]
  },
  ZOMBIE_VILLAGER: {
    kind: 'ZOMBIE_VILLAGER',
    entityTypeId: 114,
    displayName: 'Zombie Villager',
    level: 1,
    maxHp: 120,
    damage: 24,
    chaseSpeed: 3.15,
    wanderSpeed: 1.2,
    attackReach: 2.0,
    attackCooldownMs: 1000,
    coinReward: 3,
    drops: [
      { itemName: 'rotten_flesh', chance: 1.0, amount: 1 },
      { itemName: 'potato', chance: 0.02, amount: 1 },
      { itemName: 'carrot', chance: 0.02, amount: 1 },
      { itemName: 'poisonous_potato', chance: 0.02, amount: 1 },
      { itemName: 'iron_ingot', chance: 0.01, amount: 1 }
    ]
  }
};

const MOB_TAG_Y_OFFSET = 1.75; // Small+Marker ArmorStand adds +0.50 -> text renders at mob.y + 2.25 (cleanly above 1.95 head)

export interface SpawnPad {
  x: number;
  y: number;
  z: number;
}

export interface ActiveGraveyardMob {
  slotIndex: number;
  mobEntityId: number;
  tagEntityId: number;
  mobUuid: string;
  tagUuid: string;
  def: GraveyardMobDef;
  hp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  knockbackVx: number;
  knockbackVy: number;
  knockbackVz: number;
  knockbackUntil: number;
  homePad: SpawnPad;
  targetUsername: string | null;
  lastDamagedAt: number;
  lastHitReceivedAt: number;
  lastAttackAt: number;
  wanderTarget: { x: number; z: number } | null;
  nextWanderAt: number;
  dyingUntil: number;
}

const VALID_GROUND_BLOCKS = new Set([
  'grass_block', 'podzol', 'coarse_dirt', 'dirt', 'mycelium',
  'gravel', 'dirt_path', 'stone', 'cobblestone', 'mossy_cobblestone'
]);

const PASSABLE_BLOCKS = new Set([
  'air', 'cave_air', 'void_air', 'grass', 'short_grass', 'tall_grass', 'fern',
  'large_fern', 'dandelion', 'poppy', 'blue_orchid', 'azure_bluet', 'red_tulip',
  'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower',
  'lily_of_the_valley', 'sunflower', 'lilac', 'rose_bush', 'peony',
  'dead_bush', 'brown_mushroom', 'red_mushroom', 'snow', 'vine', 'cobweb',
  'torch', 'wall_torch', 'soul_torch', 'soul_wall_torch', 'lantern', 'soul_lantern',
  'moss_carpet', 'white_carpet', 'gray_carpet', 'black_carpet', 'green_carpet',
  'sweet_berry_bush', 'wheat', 'sugar_cane', 'lily_pad', 'ladder',
  'oak_sapling', 'spruce_sapling', 'birch_sapling', 'dark_oak_sapling'
]);

let spawnPads: SpawnPad[] = [];
let padsInitialized = false;
let nextMobEntityId = 200000;

const slots: Array<{ mob: ActiveGraveyardMob | null; nextSpawnAt: number }> = Array.from(
  { length: GRAVEYARD_MOB_CAP },
  () => ({ mob: null, nextSpawnAt: 0 })
);
const activeMobsByEntityId = new Map<number, ActiveGraveyardMob>();

export function isInsideGraveyardZone(x: number, y: number, z: number): boolean {
  return (
    x >= GRAVEYARD_BOUNDS.minX &&
    x <= GRAVEYARD_BOUNDS.maxX &&
    z >= GRAVEYARD_BOUNDS.minZ &&
    z <= GRAVEYARD_BOUNDS.maxZ &&
    y >= GRAVEYARD_BOUNDS.minY &&
    y <= GRAVEYARD_BOUNDS.maxY
  );
}

export function isGraveyardMobEntityId(entityId: number): boolean {
  return activeMobsByEntityId.has(entityId);
}

export function getActiveGraveyardMobs(): ActiveGraveyardMob[] {
  return Array.from(activeMobsByEntityId.values());
}

export function getGraveyardSpawnPadCount(): number {
  if (!padsInitialized) initGraveyardSpawnPads();
  return spawnPads.length;
}

function isPassableBlock(name: string): boolean {
  return PASSABLE_BLOCKS.has((name || 'air').replace('minecraft:', '').toLowerCase());
}

function isValidSurfaceTile(x: number, y: number, z: number): boolean {
  const floor = getHubBlockName(x, y, z).replace('minecraft:', '').toLowerCase();
  if (!VALID_GROUND_BLOCKS.has(floor)) return false;

  const feet = getHubBlockName(x, y + 1, z);
  const head = getHubBlockName(x, y + 2, z);
  if (!isPassableBlock(feet) || !isPassableBlock(head)) return false;

  // Require open sky overhead so underground crypt caves are strictly excluded
  for (let checkY = y + 3; checkY <= 92; checkY++) {
    const above = getHubBlockName(x, checkY, z).replace('minecraft:', '').toLowerCase();
    if (
      above !== 'air' &&
      above !== 'cave_air' &&
      !above.includes('leaves') &&
      !above.includes('log') &&
      !above.includes('wood')
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Builds invisible server-side spawn pad coordinates across the surface Graveyard once at startup.
 */
export function initGraveyardSpawnPads(): SpawnPad[] {
  if (padsInitialized) return spawnPads;
  padsInitialized = true;

  const validTiles: SpawnPad[] = [];
  for (let x = GRAVEYARD_BOUNDS.minX; x <= GRAVEYARD_BOUNDS.maxX; x++) {
    for (let z = GRAVEYARD_BOUNDS.minZ; z <= GRAVEYARD_BOUNDS.maxZ; z++) {
      for (let y = 75; y >= 68; y--) {
        if (isValidSurfaceTile(x, y, z)) {
          validTiles.push({ x: x + 0.5, y: y + 1.0, z: z + 0.5 });
          break;
        }
      }
    }
  }

  // Deterministic spacing (8 blocks apart, fallback 6 if sparse) so zombies distribute naturally
  const pickWithSpacing = (minDistSq: number): SpawnPad[] => {
    const chosen: SpawnPad[] = [];
    for (const tile of validTiles) {
      let tooClose = false;
      for (const existing of chosen) {
        const dx = tile.x - existing.x;
        const dz = tile.z - existing.z;
        if (dx * dx + dz * dz < minDistSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) chosen.push(tile);
    }
    return chosen;
  };

  let spaced = pickWithSpacing(64); // 8-block spacing
  if (spaced.length < GRAVEYARD_MOB_CAP) {
    spaced = pickWithSpacing(36); // 6-block fallback
  }
  spawnPads = spaced.length > 0 ? spaced : [{ x: -108.5, y: 71.0, z: -98.5 }];
  console.log(`🪦 [Graveyard] Indexed ${validTiles.length} surface tiles -> ${spawnPads.length} invisible spawn pads (cap=${GRAVEYARD_MOB_CAP}).`);
  return spawnPads;
}

export function resetGraveyardMobs(): void {
  activeMobsByEntityId.clear();
  for (let i = 0; i < slots.length; i++) {
    slots[i] = { mob: null, nextSpawnAt: 0 };
  }
}

function formatMobNametag(mob: ActiveGraveyardMob): string {
  const pct = mob.hp / mob.def.maxHp;
  const hpColor = pct > 0.5 ? '§a' : (pct > 0.25 ? '§e' : '§c');
  return `§8[§7Lv${mob.def.level}§8] §c${mob.def.displayName} ${hpColor}${Math.max(0, Math.ceil(mob.hp))}§f/§a${mob.def.maxHp}§c❤`;
}

function toByteAngle(deg: number): number {
  const norm = ((deg % 360) + 360) % 360;
  let b = Math.floor((norm / 360) * 256);
  if (b > 127) b -= 256;
  return b;
}

function sendToClientSafe(client: any, packetName: string, params: any): void {
  if (!client || client.ended || client.state === 'closed') return;
  try {
    client.write(packetName, params);
  } catch (_) {}
}

function spawnMobPacketsForClient(client: any, mob: ActiveGraveyardMob): void {
  const yawByte = toByteAngle(mob.yaw);
  const pitchByte = toByteAngle(mob.pitch);

  sendToClientSafe(client, 'spawn_entity', {
    entityId: mob.mobEntityId,
    objectUUID: mob.mobUuid,
    type: mob.def.entityTypeId,
    x: mob.x,
    y: mob.y,
    z: mob.z,
    pitch: pitchByte,
    yaw: yawByte,
    headPitch: yawByte,
    objectData: 0,
    velocity: { x: 0, y: 0, z: 0 }
  });

  // Standalone floating ArmorStand positioned directly above the 1.95-block zombie head (no set_passengers!)
  sendToClientSafe(client, 'spawn_entity', {
    entityId: mob.tagEntityId,
    objectUUID: mob.tagUuid,
    type: 2, // minecraft:armor_stand
    x: mob.x,
    y: mob.y + MOB_TAG_Y_OFFSET,
    z: mob.z,
    pitch: 0,
    yaw: 0,
    headPitch: 0,
    objectData: 0,
    velocity: { x: 0, y: 0, z: 0 }
  });

  sendToClientSafe(client, 'entity_metadata', {
    entityId: mob.tagEntityId,
    metadata: [
      { key: 0, type: 0, value: 0x20 }, // Invisible
      { key: 2, type: 5, value: JSON.stringify({ text: formatMobNametag(mob) }) }, // CustomName
      { key: 3, type: 7, value: true }, // CustomNameVisible
      { key: 15, type: 0, value: 0x11 } // Small + Marker
    ]
  });
}

function destroyMobPacketsForClient(client: any, mob: ActiveGraveyardMob): void {
  sendToClientSafe(client, 'entity_destroy', {
    entityIds: [mob.mobEntityId, mob.tagEntityId]
  });
}

function broadcastPacket(server: any, packetName: string, params: any, mobEntityId?: number): void {
  for (const [_, p] of players) {
    if (!server.isClientWritable(p?.client)) continue;
    if (mobEntityId !== undefined && p.spawnedGraveyardMobs && !p.spawnedGraveyardMobs.has(mobEntityId)) continue;
    sendToClientSafe(p.client, packetName, params);
  }
}

export function syncGraveyardMobsForPlayer(server: any, pData: any): void {
  if (server?.config?.worldType !== 'hub' || !server.isClientWritable(pData?.client)) return;
  if (!pData.spawnedGraveyardMobs) pData.spawnedGraveyardMobs = new Set<number>();

  for (const mob of activeMobsByEntityId.values()) {
    const dx = pData.x - mob.x;
    const dz = pData.z - mob.z;
    const distSq = dx * dx + dz * dz;
    const isSpawned = pData.spawnedGraveyardMobs.has(mob.mobEntityId);

    if (!isSpawned && distSq <= GRAVEYARD_VIEW_DIST_SQ) {
      pData.spawnedGraveyardMobs.add(mob.mobEntityId);
      spawnMobPacketsForClient(pData.client, mob);
    } else if (isSpawned && distSq > GRAVEYARD_UNLOAD_DIST_SQ) {
      pData.spawnedGraveyardMobs.delete(mob.mobEntityId);
      destroyMobPacketsForClient(pData.client, mob);
    }
  }
}

function allocateMobIds(): { mobEntityId: number; tagEntityId: number } {
  const mobEntityId = nextMobEntityId;
  const tagEntityId = nextMobEntityId + 1;
  nextMobEntityId += 2;
  if (nextMobEntityId > 400000) nextMobEntityId = 200000;
  return { mobEntityId, tagEntityId };
}

function selectFreeSpawnPad(): SpawnPad | null {
  if (!padsInitialized) initGraveyardSpawnPads();
  if (spawnPads.length === 0) return null;

  const isPadSafe = (pad: SpawnPad, minPlayerDistSq: number): boolean => {
    for (const [_, p] of players) {
      const dx = p.x - pad.x;
      const dz = p.z - pad.z;
      if (dx * dx + dz * dz < minPlayerDistSq) return false;
    }
    for (const mob of activeMobsByEntityId.values()) {
      const dx = mob.x - pad.x;
      const dz = mob.z - pad.z;
      if (dx * dx + dz * dz < 9) return false; // Avoid spawning directly on top of another active mob
    }
    return true;
  };

  const candidates = spawnPads.filter(p => isPadSafe(p, GRAVEYARD_MIN_PLAYER_SPAWN_DIST ** 2));
  const pool = candidates.length > 0
    ? candidates
    : spawnPads.filter(p => isPadSafe(p, 4)); // 2-block relaxed fallback if players fill Graveyard

  const finalPool = pool.length > 0 ? pool : spawnPads;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

function spawnMobInSlot(server: any, slotIndex: number, kind: GraveyardMobKind, now: number): void {
  const pad = selectFreeSpawnPad();
  if (!pad) return;

  const { mobEntityId, tagEntityId } = allocateMobIds();
  const def = GRAVEYARD_MOBS[kind];
  const mob: ActiveGraveyardMob = {
    slotIndex,
    mobEntityId,
    tagEntityId,
    mobUuid: crypto.randomUUID(),
    tagUuid: crypto.randomUUID(),
    def,
    hp: def.maxHp,
    x: pad.x,
    y: pad.y,
    z: pad.z,
    yaw: Math.random() * 360 - 180,
    pitch: 0,
    knockbackVx: 0,
    knockbackVy: 0,
    knockbackVz: 0,
    knockbackUntil: 0,
    homePad: pad,
    targetUsername: null,
    lastDamagedAt: 0,
    lastHitReceivedAt: 0,
    lastAttackAt: 0,
    wanderTarget: null,
    nextWanderAt: now + 1500 + Math.random() * 3000,
    dyingUntil: 0
  };

  slots[slotIndex] = { mob, nextSpawnAt: 0 };
  activeMobsByEntityId.set(mobEntityId, mob);

  for (const [_, p] of players) {
    if (!server.isClientWritable(p?.client)) continue;
    const dx = p.x - mob.x;
    const dz = p.z - mob.z;
    if (dx * dx + dz * dz <= GRAVEYARD_VIEW_DIST_SQ) {
      if (!p.spawnedGraveyardMobs) p.spawnedGraveyardMobs = new Set<number>();
      p.spawnedGraveyardMobs.add(mobEntityId);
      spawnMobPacketsForClient(p.client, mob);
    }
  }
}

function despawnMobFromSlot(server: any, mob: ActiveGraveyardMob, respawnDelayMs: number): void {
  activeMobsByEntityId.delete(mob.mobEntityId);
  if (slots[mob.slotIndex]?.mob?.mobEntityId === mob.mobEntityId) {
    slots[mob.slotIndex] = { mob: null, nextSpawnAt: Date.now() + respawnDelayMs };
  }
  for (const [_, p] of players) {
    if (p.spawnedGraveyardMobs) p.spawnedGraveyardMobs.delete(mob.mobEntityId);
    if (server.isClientWritable(p?.client)) {
      destroyMobPacketsForClient(p.client, mob);
    }
  }
}

function updateMobNametag(server: any, mob: ActiveGraveyardMob): void {
  broadcastPacket(server, 'entity_metadata', {
    entityId: mob.tagEntityId,
    metadata: [
      { key: 2, type: 5, value: JSON.stringify({ text: formatMobNametag(mob) }) }
    ]
  }, mob.mobEntityId);
}

function isSpaceClearAt(x: number, y: number, z: number): boolean {
  const bx = Math.floor(x);
  const by = Math.floor(y + 0.05);
  const bz = Math.floor(z);
  return isPassableBlock(getHubBlockName(bx, by, bz)) && isPassableBlock(getHubBlockName(bx, by + 1, bz));
}

function findGroundHeightAt(x: number, currentY: number, z: number, maxDrop: number = 1): number | null {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const baseBlockY = Math.floor(currentY + 0.05);

  const offsets = [0, 1];
  for (let d = 1; d <= maxDrop; d++) offsets.push(-d);

  for (const dy of offsets) {
    const feetY = baseBlockY + dy;
    const floor = getHubBlockName(bx, feetY - 1, bz);
    const feet = getHubBlockName(bx, feetY, bz);
    const head = getHubBlockName(bx, feetY + 1, bz);
    if (!isPassableBlock(floor) && isPassableBlock(feet) && isPassableBlock(head)) {
      return feetY;
    }
  }
  return null;
}

function moveMobPosition(
  server: any,
  mob: ActiveGraveyardMob,
  nextX: number,
  nextY: number,
  nextZ: number,
  yaw: number,
  onGround: boolean = true
): void {
  const dx = nextX - mob.x;
  const dy = nextY - mob.y;
  const dz = nextZ - mob.z;
  const maxAbs = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));

  mob.x = nextX;
  mob.y = nextY;
  mob.z = nextZ;
  mob.yaw = yaw;
  const yawByte = toByteAngle(yaw);

  if (maxAbs < 7.5) {
    const dX = Math.round(dx * 4096);
    const dY = Math.round(dy * 4096);
    const dZ = Math.round(dz * 4096);
    if (dX !== 0 || dY !== 0 || dZ !== 0) {
      broadcastPacket(server, 'entity_move_look', {
        entityId: mob.mobEntityId,
        dX,
        dY,
        dZ,
        yaw: yawByte,
        pitch: 0,
        onGround
      }, mob.mobEntityId);

      // Keep detached floating nametag ArmorStand locked cleanly above head
      broadcastPacket(server, 'rel_entity_move', {
        entityId: mob.tagEntityId,
        dX,
        dY,
        dZ,
        onGround
      }, mob.mobEntityId);
    } else {
      broadcastPacket(server, 'entity_look', {
        entityId: mob.mobEntityId,
        yaw: yawByte,
        pitch: 0,
        onGround
      }, mob.mobEntityId);
    }
  } else {
    broadcastPacket(server, 'entity_teleport', {
      entityId: mob.mobEntityId,
      x: nextX,
      y: nextY,
      z: nextZ,
      yaw: yawByte,
      pitch: 0,
      onGround
    }, mob.mobEntityId);

    broadcastPacket(server, 'entity_teleport', {
      entityId: mob.tagEntityId,
      x: nextX,
      y: nextY + MOB_TAG_Y_OFFSET,
      z: nextZ,
      yaw: 0,
      pitch: 0,
      onGround
    }, mob.mobEntityId);
  }

  broadcastPacket(server, 'entity_head_rotation', {
    entityId: mob.mobEntityId,
    headYaw: yawByte
  }, mob.mobEntityId);
}

function rubberBandMobToHome(server: any, mob: ActiveGraveyardMob): void {
  mob.hp = mob.def.maxHp;
  mob.targetUsername = null;
  mob.wanderTarget = null;
  mob.knockbackVx = 0;
  mob.knockbackVy = 0;
  mob.knockbackVz = 0;
  mob.knockbackUntil = 0;
  mob.x = mob.homePad.x;
  mob.y = mob.homePad.y;
  mob.z = mob.homePad.z;

  broadcastPacket(server, 'entity_teleport', {
    entityId: mob.mobEntityId,
    x: mob.homePad.x,
    y: mob.homePad.y,
    z: mob.homePad.z,
    yaw: toByteAngle(mob.yaw),
    pitch: 0,
    onGround: true
  }, mob.mobEntityId);

  broadcastPacket(server, 'entity_teleport', {
    entityId: mob.tagEntityId,
    x: mob.homePad.x,
    y: mob.homePad.y + MOB_TAG_Y_OFFSET,
    z: mob.homePad.z,
    yaw: 0,
    pitch: 0,
    onGround: true
  }, mob.mobEntityId);
  updateMobNametag(server, mob);
}

function isEligibleTarget(pData: any, mob: ActiveGraveyardMob, now: number): boolean {
  if (!pData || !pData.client || pData.client.ended || pData.client.state === 'closed') return false;
  if ((pData.teleportLockUntil || 0) > now || (pData.voidImmunityUntil || 0) > now) return false;
  if (now - (pData.lastDeathAt || 0) < 3000) return false;
  if (pData.x > VILLAGE_SAFE_X && pData.z > VILLAGE_SAFE_Z) return false;

  const padDist = Math.hypot(pData.x - mob.homePad.x, pData.z - mob.homePad.z);
  return padDist <= GRAVEYARD_LEASH_RANGE;
}

function selectBestTarget(mob: ActiveGraveyardMob, now: number): any | null {
  if (mob.targetUsername) {
    for (const [_, p] of players) {
      if (p.username === mob.targetUsername && isEligibleTarget(p, mob, now)) {
        const dist = Math.hypot(p.x - mob.x, p.z - mob.z);
        if (dist <= 22 && Math.abs(p.y - mob.y) <= 8) return p;
      }
    }
    mob.targetUsername = null;
  }

  let best: any = null;
  let bestDist = GRAVEYARD_AGGRO_RANGE;
  for (const [_, p] of players) {
    if (!isEligibleTarget(p, mob, now)) continue;
    const dist = Math.hypot(p.x - mob.x, p.z - mob.z);
    if (dist <= bestDist && Math.abs(p.y - mob.y) <= 6) {
      bestDist = dist;
      best = p;
    }
  }
  if (best) mob.targetUsername = best.username;
  return best;
}

function stepMobKnockbackAndGravity(server: any, mob: ActiveGraveyardMob, dtSec: number): void {
  let finalX = mob.x;
  let finalZ = mob.z;
  let steppedUpY = mob.y;
  const candX = mob.x + mob.knockbackVx * dtSec;
  const candZ = mob.z + mob.knockbackVz * dtSec;

  // Check current Y or +1 block step-up when knocked onto a gentle slope while airborne/rising
  const canMoveXZ = (tx: number, tz: number): number | null => {
    if (isSpaceClearAt(tx, steppedUpY, tz)) return steppedUpY;
    if (isSpaceClearAt(tx, steppedUpY + 1.0, tz)) return Math.floor(steppedUpY + 1.05);
    return null;
  };

  if (Math.abs(mob.knockbackVx) > 0.05 || Math.abs(mob.knockbackVz) > 0.05) {
    const clearBothY = canMoveXZ(candX, candZ);
    if (clearBothY !== null) {
      finalX = candX;
      finalZ = candZ;
      steppedUpY = Math.max(steppedUpY, clearBothY);
    } else {
      const clearX = canMoveXZ(candX, mob.z);
      if (clearX !== null) {
        finalX = candX;
        steppedUpY = Math.max(steppedUpY, clearX);
      } else {
        mob.knockbackVx = 0;
      }
      const clearZ = canMoveXZ(finalX, candZ);
      if (clearZ !== null) {
        finalZ = candZ;
        steppedUpY = Math.max(steppedUpY, clearZ);
      } else {
        mob.knockbackVz = 0;
      }
    }
  }

  // Smooth gravity fall capped gently per 100ms tick so zombies never teleport down cliffs
  mob.knockbackVy = Math.max(-9.0, mob.knockbackVy - 22.0 * dtSec);
  let nextY = steppedUpY + Math.max(-0.6, Math.min(0.8, mob.knockbackVy * dtSec));

  const surfaceY = findGroundHeightAt(finalX, steppedUpY, finalZ, 6);
  let landed = false;
  if (surfaceY !== null && nextY <= surfaceY && mob.knockbackVy <= 0) {
    nextY = surfaceY;
    mob.knockbackVy = 0;
    landed = true;
  } else if (surfaceY === null && nextY < GRAVEYARD_BOUNDS.minY - 6) {
    nextY = steppedUpY;
    mob.knockbackVy = 0;
    landed = true;
  }

  mob.knockbackVx *= 0.64;
  mob.knockbackVz *= 0.64;
  if (Math.hypot(mob.knockbackVx, mob.knockbackVz) < 0.25) {
    mob.knockbackVx = 0;
    mob.knockbackVz = 0;
  }

  moveMobPosition(server, mob, finalX, nextY, finalZ, mob.yaw, landed);
}

function stepMobToward(
  server: any,
  mob: ActiveGraveyardMob,
  goalX: number,
  goalZ: number,
  speedPerSec: number,
  dtSec: number,
  allowLargeDrops: boolean
): void {
  const toGoalX = goalX - mob.x;
  const toGoalZ = goalZ - mob.z;
  const distToGoal = Math.hypot(toGoalX, toGoalZ);
  if (distToGoal < 0.15) return;

  const baseAngle = Math.atan2(-toGoalX, toGoalZ); // MC yaw convention: 0 = +Z, -90 = +X
  const stepSize = Math.min(speedPerSec * dtSec, distToGoal);

  // Soft separation from overlapping zombies so they fan out instead of stacking into 1 pixel
  let sepX = 0;
  let sepZ = 0;
  for (const other of activeMobsByEntityId.values()) {
    if (other.mobEntityId === mob.mobEntityId) continue;
    const dx = mob.x - other.x;
    const dz = mob.z - other.z;
    const dSq = dx * dx + dz * dz;
    if (dSq > 0.0001 && dSq < 0.85) {
      const d = Math.sqrt(dSq);
      sepX += (dx / d) * 0.12;
      sepZ += (dz / d) * 0.12;
    }
  }

  // Try straight line first, then ±35° / ±70° steering around graves/fences/trees
  const candidateOffsets = [0, 0.6, -0.6, 1.2, -1.2];
  for (const offset of candidateOffsets) {
    const yawRad = baseAngle + offset;
    const dirX = -Math.sin(yawRad);
    const dirZ = Math.cos(yawRad);
    const nextX = mob.x + dirX * stepSize + sepX;
    const nextZ = mob.z + dirZ * stepSize + sepZ;
    const maxDrop = allowLargeDrops ? 3 : 1;
    const groundY = findGroundHeightAt(nextX, mob.y, nextZ, maxDrop);
    if (groundY !== null) {
      const yawDeg = (yawRad * 180) / Math.PI;
      // Avoid jarring 2-3 block instant vertical snaps: step horizontally first and let gravity fall smoothly
      if (groundY < mob.y - 1.0 && isSpaceClearAt(nextX, mob.y, nextZ)) {
        mob.knockbackVy = -1.5;
        moveMobPosition(server, mob, nextX, mob.y - 0.25, nextZ, yawDeg, false);
      } else {
        moveMobPosition(server, mob, nextX, groundY, nextZ, yawDeg, true);
      }
      return;
    }
  }

  // Only turn gaze cleanly if temporarily blocked
  const yawDeg = (baseAngle * 180) / Math.PI;
  moveMobPosition(server, mob, mob.x, mob.y, mob.z, yawDeg, true);
}

/**
 * Main 10Hz Graveyard Spawner & AI Simulation Loop (called every 100ms on Hub server).
 */
export function tickGraveyardMobs(server: any): void {
  if (!server || server.config?.worldType !== 'hub') return;
  if (!padsInitialized) initGraveyardSpawnPads();

  const now = Date.now();
  const timeState = getWorldTimeState(now);
  const isNight = timeState.isNight;

  // 1. Day/Night Cleanup: At daytime, gently retire idle out-of-combat Zombie Villagers so day is 100% Graveyard Zombies
  let activeVillagers = 0;
  for (const mob of activeMobsByEntityId.values()) {
    if (mob.def.kind === 'ZOMBIE_VILLAGER') {
      if (!isNight && !mob.dyingUntil && !mob.targetUsername && now - mob.lastHitReceivedAt > 10000) {
        despawnMobFromSlot(server, mob, 500);
      } else {
        activeVillagers++;
      }
    }
  }

  // 2. Maintain 20 Active Mobs across Spawn Pads
  const targetVillagers = isNight ? 5 : 0;
  for (let i = 0; i < GRAVEYARD_MOB_CAP; i++) {
    const slot = slots[i];
    if (!slot.mob && now >= slot.nextSpawnAt) {
      const kind: GraveyardMobKind = (isNight && activeVillagers < targetVillagers)
        ? 'ZOMBIE_VILLAGER'
        : 'GRAVEYARD_ZOMBIE';
      spawnMobInSlot(server, i, kind, now);
      if (kind === 'ZOMBIE_VILLAGER') activeVillagers++;
    }
  }

  // Sync viewer visibility dynamically as players roam into/out of Graveyard range
  for (const [_, p] of players) {
    syncGraveyardMobsForPlayer(server, p);
  }

  // 3. Simulate Active Mobs
  for (const mob of activeMobsByEntityId.values()) {
    if (mob.dyingUntil > 0) {
      if (now >= mob.dyingUntil) {
        despawnMobFromSlot(server, mob, GRAVEYARD_RESPAWN_MS);
      }
      continue;
    }

    // 32-Block Tether & Safe-Zone Protection (fixes luring hundreds of blocks into Village!)
    const distFromHome = Math.hypot(mob.x - mob.homePad.x, mob.z - mob.homePad.z);
    if (distFromHome > GRAVEYARD_LEASH_RANGE || mob.y < 58 || (mob.x > VILLAGE_SAFE_X && mob.z > VILLAGE_SAFE_Z)) {
      rubberBandMobToHome(server, mob);
      continue;
    }

    // Simulate active knockback arc / smooth falling before AI pursuit
    if (mob.knockbackVy !== 0 || Math.abs(mob.knockbackVx) > 0.05 || Math.abs(mob.knockbackVz) > 0.05) {
      stepMobKnockbackAndGravity(server, mob, 0.1);
    }

    // Pause AI walking during knockback hitstun / airborne recoil so knockback isn't erased
    if (now < mob.knockbackUntil || mob.knockbackVy !== 0) {
      continue;
    }

    const target = selectBestTarget(mob, now);
    if (target) {
      const distToTarget = Math.hypot(target.x - mob.x, target.z - mob.z);
      const yDiff = Math.abs(target.y - mob.y);

      if (distToTarget > 1.35) {
        stepMobToward(server, mob, target.x, target.z, mob.def.chaseSpeed, 0.1, true);
      } else {
        // Face target when already in melee range
        const yawDeg = (Math.atan2(-(target.x - mob.x), target.z - mob.z) * 180) / Math.PI;
        moveMobPosition(server, mob, mob.x, mob.y, mob.z, yawDeg, true);
      }

      if (distToTarget <= mob.def.attackReach && yDiff <= 2.2 && now - mob.lastAttackAt >= mob.def.attackCooldownMs) {
        mob.lastAttackAt = now;
        broadcastPacket(server, 'entity_animation', { entityId: mob.mobEntityId, animation: 0 }, mob.mobEntityId);
        applyPlayerDamage(server, target, mob.def.damage, 'MOB', {
          killerName: mob.def.displayName
        });

        // Apply crisp knockback pulse away from the zombie
        if (target.stats.health > 0 && server.isClientWritable(target.client)) {
          const kbAngle = Math.atan2(-(target.x - mob.x), target.z - mob.z);
          sendToClientSafe(target.client, 'entity_velocity', {
            entityId: target.entityId,
            velocity: {
              x: Math.round(-Math.sin(kbAngle) * 3800),
              y: 2800,
              z: Math.round(Math.cos(kbAngle) * 3800)
            }
          });
        }
      }
    } else {
      // Casual Idle Wander near homePad (strictly capped to +-1 block ledges)
      if (!mob.wanderTarget || now >= mob.nextWanderAt || Math.hypot(mob.wanderTarget.x - mob.x, mob.wanderTarget.z - mob.z) < 0.4) {
        mob.nextWanderAt = now + 2500 + Math.random() * 4000;
        const angle = Math.random() * Math.PI * 2;
        const rad = 1.5 + Math.random() * 3.5;
        mob.wanderTarget = {
          x: mob.homePad.x + Math.cos(angle) * rad,
          z: mob.homePad.z + Math.sin(angle) * rad
        };
      }
      stepMobToward(server, mob, mob.wanderTarget.x, mob.wanderTarget.z, mob.def.wanderSpeed, 0.1, false);
    }
  }
}

function getHeldWeaponDamage(pData: any): number {
  const activeSlot = 36 + (pData.selectedSlot || 0);
  const held = pData.inventory?.get(activeSlot);
  if (!held) return 0;

  const extra = getSkyBlockExtraAttributes(held);
  if (extra?.id) {
    const def = getSkyBlockItem(extra.id);
    if (typeof def?.stats?.damage === 'number') return def.stats.damage;
  }

  const itemLower = (held.name || '').toLowerCase();
  if (itemLower.includes('diamond_sword')) return 35;
  if (itemLower.includes('iron_sword')) return 30;
  if (itemLower.includes('stone_sword')) return 25;
  if (itemLower.includes('golden_sword') || itemLower.includes('wooden_sword')) return 20;
  return 0;
}

function awardMobCoins(pData: any, coinReward: number): void {
  const profile = loadPlayerProfile(pData.username);
  pData.purse = Math.round(((pData.purse || 0) + coinReward) * 10) / 10;
  profile.coins = pData.purse;
  savePlayerProfile(profile);
  updatePlayerScoreboardPurse(pData);
  persistPlayerSession(pData);

  showActionBarMessage(
    pData,
    `${COIN_ICON} §6+${coinReward} Coins`,
    1800
  );
}

/**
 * Handles player melee hit against a Graveyard Zombie or Zombie Villager.
 * Returns true if entityId belonged to a Graveyard mob.
 */
export function handleGraveyardMobAttack(server: any, pData: any, targetEntityId: number): boolean {
  const mob = activeMobsByEntityId.get(targetEntityId);
  if (!mob) return false;

  const now = Date.now();
  if (mob.dyingUntil > 0) return true;
  if (now - mob.lastHitReceivedAt < 250) return true; // 4 hits/s i-frame guard

  const reachDist = Math.hypot(pData.x - mob.x, pData.z - mob.z);
  if (reachDist > 4.8 || Math.abs(pData.y - mob.y) > 4.0) return true;

  mob.lastHitReceivedAt = now;
  mob.lastDamagedAt = now;
  mob.targetUsername = pData.username;

  const weaponDamage = getHeldWeaponDamage(pData);
  const { damage, isCrit } = calculateDamage(pData.stats, weaponDamage);
  mob.hp = Math.max(0, mob.hp - damage);

  // Floating SkyBlock Damage Hologram + Red Hurt Flash + Zombie Hurt Sound
  const allClients = Array.from(players.values()).map(p => p.client).filter(c => server.isClientWritable(c));
  spawnDamageIndicator(allClients, mob.x, mob.y, mob.z, damage, isCrit);

  broadcastPacket(server, 'entity_status', { entityId: mob.mobEntityId, entityStatus: 2 }, mob.mobEntityId);
  broadcastPacket(server, 'named_sound_effect', {
    soundName: 'entity.zombie.hurt',
    soundCategory: 2,
    x: Math.floor(mob.x * 8),
    y: Math.floor(mob.y * 8),
    z: Math.floor(mob.z * 8),
    volume: 1.0,
    pitch: mob.def.kind === 'ZOMBIE_VILLAGER' ? 0.85 : 1.0,
    seed: [0, 0]
  }, mob.mobEntityId);

  if (mob.hp > 0) {
    updateMobNametag(server, mob);
    // Real vanilla-feel knockback launch (~2.3 blocks arc + 480ms hitstun)
    const dirX = mob.x - pData.x;
    const dirZ = mob.z - pData.z;
    const dist = Math.hypot(dirX, dirZ);
    const attackerYawRad = ((pData.yaw || 0) * Math.PI) / 180;
    const nx = dist >= 0.45 ? dirX / dist : -Math.sin(attackerYawRad);
    const nz = dist >= 0.45 ? dirZ / dist : Math.cos(attackerYawRad);

    mob.knockbackVx = nx * 9.5;
    mob.knockbackVy = 6.2;
    mob.knockbackVz = nz * 9.5;
    mob.knockbackUntil = now + 480;

    broadcastPacket(server, 'entity_velocity', {
      entityId: mob.mobEntityId,
      velocity: {
        x: Math.round(nx * 5600),
        y: 3200,
        z: Math.round(nz * 5600)
      }
    }, mob.mobEntityId);
    stepMobKnockbackAndGravity(server, mob, 0.08);
  } else {
    // Mob Killed!
    mob.dyingUntil = now + 550;
    updateMobNametag(server, mob);
    broadcastPacket(server, 'entity_status', { entityId: mob.mobEntityId, entityStatus: 3 }, mob.mobEntityId);
    broadcastPacket(server, 'named_sound_effect', {
      soundName: 'entity.zombie.death',
      soundCategory: 2,
      x: Math.floor(mob.x * 8),
      y: Math.floor(mob.y * 8),
      z: Math.floor(mob.z * 8),
      volume: 1.0,
      pitch: 1.0,
      seed: [0, 0]
    }, mob.mobEntityId);

    if (server.isClientWritable(pData.client)) {
      sendToClientSafe(pData.client, 'named_sound_effect', {
        soundName: 'entity.experience_orb.pickup',
        soundCategory: 0,
        x: Math.floor(pData.x * 8),
        y: Math.floor(pData.y * 8),
        z: Math.floor(pData.z * 8),
        volume: 0.7,
        pitch: 1.35,
        seed: [0, 0]
      });
    }

    // Physical Loot Drops (private anti-theft to killer)
    for (const drop of mob.def.drops) {
      if (Math.random() < drop.chance) {
        server.spawnDroppedItem(drop.itemName, drop.amount, mob.x, mob.y + 0.35, mob.z, pData.username);
        if (drop.chance <= 0.02) {
          sendSystemMessage(pData.client, `§9§lRARE DROP! §f${drop.itemName.replace(/_/g, ' ')}`, pData.is119 !== false);
        }
      }
    }

    awardCombatXpAndCoins(pData, mob.def);
  }

  return true;
}
