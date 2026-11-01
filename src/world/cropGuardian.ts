/**
 * ZylarPixel Hub Crop Harvesting & Magical Regrowth Guardian System
 * 
 * Features:
 * - 4 Harvestable Crops: Wheat, Carrots, Potatoes, Nether Wart.
 * - 5x5 Hub Wheat Minion Exclusion Zone (X: 45..49, Y: 70, Z: -139..-135): 100% unbreakable, silent cancel with dull thud, 0 drops.
 * - Randomized Authentic Drops:
 *   - Wheat: 1 to 2 base Wheat (50% chance for 2) + 1 to 2 Wheat Seeds
 *   - Carrots: 2 to 4 base Carrots
 *   - Potatoes: 2 to 4 base Potatoes + 2% rare chance for Poisonous Potato (§b§lRARE DROP! §fPoisonous Potato with pitch 2.0 ding)
 *   - Nether Wart: 2 to 4 base Nether Wart
 *   - Scaled proportionally by Farming Fortune (+100 Fortune = +100% extra drops).
 * - Physical Ground Drops (NO Auto-Pickup):
 *   - Pop onto the ground as physical 3D bouncing items (velocityY: 0.2, spread ~0.1).
 *   - Strictly private anti-theft (tracked by owner: pData.username).
 *   - Vacuum radius 1.8 blocks, 300s (5-min) despawn timer.
 *   - If inventory 100% full, displays big red screen title §c§lINVENTORY FULL (20s cooldown).
 * - 10 Dedicated Protectors (Guardians):
 *   - Small Invisible Marker Armor Stands wearing Golden Sun / Star Orb custom player skulls.
 *   - Zero corny holograms or floating nametags.
 *   - Continuous 24/7 horizontal 360° spinning (yaw += 3°/tick) and 1.5s sinusoidal vertical bobbing (Y += Math.sin(t) * 0.2).
 *   - Independent sequential 1-by-1 FIFO queues.
 *   - 0.8-second continuous white end_rod laser beam ray while head continues spinning.
 *   - Green happy_villager bonemeal sparkles + item.bone_meal.use sound + instant 100% regrowth.
 * - Hydrated Farmland (farmland[moisture=7]) & Trample Auto-Repair.
 */

import { mcData1192, mcData1211 } from './worldManager';
import { tagVanillaItemStack, formatSlotForClient } from '../items/engine/itemBuilder';
import { setHubBlockStateId } from './hubRegionProvider';
import { players } from '../players/playerManager';

// Authentic Golden Sun / Star Orb custom skull texture from Minecraft-Heads (used widely across Hypixel)
export const SUN_SKULL_TEXTURE = 'eyJ0ZXh0dXJlcyI6eyJTS0lOIjp7InVybCI6Imh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvYmYwZWU2NDdhNjIxMWU1YzJmODE2MTZhNTk3N2E2NTg1MWU0ZGI3ODM0Y2Y0NTAxMjQ2ZGU2YjM5YWRhMzI5MSJ9fX0=';

// 4-integer array UUID representing the Golden Sun Skull
const SUN_SKULL_UUID = 'bf0ee647-a621-1e5c-2f81-616a5977a658';
const uuidClean = SUN_SKULL_UUID.replace(/-/g, '');
const SUN_SKULL_INT_UUID = [
  parseInt(uuidClean.substring(0, 8), 16) | 0,
  parseInt(uuidClean.substring(8, 16), 16) | 0,
  parseInt(uuidClean.substring(16, 24), 16) | 0,
  parseInt(uuidClean.substring(24, 32), 16) | 0
];

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

// Hydrated moist farmland (moisture=7)
export const FARMLAND_MOISTURE_7 = { state119: 3627, state121: 4293 };

/**
 * 5x5 Hub Wheat Minion Exclusion Zone (X: 45..49, Y: 70, Z: -139..-135)
 * 100% Unbreakable; punches cancel silently with a dull thud sound and give 0 drops.
 */
export function isHubMinionExclusionZone(x: number, y: number, z: number): boolean {
  return x >= 45 && x <= 49 && y === 70 && z >= -139 && z <= -135;
}

export interface CropRegrowthTask {
  x: number;
  y: number;
  z: number;
  cropName: string;
  isTrampledFarmland?: boolean;
}

export interface CropProtector {
  id: number;
  uuid: string;
  name: string;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  basePos: { x: number; y: number; z: number };
  currentY: number;
  yaw: number;
  queue: CropRegrowthTask[];
  currentTask: CropRegrowthTask | null;
  taskStartTime: number;
  taskEndTime: number;
}

/**
 * The 10 Dedicated Protectors (Guardians) covering every crop territory in the Hub
 */
export const CROP_PROTECTORS: CropProtector[] = [
  // 1. Main Lower Wheat Valley (659 blocks - moved away from 5x5 minion road to true farmable center)
  {
    id: 8801,
    uuid: '7c72f1a1-8801-4b10-8877-e1a3fc82e38f',
    name: 'Main Lower Wheat Valley',
    bounds: { minX: 18, maxX: 71, minY: 68, maxY: 74, minZ: -154, maxZ: -119 },
    basePos: { x: 30.5, y: 72.8, z: -136.5 },
    currentY: 72.8,
    yaw: 0,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 2. Upper Wheat Terrace (186 blocks)
  {
    id: 8802,
    uuid: '7c72f1a2-8802-4b10-8877-e1a3fc82e38f',
    name: 'Upper Wheat Terrace',
    bounds: { minX: 65, maxX: 85, minY: 70, maxY: 76, minZ: -169, maxZ: -154 },
    basePos: { x: 73.0, y: 74.8, z: -161.0 },
    currentY: 74.8,
    yaw: 36,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 3. Windmill Circular Wheat Patch (145 blocks - Image 2)
  {
    id: 8803,
    uuid: '7c72f1a3-8803-4b10-8877-e1a3fc82e38f',
    name: 'Windmill Circular Wheat Patch',
    bounds: { minX: 53, maxX: 67, minY: 70, maxY: 76, minZ: -192, maxZ: -175 },
    basePos: { x: 59.0, y: 74.5, z: -183.5 },
    currentY: 74.5,
    yaw: 72,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 4. Western Wheat Strip (109 blocks)
  {
    id: 8804,
    uuid: '7c72f1a4-8804-4b10-8877-e1a3fc82e38f',
    name: 'Western Wheat Strip',
    bounds: { minX: 18, maxX: 31, minY: 69, maxY: 75, minZ: -186, maxZ: -171 },
    basePos: { x: 23.5, y: 73.8, z: -178.5 },
    currentY: 73.8,
    yaw: 108,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 5. Village Sunken Garden (35 blocks - Image 3)
  {
    id: 8805,
    uuid: '7c72f1a5-8805-4b10-8877-e1a3fc82e38f',
    name: 'Village Sunken Garden',
    bounds: { minX: 35, maxX: 46, minY: 66, maxY: 72, minZ: -93, maxZ: -82 },
    basePos: { x: 42.0, y: 71.5, z: -89.0 },
    currentY: 71.5,
    yaw: 144,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 6. Village Path Garden (Square patch in Image 1)
  {
    id: 8806,
    uuid: '7c72f1a6-8806-4b10-8877-e1a3fc82e38f',
    name: 'Village Path Garden',
    bounds: { minX: 45, maxX: 53, minY: 68, maxY: 74, minZ: -103, maxZ: -94 },
    basePos: { x: 48.5, y: 72.8, z: -97.5 },
    currentY: 72.8,
    yaw: 180,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 7. Carrot Garden (92 blocks)
  {
    id: 8807,
    uuid: '7c72f1a7-8807-4b10-8877-e1a3fc82e38f',
    name: 'Carrot Garden',
    bounds: { minX: -46, maxX: 0, minY: 67, maxY: 74, minZ: 3, maxZ: 38 },
    basePos: { x: -12.5, y: 72.5, z: 21.0 },
    currentY: 72.5,
    yaw: 216,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 8. Large Barn Potato Plot (52 blocks)
  {
    id: 8808,
    uuid: '7c72f1a8-8808-4b10-8877-e1a3fc82e38f',
    name: 'Large Barn Potato Plot',
    bounds: { minX: 80, maxX: 95, minY: 68, maxY: 75, minZ: -105, maxZ: -90 },
    basePos: { x: 87.0, y: 72.8, z: -97.0 },
    currentY: 72.8,
    yaw: 252,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 9. Village Potato Garden by Hay Bales (Image 4)
  {
    id: 8809,
    uuid: '7c72f1a9-8809-4b10-8877-e1a3fc82e38f',
    name: 'Village Potato Garden (Hay Bales)',
    bounds: { minX: 16, maxX: 32, minY: 67, maxY: 73, minZ: -89, maxZ: -57 },
    basePos: { x: 26.5, y: 71.8, z: -85.0 },
    currentY: 71.8,
    yaw: 288,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  },
  // 10. Alchemist's Lab Nether Wart Garden (130 blocks - Image 5)
  {
    id: 8810,
    uuid: '7c72f1aa-8810-4b10-8877-e1a3fc82e38f',
    name: 'Alchemist Lab Nether Wart Garden',
    bounds: { minX: 28, maxX: 58, minY: 66, maxY: 73, minZ: -76, maxZ: -58 },
    basePos: { x: 41.5, y: 70.8, z: -66.5 },
    currentY: 70.8,
    yaw: 324,
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  }
];
    queue: [],
    currentTask: null,
    taskStartTime: 0,
    taskEndTime: 0
  }
];

/**
 * Finds the appropriate Protector for a broken crop coordinate
 */
export function getProtectorForCrop(x: number, y: number, z: number, rawCropName?: string): CropProtector {
  const cleanCrop = rawCropName ? rawCropName.replace('minecraft:', '').toLowerCase() : '';

  // 1. Direct Crop Type Prioritization
  if (cleanCrop === 'nether_wart') {
    return CROP_PROTECTORS[9]; // ID 8810 (Alchemist Lab)
  }
  if (cleanCrop === 'carrot' || cleanCrop === 'carrots') {
    return CROP_PROTECTORS[6]; // ID 8807
  }
  if (cleanCrop === 'potato' || cleanCrop === 'potatoes') {
    return (x > 50) ? CROP_PROTECTORS[7] : CROP_PROTECTORS[8]; // ID 8808 vs ID 8809
  }

  // 2. Specific Enclosed Gardens First
  const priorityOrder = [9, 8, 4, 5, 1, 2, 3, 0, 7, 6];
  for (const idx of priorityOrder) {
    const protector = CROP_PROTECTORS[idx];
    const b = protector.bounds;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) {
      return protector;
    }
  }

  // 3. Fallback: Closest protector by 2D horizontal distance
  let closest = CROP_PROTECTORS[0];
  let minD = Infinity;
  for (const p of CROP_PROTECTORS) {
    const d = Math.hypot(x - p.basePos.x, z - p.basePos.z);
    if (d < minD) {
      minD = d;
      closest = p;
    }
  }
  return closest;
}

// Cooldown tracker per block coordinate to prevent autoclicker / packet flood double-drops
const recentHarvests = new Map<string, number>();

/**
 * Calculates drop multiplier based on Farming Fortune:
 * +100 Fortune = guaranteed +100% extra drop (+1 multiplier).
 * Partial remainder is rolled as a percentage chance.
 */
export function calculateFortuneMultiplier(fortune: number = 0): number {
  const safe = Math.max(0, fortune);
  const guaranteed = 1 + Math.floor(safe / 100);
  const remainder = safe % 100;
  const extra = (Math.random() * 100 < remainder) ? 1 : 0;
  return guaranteed + extra;
}

/**
 * Creates authentic Golden Sun player skull item with proper 4-integer array UUID
 */
function createGoldenSunSkullItem(is119: boolean): any {
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
              Id: { type: 'intArray', value: SUN_SKULL_INT_UUID },
              Name: { type: 'string', value: 'SunGuardian' },
              Properties: {
                type: 'compound',
                value: {
                  textures: {
                    type: 'list',
                    value: {
                      type: 'compound',
                      value: [
                        { Value: { type: 'string', value: SUN_SKULL_TEXTURE } }
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
    // 1.21.1 Profile Component
    return {
      itemCount: 1,
      itemId,
      addedComponentCount: 1,
      removedComponentCount: 0,
      components: [
        {
          type: 'profile',
          data: {
            name: 'SunGuardian',
            id: SUN_SKULL_INT_UUID,
            properties: [
              {
                name: 'textures',
                value: SUN_SKULL_TEXTURE,
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
 * Spawns a single Protector entity with its custom Golden Sun skull for a client
 */
export function spawnSingleProtector(
  client: any,
  is119: boolean,
  protector: CropProtector,
  toProtocolByte: (deg: number) => number
): void {
  try {
    const armorStandType = is119 ? 2 : (mcData1211.entitiesByName['armor_stand']?.id || 2);
    const headItem = createGoldenSunSkullItem(is119);

    // 1. Invisible Small Marker Armor Stand
    client.write('spawn_entity', {
      entityId: protector.id,
      objectUUID: protector.uuid,
      type: armorStandType,
      x: protector.basePos.x,
      y: protector.currentY,
      z: protector.basePos.z,
      pitch: 0,
      yaw: toProtocolByte(protector.yaw),
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    // Metadata: 0x20 Invisible, 0x19 Small + Marker + NoBasePlate
    client.write('entity_metadata', {
      entityId: protector.id,
      metadata: [
        { key: 0, type: 0, value: 0x20 },
        { key: 15, type: 0, value: 0x19 }
      ]
    });

    // 2. Equip Golden Sun Skull on Helmet (slot 5)
    client.write('entity_equipment', {
      entityId: protector.id,
      equipments: [
        {
          slot: 5,
          item: headItem
        }
      ]
    });
  } catch (_) {}
}

/**
 * Spawns all Crop Guardians for a newly joined Hub player.
 */
export function spawnCropGuardians(client: any, is119: boolean, toProtocolByte: (deg: number) => number): void {
  for (const protector of CROP_PROTECTORS) {
    spawnSingleProtector(client, is119, protector, toProtocolByte);
  }
}

/**
 * 24/7 Ticker for all 10 Crop Guardians:
 * - Rotates yaw 360° continuously (yaw += 3° per tick).
 * - Smooth vertical sinusoidal bobbing (Y += Math.sin(t) * 0.2) on a 1.5-second cycle.
 * - Dynamic 85-block range tracking: smoothly spawns and despawns protectors as players explore the Hub.
 * - Head continues spinning smoothly even while firing the regrowth laser beam!
 * - Independent sequential 1-by-1 FIFO queues with 0.8s continuous laser ray.
 */
export function tickCropGuardians(
  server: any,
  playerMap: Map<any, any>,
  toProtocolByte: (deg: number) => number
): void {
  const now = Date.now();
  // Fast 1.5-second sinusoidal bobbing cycle (±0.2 blocks)
  const bobOffset = Math.sin((now / 1500) * Math.PI * 2) * 0.2;

  for (const protector of CROP_PROTECTORS) {
    // 1. Continuous 24/7 Animation
    protector.yaw = (protector.yaw + 3) % 360;
    protector.currentY = protector.basePos.y + bobOffset;
    const yawByte = toProtocolByte(protector.yaw);

    // Broadcast smooth head rotation, vertical hover bobbing, and dynamic range tracking
    for (const [_, p] of playerMap) {
      if (!p.client) continue;
      p._spawnedProtectors = p._spawnedProtectors || new Set<number>();
      const dist = Math.hypot((p.x || 0) - protector.basePos.x, (p.z || 0) - protector.basePos.z);

      // Within tracking range (85 blocks):
      if (dist <= 85.0) {
        if (!p._spawnedProtectors.has(protector.id)) {
          spawnSingleProtector(p.client, p.is119, protector, toProtocolByte);
          p._spawnedProtectors.add(protector.id);
        }

        try {
          p.client.write('entity_teleport', {
            entityId: protector.id,
            x: protector.basePos.x,
            y: protector.currentY,
            z: protector.basePos.z,
            yaw: yawByte,
            pitch: 0,
            onGround: false
          });
          p.client.write('entity_head_rotation', {
            entityId: protector.id,
            headYaw: yawByte
          });
        } catch (_) {}
      } else if (dist > 105.0) {
        if (p._spawnedProtectors.has(protector.id)) {
          try {
            p.client.write('entity_destroy', {
              entityIds: [protector.id]
            });
          } catch (_) {}
          p._spawnedProtectors.delete(protector.id);
        }
      }
    }

    // 2. Sequential 1-by-1 FIFO Regrowth Queue Processing
    if (protector.currentTask) {
      const task = protector.currentTask;

      // Check if beam cycle (0.8s = 800ms) has completed
      if (now >= protector.taskEndTime) {
        // Impact & Complete Regrowth!
        completeCropRegrowth(playerMap, task);
        protector.currentTask = null;
      } else {
        // While active: Render continuous solid white end_rod laser beam from head to soil
        renderRegrowthLaserBeam(playerMap, protector, task);
      }
    } else if (protector.queue.length > 0) {
      // Pop the next task in FIFO order
      const nextTask = protector.queue.shift()!;
      protector.currentTask = nextTask;
      protector.taskStartTime = now;
      protector.taskEndTime = now + 800; // 0.8-second continuous beam hold
    }
  }
}

/**
 * Renders the continuous white end_rod laser ray from Guardian head to target soil
 */
function renderRegrowthLaserBeam(
  playerMap: Map<any, any>,
  protector: CropProtector,
  task: CropRegrowthTask
): void {
  // Head origin (small armor stand head center)
  const headX = protector.basePos.x;
  const headY = protector.currentY + 0.7;
  const headZ = protector.basePos.z;

  const targetX = task.x + 0.5;
  const targetY = task.y + 0.5;
  const targetZ = task.z + 0.5;

  const dx = targetX - headX;
  const dy = targetY - headY;
  const dz = targetZ - headZ;
  const dist = Math.hypot(dx, dy, dz);

  // Density: sample points every ~0.4 blocks
  const steps = Math.min(60, Math.max(6, Math.ceil(dist / 0.4)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const stepZ = dz / steps;

  const beamPoints: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= steps; i++) {
    beamPoints.push({
      x: headX + stepX * i,
      y: headY + stepY * i,
      z: headZ + stepZ * i
    });
  }

  // Record live telemetry for external diagnostics
  guardianTelemetry.lastBeam = {
    protectorId: protector.id,
    protectorName: protector.name,
    headOrigin: { x: Number(headX.toFixed(4)), y: Number(headY.toFixed(4)), z: Number(headZ.toFixed(4)) },
    soilTarget: { x: targetX, y: targetY, z: targetZ },
    delta: { dx: Number(dx.toFixed(4)), dy: Number(dy.toFixed(4)), dz: Number(dz.toFixed(4)) },
    distance: Number(dist.toFixed(4)),
    steps,
    sampleNodes: beamPoints.map(p => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)), z: Number(p.z.toFixed(4)) })),
    particleId: 20,
    particleName: 'minecraft:end_rod',
    timestamp: Date.now()
  };
  guardianTelemetry.stats.totalBeamsFired++;

  for (const [_, p] of playerMap) {
    if (!p.client) continue;
    const pDist = Math.hypot((p.x || 0) - task.x, (p.z || 0) - task.z);
    if (pDist > 96.0) continue;

    const is119 = p.is119;
    for (const pt of beamPoints) {
      try {
        if (is119) {
          p.client.write('world_particles', {
            particleId: 20, // end_rod
            longDistance: true,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            offsetX: 0.02,
            offsetY: 0.02,
            offsetZ: 0.02,
            particleData: 0,
            particles: 1
          });
        } else {
          p.client.write('world_particles', {
            longDistance: true,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            offsetX: 0.02,
            offsetY: 0.02,
            offsetZ: 0.02,
            velocityOffset: 0,
            amount: 1,
            particle: { type: 'end_rod' }
          });
        }
      } catch (_) {}
    }
  }
}

/**
 * Completes crop regrowth on laser impact:
 * 1. Green bonemeal sparkles (happy_villager)
 * 2. Crisp chime sound (item.bone_meal.use)
 * 3. Instant 100% fully grown crop block_change
 * 4. Farmland moisture hydration
 */
function completeCropRegrowth(
  playerMap: Map<any, any>,
  task: CropRegrowthTask
): void {
  const { x, y, z, cropName, isTrampledFarmland } = task;
  const fullyGrown = FULLY_GROWN_CROP_STATES[cropName];

  for (const [_, p] of playerMap) {
    if (!p.client) continue;
    const pDist = Math.hypot((p.x || 0) - x, (p.z || 0) - z);
    if (pDist > 96.0) continue;

    const is119 = p.is119;

    // 1. Green Bonemeal Sparkles (happy_villager)
    try {
      if (is119) {
        p.client.write('world_particles', {
          particleId: 35, // happy_villager
          longDistance: true,
          x: x + 0.5,
          y: y + 0.35,
          z: z + 0.5,
          offsetX: 0.35,
          offsetY: 0.35,
          offsetZ: 0.35,
          particleData: 0,
          particles: 14
        });
      } else {
        p.client.write('world_particles', {
          longDistance: true,
          x: x + 0.5,
          y: y + 0.35,
          z: z + 0.5,
          offsetX: 0.35,
          offsetY: 0.35,
          offsetZ: 0.35,
          velocityOffset: 0,
          amount: 14,
          particle: { type: 'happy_villager' }
        });
      }
    } catch (_) {}

    // 2. Crisp Fertilizer Chime Sound (item.bone_meal.use)
    try {
      p.client.write('named_sound_effect', {
        soundName: 'item.bone_meal.use',
        soundCategory: 0,
        x: Math.floor(x * 8),
        y: Math.floor(y * 8),
        z: Math.floor(z * 8),
        volume: 1.0,
        pitch: 1.25,
        seed: [0, 0]
      });
    } catch (_) {}

    // 3. Hydrate farmland underneath if not nether_wart
    if (cropName !== 'nether_wart') {
      try {
        p.client.write('block_change', {
          location: { x, y: y - 1, z },
          type: is119 ? FARMLAND_MOISTURE_7.state119 : FARMLAND_MOISTURE_7.state121
        });
      } catch (_) {}
    }

    // 4. Instantly restore crop to 100% fully grown state
    if (fullyGrown) {
      try {
        p.client.write('block_change', {
          location: { x, y, z },
          type: is119 ? fullyGrown.state119 : fullyGrown.state121
        });
      } catch (_) {}
    }
  }

  // Update Hub chunk memory
  if (cropName !== 'nether_wart') {
    setHubBlockStateId(x, y - 1, z, FARMLAND_MOISTURE_7.state119, FARMLAND_MOISTURE_7.state121);
  }
  if (fullyGrown) {
    setHubBlockStateId(x, y, z, fullyGrown.state119, fullyGrown.state121);
  }
}

/**
 * Handles Hub crop harvesting:
 * - Checks 5x5 Minion zone (unbreakable, silent cancel, 0 drops)
 * - Plays crisp crop break sound
 * - Calculates drops scaled by Farming Fortune
 * - Drops physical bouncing items on the ground with owner: pData.username (Anti-theft!)
 * - Shows bare moist farmland temporarily
 * - Enqueues block into territory Protector's sequential FIFO queue
 * - Completely silent on screen (no action bar spam)
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

  // 1. Check 5x5 Hub Wheat Minion Exclusion Zone
  if (isHubMinionExclusionZone(x, y, z)) {
    // Record Minion rejection telemetry
    guardianTelemetry.lastMinionCancel = {
      player: pData.username,
      coords: { x, y, z },
      timestamp: Date.now(),
      sound: 'block.wood.hit',
      cancelled: true
    };
    guardianTelemetry.stats.totalMinionBlocksBlocked++;

    // Cancel silently with a dull thud sound and keep wheat intact (zero drops)
    try {
      pData.client.write('named_sound_effect', {
        soundName: 'block.wood.hit',
        soundCategory: 0,
        x: Math.floor(x * 8),
        y: Math.floor(y * 8),
        z: Math.floor(z * 8),
        volume: 0.8,
        pitch: 0.8,
        seed: [0, 0]
      });
    } catch (_) {}

    if (typeof sequence === 'number') {
      try { pData.client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
    }
    const fullyGrown = FULLY_GROWN_CROP_STATES['wheat'];
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

  // 2. Cooldown check per block coordinate
  const locKey = `${x},${y},${z}`;
  const now = Date.now();
  if (now - (recentHarvests.get(locKey) || 0) < 150) {
    if (typeof sequence === 'number') {
      try { pData.client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
    }
    return;
  }
  recentHarvests.set(locKey, now);

  if (recentHarvests.size > 200) {
    for (const [k, ts] of recentHarvests) {
      if (now - ts > 1000) recentHarvests.delete(k);
    }
  }

  // 3. Play crisp crop break crunch sound
  try {
    pData.client.write('named_sound_effect', {
      soundName: 'block.crop.break',
      soundCategory: 0,
      x: Math.floor(x * 8),
      y: Math.floor(y * 8),
      z: Math.floor(z * 8),
      volume: 1.0,
      pitch: 1.0,
      seed: [0, 0]
    });
  } catch (_) {}

  // 4. Drop table calculation scaled by Farming Fortune
  const fortune = pData.stats?.farmingFortune || 0;
  const fortuneMult = calculateFortuneMultiplier(fortune);

  let primaryItem = '';
  let primaryCount = 0;
  let secondaryItem: string | null = null;
  let secondaryCount = 0;

  if (cropName === 'wheat') {
    primaryItem = 'wheat';
    // 1 to 2 base Wheat (50% chance for 2)
    const base = Math.random() < 0.5 ? 2 : 1;
    primaryCount = base * fortuneMult;

    // 1 to 2 Wheat Seeds (scaled proportionally by Fortune)
    secondaryItem = 'wheat_seeds';
    const baseSeeds = Math.floor(Math.random() * 2) + 1;
    secondaryCount = baseSeeds * fortuneMult;
  } else if (cropName === 'carrots') {
    primaryItem = 'carrot';
    // 2 to 4 base Carrots
    const base = Math.floor(Math.random() * 3) + 2;
    primaryCount = base * fortuneMult;
  } else if (cropName === 'potatoes') {
    primaryItem = 'potato';
    // 2 to 4 base Potatoes
    const base = Math.floor(Math.random() * 3) + 2;
    primaryCount = base * fortuneMult;

    // 2% rare chance for Poisonous Potato
    if (Math.random() < 0.02) {
      secondaryItem = 'poisonous_potato';
      secondaryCount = 1;

      // Authentic Hypixel Aqua Blue Rare Drop alert + pitch 2.0 ding
      try {
        pData.client.write('named_sound_effect', {
          soundName: 'entity.player.levelup',
          soundCategory: 0,
          x: Math.floor(pData.x * 8),
          y: Math.floor(pData.y * 8),
          z: Math.floor(pData.z * 8),
          volume: 1.0,
          pitch: 2.0,
          seed: [0, 0]
        });
      } catch (_) {}

      try {
        const { sendSystemMessage } = require('../core/chatManager');
        sendSystemMessage(pData.client, '§b§lRARE DROP! §fPoisonous Potato', pData.is119);
      } catch (_) {}
    }
  } else if (cropName === 'nether_wart') {
    primaryItem = 'nether_wart';
    // 2 to 4 base Nether Wart
    const base = Math.floor(Math.random() * 3) + 2;
    primaryCount = base * fortuneMult;
  }

  // 5. Spawn Physical Ground Drops with breaker ownership (Strict Anti-Theft!)
  if (primaryCount > 0) {
    server.spawnDroppedItem(primaryItem, primaryCount, x, y, z, pData.username);
  }
  if (secondaryItem && secondaryCount > 0) {
    server.spawnDroppedItem(secondaryItem, secondaryCount, x, y, z, pData.username);
  }

  // Record harvest telemetry
  guardianTelemetry.lastHarvest = {
    player: pData.username,
    coords: { x, y, z },
    crop: cropName,
    minionBlocked: false,
    fortune: pData.stats?.farmingFortune || 0,
    multiplier: fortuneMult,
    drops: [
      { item: primaryItem, count: primaryCount },
      ...(secondaryItem ? [{ item: secondaryItem, count: secondaryCount }] : [])
    ],
    timestamp: Date.now()
  };
  guardianTelemetry.stats.totalHarvests++;

  // 6. Set block visually to broken (bare moist Farmland underneath)
  for (const [_, observer] of players) {
    if (!observer.client) continue;
    const obsDist = Math.hypot((observer.x || 0) - x, (observer.z || 0) - z);
    if (obsDist > 96.0) continue;

    const obsIs119 = observer.is119;
    try {
      // Clear crop block to air (0)
      observer.client.write('block_change', {
        location: { x, y, z },
        type: 0
      });

      // Ensure moist farmland is visible underneath
      if (cropName !== 'nether_wart') {
        observer.client.write('block_change', {
          location: { x, y: y - 1, z },
          type: obsIs119 ? FARMLAND_MOISTURE_7.state119 : FARMLAND_MOISTURE_7.state121
        });
      }
    } catch (_) {}
  }

  // Update chunk memory temporarily to air
  setHubBlockStateId(x, y, z, 0, 0);
  if (cropName !== 'nether_wart') {
    setHubBlockStateId(x, y - 1, z, FARMLAND_MOISTURE_7.state119, FARMLAND_MOISTURE_7.state121);
  }

  // 7. Enqueue broken crop into territory Protector's FIFO queue
  const protector = getProtectorForCrop(x, y, z, cropName);
  protector.queue.push({ x, y, z, cropName });

  // 8. Acknowledge digging
  if (typeof sequence === 'number') {
    try { pData.client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
  }
}

/**
 * Live In-Memory Telemetry Recorder for External Diagnostics
 */
export const guardianTelemetry = {
  lastBeam: null as any,
  lastHarvest: null as any,
  lastMinionCancel: null as any,
  stats: {
    totalHarvests: 0,
    totalBeamsFired: 0,
    totalMinionBlocksBlocked: 0
  }
};

/**
 * Computes exact mathematical 3D ray-traced laser beam nodes between a Guardian and target soil
 */
export function computeRayTraceTelemetry(
  protector: CropProtector,
  targetX: number,
  targetY: number,
  targetZ: number
): {
  headOrigin: { x: number; y: number; z: number };
  soilTarget: { x: number; y: number; z: number };
  delta: { dx: number; dy: number; dz: number };
  distance: number;
  unitDirection: { ux: number; uy: number; uz: number };
  steps: number;
  sampleNodes: Array<{ x: number; y: number; z: number }>;
  particleId: number;
  particleName: string;
} {
  const headX = protector.basePos.x;
  const headY = protector.currentY + 0.7;
  const headZ = protector.basePos.z;

  const tx = targetX + 0.5;
  const ty = targetY + 0.5;
  const tz = targetZ + 0.5;

  const dx = tx - headX;
  const dy = ty - headY;
  const dz = tz - headZ;
  const dist = Math.hypot(dx, dy, dz);

  const steps = Math.min(60, Math.max(6, Math.ceil(dist / 0.4)));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const stepZ = dz / steps;

  const sampleNodes: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= steps; i++) {
    sampleNodes.push({
      x: Number((headX + stepX * i).toFixed(4)),
      y: Number((headY + stepY * i).toFixed(4)),
      z: Number((headZ + stepZ * i).toFixed(4))
    });
  }

  const ux = dist > 0 ? Number((dx / dist).toFixed(4)) : 0;
  const uy = dist > 0 ? Number((dy / dist).toFixed(4)) : 0;
  const uz = dist > 0 ? Number((dz / dist).toFixed(4)) : 0;

  return {
    headOrigin: { x: Number(headX.toFixed(4)), y: Number(headY.toFixed(4)), z: Number(headZ.toFixed(4)) },
    soilTarget: { x: tx, y: ty, z: tz },
    delta: { dx: Number(dx.toFixed(4)), dy: Number(dy.toFixed(4)), dz: Number(dz.toFixed(4)) },
    distance: Number(dist.toFixed(4)),
    unitDirection: { ux, uy, uz },
    steps,
    sampleNodes,
    particleId: 20,
    particleName: 'minecraft:end_rod'
  };
}
