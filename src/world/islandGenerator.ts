/**
 * ZylarPixel Procedural Multi-Island & Portal Generator
 * Generates individual private islands for players spaced across the infinite void
 * Restores each player's saved modifications from disk!
 */

import {
  setWorldBlock,
  setWorldBlockStateId,
  getWorldBlockName,
  emitLightSource,
  clearIslandChunks
} from './worldManager';
import { loadPlayerIslandModifications } from '../storage/diskStorage';

// Stone Brick Stairs & Arch State IDs in 1.19.2
// Proper Pyramid Pedestal: Climbing UP into the portal & pillars!
const STAIRS_SOUTH = 5470; // Front: lower step at North, climbs UP towards South into portal
const STAIRS_NORTH = 5450; // Back: lower step at South, climbs UP towards North into portal
const STAIRS_EAST  = 5510; // Left: lower step at West, climbs UP towards East into pillar
const STAIRS_WEST  = 5490; // Right: lower step at East, climbs UP towards West into pillar

// Connected 45-degree Outer Corner Stairs (Wrapping seamlessly around pillars)
const CORNER_FRONT_WEST = 5476; // south outer_left: high step at South-East
const CORNER_FRONT_EAST = 5478; // south outer_right: high step at South-West
const CORNER_BACK_WEST  = 5458; // north outer_right: high step at North-East
const CORNER_BACK_EAST  = 5456; // north outer_left: high step at North-West

// Hypixel Arch Header Peak Crown Slab
const STONE_BRICK_SLAB  = 9128; // bottom stone brick slab crowning center arch peak

// Track generated islands in memory
const generatedIslands = new Set<string>();

export function generatePlayerIsland(username: string, originX: number = 0, originZ: number = 0): void {
  const islandKey = `${originX},${originZ}`;
  if (generatedIslands.has(islandKey)) {
    return; // Already generated this session
  }
  generatedIslands.add(islandKey);

  console.time(`Generate Island [${username}] (${originX}, ${originZ})`);

  // ==========================================
  // A. MAIN ISLAND: Center (originX, 100, originZ)
  // ==========================================
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const dist = Math.hypot(x / 7.5, z / 7.5);
      if (dist <= 1.0) {
        const isRockOutcrop = (x <= -4 && z <= -3);
        const surfaceBlock = isRockOutcrop ? ((x + z) % 2 === 0 ? 'stone' : 'cobblestone') : 'grass_block';
        setWorldBlock(originX + x, 100, originZ + z, surfaceBlock);

        // Underside stalactite tapering into void
        const maxDepth = Math.floor((1.0 - dist) * 11) + Math.abs((x * 3 + z * 7) % 3);
        for (let y = 99; y >= 100 - maxDepth; y--) {
          if (y >= 97 && !isRockOutcrop) {
            setWorldBlock(originX + x, y, originZ + z, 'dirt');
          } else if (y % 3 === 0) {
            setWorldBlock(originX + x, y, originZ + z, 'cobblestone');
          } else if (y % 2 === 0) {
            setWorldBlock(originX + x, y, originZ + z, 'andesite');
          } else {
            setWorldBlock(originX + x, y, originZ + z, 'stone');
          }
        }
      }
    }
  }

  // Flower accents on grass
  setWorldBlock(originX + 1, 101, originZ - 2, 'poppy');
  setWorldBlock(originX - 2, 101, originZ + 2, 'dandelion');

  // Custom Organic Oak Tree at (originX + 3, 101, originZ + 3)
  const treeX = originX + 3;
  const treeZ = originZ + 3;
  for (let y = 101; y <= 105; y++) {
    setWorldBlock(treeX, y, treeZ, 'oak_log');
  }
  setWorldBlock(treeX + 1, 103, treeZ, 'oak_log');
  setWorldBlock(treeX + 1, 104, treeZ, 'oak_log');
  setWorldBlock(treeX, 104, treeZ - 1, 'oak_log');

  for (let lx = treeX - 3; lx <= treeX + 3; lx++) {
    for (let lz = treeZ - 3; lz <= treeZ + 3; lz++) {
      for (let ly = 104; ly <= 107; ly++) {
        const d = Math.hypot(lx - treeX, (ly - 105) * 1.3, lz - treeZ);
        if (d <= 2.8 && getWorldBlockName(lx, ly, lz, true) === 'air') {
          setWorldBlock(lx, ly, lz, 'oak_leaves');
        }
      }
    }
  }
  setWorldBlock(treeX, 108, treeZ, 'oak_leaves');

  // ==========================================
  // B. PORTAL ISLAND: Center (originX, 100, originZ + 32)
  // ==========================================
  const portalCenterX = originX;
  const portalCenterZ = originZ + 32;

  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const dist = Math.hypot(x / 4.8, z / 4.8);
      if (dist <= 1.0) {
        const isStoneEdge = (dist > 0.7);
        const surface = isStoneEdge ? ((x + z) % 2 === 0 ? 'stone_bricks' : 'mossy_stone_bricks') : 'cobblestone';
        setWorldBlock(portalCenterX + x, 100, portalCenterZ + z, surface);

        const depth = Math.floor((1.0 - dist) * 7) + Math.abs((x * 2 + z * 5) % 2);
        for (let y = 99; y >= 100 - depth; y--) {
          setWorldBlock(portalCenterX + x, y, portalCenterZ + z, (y % 2 === 0 ? 'stone' : 'cobblestone'));
        }
      }
    }
  }

  // Lantern posts on portal island
  setWorldBlock(portalCenterX - 3, 101, portalCenterZ - 2, 'cobblestone_wall');
  setWorldBlock(portalCenterX - 3, 102, portalCenterZ - 2, 'lantern');
  emitLightSource(portalCenterX - 3, 102, portalCenterZ - 2, 15);

  setWorldBlock(portalCenterX + 3, 101, portalCenterZ - 2, 'cobblestone_wall');
  setWorldBlock(portalCenterX + 3, 102, portalCenterZ - 2, 'lantern');
  emitLightSource(portalCenterX + 3, 102, portalCenterZ - 2, 15);

  // ==========================================
  // C. THE ANCIENT STONE ARCH PORTAL
  // ==========================================
  const pZ = portalCenterZ + 2; // originZ + 34

  // 1. Left Pillar (West Pillar at originX - 2)
  setWorldBlock(originX - 2, 101, pZ, 'stone_bricks');
  setWorldBlock(originX - 2, 102, pZ, 'chiseled_stone_bricks');
  setWorldBlock(originX - 2, 103, pZ, 'mossy_stone_bricks');
  setWorldBlock(originX - 2, 104, pZ, 'cracked_stone_bricks');
  setWorldBlock(originX - 2, 105, pZ, 'stone_bricks');
  setWorldBlock(originX - 2, 106, pZ, 'stone_bricks');
  setWorldBlock(originX - 2, 107, pZ, 'cobblestone_wall');
  setWorldBlock(originX - 2, 108, pZ, 'lantern');
  emitLightSource(originX - 2, 108, pZ, 15);

  // 2. Right Pillar (East Pillar at originX + 2)
  setWorldBlock(originX + 2, 101, pZ, 'stone_bricks');
  setWorldBlock(originX + 2, 102, pZ, 'chiseled_stone_bricks');
  setWorldBlock(originX + 2, 103, pZ, 'cracked_stone_bricks');
  setWorldBlock(originX + 2, 104, pZ, 'mossy_stone_bricks');
  setWorldBlock(originX + 2, 105, pZ, 'stone_bricks');
  setWorldBlock(originX + 2, 106, pZ, 'stone_bricks');
  setWorldBlock(originX + 2, 107, pZ, 'cobblestone_wall');
  setWorldBlock(originX + 2, 108, pZ, 'lantern');
  emitLightSource(originX + 2, 108, pZ, 15);

  // 3. Ancient Stone Base Sill (Y = 101, Z = pZ)
  setWorldBlock(originX - 1, 101, pZ, 'cracked_stone_bricks');
  setWorldBlock(originX, 101, pZ, 'chiseled_stone_bricks');
  setWorldBlock(originX + 1, 101, pZ, 'mossy_stone_bricks');

  // 4. Stepped Stone Base: 360-DEGREE CONNECTED OUTWARD STAIRS (PYRAMID PEDESTAL!)
  // FRONT STAIRS (Z = pZ - 1): Low step at North, climbing UP into portal!
  for (let px = -1; px <= 1; px++) {
    setWorldBlockStateId(originX + px, 101, pZ - 1, STAIRS_SOUTH);
  }
  // BACK STAIRS (Z = pZ + 1): Low step at South, climbing UP into portal!
  for (let px = -1; px <= 1; px++) {
    setWorldBlockStateId(originX + px, 101, pZ + 1, STAIRS_NORTH);
  }
  // SIDE STAIRS (X = originX - 3 and X = originX + 3): Climbing UP into pillars!
  setWorldBlockStateId(originX - 3, 101, pZ, STAIRS_EAST);
  setWorldBlockStateId(originX + 3, 101, pZ, STAIRS_WEST);

  // MITERED CORNER STAIRS (45-degree turn around pillars):
  setWorldBlockStateId(originX - 2, 101, pZ - 1, CORNER_FRONT_WEST);
  setWorldBlockStateId(originX + 2, 101, pZ - 1, CORNER_FRONT_EAST);
  setWorldBlockStateId(originX - 2, 101, pZ + 1, CORNER_BACK_WEST);
  setWorldBlockStateId(originX + 2, 101, pZ + 1, CORNER_BACK_EAST);

  // 5. Solid Glowing Nether Portal Vortex (Clean 3x4 Rectangle, ZERO awkward inner stairs!)
  for (let px = -1; px <= 1; px++) {
    for (let py = 102; py <= 105; py++) {
      setWorldBlock(originX + px, py, pZ, 'nether_portal');
    }
  }

  // 6. Hypixel-Style Stone Arch Header & Peaked Crown (Y = 106 & 107)
  setWorldBlock(originX - 1, 106, pZ, 'stone_bricks');
  setWorldBlock(originX, 106, pZ, 'chiseled_stone_bricks'); // Central Arch Keystone
  setWorldBlock(originX + 1, 106, pZ, 'mossy_stone_bricks');

  // Peaked Crown Roof (Y = 107)
  setWorldBlockStateId(originX - 1, 107, pZ, STAIRS_EAST); // Sloping UP towards center
  setWorldBlockStateId(originX, 107, pZ, STONE_BRICK_SLAB); // Crown Peak Slab
  setWorldBlockStateId(originX + 1, 107, pZ, STAIRS_WEST); // Sloping UP towards center

  // Emit portal ambient light (level 11)
  emitLightSource(originX, 103, pZ, 11);

  // ==========================================
  // D. RESTORE SAVED DISK MODIFICATIONS
  // ==========================================
  const savedDiffs = loadPlayerIslandModifications(username);
  for (const [posKey, blockName] of savedDiffs) {
    const [x, y, z] = posKey.split(',').map(Number);
    setWorldBlock(x, y, z, blockName, false);
  }

  console.timeEnd(`Generate Island [${username}] (${originX}, ${originZ})`);
}

export function generateStarterIslands(): void {
  generatePlayerIsland('arnavjava', 0, 0);
}

export function resetPlayerIsland(username: string, originX: number = 0, originZ: number = 0): void {
  const islandKey = `${originX},${originZ}`;
  generatedIslands.delete(islandKey);
  clearIslandChunks(originX, originZ);
  generatePlayerIsland(username, originX, originZ);
}
