/**
 * ZylarPixel Hub World Generator
 * Creates an authentic, expansive SkyBlock Hub island centered at (originX, originZ)
 * Features:
 * - Island Portal Spawn Platform at (originX + 0.5, 71.0, originZ + 0.5)
 * - Central Village Fountain & Town Plaza
 * - Auction House & Bank Pavilions
 * - Market Stalls & Merchant Walkways
 * - Forest Edge & Scenic Trees
 */

import { setWorldBlock } from './worldManager';

export const HUB_ORIGIN_X = 100000;
export const HUB_ORIGIN_Z = 100000;
export const HUB_SPAWN_Y = 71.0;

export function generateHubWorld(originX: number = HUB_ORIGIN_X, originZ: number = HUB_ORIGIN_Z): void {
  console.time('Generate Hub World');
  const baseY = 70;

  // 1. Central Plaza & Island Terrain (-35 to +35 in X and Z)
  for (let dx = -35; dx <= 35; dx++) {
    for (let dz = -35; dz <= 35; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 35) continue;

      const x = originX + dx;
      const z = originZ + dz;

      // Island base layers (stone -> dirt -> grass / stone bricks)
      const depth = Math.floor(6 + Math.cos(dx * 0.2) * 2 + Math.sin(dz * 0.2) * 2 - dist * 0.12);
      if (depth < 1) continue;

      for (let y = baseY - depth; y < baseY; y++) {
        if (y < baseY - 2) {
          setWorldBlock(x, y, z, 'stone');
        } else {
          setWorldBlock(x, y, z, 'dirt');
        }
      }

      // Surface decoration
      if (dist < 12) {
        // Central Plaza floor: polished andesite & stone bricks pattern
        if ((dx + dz) % 2 === 0) {
          setWorldBlock(x, baseY, z, 'stone_bricks');
        } else {
          setWorldBlock(x, baseY, z, 'polished_andesite');
        }
      } else if (Math.abs(dx) <= 3 || Math.abs(dz) <= 3) {
        // Main cross streets: cobblestone and dirt path
        setWorldBlock(x, baseY, z, (dx + dz) % 3 === 0 ? 'gravel' : 'dirt_path');
      } else {
        // Natural lush grass
        setWorldBlock(x, baseY, z, 'grass_block');
        // Random wildflowers
        if (Math.random() < 0.08) {
          const flower = (dx + dz) % 2 === 0 ? 'dandelion' : 'poppy';
          setWorldBlock(x, baseY + 1, z, flower);
        }
      }
    }
  }

  // 2. The Iconic Island Portal (Spawn Point at originX, 71, originZ)
  for (let px = -3; px <= 3; px++) {
    for (let pz = -3; pz <= 3; pz++) {
      setWorldBlock(originX + px, baseY, originZ + pz, 'chiseled_stone_bricks');
      if (Math.abs(px) === 3 || Math.abs(pz) === 3) {
        setWorldBlock(originX + px, baseY + 1, originZ + pz, 'stone_brick_slab');
      }
    }
  }

  // Obsidian Portal Frame (facing North-South at originZ + 3)
  for (let ox = -2; ox <= 2; ox++) {
    for (let oy = 1; oy <= 5; oy++) {
      if (ox === -2 || ox === 2 || oy === 1 || oy === 5) {
        setWorldBlock(originX + ox, baseY + oy, originZ + 3, 'obsidian');
      } else {
        // Portal center
        setWorldBlock(originX + ox, baseY + oy, originZ + 3, 'crying_obsidian');
      }
    }
  }
  // Portal decorative lanterns
  setWorldBlock(originX - 2, baseY + 6, originZ + 3, 'lantern');
  setWorldBlock(originX + 2, baseY + 6, originZ + 3, 'lantern');

  // 3. Central Village Fountain (at originZ - 15)
  const fx = originX;
  const fz = originZ - 15;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const fDist = Math.sqrt(dx * dx + dz * dz);
      if (fDist <= 4) {
        if (fDist > 3.2) {
          setWorldBlock(fx + dx, baseY + 1, fz + dz, 'stone_brick_stairs');
        } else {
          setWorldBlock(fx + dx, baseY, fz + dz, 'dark_prismarine');
          setWorldBlock(fx + dx, baseY + 1, fz + dz, 'water');
        }
      }
    }
  }
  // Fountain Pillar & Spout
  for (let fy = 1; fy <= 4; fy++) {
    setWorldBlock(fx, baseY + fy, fz, 'stone_bricks');
  }
  setWorldBlock(fx, baseY + 5, fz, 'sea_lantern');
  setWorldBlock(fx, baseY + 6, fz, 'water');

  // 4. The Bank Pavilion (West at originX - 20, originZ - 10)
  buildPavilion(originX - 20, baseY, originZ - 10, 'oak_planks', 'dark_oak_stairs');

  // 5. The Auction House Pavilion (East at originX + 20, originZ - 10)
  buildPavilion(originX + 20, baseY, originZ - 10, 'spruce_planks', 'spruce_stairs');

  // 6. Street Lantern Posts
  const lampPosts = [
    [-6, baseY + 1, -6],
    [6, baseY + 1, -6],
    [-6, baseY + 1, 6],
    [6, baseY + 1, 6],
    [-15, baseY + 1, -15],
    [15, baseY + 1, -15],
    [0, baseY + 1, -26]
  ];
  for (const [lx, ly, lz] of lampPosts) {
    setWorldBlock(originX + lx, ly, originZ + lz, 'spruce_fence');
    setWorldBlock(originX + lx, ly + 1, originZ + lz, 'spruce_fence');
    setWorldBlock(originX + lx, ly + 2, originZ + lz, 'spruce_fence');
    setWorldBlock(originX + lx, ly + 3, originZ + lz, 'lantern');
  }

  // 7. Scenic Trees (Oak & Birch)
  growTree(originX - 25, baseY + 1, originZ + 15, 'oak');
  growTree(originX - 20, baseY + 1, originZ + 22, 'birch');
  growTree(originX + 25, baseY + 1, originZ + 15, 'oak');
  growTree(originX + 22, baseY + 1, originZ + 24, 'birch');
  growTree(originX, baseY + 1, originZ - 30, 'oak');

  console.timeEnd('Generate Hub World');
}

function buildPavilion(cx: number, cy: number, cz: number, floorBlock: string, roofStairs: string): void {
  for (let x = cx - 4; x <= cx + 4; x++) {
    for (let z = cz - 4; z <= cz + 4; z++) {
      setWorldBlock(x, cy, z, floorBlock);
    }
  }

  const corners = [
    [cx - 4, cz - 4],
    [cx + 4, cz - 4],
    [cx - 4, cz + 4],
    [cx + 4, cz + 4]
  ];
  for (const [px, pz] of corners) {
    for (let y = cy + 1; y <= cy + 4; y++) {
      setWorldBlock(px, y, pz, 'oak_log');
    }
  }

  for (let x = cx - 4; x <= cx + 4; x++) {
    for (let z = cz - 4; z <= cz + 4; z++) {
      setWorldBlock(x, cy + 5, z, 'oak_slab');
    }
  }

  for (let x = cx - 2; x <= cx + 2; x++) {
    setWorldBlock(x, cy + 1, cz, roofStairs);
  }
  setWorldBlock(cx, cy + 2, cz, 'lantern');
}

function growTree(tx: number, ty: number, tz: number, type: 'oak' | 'birch'): void {
  const log = `${type}_log`;
  const leaves = `${type}_leaves`;

  for (let y = 0; y < 5; y++) {
    setWorldBlock(tx, ty + y, tz, log);
  }

  for (let lx = tx - 2; lx <= tx + 2; lx++) {
    for (let lz = tz - 2; lz <= tz + 2; lz++) {
      for (let ly = ty + 3; ly <= ty + 4; ly++) {
        if (Math.abs(lx - tx) === 2 && Math.abs(lz - tz) === 2) continue;
        if (lx === tx && lz === tz && ly < ty + 5) continue;
        setWorldBlock(lx, ly, lz, leaves);
      }
    }
  }
  for (let lx = tx - 1; lx <= tx + 1; lx++) {
    for (let lz = tz - 1; lz <= tz + 1; lz++) {
      setWorldBlock(lx, ty + 5, lz, leaves);
    }
  }
  setWorldBlock(tx, ty + 6, tz, leaves);
}
