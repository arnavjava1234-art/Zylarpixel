/**
 * ZylarPixel SkyBlock Item Engine - Types & Definitions
 * Defines authentic Hypixel SkyBlock Rarities, Item Types, Stats, Abilities, and NBT structures.
 */

export type ItemRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | 'MYTHIC'
  | 'DIVINE'
  | 'SPECIAL'
  | 'VERY_SPECIAL'
  | 'EXCLUSIVE';

export type ItemType =
  | 'SWORD'
  | 'BOW'
  | 'PICKAXE'
  | 'AXE'
  | 'HOE'
  | 'SHOVEL'
  | 'HELMET'
  | 'CHESTPLATE'
  | 'LEGGINGS'
  | 'BOOTS'
  | 'ACCESSORY'
  | 'WAND'
  | 'FISHING_ROD'
  | 'DRILL'
  | 'PET'
  | 'DEPLOYABLE'
  | 'ITEM';

export interface RarityDefinition {
  id: ItemRarity;
  name: string;
  colorCode: string;
  boldCode: string;
  badgeName?: string;
  isGradient?: boolean;
}

export function formatExclusiveGradient(text: string): string {
  // Red to Yellow/Gold gradient sequence: §c -> §6 -> §e -> §6 -> §c
  const colors = ['§c§l', '§c§l', '§6§l', '§6§l', '§e§l', '§e§l', '§6§l', '§6§l', '§c§l'];
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === ' ') {
      result += ' ';
    } else {
      const color = colors[i % colors.length];
      result += `${color}${char}`;
    }
  }
  return result;
}

export const RARITIES: Record<ItemRarity, RarityDefinition> = {
  COMMON: {
    id: 'COMMON',
    name: 'Common',
    colorCode: '§f',
    boldCode: '§f§l'
  },
  UNCOMMON: {
    id: 'UNCOMMON',
    name: 'Uncommon',
    colorCode: '§a',
    boldCode: '§a§l'
  },
  RARE: {
    id: 'RARE',
    name: 'Rare',
    colorCode: '§9',
    boldCode: '§9§l'
  },
  EPIC: {
    id: 'EPIC',
    name: 'Epic',
    colorCode: '§5',
    boldCode: '§5§l'
  },
  LEGENDARY: {
    id: 'LEGENDARY',
    name: 'Legendary',
    colorCode: '§6',
    boldCode: '§6§l'
  },
  MYTHIC: {
    id: 'MYTHIC',
    name: 'Mythic',
    colorCode: '§d',
    boldCode: '§d§l'
  },
  DIVINE: {
    id: 'DIVINE',
    name: 'Divine',
    colorCode: '§b',
    boldCode: '§b§l'
  },
  SPECIAL: {
    id: 'SPECIAL',
    name: 'Special',
    colorCode: '§c',
    boldCode: '§c§l',
    badgeName: 'SPECIAL'
  },
  VERY_SPECIAL: {
    id: 'VERY_SPECIAL',
    name: 'Very Special',
    colorCode: '§c',
    boldCode: '§c§l',
    badgeName: 'VERY SPECIAL'
  },
  EXCLUSIVE: {
    id: 'EXCLUSIVE',
    name: 'Exclusive',
    colorCode: '§c',
    boldCode: '§c§l',
    isGradient: true
  }
};

export interface ItemStats {
  damage?: number;            // ⚔ Damage
  strength?: number;          // ❁ Strength
  critChance?: number;        // ☣ Crit Chance %
  critDamage?: number;        // ☠ Crit Damage %
  health?: number;            // ❤ Health
  defense?: number;           // ❈ Defense
  speed?: number;             // ✦ Speed
  intelligence?: number;      // ✎ Intelligence
  attackSpeed?: number;       // ⚔ Bonus Attack Speed %
  magicFind?: number;         // ✯ Magic Find
  ferocity?: number;          // ⫽ Ferocity
  abilityDamage?: number;     // ๑ Ability Damage %
  trueDefense?: number;       // ❂ True Defense
}

export type AbilityTrigger =
  | 'RIGHT CLICK'
  | 'LEFT CLICK'
  | 'SNEAK'
  | 'PASSIVE'
  | 'FULL SET BONUS';

export interface ItemAbility {
  name: string;
  trigger: AbilityTrigger;
  description: string[];
  manaCost?: number;
  cooldownSeconds?: number;
  onExecute?: (player: any, server: any, itemStack: any) => boolean | void;
}

export interface SkyBlockItemDefinition {
  id: string;
  name: string;
  material: string;
  rarity: ItemRarity;
  type: ItemType;
  stats?: ItemStats;
  ability?: ItemAbility;
  abilities?: ItemAbility[];
  description?: string[];     // Flavor text / passive lore notes
  unstackable?: boolean;
  glowing?: boolean;          // Enchantment shimmer
  skullTexture?: string;      // Base64 texture for player_head items
  customData?: Record<string, any>;
}

export interface ExtraAttributes {
  id: string;
  rarity: ItemRarity;
  itemType: ItemType;
  origin?: string;
  uuid?: string;
  timestamp?: number;
  stats?: Partial<ItemStats>;
  customData?: Record<string, any>;
  [key: string]: any;
}
