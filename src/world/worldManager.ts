/**
 * ZylarPixel World & Voxel Storage Manager
 * Handles multi-version chunk storage, voxel manipulation, lighting, and persistent disk saving
 */

const Vec3: any = require('vec3');
import { savePlayerIslandBlock } from '../storage/diskStorage';

const Chunk1192 = require('prismarine-chunk')('1.19.2');
const Chunk1211 = require('prismarine-chunk')('1.21.1');
export const mcData1192 = require('minecraft-data')('1.19.2');
export const mcData1211 = require('minecraft-data')('1.21.1');

// 1. Pre-Baked Heightmaps for Y = 105 Surface
const surfaceHeight = 175n; // y = 111 in 384-height world (-64..320)
const heightmapLongs: bigint[] = [];
let currentLong = 0n;
let countInLong = 0;

for (let i = 0; i < 256; i++) {
  currentLong |= (surfaceHeight << BigInt(countInLong * 9));
  countInLong++;
  if (countInLong === 7 || i === 255) {
    heightmapLongs.push(currentLong);
    currentLong = 0n;
    countInLong = 0;
  }
}

const motionBlockingData = heightmapLongs.map(l => [Number(l >> 32n), Number(l & 0xFFFFFFFFn)]);
const heightmapNbt = {
  type: 'compound',
  name: '',
  value: {
    MOTION_BLOCKING: { type: 'longArray', value: motionBlockingData },
    WORLD_SURFACE: { type: 'longArray', value: motionBlockingData }
  }
};

// 2. Multi-Version Chunk Storage
const worldChunks119 = new Map<string, any>();
const worldChunks121 = new Map<string, any>();

// Memoized packet cache: 'cx,cz' -> map_chunk packet payload (0ms streaming!)
const chunkPacketCache119 = new Map<string, any>();
const chunkPacketCache121 = new Map<string, any>();

export function clearWorldChunks(): void {
  worldChunks119.clear();
  worldChunks121.clear();
  chunkPacketCache119.clear();
  chunkPacketCache121.clear();
}

export function clearIslandChunks(originX: number, originZ: number): void {
  const baseChunkX = Math.floor(originX / 16);
  const baseChunkZ = Math.floor(originZ / 16);
  for (let cx = baseChunkX - 3; cx <= baseChunkX + 3; cx++) {
    for (let cz = baseChunkZ - 2; cz <= baseChunkZ + 4; cz++) {
      const key = `${cx},${cz}`;
      worldChunks119.delete(key);
      worldChunks121.delete(key);
      chunkPacketCache119.delete(key);
      chunkPacketCache121.delete(key);
    }
  }
}

export function getOrCreateChunk(cx: number, cz: number, is119: boolean = true): any {
  const key = `${cx},${cz}`;
  const store = is119 ? worldChunks119 : worldChunks121;
  if (!store.has(key)) {
    const chunk = is119 ? new Chunk1192() : new Chunk1211();
    store.set(key, chunk);
  }
  return store.get(key);
}

export function setWorldBlock(x: number, y: number, z: number, blockName: string, persist: boolean = false, username?: string): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache119.delete(key);
  chunkPacketCache121.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const block119 = mcData1192.blocksByName[blockName];
  if (block119) {
    const chunk = getOrCreateChunk(cx, cz, true);
    chunk.setBlockStateId(pos, block119.defaultState);
  }

  const block121 = mcData1211.blocksByName[blockName];
  if (block121) {
    const chunk = getOrCreateChunk(cx, cz, false);
    chunk.setBlockStateId(pos, block121.defaultState);
  }

  if (persist && username) {
    savePlayerIslandBlock(username, x, y, z, blockName);
  }
}

export function setWorldBlockStateId(x: number, y: number, z: number, stateId119: number, stateId121?: number): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache119.delete(key);
  chunkPacketCache121.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const chunk119 = getOrCreateChunk(cx, cz, true);
  chunk119.setBlockStateId(pos, stateId119);

  const chunk121 = getOrCreateChunk(cx, cz, false);
  chunk121.setBlockStateId(pos, stateId121 || stateId119);
}

export function getWorldBlockName(x: number, y: number, z: number, is119: boolean = true): string {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const key = `${cx},${cz}`;
  const store = is119 ? worldChunks119 : worldChunks121;
  if (!store.has(key)) return 'air';
  const block = store.get(key).getBlock(new Vec3(rx, y, rz));
  return block ? block.name : 'air';
}

export function setWorldBlockLight(x: number, y: number, z: number, lightLevel: number): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache119.delete(key);
  chunkPacketCache121.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const chunk119 = getOrCreateChunk(cx, cz, true);
  if (lightLevel > chunk119.getBlockLight(pos)) {
    chunk119.setBlockLight(pos, lightLevel);
  }

  const chunk121 = getOrCreateChunk(cx, cz, false);
  if (lightLevel > chunk121.getBlockLight(pos)) {
    chunk121.setBlockLight(pos, lightLevel);
  }
}

export function emitLightSource(lx: number, ly: number, lz: number, maxLevel: number = 15): void {
  for (let dx = -maxLevel; dx <= maxLevel; dx++) {
    for (let dy = -maxLevel; dy <= maxLevel; dy++) {
      for (let dz = -maxLevel; dz <= maxLevel; dz++) {
        const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (dist < maxLevel) {
          const level = maxLevel - dist;
          setWorldBlockLight(lx + dx, ly + dy, lz + dz, level);
        }
      }
    }
  }
}

export function dumpChunkPacket(cx: number, cz: number, is119: boolean = true): any {
  const key = `${cx},${cz}`;
  const packetCache = is119 ? chunkPacketCache119 : chunkPacketCache121;
  const cached = packetCache.get(key);
  if (cached) return cached;

  const chunk = getOrCreateChunk(cx, cz, is119);
  const packet = is119 ? {
    x: cx,
    z: cz,
    heightmaps: heightmapNbt,
    biomes: chunk.dumpBiomes(),
    chunkData: chunk.dump(),
    blockEntities: [],
    trustEdges: true,
    ...chunk.dumpLight()
  } : {
    x: cx,
    z: cz,
    heightmaps: heightmapNbt,
    chunkData: chunk.dump(),
    blockEntities: [],
    ...chunk.dumpLight()
  };

  packetCache.set(key, packet);
  return packet;
}

// 3. Block Drops & Item-To-Block Mappings
export const BLOCK_DROPS: Record<string, string> = {
  grass_block: 'dirt',
  dirt: 'dirt',
  stone: 'cobblestone',
  cobblestone: 'cobblestone',
  andesite: 'andesite',
  oak_log: 'oak_log',
  oak_leaves: 'oak_sapling',
  stone_bricks: 'stone_bricks',
  cracked_stone_bricks: 'stone_bricks',
  mossy_stone_bricks: 'stone_bricks',
  chiseled_stone_bricks: 'stone_bricks',
  stone_brick_stairs: 'stone_bricks',
  cobblestone_wall: 'cobblestone_wall',
  stone_brick_slab: 'stone_brick_slab',
  poppy: 'poppy',
  dandelion: 'dandelion',
  lantern: 'lantern'
};

export const ITEM_TO_BLOCK: Record<string, string> = {
  dirt: 'dirt',
  cobblestone: 'cobblestone',
  andesite: 'andesite',
  stone: 'stone',
  oak_log: 'oak_log',
  oak_planks: 'oak_planks',
  oak_sapling: 'oak_sapling',
  stone_bricks: 'stone_bricks',
  cobblestone_wall: 'cobblestone_wall',
  stone_brick_slab: 'stone_brick_slab',
  lantern: 'lantern'
};
