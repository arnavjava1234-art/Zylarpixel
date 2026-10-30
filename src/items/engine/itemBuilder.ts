/**
 * ZylarPixel SkyBlock Item Builder
 * Automatically formats authentic Hypixel SkyBlock Lore, spacing, colors, and NBT ExtraAttributes.
 */

import * as crypto from 'crypto';
import { mcData1192, mcData1211 } from '../../world/worldManager';
import {
  ItemRarity,
  ItemType,
  ItemStats,
  SkyBlockItemDefinition,
  ExtraAttributes,
  RARITIES,
  formatExclusiveGradient
} from './itemTypes';

export function formatRarityBadge(rarity: ItemRarity, type: ItemType): string {
  if (rarity === 'EXCLUSIVE') {
    const text = type === 'ITEM' ? 'EXCLUSIVE' : `EXCLUSIVE ${type}`;
    return formatExclusiveGradient(text);
  }

  const def = RARITIES[rarity] || RARITIES.COMMON;
  if (rarity === 'SPECIAL' || rarity === 'VERY_SPECIAL') {
    if (type === 'ITEM') return `${def.boldCode}${def.badgeName || rarity}`;
    return `${def.boldCode}${def.badgeName || rarity} ${type}`;
  }

  const typeStr = type === 'ITEM' ? '' : ` ${type}`;
  return `${def.boldCode}${rarity}${typeStr}`;
}

export function formatItemName(name: string, rarity: ItemRarity): string {
  if (rarity === 'EXCLUSIVE') {
    return formatExclusiveGradient(name);
  }
  const def = RARITIES[rarity] || RARITIES.COMMON;
  return `${def.colorCode}${name}`;
}

export function buildItemLore(
  def: SkyBlockItemDefinition,
  customStats?: Partial<ItemStats>
): string[] {
  const lore: string[] = [];
  const mergedStats: ItemStats = { ...(def.stats || {}), ...(customStats || {}) };

  // 1. Primary Stats
  let hasStats = false;
  if (typeof mergedStats.damage === 'number' && mergedStats.damage !== 0) {
    lore.push(`§7Damage: §c+${mergedStats.damage}`);
    hasStats = true;
  }
  if (typeof mergedStats.strength === 'number' && mergedStats.strength !== 0) {
    lore.push(`§7Strength: §c+${mergedStats.strength}`);
    hasStats = true;
  }
  if (typeof mergedStats.critChance === 'number' && mergedStats.critChance !== 0) {
    lore.push(`§7Crit Chance: §9+${mergedStats.critChance}%`);
    hasStats = true;
  }
  if (typeof mergedStats.critDamage === 'number' && mergedStats.critDamage !== 0) {
    lore.push(`§7Crit Damage: §9+${mergedStats.critDamage}%`);
    hasStats = true;
  }
  if (typeof mergedStats.attackSpeed === 'number' && mergedStats.attackSpeed !== 0) {
    lore.push(`§7Bonus Attack Speed: §e+${mergedStats.attackSpeed}%`);
    hasStats = true;
  }
  if (typeof mergedStats.health === 'number' && mergedStats.health !== 0) {
    lore.push(`§7Health: §a+${mergedStats.health} HP`);
    hasStats = true;
  }
  if (typeof mergedStats.defense === 'number' && mergedStats.defense !== 0) {
    lore.push(`§7Defense: §a+${mergedStats.defense}`);
    hasStats = true;
  }
  if (typeof mergedStats.speed === 'number' && mergedStats.speed !== 0) {
    lore.push(`§7Speed: §a+${mergedStats.speed}`);
    hasStats = true;
  }
  if (typeof mergedStats.intelligence === 'number' && mergedStats.intelligence !== 0) {
    lore.push(`§7Intelligence: §a+${mergedStats.intelligence}`);
    hasStats = true;
  }
  if (typeof mergedStats.trueDefense === 'number' && mergedStats.trueDefense !== 0) {
    lore.push(`§7True Defense: §f+${mergedStats.trueDefense}`);
    hasStats = true;
  }
  if (typeof mergedStats.ferocity === 'number' && mergedStats.ferocity !== 0) {
    lore.push(`§7Ferocity: §c+${mergedStats.ferocity}`);
    hasStats = true;
  }
  if (typeof mergedStats.magicFind === 'number' && mergedStats.magicFind !== 0) {
    lore.push(`§7Magic Find: §a+${mergedStats.magicFind}`);
    hasStats = true;
  }
  if (typeof mergedStats.abilityDamage === 'number' && mergedStats.abilityDamage !== 0) {
    lore.push(`§7Ability Damage: §c+${mergedStats.abilityDamage}%`);
    hasStats = true;
  }

  // 2. Abilities Block
  const abilities = def.abilities || (def.ability ? [def.ability] : []);
  for (const ab of abilities) {
    if (lore.length > 0) lore.push(' '); // Blank separator
    lore.push(`§6Ability: ${ab.name} §e§l${ab.trigger}§r`);
    for (const descLine of ab.description) {
      lore.push(`§7${descLine}`);
    }
    if (typeof ab.manaCost === 'number' && ab.manaCost > 0) {
      lore.push(`§8Mana Cost: §3${ab.manaCost}`);
    }
    if (typeof ab.cooldownSeconds === 'number' && ab.cooldownSeconds > 0) {
      lore.push(`§8Cooldown: §a${ab.cooldownSeconds}s`);
    }
  }

  // 3. Custom / Flavor Description Block
  if (def.description && def.description.length > 0) {
    if (lore.length > 0) lore.push(' '); // Blank separator
    for (const line of def.description) {
      lore.push(line);
    }
  }

  // 4. Mandatory 1-line spacer before bottom rarity badge
  if (lore.length > 0) {
    lore.push(' ');
  }

  // 5. Authentic Bottom Rarity Badge
  lore.push(formatRarityBadge(def.rarity, def.type));

  return lore;
}

export function createSkyBlockItemStack(
  def: SkyBlockItemDefinition,
  options?: {
    count?: number;
    customStats?: Partial<ItemStats>;
    uuid?: string;
    customData?: Record<string, any>;
  }
): any {
  const itemDef = mcData1192.itemsByName[def.material] || mcData1192.itemsByName.stone;
  const loreStrings = buildItemLore(def, options?.customStats).map(l => JSON.stringify({ text: l }));
  const formattedName = formatItemName(def.name, def.rarity);
  const itemUuid = options?.uuid || crypto.randomUUID();

  const extraAttr: any = {
    id: { type: 'string', value: def.id },
    rarity: { type: 'string', value: def.rarity },
    itemType: { type: 'string', value: def.type },
    uuid: { type: 'string', value: itemUuid },
    origin: { type: 'string', value: 'ZYLARPIXEL' }
  };

  if (options?.customStats) {
    extraAttr.stats = {
      type: 'compound',
      value: Object.entries(options.customStats).reduce((acc: any, [k, v]) => {
        if (typeof v === 'number') acc[k] = { type: 'double', value: v };
        return acc;
      }, {})
    };
  }

  if (options?.customData) {
    extraAttr.customData = {
      type: 'compound',
      value: Object.entries(options.customData).reduce((acc: any, [k, v]) => {
        if (typeof v === 'string') acc[k] = { type: 'string', value: v };
        else if (typeof v === 'number') acc[k] = { type: 'double', value: v };
        else if (typeof v === 'boolean') acc[k] = { type: 'byte', value: v ? 1 : 0 };
        return acc;
      }, {})
    };
  }

  const nbtValue: any = {
    HideFlags: { type: 'int', value: 254 }, // Hides vanilla attribute tooltips (e.g. +4 Attack Damage, +1.6 Attack Speed), unbreakable, etc.
    Unbreakable: { type: 'byte', value: 1 },
    display: {
      type: 'compound',
      value: {
        Name: { type: 'string', value: JSON.stringify({ text: formattedName }) },
        Lore: {
          type: 'list',
          value: {
            type: 'string',
            value: loreStrings
          }
        }
      }
    },
    ExtraAttributes: {
      type: 'compound',
      value: extraAttr
    }
  };

  // Enchantment glint shimmer
  if (def.glowing) {
    nbtValue.Enchantments = {
      type: 'list',
      value: {
        type: 'compound',
        value: []
      }
    };
  }

  // Custom skull texture for player heads
  if (def.material === 'player_head' && def.skullTexture) {
    const hash = crypto.createHash('md5').update(`SkyBlockHead:${def.id}`).digest();
    const intUuid = [
      hash.readInt32BE(0),
      hash.readInt32BE(4),
      hash.readInt32BE(8),
      hash.readInt32BE(12)
    ];

    nbtValue.SkullOwner = {
      type: 'compound',
      value: {
        Id: { type: 'intArray', value: intUuid },
        Name: { type: 'string', value: def.name },
        Properties: {
          type: 'compound',
          value: {
            textures: {
              type: 'list',
              value: {
                type: 'compound',
                value: [{ Value: { type: 'string', value: def.skullTexture } }]
              }
            }
          }
        }
      }
    };
  }

  return {
    present: true,
    itemId: itemDef.id,
    itemCount: options?.count || 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: nbtValue
    }
  };
}

export function isSkyBlockItemStack(item: any): boolean {
  return !!item?.nbtData?.value?.ExtraAttributes?.value?.id?.value;
}

export function getSkyBlockExtraAttributes(item: any): ExtraAttributes | null {
  const extra = item?.nbtData?.value?.ExtraAttributes?.value;
  if (!extra || !extra.id?.value) return null;

  const result: ExtraAttributes = {
    id: extra.id.value,
    rarity: extra.rarity?.value || 'COMMON',
    itemType: extra.itemType?.value || 'ITEM',
    origin: extra.origin?.value,
    uuid: extra.uuid?.value
  };

  if (extra.stats?.value) {
    result.stats = {};
    for (const [k, v] of Object.entries(extra.stats.value)) {
      (result.stats as any)[k] = (v as any).value;
    }
  }

  if (extra.customData?.value) {
    result.customData = {};
    for (const [k, v] of Object.entries(extra.customData.value)) {
      result.customData[k] = (v as any).value;
    }
  }

  return result;
}

export function defineSkyBlockItem(def: SkyBlockItemDefinition): SkyBlockItemDefinition {
  return def;
}

export function determineItemType(rawName: string): ItemType {
  const name = (rawName || '').toLowerCase();
  if (name.endsWith('_sword')) return 'SWORD';
  if (name.endsWith('_bow') || name === 'bow' || name === 'crossbow') return 'BOW';
  if (name.endsWith('_pickaxe')) return 'PICKAXE';
  if (name.endsWith('_axe')) return 'AXE';
  if (name.endsWith('_hoe')) return 'HOE';
  if (name.endsWith('_shovel')) return 'SHOVEL';
  if (name.endsWith('_helmet')) return 'HELMET';
  if (name.endsWith('_chestplate')) return 'CHESTPLATE';
  if (name.endsWith('_leggings')) return 'LEGGINGS';
  if (name.endsWith('_boots')) return 'BOOTS';
  if (name.endsWith('_rod')) return 'FISHING_ROD';
  return 'ITEM';
}

export function formatFriendlyItemName(rawName: string): string {
  return rawName
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Scans an item stack and tags any untagged vanilla item with COMMON rarity
 * and a permanent VANILLA origin tag in ExtraAttributes!
 */
export function tagVanillaItemStack(itemStack: any, is119: boolean = true): any {
  if (!itemStack || !itemStack.present || typeof itemStack.itemId !== 'number') {
    return itemStack;
  }

  // Preserve existing SkyBlock items, but ensure HideFlags: 254 is present to hide vanilla tooltips!
  if (isSkyBlockItemStack(itemStack)) {
    if (itemStack.nbtData?.value) {
      if (!itemStack.nbtData.value.HideFlags) {
        itemStack.nbtData.value.HideFlags = { type: 'int', value: 254 };
      }
      if (!itemStack.nbtData.value.Unbreakable) {
        itemStack.nbtData.value.Unbreakable = { type: 'byte', value: 1 };
      }
    }
    return itemStack;
  }

  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.items[itemStack.itemId];
  const rawName = itemDef ? itemDef.name : 'unknown';

  // Do not tag the SkyBlock Menu Nether Star
  if (rawName === 'nether_star') {
    return itemStack;
  }

  const friendlyName = formatFriendlyItemName(rawName);
  const itemType = determineItemType(rawName);
  const badge = formatRarityBadge('COMMON', itemType);

  const loreStrings = [
    JSON.stringify({ text: ' ' }),
    JSON.stringify({ text: badge })
  ];

  // Deep clone or construct NBT data
  const existingNbt = itemStack.nbtData?.value ? JSON.parse(JSON.stringify(itemStack.nbtData.value)) : {};

  // Hide vanilla attack damage & speed tooltips, unbreakable, etc.
  existingNbt.HideFlags = { type: 'int', value: 254 };

  if (!existingNbt.display) {
    existingNbt.display = { type: 'compound', value: {} };
  }
  if (!existingNbt.display.value) {
    existingNbt.display.value = {};
  }

  existingNbt.display.value.Name = {
    type: 'string',
    value: JSON.stringify({ text: `§f${friendlyName}` })
  };

  existingNbt.display.value.Lore = {
    type: 'list',
    value: {
      type: 'string',
      value: loreStrings
    }
  };

  // Embed authentic ExtraAttributes with origin: VANILLA
  existingNbt.ExtraAttributes = {
    type: 'compound',
    value: {
      id: { type: 'string', value: rawName.toUpperCase() },
      rarity: { type: 'string', value: 'COMMON' },
      itemType: { type: 'string', value: itemType },
      origin: { type: 'string', value: 'VANILLA' }
    }
  };

  return {
    ...itemStack,
    nbtData: {
      type: 'compound',
      name: '',
      value: existingNbt
    }
  };
}

