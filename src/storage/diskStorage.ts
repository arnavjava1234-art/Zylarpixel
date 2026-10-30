/**
 * ZylarPixel Permanent Disk Storage Engine
 * Persists player ranks, inventories, OP permissions, and individual player island diffs
 */

import * as fs from 'fs';
import * as path from 'path';
import { IslandData, StoredPlayerData } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const ISLANDS_DIR = path.join(DATA_DIR, 'islands');

// Ensure storage directories exist
export function initStorage(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PLAYERS_DIR)) fs.mkdirSync(PLAYERS_DIR, { recursive: true });
  if (!fs.existsSync(ISLANDS_DIR)) fs.mkdirSync(ISLANDS_DIR, { recursive: true });
}

initStorage();

// In-memory cache for player island modifications: username -> Map("x,y,z" -> blockName)
const playerIslandDiffs = new Map<string, Map<string, string>>();

export function getPlayerIslandDiffFile(username: string): string {
  const safe = (username || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return path.join(ISLANDS_DIR, `${safe}_island_diff.json`);
}

export function loadPlayerIslandModifications(username: string): Map<string, string> {
  const safe = (username || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!playerIslandDiffs.has(safe)) {
    playerIslandDiffs.set(safe, new Map<string, string>());
    const file = getPlayerIslandDiffFile(safe);
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) {
          playerIslandDiffs.get(safe)!.set(k, v as string);
        }
        console.log(`💾 Loaded ${playerIslandDiffs.get(safe)!.size} saved block modifications for [${safe}].`);
      }
    } catch (e: any) {
      console.error(`Failed to load island modifications for ${username}:`, e.message);
    }
  }
  return playerIslandDiffs.get(safe)!;
}

const saveDiffTimeouts = new Map<string, NodeJS.Timeout>();

export function savePlayerIslandBlock(username: string, x: number, y: number, z: number, blockName: string): void {
  const safe = (username || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const diffs = loadPlayerIslandModifications(safe);
  const key = `${x},${y},${z}`;
  diffs.set(key, blockName);

  if (saveDiffTimeouts.has(safe)) {
    clearTimeout(saveDiffTimeouts.get(safe)!);
  }
  saveDiffTimeouts.set(safe, setTimeout(() => {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of diffs) {
        obj[k] = v;
      }
      fs.writeFileSync(getPlayerIslandDiffFile(safe), JSON.stringify(obj, null, 2), 'utf8');
    } catch (e: any) {
      console.error(`Failed to save island diff for ${safe}:`, e.message);
    }
  }, 100));
}

export function clearPlayerIslandModifications(username: string): void {
  const safe = (username || 'default').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (saveDiffTimeouts.has(safe)) {
    clearTimeout(saveDiffTimeouts.get(safe)!);
    saveDiffTimeouts.delete(safe);
  }
  const diffs = loadPlayerIslandModifications(safe);
  diffs.clear();
  try {
    fs.writeFileSync(getPlayerIslandDiffFile(safe), '{}', 'utf8');
  } catch (e) {}
}

export function getPlayerFilePath(username: string): string {
  const safeName = (username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return path.join(PLAYERS_DIR, `${safeName}.json`);
}

export function loadPlayerData(username: string): StoredPlayerData | null {
  try {
    const file = getPlayerFilePath(username);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e: any) {
    console.error(`Failed to load player data for ${username}:`, e.message);
  }
  return null;
}

// Memory cache for exact player username casing: lowercase -> original casing
const playerCasingCache = new Map<string, string>();
let isCasingCachePopulated = false;

function populateCasingCache(): void {
  if (isCasingCachePopulated) return;
  isCasingCachePopulated = true;
  try {
    if (!fs.existsSync(PLAYERS_DIR)) return;
    const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const full = path.join(PLAYERS_DIR, f);
        const raw = fs.readFileSync(full, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.username === 'string') {
          playerCasingCache.set(parsed.username.toLowerCase(), parsed.username);
        } else {
          const fallback = f.slice(0, -5);
          playerCasingCache.set(fallback.toLowerCase(), fallback);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

export function savePlayerData(username: string, data: StoredPlayerData): void {
  try {
    const file = getPlayerFilePath(username);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    if (data.username) {
      playerCasingCache.set(data.username.toLowerCase(), data.username);
    }
  } catch (e: any) {
    console.error(`Failed to save player data for ${username}:`, e.message);
  }
}

// Scans all registered player names from disk preserving exact original casing
export function getAllDiskPlayerNames(): string[] {
  populateCasingCache();
  return Array.from(playerCasingCache.values());
}

// Allocate personal island coordinates for new players (spaced 1000 blocks apart)
export function allocateIslandForPlayer(username: string): IslandData {
  const safe = (username || '').toLowerCase();
  if (safe === 'arnavjava') {
    return {
      owner: username,
      originX: 0,
      originZ: 0,
      spawnX: 0.5,
      spawnY: 101.0,
      spawnZ: 0.5,
      tier: 1
    };
  }

  // Scan existing islands
  let maxIndex = 0;
  const diskNames = getAllDiskPlayerNames();
  for (const name of diskNames) {
    const data = loadPlayerData(name);
    if (data && data.island && typeof data.island.originX === 'number') {
      const idx = Math.floor(data.island.originX / 1000);
      if (idx > maxIndex) maxIndex = idx;
    }
  }

  const newIndex = maxIndex + 1;
  const originX = newIndex * 1000;
  return {
    owner: username,
    originX,
    originZ: 0,
    spawnX: originX + 0.5,
    spawnY: 101.0,
    spawnZ: 0.5,
    tier: 1
  };
}
