/**
 * Authentic Hypixel SkyBlock Hub World Provider
 * Reads directly from community-archived Anvil region files (The_Hub/The Hub/region)
 * Converts block state palettes to 1.19.2 / 1.21.1 and caches chunks for 0ms streaming!
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
const nbt = require('prismarine-nbt');
const Chunk1218 = require('prismarine-chunk')('1.21.8');
const Vec3 = require('vec3');
const mcData1218 = require('minecraft-data')('1.21.8');
const Block1218 = require('prismarine-block')('1.21.8');

export const HUB_SPAWN_X = -2.5;
export const HUB_SPAWN_Y = 71.0;
export const HUB_SPAWN_Z = -66.5;
export const HUB_WORLD_NAME = 'zylarpixel:hub';

// Cache for loaded Hub chunks
const hubChunks = new Map<string, any>();
const hubPacketCache = new Map<string, any>();

// Backwards-compatible aliases
const hubChunks119 = hubChunks;
const hubChunks121 = hubChunks;
const hubPacketCache119 = hubPacketCache;
const hubPacketCache121 = hubPacketCache;

// Region file cache: regionKey ('rx,rz') -> Buffer
const regionCache = new Map<string, Buffer | null>();

const candidateRegionDirs = [
  path.resolve(__dirname, '../../The_Hub/The Hub/region'),
  path.resolve(__dirname, '../../../The_Hub/The Hub/region'),
  path.resolve(process.cwd(), 'The_Hub/The Hub/region'),
  path.resolve(__dirname, '../The_Hub/The Hub/region')
];
const REGION_DIR = candidateRegionDirs.find(d => fs.existsSync(d)) || candidateRegionDirs[0];

function getRegionBuffer(rx: number, rz: number): Buffer | null {
  const key = `${rx},${rz}`;
  if (regionCache.has(key)) return regionCache.get(key) || null;

  const fileName = `r.${rx}.${rz}.mca`;
  const fullPath = path.join(REGION_DIR, fileName);
  if (!fs.existsSync(fullPath)) {
    regionCache.set(key, null);
    return null;
  }

  try {
    const buf = fs.readFileSync(fullPath);
    regionCache.set(key, buf);
    return buf;
  } catch (e) {
    regionCache.set(key, null);
    return null;
  }
}

/**
 * Loads and parses a chunk from Anvil region files on demand
 */
export function loadHubChunk(cx: number, cz: number, _is119?: boolean): any {
  const key = `${cx},${cz}`;
  if (hubChunks.has(key)) return hubChunks.get(key);

  const chunk = new Chunk1218();
  hubChunks.set(key, chunk);

  const rx = Math.floor(cx / 32);
  const rz = Math.floor(cz / 32);
  const buf = getRegionBuffer(rx, rz);
  if (!buf) return chunk;

  const localCx = ((cx % 32) + 32) % 32;
  const localCz = ((cz % 32) + 32) % 32;
  const idx = 4 * (localCx + localCz * 32);

  if (idx + 4 > buf.length) return chunk;

  const offset = (buf.readUInt8(idx) << 16) | (buf.readUInt8(idx + 1) << 8) | buf.readUInt8(idx + 2);
  if (offset === 0) return chunk; // Empty chunk in region

  const byteOffset = offset * 4096;
  if (byteOffset + 5 > buf.length) return chunk;

  const length = buf.readUInt32BE(byteOffset);
  const compressed = buf.subarray(byteOffset + 5, byteOffset + 4 + length);

  try {
    const decompressed = zlib.inflateSync(compressed);
    const parsed = nbt.parseUncompressed(decompressed);
    const simp = nbt.simplify(parsed);

    if (simp.Level && simp.Level.Sections) {
      const mcData = mcData1218;
      const BlockClass = Block1218;
      const lightSources: Array<{ x: number; y: number; z: number; level: number }> = [];

      for (const sec of simp.Level.Sections) {
        if (!sec.BlockStates || !sec.Palette) continue;
        const yBase = sec.Y * 16;
        const palette = sec.Palette;
        const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(palette.length)));
        const mask = (1n << BigInt(bitsPerBlock)) - 1n;
        const blocksPerLong = Math.floor(64 / bitsPerBlock);

        const lightMap = palette.map((p: any) => {
          const name = (p.Name || '').replace('minecraft:', '');
          const b = mcData.blocksByName[name];
          return b?.emitLight || 0;
        });

        const stateMap = palette.map((p: any) => {
          const name = (p.Name || '').replace('minecraft:', '');
          const b = mcData.blocksByName[name];
          if (!b) return 0;
          if (!p.Properties) return b.defaultState;
          try {
            return BlockClass.fromProperties(b.id, p.Properties, 0).stateId;
          } catch (_) {
            return b.defaultState;
          }
        });

        let blockIdx = 0;
        for (let l = 0; l < sec.BlockStates.length; l++) {
          let val = BigInt(sec.BlockStates[l]);
          if (val < 0n) val = BigInt.asUintN(64, val);
          for (let b = 0; b < blocksPerLong && blockIdx < 4096; b++) {
            const palIdx = Number((val >> BigInt(b * bitsPerBlock)) & mask);
            const stateId = stateMap[palIdx] || 0;
            if (stateId !== 0) {
              const by = Math.floor(blockIdx / 256);
              const bz = Math.floor((blockIdx % 256) / 16);
              const bx = blockIdx % 16;
              const y = yBase + by;
              chunk.setBlockStateId(new Vec3(bx, y, bz), stateId);

              const emitL = lightMap[palIdx] || 0;
              if (emitL > 0) {
                lightSources.push({ x: bx, y, z: bz, level: emitL });
              }
            }
            blockIdx++;
          }
        }
      }

      // Propagate block light for all light-emitting blocks in this Hub chunk
      for (const src of lightSources) {
        const radius = Math.min(src.level, 7);
        for (let dx = -radius; dx <= radius; dx++) {
          const x = src.x + dx;
          if (x < 0 || x >= 16) continue;
          for (let dz = -radius; dz <= radius; dz++) {
            const z = src.z + dz;
            if (z < 0 || z >= 16) continue;
            for (let dy = -radius; dy <= radius; dy++) {
              const y = src.y + dy;
              if (y < 0 || y >= 256) continue;
              const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
              if (dist < src.level) {
                const lightVal = src.level - dist;
                const pos = new Vec3(x, y, z);
                if (lightVal > chunk.getBlockLight(pos)) {
                  chunk.setBlockLight(pos, lightVal);
                }
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    // Graceful fallback for unreadable chunks
  }

  return chunk;
}

export function getHubBlockStateId(x: number, y: number, z: number): number {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  const chunk = hubChunks.get(key) || loadHubChunk(cx, cz);
  if (!chunk) return 0;
  const localX = ((x % 16) + 16) % 16;
  const localZ = ((z % 16) + 16) % 16;
  try {
    return chunk.getBlockStateId(new Vec3(localX, y, localZ));
  } catch (_) {
    return 0;
  }
}

export function getHubBlockName(x: number, y: number, z: number): string {
  const stateId = getHubBlockStateId(x, y, z);
  return mcData1218.blocksByStateId[stateId]?.name || 'air';
}

export function setHubBlockStateId(x: number, y: number, z: number, stateId119: number, stateId121?: number): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  hubPacketCache.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const chunk = hubChunks.get(key) || loadHubChunk(cx, cz);
  if (chunk) {
    chunk.setBlockStateId(pos, stateId121 || stateId119);
  }
}

export function dumpHubChunkPacket(cx: number, cz: number, _is119?: boolean): any {
  const key = `${cx},${cz}`;
  const cached = hubPacketCache.get(key);
  if (cached) return cached;

  const chunk = loadHubChunk(cx, cz);

  const packet = {
    x: cx,
    z: cz,
    heightmaps: [],
    chunkData: chunk.dump(),
    blockEntities: [],
    ...chunk.dumpLight()
  };

  hubPacketCache.set(key, packet);
  return packet;
}

let isBackgroundPreWarming = false;

/**
 * Pre-warms the central Hub spawn chunks around Island Portal (-2, 70, -70)
 * Synchronously caches core radius 4 (81 chunks) for solid ground,
 * then warms the full Hub region (radius 5-9, 361 chunks) in micro-slices via setImmediate.
 */
export function preWarmHubSpawn(): void {
  console.time('Pre-warm Authentic Hub Chunks');
  const spawnCx = Math.floor(HUB_SPAWN_X / 16);
  const spawnCz = Math.floor(HUB_SPAWN_Z / 16);

  let coreLoaded = 0;
  for (let cx = spawnCx - 4; cx <= spawnCx + 4; cx++) {
    for (let cz = spawnCz - 4; cz <= spawnCz + 4; cz++) {
      dumpHubChunkPacket(cx, cz);
      coreLoaded++;
    }
  }
  console.timeEnd('Pre-warm Authentic Hub Chunks');
  console.log(`🏛️ Authentic Hypixel Hub core loaded & memoized ${coreLoaded} chunks around Island Portal (${HUB_SPAWN_X}, ${HUB_SPAWN_Y}, ${HUB_SPAWN_Z})`);

  if (!isBackgroundPreWarming) {
    isBackgroundPreWarming = true;
    const queue: { cx: number; cz: number }[] = [];
    for (let cx = spawnCx - 9; cx <= spawnCx + 9; cx++) {
      for (let cz = spawnCz - 9; cz <= spawnCz + 9; cz++) {
        const dist = Math.max(Math.abs(cx - spawnCx), Math.abs(cz - spawnCz));
        if (dist > 4) {
          queue.push({ cx, cz });
        }
      }
    }

    const processQueue = () => {
      const startTime = performance.now();
      // Keep each slice under 4ms so the event loop 20 TPS is completely unhindered
      while (queue.length > 0 && performance.now() - startTime < 4) {
        const item = queue.shift()!;
        dumpHubChunkPacket(item.cx, item.cz);
      }

      if (queue.length > 0) {
        setImmediate(processQueue);
      } else {
        isBackgroundPreWarming = false;
        console.log(`🚀 All 361 Authentic Hub chunks fully pre-warmed & memoized in RAM! (0ms packet streaming active)`);
      }
    };

    setImmediate(processQueue);
  }
}

export function reloadHubWorld(): void {
  hubChunks.clear();
  hubPacketCache.clear();
  regionCache.clear();
  preWarmHubSpawn();
}
