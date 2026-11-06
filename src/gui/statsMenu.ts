/**
 * ZylarPixel SkyBlock Stats GUI (/stats)
 * Opens a 54-slot chest presenting all 8 SkyBlock stats with a premium dark theme.
 */

import { mcData1192 } from '../world/worldManager';
import { PlayerSession } from '../types';
import { calculateEHP } from '../stats/statsManager';
import { formatSlotForClient } from '../items';
import { sendWindow } from './guiHelper';

export function createGuiItem(
  itemName: string,
  count: number,
  displayName: string,
  loreArray: string[] = []
): any {
  if (!itemName || count <= 0) {
    return { itemCount: 0 };
  }
  const itemDef = mcData1192.itemsByName[itemName] || mcData1192.itemsByName.stone;
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));

  return formatSlotForClient({
    present: true,
    itemId: itemDef.id,
    itemCount: count || 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: {
        display: {
          type: 'compound',
          value: {
            Name: { type: 'string', value: JSON.stringify({ text: displayName }) },
            Lore: {
              type: 'list',
              value: {
                type: 'string',
                value: loreStrings
              }
            }
          }
        }
      }
    }
  }, false);
}

export function openStatsMenu(client: any, pData: PlayerSession): void {
  pData.openWindowId = 5; // Window ID 5 = Stats Menu

  // Fill background with dark gray glass panes (premium dark theme)
  const items = new Array(54).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§7', [])
  );

  const stats = pData.stats;
  const ehp = calculateEHP(stats.maxHealth, stats.defense);

  // Slot 13: Player Overview (Nether Star or Head)
  items[13] = createGuiItem(
    'nether_star',
    1,
    `§a§l${pData.username}'s Profile`,
    [
      `§7Rank: ${pData.rank.prefix}`,
      `§7Purse: §6${(pData as any).purse ? (pData as any).purse.toFixed(1) : '0.0'} coins`,
      `§7Bits: §b${(pData as any).bits || 0}`,
      ' ',
      `§7Effective Health (EHP): §a${ehp.toLocaleString()}`,
      ' ',
      '§eView your combat and survivability attributes below!'
    ]
  );

  // Slot 20: ❤ Health (Red Wool / Glistering Melon)
  items[20] = createGuiItem(
    'red_dye',
    1,
    `§c❤ Health §f${Math.ceil(stats.health)}/${Math.ceil(stats.maxHealth)}`,
    [
      '§7Health is your maximum life pool.',
      '§7When it drops to 0, you die!',
      ' ',
      `§7Base Value: §a100`,
      `§7Current Max: §a${Math.ceil(stats.maxHealth)}`,
      `§7Natural Regen: §a+${((stats.maxHealth / 100) + 1.5).toFixed(1)} HP / 2s`
    ]
  );

  // Slot 21: ❈ Defense (Iron Chestplate)
  items[21] = createGuiItem(
    'iron_chestplate',
    1,
    `§a❈ Defense §f${Math.floor(stats.defense)}`,
    [
      '§7Defense reduces incoming physical and',
      '§7environmental damage (including fall damage).',
      ' ',
      `§7Damage Reduction: §a${(stats.defense / (stats.defense + 100) * 100).toFixed(1)}%`,
      `§7Effective Health: §a${ehp.toLocaleString()} HP`,
      ' ',
      '§8Formula: damage * (100 / (Defense + 100))'
    ]
  );

  // Slot 22: ❁ Strength (Blaze Powder)
  items[22] = createGuiItem(
    'blaze_powder',
    1,
    `§c❁ Strength §f${Math.floor(stats.strength)}`,
    [
      '§7Strength multiplies all damage you deal',
      '§7and boosts weapon base hit value.',
      ' ',
      `§7Base Hit Bonus: §a+${Math.floor(stats.strength / 5)}`,
      `§7Damage Multiplier: §a+${Math.floor(stats.strength)}%`,
      ' ',
      '§8Adds floor(Strength / 5) to base hit!'
    ]
  );

  // Slot 23: ⚔ Damage (Diamond Sword)
  items[23] = createGuiItem(
    'diamond_sword',
    1,
    `§c⚔ Damage §f+${Math.floor(stats.damage)}`,
    [
      '§7Damage directly increases your weapon base attack',
      '§7before Strength and Crit Damage are multiplied.',
      ' ',
      `§7Bonus Weapon Damage: §c+${Math.floor(stats.damage)}`,
      ' ',
      '§8Scales with Strength & Critical Hits!'
    ]
  );

  // Slot 24: ✦ Speed (Sugar)
  items[24] = createGuiItem(
    'sugar',
    1,
    `§f✦ Speed §f${Math.floor(stats.speed)}`,
    [
      '§7Speed increases your walking and sprinting rate.',
      ' ',
      `§7Current Speed: §a${Math.floor(stats.speed)} §7(Cap: §e400§7)`,
      `§7Movement Boost: §a+${Math.max(0, Math.floor(stats.speed - 100))}%`,
      ' ',
      '§8Standard base speed is 100.'
    ]
  );

  // Slot 29: ☣ Crit Chance (Player Head / Eye of Ender)
  items[29] = createGuiItem(
    'ender_eye',
    1,
    `§9☣ Crit Chance §f${Math.floor(stats.critChance)}%`,
    [
      '§7Crit Chance is your probability to land a',
      '§7critical strike dealing multiplied damage.',
      ' ',
      `§7Chance to Crit: §9${Math.min(100, Math.floor(stats.critChance))}%`,
      `§7Cap: §8100% (Guaranteed Crit)`,
      ' ',
      '§8Base chance is 30%.'
    ]
  );

  // Slot 30: ☠ Crit Damage (Skeleton Skull)
  items[30] = createGuiItem(
    'skeleton_skull',
    1,
    `§9☠ Crit Damage §f${Math.floor(stats.critDamage)}%`,
    [
      '§7Crit Damage multiplies your damage output',
      '§7whenever a critical hit successfully lands.',
      ' ',
      `§7Multiplier: §9${(1 + stats.critDamage / 100).toFixed(2)}x §7damage`,
      `§7Scaling: §aUnlimited`,
      ' ',
      '§8Base Crit Damage is 50%.'
    ]
  );

  // Slot 31: ✎ Intelligence / Mana (Enchanted Book / Lapis)
  items[31] = createGuiItem(
    'lapis_lazuli',
    1,
    `§b✎ Intelligence §f${Math.floor(stats.intelligence)}`,
    [
      '§7Intelligence raises your maximum Mana pool',
      '§7and speeds up passive mana recovery.',
      ' ',
      `§7Max Mana: §b${Math.floor(stats.maxMana)} §7(100 + Int)`,
      `§7Current Mana: §b${Math.floor(stats.mana)}`,
      `§7Mana Regen: §b+${(stats.maxMana * 0.02).toFixed(1)}/s §7(2%/s)`,
      ' ',
      '§8Regenerates continuously during combat!'
    ]
  );

  // Slot 32: ☘ Farming Fortune (Hay Block)
  items[32] = createGuiItem(
    'hay_block',
    1,
    `§a☘ Farming Fortune: §f${Math.floor(stats.farmingFortune || 0)}`,
    [
      '§7Farming Fortune increases your chance',
      '§7to get multiple drops from crops.',
      ' ',
      `§7Current Fortune: §a+${Math.floor(stats.farmingFortune || 0)}`,
      `§7Extra Drop Multiplier: §e+${Math.floor(stats.farmingFortune || 0)}%`,
      ' ',
      '§8Every 100 Fortune grants +100% chance',
      '§8for an extra crop drop!'
    ]
  );

  // Slot 49: Close Menu Barrier
  items[49] = createGuiItem(
    'barrier',
    1,
    '§cClose',
    ['§7Click to close this stats menu.']
  );

  (pData as any).currentGuiItems = items;
  sendWindow(client, 5, 5, '§8Your SkyBlock Stats', items);
}
