/**
 * ZylarPixel Admin Time & Day/Night Manager (2-Page Bordered 54-Slot GUI)
 *
 * Page 1 (Slots 0..23): Daytime half-hours (6:00am -> 5:30pm)
 * Page 2 (Slots 24..47): Nighttime half-hours (6:00pm -> 5:30am)
 * Uses 5 verified Mojang custom player head textures mapped cleanly to Sunrise, Day, Sunset, Night, and Midnight.
 */

import * as crypto from 'crypto';
import { createGuiItem, createAdminBaseSlots, openAdminMenu } from './adminMenu';
import { formatGuiTitle } from './guiTheme';
import { playSound } from './bankMenu';
import { applyUniversalItemFlags } from '../items';
import { mcData1192 } from '../world/worldManager';
import { sendSystemMessage } from '../players/playerManager';
import {
  getAllHalfHourSlots,
  getWorldTimeState,
  HalfHourSlotInfo,
  setWorldTimeFrozen,
  setWorldTimeTicks
} from '../world/timeManager';

export const ADMIN_TIME_WINDOW_ID = 17;

// 24 symmetrical inner slots inside a black-bordered 54-slot chest (3x7 + 3 centered)
export const TIME_GRID_SLOTS = [
  10, 11, 12, 13, 14, 15, 16,
  19, 20, 21, 22, 23, 24, 25,
  28, 29, 30, 31, 32, 33, 34,
  39, 40, 41
];

function createTimeHeadGuiItem(
  skullTexture: string,
  phaseKey: string,
  displayName: string,
  loreArray: string[],
  enchanted: boolean
): any {
  const itemDef = mcData1192.itemsByName['player_head'] || { id: 998 };
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));
  const hash = crypto.createHash('md5').update(`TimePhaseHeadV2:${phaseKey}`).digest();
  const intUuid = [
    hash.readInt32BE(0),
    hash.readInt32BE(4),
    hash.readInt32BE(8),
    hash.readInt32BE(12)
  ];

  const nbtValue: any = {
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
    },
    SkullOwner: {
      type: 'compound',
      value: {
        Id: { type: 'intArray', value: intUuid },
        Name: { type: 'string', value: `TimeV2_${phaseKey}` },
        Properties: {
          type: 'compound',
          value: {
            textures: {
              type: 'list',
              value: {
                type: 'compound',
                value: [{ Value: { type: 'string', value: skullTexture } }]
              }
            }
          }
        }
      }
    }
  };

  if (enchanted) {
    nbtValue.Enchantments = {
      type: 'list',
      value: {
        type: 'compound',
        value: [{ id: { type: 'string', value: 'minecraft:unbreaking' }, lvl: { type: 'short', value: 1 } }]
      }
    };
  }

  return applyUniversalItemFlags({
    present: true,
    itemId: itemDef.id,
    itemCount: 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: nbtValue
    }
  }, true);
}

export function openAdminTimeMenu(client: any, pData: any, page: number = 0): void {
  const safePage = page === 1 ? 1 : 0;
  pData.openWindowId = ADMIN_TIME_WINDOW_ID;
  pData.adminTimePage = safePage;

  const state = getWorldTimeState();
  const allSlots = getAllHalfHourSlots();
  const pageSlots = allSlots.slice(safePage * 24, safePage * 24 + 24);
  const pageLabel = safePage === 0 ? 'Daytime 6am-5:30pm (1/2)' : 'Nighttime 6pm-5:30am (2/2)';

  client.write('open_window', {
    windowId: ADMIN_TIME_WINDOW_ID,
    inventoryType: 5, // generic_9x6
    windowTitle: JSON.stringify({ text: formatGuiTitle(6, `Time Control - ${pageLabel}`) })
  });

  const items = createAdminBaseSlots(54);
  const slotMap = new Map<number, HalfHourSlotInfo>();

  pageSlots.forEach((slotInfo, idx) => {
    const guiSlot = TIME_GRID_SLOTS[idx];
    if (guiSlot === undefined) return;
    slotMap.set(guiSlot, slotInfo);

    const isActive = state.slot.slotIndex === slotInfo.slotIndex;
    const titlePrefix = isActive ? '§a§l' : slotInfo.phase.colorCode;
    const mobStatus = slotInfo.isNight
      ? '§b☽ Night §7(§eGraveyard Zombie §7+ §cZombie Villager§7)'
      : '§e☀ Day §7(§eGraveyard Zombie Only§7)';

    const lore = [
      `§7Phase: ${slotInfo.phase.colorCode}${slotInfo.phase.label}`,
      `§7Cycle: ${mobStatus}`,
      `§7Command: §f/time set ${slotInfo.shorthandDecimal} §8| §f${slotInfo.shorthandHHMM} §8| §f${slotInfo.label}`,
      `§7Day Ticks: §f${slotInfo.dayTick.toLocaleString()}`,
      ' ',
      isActive ? '§a✔ CURRENTLY ACTIVE' : '§eClick to set world time! §b▶'
    ];

    items[guiSlot] = createTimeHeadGuiItem(
      slotInfo.phase.skullTexture,
      slotInfo.phase.id,
      `${titlePrefix}${slotInfo.phase.symbol} ${slotInfo.spacedLabel.toUpperCase()}`,
      lore,
      isActive
    );
  });

  // Slot 45: Back to Admin Panel (Page 1) or Previous Page (Page 2)
  items[45] = createGuiItem(
    'arrow',
    1,
    safePage === 0 ? '§c§l◀ Back to Admin Panel' : '§a§l◀ Previous Page §7(Daytime)',
    [safePage === 0 ? '§7Return to the main admin menu.' : '§7Switch to Daytime slots (6:00am - 5:30pm).']
  );

  // Slot 48: Freeze / Resume Time Toggle
  items[48] = createGuiItem(
    state.frozen ? 'redstone_torch' : 'lever',
    1,
    state.frozen ? '§b§l❄ Time Cycle: FROZEN' : '§a§l▶ Time Cycle: FLOWING',
    [
      state.frozen ? '§7The sky & scoreboard clock are paused.' : '§720-min real-time Day/Night cycle active.',
      ' ',
      state.frozen ? '§aClick to resume time! §b▶' : '§eClick to freeze time! §b▶'
    ]
  );

  // Slot 49: Live Current Time Clock Indicator
  items[49] = createGuiItem(
    'clock',
    1,
    `§e§lCurrent Time: §f${state.slot.spacedLabel.toUpperCase()} ${state.isNight ? '§b☽' : '§e☀'}`,
    [
      `§7Date: §b${state.seasonName} ${state.ordinalDay}`,
      `§7Phase: ${state.slot.phase.colorCode}${state.slot.phase.label}`,
      `§7Exact Ticks: §f${state.dayTick.toLocaleString()} §8/ 24,000`,
      `§7Graveyard: ${state.isNight ? '§cNight Mix (Zombie + Villager)' : '§eDay (Graveyard Zombie Only)'}`,
      ' ',
      '§8Tip: Click any of the 48 heads to jump!'
    ]
  );

  // Slot 50: Close Menu
  items[50] = createGuiItem('barrier', 1, '§c§lClose Menu', ['§7Exit the time control menu.']);

  // Slot 53: Next Page (Page 1 -> Page 2)
  if (safePage === 0) {
    items[53] = createGuiItem(
      'arrow',
      1,
      '§a§lNext Page ▶ §7(Nighttime)',
      ['§7Switch to Nighttime slots (6:00pm - 5:30am).']
    );
  }

  pData.adminTimeSlotMap = slotMap;
  pData.currentGuiItems = items;

  client.write('window_items', {
    windowId: ADMIN_TIME_WINDOW_ID,
    stateId: 1,
    items,
    carriedItem: { present: false }
  });
}

export function handleAdminTimeMenuClick(
  client: any,
  pData: any,
  clickedSlot: number,
  onTimeUpdated: () => void
): void {
  const currentPage = pData.adminTimePage === 1 ? 1 : 0;
  const is119 = pData.is119 !== false;

  if (clickedSlot === 45) {
    playSound(client, pData, 'ui.button.click', 1.0, 0.8);
    if (currentPage === 1) {
      openAdminTimeMenu(client, pData, 0);
    } else {
      openAdminMenu(client, pData);
    }
    return;
  }

  if (clickedSlot === 53 && currentPage === 0) {
    playSound(client, pData, 'ui.button.click', 1.0, 0.8);
    openAdminTimeMenu(client, pData, 1);
    return;
  }

  if (clickedSlot === 50) {
    pData.openWindowId = 0;
    try { client.write('close_window', { windowId: ADMIN_TIME_WINDOW_ID }); } catch (_) {}
    return;
  }

  if (clickedSlot === 48) {
    const curr = getWorldTimeState();
    const next = setWorldTimeFrozen(!curr.frozen);
    playSound(client, pData, 'block.lever.click', next.frozen ? 0.8 : 1.2, 0.9);
    sendSystemMessage(
      client,
      next.frozen
        ? `§b[Time] §fTime cycle §cfrozen §fat §e${next.slot.spacedLabel}§f.`
        : `§b[Time] §fTime cycle §aresumed §ffrom §e${next.slot.spacedLabel}§f.`,
      is119
    );
    onTimeUpdated();
    openAdminTimeMenu(client, pData, currentPage);
    return;
  }

  const chosen: HalfHourSlotInfo | undefined = pData.adminTimeSlotMap?.get(clickedSlot);
  if (!chosen) return;

  const updated = setWorldTimeTicks(chosen.dayTick);
  playSound(client, pData, 'block.note_block.pling', 1.5, 0.9);
  sendSystemMessage(
    client,
    `§a[Time] Set world time to §e${updated.slot.spacedLabel} ${updated.isNight ? '§b☽ Night' : '§e☀ Day'} §8(${updated.dayTick} ticks)§a!`,
    is119
  );
  onTimeUpdated();
  openAdminTimeMenu(client, pData, currentPage);
}
