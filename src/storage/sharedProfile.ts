import * as fs from 'fs';
import * as path from 'path';

export interface PlayerStats {
  health: number;
  maxHealth: number;
  defense: number;
  strength: number;
  damage?: number;
  speed: number;
  intelligence: number;
  mana?: number;
  maxMana: number;
  critChance: number;
  critDamage: number;
  farmingFortune?: number;
}

export interface SharedInventoryItem {
  slot: number;
  itemId: number;
  count: number;
  name?: string;
}

export interface PlayerProfile {
  username: string;
  rank: string;
  isOp: boolean;
  coins: number;
  bank: number;
  bankTransactions?: Array<{ type: 'deposit' | 'withdraw'; amount: number; timestamp: number }>;
  stats: PlayerStats;
  skills: {
    combat: number;
    mining: number;
    foraging: number;
    farming: number;
  };
  inventory: SharedInventoryItem[];
  currentServer: 'hub' | 'islands';
  lastSeen: number;
  activeBuffs?: {
    speedBoostUntil?: number;
  };
  cooldowns?: Record<string, number>;
}

const PROFILES_DIR = path.join(__dirname, '..', '..', 'data', 'profiles');

function ensureDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

export function getDefaultProfile(username: string): PlayerProfile {
  return {
    username,
    rank: username.toLowerCase() === 'arnavjava' ? 'OWNER' : 'DEFAULT',
    isOp: username.toLowerCase() === 'arnavjava',
    coins: 0,
    bank: 0,
    stats: {
      health: 100,
      maxHealth: 100,
      defense: 0,
      strength: 0,
      damage: 0,
      speed: 100,
      intelligence: 0,
      mana: 100,
      maxMana: 100,
      critChance: 30,
      critDamage: 50
    },
    skills: {
      combat: 1,
      mining: 1,
      foraging: 1,
      farming: 1
    },
    inventory: [],
    currentServer: 'hub',
    lastSeen: Date.now()
  };
}

export function loadPlayerProfile(username: string): PlayerProfile {
  ensureDir();
  const filePath = path.join(PROFILES_DIR, `${username.toLowerCase()}.json`);
  let profile: PlayerProfile;

  if (!fs.existsSync(filePath)) {
    profile = getDefaultProfile(username);
  } else {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      profile = { ...getDefaultProfile(username), ...parsed };
      if (!profile.stats) profile.stats = getDefaultProfile(username).stats;
      if (typeof profile.stats.mana !== 'number') profile.stats.mana = profile.stats.maxMana || 100;
      if (typeof profile.stats.damage !== 'number') profile.stats.damage = 0;
    } catch (e) {
      console.error(`[PROFILE] Error reading profile for ${username}:`, e);
      profile = getDefaultProfile(username);
    }
  }

  // Cross-System Migration: If shared profile inventory is empty, pull from data/players/<username>.json
  if (!profile.inventory || profile.inventory.length === 0) {
    try {
      const legacyPath = path.join(__dirname, '..', '..', 'data', 'players', `${username.toLowerCase()}.json`);
      if (fs.existsSync(legacyPath)) {
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
        if (Array.isArray(legacyData.inventory) && legacyData.inventory.length > 0) {
          profile.inventory = legacyData.inventory.map((inv: any) => ({
            slot: inv.slot,
            itemId: inv.itemId,
            count: inv.count,
            name: inv.name
          }));
          savePlayerProfile(profile);
        }
      }
    } catch (e) {}
  }

  return profile;
}

export function savePlayerProfile(profile: PlayerProfile): void {
  ensureDir();
  const filePath = path.join(PROFILES_DIR, `${profile.username.toLowerCase()}.json`);
  try {
    profile.lastSeen = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[PROFILE] Failed saving profile for ${profile.username}:`, e);
  }
}
