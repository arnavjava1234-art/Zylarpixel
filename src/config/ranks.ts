/**
 * ZylarPixel Rank System
 * 11 Authentic Ranks with Custom Resource Pack Font Glyphs, Colors, and GUI Display Items
 *
 * Resource Pack Glyph Mapping (resourcepack/assets/minecraft/font/default.json):
 *   \uE010 -> owner.png
 *   \uE011 -> admin.png
 *   \uE012 -> dev.png
 *   \uE013 -> mod.png
 *   \uE014 -> helper.png
 *   \uE015 -> mvp_plus_plus.png
 *   \uE016 -> mvp_plus.png
 *   \uE017 -> mvp.png
 *   \uE018 -> vip_plus.png
 *   \uE019 -> vip.png
 *   \uE01A -> member.png
 *
 * Always prefix rank glyphs with §f so surrounding team/GUI/chat color codes do NOT tint the PNG banner.
 */

export const RANK_GLYPHS = {
  owner: '\uE010',
  admin: '\uE011',
  developer: '\uE012',
  mod: '\uE013',
  helper: '\uE014',
  mvp_plus_plus: '\uE015',
  mvp_plus: '\uE016',
  mvp: '\uE017',
  vip_plus: '\uE018',
  vip: '\uE019',
  default: '\uE01A'
} as const;

export interface RankDefinition {
  id: string;
  name: string;
  glyph: string;
  plainPrefix: string;
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
    glyph: RANK_GLYPHS.owner,
    plainPrefix: '[OWNER]',
    prefix: `§f${RANK_GLYPHS.owner}`,
    displayName: `§f${RANK_GLYPHS.owner}`,
    colorCode: 12, // Red
    chatColor: '§c',
    iconItem: 'redstone_block',
    weight: 100,
    description: 'Server Owner & Master Administrator'
  },
  admin: {
    id: 'admin',
    name: 'ADMIN',
    glyph: RANK_GLYPHS.admin,
    plainPrefix: '[ADMIN]',
    prefix: `§f${RANK_GLYPHS.admin}`,
    displayName: `§f${RANK_GLYPHS.admin}`,
    colorCode: 12, // Red
    chatColor: '§c',
    iconItem: 'tnt',
    weight: 90,
    description: 'Server Administrator'
  },
  developer: {
    id: 'developer',
    name: 'DEVELOPER',
    glyph: RANK_GLYPHS.developer,
    plainPrefix: '[DEV]',
    prefix: `§f${RANK_GLYPHS.developer}`,
    displayName: `§f${RANK_GLYPHS.developer}`,
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'lapis_block',
    weight: 85,
    description: 'Engine & Core Systems Developer'
  },
  mod: {
    id: 'mod',
    name: 'MOD',
    glyph: RANK_GLYPHS.mod,
    plainPrefix: '[MOD]',
    prefix: `§f${RANK_GLYPHS.mod}`,
    displayName: `§f${RANK_GLYPHS.mod}`,
    colorCode: 2, // Dark Green
    chatColor: '§2',
    iconItem: 'emerald_block',
    weight: 80,
    description: 'Server Moderator'
  },
  helper: {
    id: 'helper',
    name: 'HELPER',
    glyph: RANK_GLYPHS.helper,
    plainPrefix: '[HELPER]',
    prefix: `§f${RANK_GLYPHS.helper}`,
    displayName: `§f${RANK_GLYPHS.helper}`,
    colorCode: 9, // Blue
    chatColor: '§9',
    iconItem: 'light_blue_dye',
    weight: 70,
    description: 'Player Support Helper'
  },
  mvp_plus_plus: {
    id: 'mvp_plus_plus',
    name: 'MVP++',
    glyph: RANK_GLYPHS.mvp_plus_plus,
    plainPrefix: '[MVP++]',
    prefix: `§f${RANK_GLYPHS.mvp_plus_plus}`,
    displayName: `§f${RANK_GLYPHS.mvp_plus_plus}`,
    colorCode: 6, // Gold
    chatColor: '§6',
    iconItem: 'golden_apple',
    weight: 60,
    description: 'Premium Golden Tier Supporter'
  },
  mvp_plus: {
    id: 'mvp_plus',
    name: 'MVP+',
    glyph: RANK_GLYPHS.mvp_plus,
    plainPrefix: '[MVP+]',
    prefix: `§f${RANK_GLYPHS.mvp_plus}`,
    displayName: `§f${RANK_GLYPHS.mvp_plus}`,
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'diamond',
    weight: 50,
    description: 'Top Lifetime Supporter'
  },
  mvp: {
    id: 'mvp',
    name: 'MVP',
    glyph: RANK_GLYPHS.mvp,
    plainPrefix: '[MVP]',
    prefix: `§f${RANK_GLYPHS.mvp}`,
    displayName: `§f${RANK_GLYPHS.mvp}`,
    colorCode: 11, // Aqua
    chatColor: '§b',
    iconItem: 'prismarine_shard',
    weight: 40,
    description: 'Most Valuable Player'
  },
  vip_plus: {
    id: 'vip_plus',
    name: 'VIP+',
    glyph: RANK_GLYPHS.vip_plus,
    plainPrefix: '[VIP+]',
    prefix: `§f${RANK_GLYPHS.vip_plus}`,
    displayName: `§f${RANK_GLYPHS.vip_plus}`,
    colorCode: 10, // Green
    chatColor: '§a',
    iconItem: 'gold_ingot',
    weight: 30,
    description: 'Very Important Person+'
  },
  vip: {
    id: 'vip',
    name: 'VIP',
    glyph: RANK_GLYPHS.vip,
    plainPrefix: '[VIP]',
    prefix: `§f${RANK_GLYPHS.vip}`,
    displayName: `§f${RANK_GLYPHS.vip}`,
    colorCode: 10, // Green
    chatColor: '§a',
    iconItem: 'lime_dye',
    weight: 20,
    description: 'Very Important Person'
  },
  default: {
    id: 'default',
    name: 'MEMBER',
    glyph: RANK_GLYPHS.default,
    plainPrefix: '[MEMBER]',
    prefix: `§f${RANK_GLYPHS.default}`,
    displayName: `§f${RANK_GLYPHS.default}`,
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
  if (rawKey === 'member' || rawKey === 'player') return RANKS.default;
  const key = rawKey.replace(/[^a-z0-9_]/g, '');
  return RANKS[key] || null;
}

export function getRankOrDefault(rankId?: string): RankDefinition {
  return getRank(rankId) || RANKS.default;
}

export function formatPlayerName(rank: RankDefinition, username: string): string {
  return `${rank.prefix} ${rank.chatColor}${username}`;
}

export function formatChatMessage(rank: RankDefinition, username: string, message: string): string {
  return `${rank.prefix} ${rank.chatColor}${username}§f: ${message}`;
}

export function formatPlainChatLog(rank: RankDefinition, username: string, message: string): string {
  return `${rank.plainPrefix} ${username}: ${message}`;
}
