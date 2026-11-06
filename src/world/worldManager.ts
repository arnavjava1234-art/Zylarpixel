/**
 * ZylarPixel World & Voxel Storage Manager
 * Handles multi-version chunk storage, voxel manipulation, lighting, and persistent disk saving
 */

const Vec3: any = require('vec3');
import * as fs from 'fs';
import * as path from 'path';
import { savePlayerIslandBlock } from '../storage/diskStorage';

const Chunk1218 = require('prismarine-chunk')('1.21.8');
export const mcData1218 = require('minecraft-data')('1.21.8');
export const mcData = mcData1218;
export const mcData1192 = mcData1218;
export const mcData1211 = mcData1218;

function jsonToNbtCompound(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return { type: 'string', value: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { type: 'int', value: val } : { type: 'float', value: val };
  if (typeof val === 'boolean') return { type: 'byte', value: val ? 1 : 0 };
  if (Array.isArray(val)) {
    if (val.length === 0) return { type: 'list', value: { type: 'end', value: [] } };
    const converted = val.map(jsonToNbtCompound);
    const childType = converted[0].type;
    return {
      type: 'list',
      value: {
        type: childType,
        value: converted.map((c: any) => c.value)
      }
    };
  }
  if (typeof val === 'object') {
    const res: any = {};
    for (const k of Object.keys(val)) {
      const child = jsonToNbtCompound(val[k]);
      if (child !== null) res[k] = child;
    }
    return { type: 'compound', value: res };
  }
  return null;
}

// 1.21.8 Registry Codec Sanitizer (Complete 21-Registry Mojang 1.21.8 Synchronized Suite)
export const sanitizedDimensionCodec1218 = (() => {
  const codec = JSON.parse(JSON.stringify(mcData1218.loginPacket.dimensionCodec));

  // 1. Sanitize Biomes: Omit optional music tag to bypass Mojang 1.21.8 WeightedList validation
  const biomes = codec['minecraft:worldgen/biome']?.entries;
  if (Array.isArray(biomes)) {
    for (const entry of biomes) {
      const eff = entry?.value?.value?.effects?.value;
      if (eff && eff.music) {
        delete eff.music;
      }
    }
  }

  // 2. Sanitize Wolf Variants: Wrap flat textures into 1.21.8 assets compound { wild, tame, angry }
  const wolves = codec['minecraft:wolf_variant']?.entries;
  if (Array.isArray(wolves)) {
    for (const entry of wolves) {
      const val = entry?.value?.value;
      if (val && val.wild_texture && !val.assets) {
        const wild = val.wild_texture.value;
        const tame = val.tame_texture ? val.tame_texture.value : wild;
        const angry = val.angry_texture ? val.angry_texture.value : wild;
        entry.value = {
          type: 'compound',
          value: {
            assets: {
              type: 'compound',
              value: {
                wild: { type: 'string', value: wild },
                tame: { type: 'string', value: tame },
                angry: { type: 'string', value: angry }
              }
            }
          }
        };
      }
    }
  }

  // 3. Inject all 9 additional 1.21.8 synchronized registries (wolf_sound_variant, cat, frog, chicken, cow, pig, dialog, test)
  try {
    const addFile = path.join(__dirname, 'additionalRegistries1218.json');
    if (fs.existsSync(addFile)) {
      const addData = JSON.parse(fs.readFileSync(addFile, 'utf8'));
      for (const regName of Object.keys(addData)) {
        const rawEntries = addData[regName];
        if (Array.isArray(rawEntries)) {
          codec[regName] = {
            id: regName,
            entries: rawEntries.map((e: any) => ({
              key: e.key,
              value: jsonToNbtCompound(JSON.parse(e.jsonText))
            }))
          };
        }
      }
    }
  } catch (err: any) {
    console.error('Failed to load additional 1.21.8 registries:', err?.message || err);
  }

  return codec;
})();

// 1. Pre-Baked Heightmaps
const heightmapNbt = {
  type: 'compound',
  name: '',
  value: {}
};

// 2. High-Performance 1.21.8 Chunk Storage
const worldChunks = new Map<string, any>();
const chunkPacketCache = new Map<string, any>();

// Backwards-compatible references
const worldChunks119 = worldChunks;
const worldChunks121 = worldChunks;
const chunkPacketCache119 = chunkPacketCache;
const chunkPacketCache121 = chunkPacketCache;

export function clearWorldChunks(): void {
  worldChunks.clear();
  chunkPacketCache.clear();
}

export function clearIslandChunks(originX: number, originZ: number): void {
  const baseChunkX = Math.floor(originX / 16);
  const baseChunkZ = Math.floor(originZ / 16);
  for (let cx = baseChunkX - 3; cx <= baseChunkX + 3; cx++) {
    for (let cz = baseChunkZ - 2; cz <= baseChunkZ + 4; cz++) {
      const key = `${cx},${cz}`;
      worldChunks.delete(key);
      chunkPacketCache.delete(key);
    }
  }
}

export function getOrCreateChunk(cx: number, cz: number, _is119?: boolean): any {
  const key = `${cx},${cz}`;
  if (!worldChunks.has(key)) {
    const chunk = new Chunk1218();
    worldChunks.set(key, chunk);
  }
  return worldChunks.get(key);
}

export function setWorldBlock(x: number, y: number, z: number, blockName: string, persist: boolean = false, username?: string): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const block = mcData1218.blocksByName[blockName];
  if (block) {
    const chunk = getOrCreateChunk(cx, cz);
    chunk.setBlockStateId(pos, block.defaultState);
  }

  if (persist && username) {
    savePlayerIslandBlock(username, x, y, z, blockName);
  }
}

export function setWorldBlockStateId(x: number, y: number, z: number, stateId119: number, stateId121?: number): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const targetState = stateId121 || stateId119;
  const chunk = getOrCreateChunk(cx, cz);
  chunk.setBlockStateId(pos, targetState);
}

export function getWorldBlockName(x: number, y: number, z: number, _is119?: boolean): string {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const key = `${cx},${cz}`;
  if (!worldChunks.has(key)) return 'air';
  const block = worldChunks.get(key).getBlock(new Vec3(rx, y, rz));
  return block ? block.name : 'air';
}

export function setWorldBlockLight(x: number, y: number, z: number, lightLevel: number): void {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  const key = `${cx},${cz}`;
  chunkPacketCache.delete(key);

  const rx = ((x % 16) + 16) % 16;
  const rz = ((z % 16) + 16) % 16;
  const pos = new Vec3(rx, y, rz);

  const chunk = getOrCreateChunk(cx, cz);
  if (lightLevel > chunk.getBlockLight(pos)) {
    chunk.setBlockLight(pos, lightLevel);
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

export function dumpChunkPacket(cx: number, cz: number, _is119?: boolean): any {
  const key = `${cx},${cz}`;
  const cached = chunkPacketCache.get(key);
  if (cached) return cached;

  const chunk = getOrCreateChunk(cx, cz);
  const packet = {
    x: cx,
    z: cz,
    heightmaps: [],
    chunkData: chunk.dump(),
    blockEntities: [],
    ...chunk.dumpLight()
  };

  chunkPacketCache.set(key, packet);
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
