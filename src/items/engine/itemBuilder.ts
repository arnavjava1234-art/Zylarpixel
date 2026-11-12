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

export const UNIVERSAL_HIDE_FLAGS = 255;

/**
 * Returns true if the given Minecraft item ID has durability and can break in vanilla.
 */
export function isBreakableItem(itemId: number, is119: boolean = true): boolean {
  if (typeof itemId !== 'number') return false;
  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData?.items?.[itemId];
  return typeof itemDef?.maxDurability === 'number' && itemDef.maxDurability > 0;
}

function applyUniversalNbtFields(nbtValue: any, itemId: number, isSkyBlock: boolean, is119: boolean): void {
  nbtValue.HideFlags = { type: 'int', value: UNIVERSAL_HIDE_FLAGS };
  if (isBreakableItem(itemId, is119) || isSkyBlock) {
    nbtValue.Unbreakable = { type: 'byte', value: 1 };
    delete nbtValue.Damage;
  } else {
    // Strip legacy Unbreakable from non-breakable items so old & new stacks always merge cleanly
    delete nbtValue.Unbreakable;
  }
}

/**
 * Universally enforces HideFlags: 255 on any item stack and marks all breakable items Unbreakable.
 */
export function applyUniversalItemFlags(itemStack: any, is119: boolean = true): any {
  if (
    !itemStack ||
    itemStack.present === false ||
    typeof itemStack.itemId !== 'number' ||
    (typeof itemStack.itemCount === 'number' && itemStack.itemCount <= 0) ||
    (typeof itemStack.count === 'number' && itemStack.count <= 0)
  ) {
    return itemStack;
  }

  // Handle 1.21.1 component slot shape without wrapping in legacy nbtData
  if (itemStack.addedComponentCount !== undefined && Array.isArray(itemStack.components)) {
    return itemStack;
  }

  const nextNbtValue = itemStack.nbtData?.value ? { ...itemStack.nbtData.value } : {};
  applyUniversalNbtFields(nextNbtValue, itemStack.itemId, isSkyBlockItemStack(itemStack), is119);

  return {
    ...itemStack,
    nbtData: {
      type: 'compound',
      name: itemStack.nbtData?.name ?? '',
      value: nextNbtValue
    }
  };
}

/**
 * Sanitizes outgoing item-bearing packets (set_slot, window_items, entity_equipment, entity_metadata)
 * so every item sent to clients has HideFlags: 255 and breakable items are Unbreakable.
 */
export function sanitizeOutgoingPacket(packetName: string, params: any, is119: boolean = true): any {
  if (!params || typeof params !== 'object') return params;

  if (packetName === 'set_slot') {
    const next = { ...params };
    if (next.item) {
      next.item = applyUniversalItemFlags(next.item, is119);
    }
    return next;
  }

  if (packetName === 'window_items') {
    const next = { ...params };
    if (Array.isArray(next.items)) {
      next.items = next.items.map((it: any) => applyUniversalItemFlags(it, is119));
    }
    if (next.carriedItem) {
      next.carriedItem = applyUniversalItemFlags(next.carriedItem, is119);
    }
    return next;
  }

  if (packetName === 'entity_equipment') {
    const next = { ...params };
    if (Array.isArray(next.equipments)) {
      next.equipments = next.equipments.map((eq: any) =>
        eq && eq.item ? { ...eq, item: applyUniversalItemFlags(eq.item, is119) } : eq
      );
    }
    return next;
  }

  if (packetName === 'entity_metadata') {
    const next = { ...params };
    if (Array.isArray(next.metadata)) {
      next.metadata = next.metadata.map((entry: any) =>
        entry && entry.type === 6 && entry.value
          ? { ...entry, value: applyUniversalItemFlags(entry.value, is119) }
          : entry
      );
    }
    return next;
  }

  return params;
}

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
    HideFlags: { type: 'int', value: UNIVERSAL_HIDE_FLAGS }, // Hides all vanilla tooltips (enchants, damage, attack speed, unbreakable, dyed, etc.)
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

  // Preserve existing SkyBlock items, upgrading HideFlags to 255 and enforcing Unbreakable
  if (isSkyBlockItemStack(itemStack)) {
    return applyUniversalItemFlags(itemStack, is119);
  }

  const mcData = is119 ? mcData1192 : mcData1211;
  const itemDef = mcData.items[itemStack.itemId];
  const rawName = itemDef ? itemDef.name : 'unknown';

  // Do not add ExtraAttributes/lore to the SkyBlock Menu Nether Star, but still hide tooltips
  if (rawName === 'nether_star') {
    return applyUniversalItemFlags(itemStack, is119);
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

  // Hide all vanilla tooltips and normalize Unbreakable consistently with packet sanitizer
  applyUniversalNbtFields(existingNbt, itemStack.itemId, false, is119);

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

/**
 * Ensures item stack is formatted correctly for the target protocol version:
 * - 1.19.2: { present: boolean, itemId?: number, itemCount?: number, nbtData?: any }
 * - 1.21.1: SlotComponent format { itemCount: number, itemId?: number, addedComponentCount: number, removedComponentCount: number, components: any[], removeComponents: any[] }
 */
export function formatSlotForClient(item: any, is119: boolean = true): any {
  if (
    !item ||
    item.present === false ||
    (typeof item.count === 'number' && item.count <= 0) ||
    (typeof item.itemCount === 'number' && item.itemCount <= 0)
  ) {
    return is119 ? { present: false } : { itemCount: 0 };
  }

  if (is119) {
    if (item.present !== undefined) return applyUniversalItemFlags(item, true);
    return applyUniversalItemFlags({
      present: true,
      itemId: item.itemId,
      itemCount: item.itemCount || item.count || 1,
      nbtData: item.nbtData
    }, true);
  }

  // 1.21.1 SlotComponent format: if already formatted, return directly
  if (item.addedComponentCount !== undefined && Array.isArray(item.components)) {
    return item;
  }

  const count = item.itemCount || item.count || 1;
  let targetItemId = item.itemId;

  // If itemId was resolved from 1.19.2, translate to 1.21.1
  if (typeof targetItemId === 'number') {
    const def119 = mcData1192.items[targetItemId];
    if (def119) {
      const def121 = mcData1211.itemsByName[def119.name] || mcData1211.blocksByName[def119.name];
      if (def121) targetItemId = def121.id;
    }
  }

  const components: any[] = [];

  // Parse components out of nbtData if present
  if (item.nbtData?.value) {
    const val = item.nbtData.value;

    // 1. Custom Name
    if (val.display?.value?.Name?.value) {
      components.push({
        type: 'custom_name',
        data: {
          type: 'string',
          value: val.display.value.Name.value
        }
      });
    }

    // 2. Lore
    const rawLore = val.display?.value?.Lore?.value?.value;
    if (Array.isArray(rawLore) && rawLore.length > 0) {
      components.push({
        type: 'lore',
        data: rawLore.map((line: any) => ({
          type: 'string',
          value: typeof line === 'string' ? line : JSON.stringify(line)
        }))
      });
    }

    // 3. SkyBlock ExtraAttributes / Custom Data
    if (val.ExtraAttributes?.value) {
      components.push({
        type: 'custom_data',
        data: {
          type: 'compound',
          name: '',
          value: {
            ExtraAttributes: val.ExtraAttributes
          }
        }
      });
    }

    // 4. Custom Skull / Profile
    if (val.SkullOwner?.value) {
      const so = val.SkullOwner.value;
      const textures = so.Properties?.value?.textures?.value?.value;
      const texVal = Array.isArray(textures) && textures[0]?.Value?.value;
      if (texVal) {
        components.push({
          type: 'profile',
          data: {
            name: so.Name?.value || 'Player',
            uuid: typeof so.Id?.value === 'string' ? so.Id.value : undefined,
            properties: [
              {
                name: 'textures',
                value: texVal,
                signature: undefined
              }
            ]
          }
        });
      }
    }
  }

  return {
    itemCount: count,
    itemId: targetItemId,
    addedComponentCount: components.length,
    removedComponentCount: 0,
    components,
    removeComponents: []
  };
}
