export interface Rank {
  name: string;
  prefix: string;
  chatColor: string;
  priority: number;
  weight: number;
  opDefault: boolean;
}

export type RankKey =
  | 'owner'
  | 'admin'
  | 'developer'
  | 'mod'
  | 'helper'
  | 'mvp++'
  | 'mvp+'
  | 'mvp'
  | 'vip+'
  | 'vip'
  | 'default';

export interface IslandData {
  owner: string;
  originX: number;
  originZ: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  tier: number;
  visitorsAllowed?: boolean;
  pvpEnabled?: boolean;
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  defense: number;
  strength: number;
  damage: number;
  critChance: number;
  critDamage: number;
  intelligence: number;
  mana: number;
  maxMana: number;
  speed: number;
}

export interface PlayerSession {
  client: any;
  username: string;
  uuid: string;
  protocolVersion: number;
  is119: boolean;
  rank: Rank;
  isOp: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  currentChunkX?: number;
  currentChunkZ?: number;
  loadedChunks?: Set<string>;
  pendingTeleportId?: number;
  teleportLockUntil?: number;
  island?: IslandData;
  bypassGuestProtection?: boolean;
  stats: PlayerStats;
  openWindowId?: number;
  currentGuiItems?: any[];
}

export interface StoredPlayerData {
  username: string;
  uuid: string;
  rank: string;
  isOp: boolean;
  island: IslandData;
  lastLogin: string;
  stats?: Partial<PlayerStats>;
}

export interface BlockModification {
  x: number;
  y: number;
  z: number;
  blockStateId: number;
}
