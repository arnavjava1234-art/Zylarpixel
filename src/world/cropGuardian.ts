/**
 * ZylarPixel Hub Crop Harvesting & Magical Regrowth Guardian System
 * 
 * Features:
 * - Special-cases the 4 core Hub crops: Wheat, Carrots, Potatoes, Nether Wart.
 * - Leaves mushrooms and all other blocks protected under general Hub protection.
 * - Authentic randomized drop tables scaled by PlayerStats.farmingFortune (+100 = guaranteed +100% extra drop).
 * - Multi-pass inventory stacking (hotbar 36..43, main inventory 9..35, skipping slot 44 Nether Star).
 * - Physical ground drop fallback via droppedItems if inventory is 100% full.
 * - Floating invisible Armor Stand Guardian Sprite overlooking the Hub farm with custom skull.
 * - Smooth head rotation (yaw += 3° per tick).
 * - High-density white particle beam (end_rod) from Guardian head to harvested block.
 * - Magical chime sound (item.bone_meal.use) and green bonemeal sparkles (happy_villager).
 * - Instant block_change restoration to 100% fully grown crop state & chunk state memory update.
 */

import { mcData1192, mcData1211 } from './worldManager';
import { tagVanillaItemStack, formatSlotForClient, isSkyBlockItemStack } from '../items/engine/itemBuilder';
export { formatSlotForClient };
import { showActionBarMessage } from '../stats/statsManager';
import { setHubBlockStateId } from './hubRegionProvider';
import { players } from '../players/playerManager';

export const GUARDIAN_ENTITY_ID = 8895;
export const GUARDIAN_HOLO_TITLE_ID = 8896;
export const GUARDIAN_HOLO_SUB_ID = 8897;

export const GUARDIAN_UUID = '7c72f1a5-8895-4b10-8877-e1a3fc82e38f';
export const GUARDIAN_HOLO_TITLE_UUID = '7c72f1a6-8896-4b10-8877-e1a3fc82e38f';
export const GUARDIAN_HOLO_SUB_UUID = '7c72f1a7-8897-4b10-8877-e1a3fc82e38f';

// Central floating point over the Hub farm fields (X: 45.5, Y: 75.5, Z: -135.5)
export const GUARDIAN_POS = {
  x: 45.5,
  y: 75.5,
  z: -135.5,
  yaw: 0.0,
  pitch: 0.0
};

// Custom glowing Nature/Leaf Spirit skull texture
export const GUARDIAN_SKULL_TEXTURE = 'eyJ0ZXh0dXJlcyI6eyJTS0lOIjp7InVybCI6Imh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvOTdhMWI0NmQzNmRjMmFlNmI5NjZkMjJmYjYzNzJkNDZhZjZlYzg2MWE5ZGUzM2Q1NDVjOGVkMWI1Yzg4N2Q0In19fQ==';

export const HARVESTABLE_CROPS = new Set([
  'wheat',
  'carrots',
  'potatoes',
  'nether_wart'
]);

export function isHarvestableHubCrop(blockName: string): boolean {
  if (!blockName) return false;
  const clean = blockName.replace('minecraft:', '').toLowerCase();
  return HARVESTABLE_CROPS.has(clean);
}

// 100% Fully grown crop state IDs for 1.19.2 and 1.21.1
export const FULLY_GROWN_CROP_STATES: Record<string, { state119: number; state121: number }> = {
  wheat: { state119: 3619, state121: 4285 },       // age=7
  carrots: { state119: 6930, state121: 8602 },     // age=7
  potatoes: { state119: 6938, state121: 8610 },    // age=7
  nether_wart: { state119: 5718, state121: 7388 }  // age=3
};

// Cooldown tracker per block coordinate to prevent autoclicker / packet flood double-drops
const recentHarvests = new Map<string, number>();

let currentGuardianYaw = 0;

/**
 * Calculates drop multiplier based on Farming Fortune:
 * +100 Fortune = +100% chance for an extra drop (guaranteed +1 drop multiplier)
 */
export function calculateFortuneMultiplier(fortune: number = 0): number {
  const safe = Math.max(0, fortune);
  const guaranteed = 1 + Math.floor(safe / 100);
  const remainder = safe % 100;
  const extra = (Math.random() * 100 < remainder) ? 1 : 0;
  return guaranteed + extra;
}

/**
 * Creates custom head NBT data for the Guardian Armor Stand
 */
function createGuardianHeadItem(is119: boolean): any {
  const itemId = is119 ? 998 : 1105; // player_head item ID
  if (is119) {
    return {
      present: true,
      itemId,
      itemCount: 1,
      nbtData: {
        type: 'compound',
        name: '',
        value: {
          SkullOwner: {
            type: 'compound',
            value: {
              Id: { type: 'string', value: GUARDIAN_UUID },
              Properties: {
                type: 'compound',
                value: {
                  textures: {
                    type: 'list',
                    value: {
                      type: 'compound',
                      value: [
                        { Value: { type: 'string', value: GUARDIAN_SKULL_TEXTURE } }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
  } else {
    // 1.21.1 Slot format with custom skin profile component
    return {
      itemCount: 1,
      itemId,
      addedComponentCount: 1,
      removedComponentCount: 0,
      components: [
        {
          type: 'profile',
          data: {
            name: 'CropGuardian',
            uuid: GUARDIAN_UUID,
            properties: [
              {
                name: 'textures',
                value: GUARDIAN_SKULL_TEXTURE,
                signature: undefined
              }
            ]
          }
        }
      ],
      removeComponents: []
    };
  }
}

/**
 * Spawns the Floating Guardian Armor Stand & Holograms for a player
 */
export function spawnCropGuardian(client: any, is119: boolean, toProtocolByte: (deg: number) => number): void {
  try {
    const armorStandType = is119 ? 2 : (mcData1211.entitiesByName['armor_stand']?.id || 2);

    // 1. Invisible Floating Armor Stand
    client.write('spawn_entity', {
      entityId: GUARDIAN_ENTITY_ID,
      objectUUID: GUARDIAN_UUID,
      type: armorStandType,
      x: GUARDIAN_POS.x,
      y: GUARDIAN_POS.y,
      z: GUARDIAN_POS.z,
      pitch: 0,
      yaw: toProtocolByte(currentGuardianYaw),
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    client.write('entity_metadata', {
      entityId: GUARDIAN_ENTITY_ID,
      metadata: [
        { key: 0, type: 0, value: 0x20 }, // Invisible
        { key: 15, type: 0, value: 0x18 }  // 0x08 noBasePlate | 0x10 isMarker (no hitbox)
      ]
    });

    // 2. Head Equipment: Custom Nature Spirit Skull
    const headItem = createGuardianHeadItem(is119);
    client.write('entity_equipment', {
      entityId: GUARDIAN_ENTITY_ID,
      equipments: [
        {
          slot: 5, // 5 = Helmet / Head slot in Minecraft
          item: headItem
        }
      ]
    });

    // 3. Floating Hologram Line 1: §a§lREGROWTH GUARDIAN
    client.write('spawn_entity', {
      entityId: GUARDIAN_HOLO_TITLE_ID,
      objectUUID: GUARDIAN_HOLO_TITLE_UUID,
      type: armorStandType,
      x: GUARDIAN_POS.x,
      y: GUARDIAN_POS.y + 2.35,
      z: GUARDIAN_POS.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    client.write('entity_metadata', {
      entityId: GUARDIAN_HOLO_TITLE_ID,
      metadata: [
        { key: 0, type: 0, value: 0x20 }, // Invisible
        { key: 2, type: 5, value: JSON.stringify({ text: '§a§lREGROWTH GUARDIAN' }) },
        { key: 3, type: 7, value: true }, // CustomNameVisible
        { key: 15, type: 0, value: 0x11 } // Small & Marker
      ]
    });

    // 4. Floating Hologram Line 2: §e§l✦ HARVEST SPIRIT ✦
    client.write('spawn_entity', {
      entityId: GUARDIAN_HOLO_SUB_ID,
      objectUUID: GUARDIAN_HOLO_SUB_UUID,
      type: armorStandType,
      x: GUARDIAN_POS.x,
      y: GUARDIAN_POS.y + 2.05,
      z: GUARDIAN_POS.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    client.write('entity_metadata', {
      entityId: GUARDIAN_HOLO_SUB_ID,
      metadata: [
        { key: 0, type: 0, value: 0x20 },
        { key: 2, type: 5, value: JSON.stringify({ text: '§e§l✦ PROTECTOR OF THE CROPS ✦' }) },
        { key: 3, type: 7, value: true },
        { key: 15, type: 0, value: 0x11 }
      ]
    });
  } catch (_) {}
}

/**
 * Ticks Guardian head rotation (smoothly rotates yaw += 3° per tick)
 */
export function tickCropGuardian(players: Map<any, any>, toProtocolByte: (deg: number) => number): void {
  currentGuardianYaw = (currentGuardianYaw + 3) % 360;
  const yawByte = toProtocolByte(currentGuardianYaw);

  for (const [_, p] of players) {
    if (!p.client) continue;
    try {
      p.client.write('entity_head_rotation', {
        entityId: GUARDIAN_ENTITY_ID,
        headYaw: yawByte
      });
      p.client.write('entity_look', {
        entityId: GUARDIAN_ENTITY_ID,
        yaw: yawByte,
        pitch: 0,
        onGround: false
      });
    } catch (_) {}
  }
}

/**
 * Distributes items to player inventory:
 * 1. Stacks into existing inventory slots with count < 64 (hotbar 36..43, main inv 9..35, skipping slot 44 Nether Star).
 * 2. Places into empty slots (36..43, then 9..35).
 * 3. Physical ground drop fallback if all existing slots are capped and 0 empty slots remain.
 */
function distributeItem(
  pData: any,
  server: any,
  itemName: string,
  totalCount: number,
  blockPos: { x: number; y: number; z: number }
): void {
  if (totalCount <= 0) return;
  const is119 = pData.is119;
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.itemsByName[itemName] || mcData.blocksByName[itemName];
  if (!itemDef) return;
  const maxStack = itemDef.stackSize || 64;

  let remaining = totalCount;

  // Search order: Hotbar (36 to 43, skipping 44), then Main Inventory (9 to 35)
  const slotOrder: number[] = [];
  for (let s = 36; s <= 43; s++) slotOrder.push(s);
  for (let s = 9; s <= 35; s++) slotOrder.push(s);

  // Pass 1: Add to existing matching stacks < maxStack (excluding custom SkyBlock items)
  for (const slot of slotOrder) {
    if (remaining <= 0) break;
    const existing = pData.inventory.get(slot);
    if (existing && !isSkyBlockItemStack(existing) && existing.name === itemName && existing.count < maxStack) {
      const space = maxStack - existing.count;
      const toAdd = Math.min(space, remaining);
      existing.count += toAdd;
      remaining -= toAdd;
      existing.itemId = itemDef.id;

      const tagged = tagVanillaItemStack({
        present: true,
        itemId: itemDef.id,
        itemCount: existing.count,
        nbtData: existing.nbtData
      }, is119);
      existing.nbtData = tagged.nbtData;

      try {
        pData.client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot,
          item: formatSlotForClient(tagged, is119)
        });
      } catch (_) {}
    }
  }

  // Pass 2: Place into empty slots
  if (remaining > 0) {
    for (const slot of slotOrder) {
      if (remaining <= 0) break;
      if (!pData.inventory.has(slot)) {
        const toPut = Math.min(maxStack, remaining);
        remaining -= toPut;

        const rawStack = {
          present: true,
          itemId: itemDef.id,
          itemCount: toPut
        };
        const tagged = tagVanillaItemStack(rawStack, is119);

        pData.inventory.set(slot, {
          slot,
          name: itemName,
          itemId: itemDef.id,
          count: toPut,
          nbtData: tagged.nbtData
        });

        try {
          pData.client.write('set_slot', {
            windowId: 0,
            stateId: 1,
            slot,
            item: formatSlotForClient(tagged, is119)
          });
        } catch (_) {}
      }
    }
  }

  // Pass 3: Ground fallback if still remaining
  if (remaining > 0) {
    server.spawnDroppedItem(itemName, remaining, blockPos.x, blockPos.y, blockPos.z);
  }
}

/**
 * Handles Hub crop harvesting, drop distribution, beam cast, and instant regrowth
 */
export function handleHubCropHarvest(
  server: any,
  pData: any,
  x: number,
  y: number,
  z: number,
  rawCropName: string,
  sequence?: number
): void {
  const cropName = rawCropName.replace('minecraft:', '').toLowerCase();
  if (!HARVESTABLE_CROPS.has(cropName)) return;

  const locKey = `${x},${y},${z}`;
  const now = Date.now();
  if (now - (recentHarvests.get(locKey) || 0) < 200) {
    // Cooldown active: acknowledge and silently reset
    if (typeof sequence === 'number') {
      try { pData.client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
    }
    const fullyGrown = FULLY_GROWN_CROP_STATES[cropName];
    if (fullyGrown) {
      try {
        pData.client.write('block_change', {
          location: { x, y, z },
          type: pData.is119 ? fullyGrown.state119 : fullyGrown.state121
        });
      } catch (_) {}
    }
    return;
  }
  recentHarvests.set(locKey, now);

  // Clean old cooldown entries periodically
  if (recentHarvests.size > 200) {
    for (const [k, ts] of recentHarvests) {
      if (now - ts > 1000) recentHarvests.delete(k);
    }
  }

  // 1. Farming Fortune calculation
  const fortune = pData.stats?.farmingFortune || 0;
  const fortuneMult = calculateFortuneMultiplier(fortune);

  // 2. Randomized Drop Tables
  let primaryItem = '';
  let primaryCount = 0;
  let secondaryItem: string | null = null;
  let secondaryCount = 0;
  let displayCropName = '';

  if (cropName === 'wheat') {
    primaryItem = 'wheat';
    primaryCount = 1 * fortuneMult;
    secondaryItem = 'wheat_seeds';
    secondaryCount = Math.floor(Math.random() * 2) + 1; // 1 to 2x wheat seeds
    displayCropName = 'Wheat';
  } else if (cropName === 'carrots') {
    primaryItem = 'carrot';
    const base = Math.floor(Math.random() * 3) + 2; // 2 to 4x carrots
    primaryCount = base * fortuneMult;
    displayCropName = 'Carrot';
  } else if (cropName === 'potatoes') {
    primaryItem = 'potato';
    const base = Math.floor(Math.random() * 3) + 2; // 2 to 4x potatoes
    primaryCount = base * fortuneMult;
    displayCropName = 'Potato';
    if (Math.random() < 0.02) {
      secondaryItem = 'poisonous_potato';
      secondaryCount = 1;
    }
  } else if (cropName === 'nether_wart') {
    primaryItem = 'nether_wart';
    const base = Math.floor(Math.random() * 3) + 2; // 2 to 4x nether wart
    primaryCount = base * fortuneMult;
    displayCropName = 'Nether Wart';
  }

  // 3. Inventory Distribution
  const blockPos = { x, y, z };
  distributeItem(pData, server, primaryItem, primaryCount, blockPos);
  if (secondaryItem && secondaryCount > 0) {
    distributeItem(pData, server, secondaryItem, secondaryCount, blockPos);
  }

  // 4. Pickup sound & Action Bar notice
  try {
    pData.client.write('named_sound_effect', {
      soundName: 'entity.item.pickup',
      soundCategory: 0,
      x: Math.floor(pData.x * 8),
      y: Math.floor(pData.y * 8),
      z: Math.floor(pData.z * 8),
      volume: 0.8,
      pitch: 1.2,
      seed: [0, 0]
    });
  } catch (_) {}

  showActionBarMessage(pData, `§a+${primaryCount} ${displayCropName} §8(Farming)`, 1500);

  // 5. Acknowledge digging to prevent client-side ghost breaking
  if (typeof sequence === 'number') {
    try { pData.client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
  }

  // 6. Cast White Particle Beam & Bonemeal Chime & Instant Regrowth
  castRegrowthBeamAndRestore(server, x, y, z, cropName);
}

/**
 * Casts a white particle beam from Guardian head to crop,
 * bursts green bonemeal particles, plays chime sound,
 * and broadcasts 100% fully grown block_change.
 */
function castRegrowthBeamAndRestore(
  server: any,
  cropX: number,
  cropY: number,
  cropZ: number,
  cropName: string
): void {
  const headPos = {
    x: GUARDIAN_POS.x,
    y: GUARDIAN_POS.y + 1.8,
    z: GUARDIAN_POS.z
  };

  const targetPos = {
    x: cropX + 0.5,
    y: cropY + 0.5,
    z: cropZ + 0.5
  };

  const dx = targetPos.x - headPos.x;
  const dy = targetPos.y - headPos.y;
  const dz = targetPos.z - headPos.z;
  const dist = Math.hypot(dx, dy, dz);

  // Density: sample points every ~0.5 blocks along the 3D ray (max 45 steps)
  const steps = Math.min(45, Math.max(6, Math.ceil(dist / 0.5)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const stepZ = dz / steps;

  const beamPoints: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= steps; i++) {
    beamPoints.push({
      x: headPos.x + stepX * i,
      y: headPos.y + stepY * i,
      z: headPos.z + stepZ * i
    });
  }

  const fullyGrown = FULLY_GROWN_CROP_STATES[cropName];

  for (const [_, p] of players) {
    if (!p.client) continue;
    const is119 = p.is119;
    const pDist = Math.hypot((p.x || 0) - cropX, (p.z || 0) - cropZ);
    if (pDist > 128.0) continue;

    // 1. Particle Beam (end_rod)
    for (const pt of beamPoints) {
      try {
        if (is119) {
          p.client.write('world_particles', {
            particleId: 20, // end_rod
            longDistance: true,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            offsetX: 0.04,
            offsetY: 0.04,
            offsetZ: 0.04,
            particleData: 0,
            particles: 1
          });
        } else {
          p.client.write('world_particles', {
            longDistance: true,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            offsetX: 0.04,
            offsetY: 0.04,
            offsetZ: 0.04,
            velocityOffset: 0,
            amount: 1,
            particle: { type: 'end_rod' }
          });
        }
      } catch (_) {}
    }

    // 2. Green Bonemeal Sparkles (happy_villager) at crop
    try {
      if (is119) {
        p.client.write('world_particles', {
          particleId: 35, // happy_villager
          longDistance: true,
          x: targetPos.x,
          y: targetPos.y + 0.25,
          z: targetPos.z,
          offsetX: 0.35,
          offsetY: 0.35,
          offsetZ: 0.35,
          particleData: 0,
          particles: 14
        });
      } else {
        p.client.write('world_particles', {
          longDistance: true,
          x: targetPos.x,
          y: targetPos.y + 0.25,
          z: targetPos.z,
          offsetX: 0.35,
          offsetY: 0.35,
          offsetZ: 0.35,
          velocityOffset: 0,
          amount: 14,
          particle: { type: 'happy_villager' }
        });
      }
    } catch (_) {}

    // 3. Magical Chime Sound (item.bone_meal.use)
    try {
      p.client.write('named_sound_effect', {
        soundName: 'item.bone_meal.use',
        soundCategory: 0,
        x: Math.floor(cropX * 8),
        y: Math.floor(cropY * 8),
        z: Math.floor(cropZ * 8),
        volume: 1.0,
        pitch: 1.25,
        seed: [0, 0]
      });
    } catch (_) {}

    // 4. Instantly restore crop to 100% fully grown state
    if (fullyGrown) {
      try {
        p.client.write('block_change', {
          location: { x: cropX, y: cropY, z: cropZ },
          type: is119 ? fullyGrown.state119 : fullyGrown.state121
        });
      } catch (_) {}
    }
  }

  // Update Hub chunk memory so subsequent queries reflect 100% fully grown crop
  if (fullyGrown) {
    setHubBlockStateId(cropX, cropY, cropZ, fullyGrown.state119, fullyGrown.state121);
  }
}
