/**
 * ZylarPixel Rank System
 * 11 Authentic Ranks with Colors, Prefixes, and GUI Display Items
 */

export interface RankDefinition {
  id: string;
  name: string;
  prefix: string;
  displayName: string;
  colorCode: number;
  chatColor: string;
  iconItem: string;
  weight: number;
  description: string;
}

export const RANKS: Record<string, RankDefinition> = {
  owner: {
    id: 'owner',
    name: 'OWNER',
    prefix: '§c[OWNER]',
    displayName: '§c[OWNER]',
    colorCode: 12, // Red
    chatColor: '§c',
    iconItem: 'redstone_block',
    weight: 100,
    description: 'Server Owner & Master Administrator'
  },
  admin: {
    id: 'admin',
    name: 'ADMIN',
    prefix: '§c[ADMIN]',
    displayName: '§c[ADMIN]',
    colorCode: 12, // Red
    chatColor: '§c',
    iconItem: 'tnt',
    weight: 90,
    description: 'Server Administrator'
  },
  developer: {
    id: 'developer',
    name: 'DEVELOPER',
    prefix: '§b[DEV]',
    displayName: '§b[DEV]',
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'lapis_block',
    weight: 85,
    description: 'Engine & Core Systems Developer'
  },
  mod: {
    id: 'mod',
    name: 'MOD',
    prefix: '§2[MOD]',
    displayName: '§2[MOD]',
    colorCode: 2, // Dark Green
    chatColor: '§2',
    iconItem: 'emerald_block',
    weight: 80,
    description: 'Server Moderator'
  },
  helper: {
    id: 'helper',
    name: 'HELPER',
    prefix: '§9[HELPER]',
    displayName: '§9[HELPER]',
    colorCode: 9, // Blue
    chatColor: '§9',
    iconItem: 'light_blue_dye',
    weight: 70,
    description: 'Player Support Helper'
  },
  mvp_plus_plus: {
    id: 'mvp_plus_plus',
    name: 'MVP++',
    prefix: '§6[MVP§c++§6]',
    displayName: '§6[MVP§c++§6]',
    colorCode: 6, // Gold
    chatColor: '§6',
    iconItem: 'golden_apple',
    weight: 60,
    description: 'Premium Golden Tier Supporter'
  },
  mvp_plus: {
    id: 'mvp_plus',
    name: 'MVP+',
    prefix: '§b[MVP§c+§b]',
    displayName: '§b[MVP§c+§b]',
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'diamond',
    weight: 50,
    description: 'Top Lifetime Supporter'
  },
  mvp: {
    id: 'mvp',
    name: 'MVP',
    prefix: '§b[MVP]',
    displayName: '§b[MVP]',
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'prismarine_shard',
    weight: 40,
    description: 'Most Valuable Player'
  },
  vip_plus: {
    id: 'vip_plus',
    name: 'VIP+',
    prefix: '§a[VIP§6+§a]',
    displayName: '§a[VIP§6+§a]',
    colorCode: 10, // Green
    chatColor: '§a',
    iconItem: 'gold_ingot',
    weight: 30,
    description: 'Very Important Person+'
  },
  vip: {
    id: 'vip',
    name: 'VIP',
    prefix: '§a[VIP]',
    displayName: '§a[VIP]',
    colorCode: 10, // Green
    chatColor: '§a',
    iconItem: 'lime_dye',
    weight: 20,
    description: 'Very Important Person'
  },
  default: {
    id: 'default',
    name: 'DEFAULT',
    prefix: '§7',
    displayName: '§7[MEMBER]',
    colorCode: 7, // Gray
    chatColor: '§7',
    iconItem: 'iron_ingot',
    weight: 1,
    description: 'Default ZylarPixel Player'
  }
};

export function getRank(rankId?: string): RankDefinition | null {
  if (!rankId) return null;
  const rawKey = String(rankId).toLowerCase().trim();
  if (rawKey === 'mvp++' || rawKey === 'mvpplusplus') return RANKS.mvp_plus_plus;
  if (rawKey === 'mvp+' || rawKey === 'mvpplus') return RANKS.mvp_plus;
  if (rawKey === 'vip+' || rawKey === 'vipplus') return RANKS.vip_plus;
  const key = rawKey.replace(/[^a-z0-9_]/g, '');
  return RANKS[key] || null;
}

export function getRankOrDefault(rankId?: string): RankDefinition {
  return getRank(rankId) || RANKS.default;
}

export function formatPlayerName(rank: RankDefinition, username: string): string {
  if (rank.id === 'default') {
    return `§7${username}`;
  }
  return `${rank.prefix} ${username}`;
}

export function formatChatMessage(rank: RankDefinition, username: string, message: string): string {
  if (rank.id === 'default') {
    return `§7${username}§f: ${message}`;
  }
  return `${rank.prefix} ${username}§f: ${message}`;
}
