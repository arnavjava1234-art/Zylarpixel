/**
 * ZylarPixel Animated Scoreboard & Tablist Manager
 * Controls the sidebar objective, tablist headers, and 3D nametag teams
 * Supports both 1.19.2 (JSON strings) and 1.21.1 (anonymousNbt) protocols
 */

import * as nbt from 'prismarine-nbt';
import { PlayerSession } from '../types';
import { RankDefinition } from '../config/ranks';
import { COIN_ICON, BITS_ICON } from '../config/currencyIcons';

export const TITLE_FRAMES = [
  '§f\ue042 §6§lZYLARPIXEL',
  '§f\ue042 §6§lZYLARPIXEL',
  '§f\ue042 §6§lZYLARPIXEL',
  '§f\ue042 §f§lZYLARPIXEL',
  '§f\ue042 §6§lZYLARPIXEL',
  '§f\ue042 §e§lSKYBLOCK',
  '§f\ue042 §e§lSKYBLOCK',
  '§f\ue042 §6§lS§e§lKYBLOCK',
  '§f\ue042 §e§lS§6§lK§e§lYBLOCK',
  '§f\ue042 §e§lSK§6§lY§e§lBLOCK',
  '§f\ue042 §e§lSKY§6§lB§e§lLOCK',
  '§f\ue042 §e§lSKYB§6§lL§e§lOCK',
  '§f\ue042 §e§lSKYBL§6§lO§e§lCK',
  '§f\ue042 §e§lSKYBLO§6§lC§e§lK',
  '§f\ue042 §e§lSKYBLOC§6§lK',
  '§f\ue042 §f§lSKYBLOCK',
  '§f\ue042 §e§lSKYBLOCK',
  '§f\ue042 §e§lSKYBLOCK'
];

let currentTitleIndex = 0;

export function formatScoreboardPurse(purse: number): string {
  const p = typeof purse === 'number' && !isNaN(purse) ? purse : 0.0;
  return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatScoreboardBits(bits: number): string {
  const b = typeof bits === 'number' && !isNaN(bits) ? Math.max(0, Math.floor(bits)) : 0;
  return b.toLocaleString('en-US');
}

export function sendScoreboard(
  client: any,
  is119: boolean = true,
  islandName: string = 'Your Island',
  initialPurse: number = 0.0,
  initialTimeLine: string = '§fTime: §712:00pm §e☀',
  initialDateLine: string = '§fDate: §bLate Autumn 1st',
  initialLocationName?: string,
  initialBits: number = 0
): void {
  try {
    const title = TITLE_FRAMES[currentTitleIndex];
    const locationLabel = initialLocationName || islandName;

    // 0. Remove previous Objective 'sb' first to wipe all previous scoreboard score lines completely
    try {
      client.write('scoreboard_objective', {
        name: 'sb',
        action: 1 // REMOVE
      });
    } catch (_) {}

    // 1. Create Objective 'sb' fresh
    if (is119) {
      client.write('scoreboard_objective', {
        name: 'sb',
        action: 0, // CREATE
        displayText: JSON.stringify({ text: title }),
        type: 0
      });
    } else {
      client.write('scoreboard_objective', {
        name: 'sb',
        action: 0,
        displayText: nbt.comp({ text: nbt.string(title) }),
        type: 0,
        number_format: undefined
      });
    }

    client._currentIslandScoreboardName = islandName;
    client._currentZoneScoreboardName = locationLabel;
    client._lastScoreboardDateStr = initialDateLine;
    client._lastScoreboardTimeStr = initialTimeLine;

    // 2. Display on Sidebar (position: 1)
    client.write('scoreboard_display_objective', {
      position: 1,
      name: 'sb'
    });

    const purseFormatted = formatScoreboardPurse(initialPurse);
    const bitsFormatted = formatScoreboardBits(initialBits);
    client._lastScoreboardPurseStr = purseFormatted;
    client._lastScoreboardBitsStr = bitsFormatted;

    // 3. Set Scores (Hypixel layout with Bits & Quest Objective)
    const lines = [
      '§701/10/26 §8mini01A',
      ' ',
      `§fIsland: §a${islandName}`,
      initialDateLine,
      initialTimeLine,
      `§fLocation: ${locationLabel.startsWith('§') ? locationLabel : `§a${locationLabel}`}`,
      '  ',
      `§fPurse: ${COIN_ICON} §6${purseFormatted}`,
      `§fBits: ${BITS_ICON} §b${bitsFormatted}`,
      '   ',
      '§eObjective',
      '§7Currently no active quests',
      '    ',
      '§eplay.zylarpixel.net'
    ];

    lines.forEach((line, idx) => {
      const scoreVal = lines.length - idx;
      if (is119) {
        client.write('scoreboard_score', {
          itemName: line,
          action: 0,
          scoreName: 'sb',
          value: scoreVal
        });
      } else {
        client.write('scoreboard_score', {
          itemName: line,
          scoreName: 'sb',
          value: scoreVal,
          display_name: undefined,
          number_format: undefined
        });
      }
    });
  } catch (e) {}
}

export function updatePlayerScoreboardPurse(pData: any): void {
  if (!pData || !pData.client) return;
  const client = pData.client;
  const is119 = pData.is119 !== false;
  const oldPurseStr = client._lastScoreboardPurseStr || pData.lastScoreboardPurseStr || '0.0';
  const newPurseStr = formatScoreboardPurse(pData.purse || 0);

  if (oldPurseStr === newPurseStr) return;

  replaceScoreboardLine(
    client,
    is119,
    `§fPurse: ${COIN_ICON} §6${oldPurseStr}`,
    `§fPurse: ${COIN_ICON} §6${newPurseStr}`,
    7
  );
  client._lastScoreboardPurseStr = newPurseStr;
  pData.lastScoreboardPurseStr = newPurseStr;
}

export function updatePlayerScoreboardBits(pData: any): void {
  if (!pData || !pData.client) return;
  const client = pData.client;
  const is119 = pData.is119 !== false;
  const oldBitsStr = client._lastScoreboardBitsStr || pData.lastScoreboardBitsStr || '0';
  const newBitsStr = formatScoreboardBits(pData.bits || 0);

  if (oldBitsStr === newBitsStr) return;

  replaceScoreboardLine(
    client,
    is119,
    `§fBits: ${BITS_ICON} §b${oldBitsStr}`,
    `§fBits: ${BITS_ICON} §b${newBitsStr}`,
    6
  );
  client._lastScoreboardBitsStr = newBitsStr;
  pData.lastScoreboardBitsStr = newBitsStr;
}

function replaceScoreboardLine(client: any, is119: boolean, oldLine: string, newLine: string, scoreValue: number): void {
  if (!client || client.ended || client.state === 'closed') return;
  try {
    if (is119) {
      if (oldLine) {
        client.write('scoreboard_score', {
          itemName: oldLine,
          action: 1,
          scoreName: 'sb'
        });
      }
      client.write('scoreboard_score', {
        itemName: newLine,
        action: 0,
        scoreName: 'sb',
        value: scoreValue
      });
    } else {
      if (oldLine) {
        client.write('reset_score', {
          entity_name: oldLine,
          objective_name: 'sb'
        });
      }
      client.write('scoreboard_score', {
        itemName: newLine,
        scoreName: 'sb',
        value: scoreValue,
        display_name: undefined,
        number_format: undefined
      });
    }
  } catch (_) {}
}

export function updatePlayerScoreboardTimeAndDate(pData: any, timeLine: string, dateLine?: string): void {
  if (!pData || !pData.client) return;
  const client = pData.client;
  const is119 = pData.is119 !== false;

  const prevTime = client._lastScoreboardTimeStr;
  if (timeLine && prevTime !== timeLine) {
    replaceScoreboardLine(client, is119, prevTime || '§fTime: §712:00pm', timeLine, 10);
    client._lastScoreboardTimeStr = timeLine;
  }

  const prevDate = client._lastScoreboardDateStr;
  if (dateLine && prevDate !== dateLine) {
    replaceScoreboardLine(client, is119, prevDate || '§fDate: §bLate Autumn 1st', dateLine, 11);
    client._lastScoreboardDateStr = dateLine;
  }
}

export function updatePlayerScoreboardZone(pData: any, zoneName: string): void {
  if (!pData || !pData.client) return;
  const client = pData.client;
  const is119 = pData.is119 !== false;
  const oldZone = pData.currentZoneScoreboardName || client._currentZoneScoreboardName || client._currentIslandScoreboardName || 'Village';
  if (oldZone === zoneName) return;

  const formatLoc = (loc: string) => `§fLocation: ${loc.startsWith('§') ? loc : `§a${loc}`}`;
  replaceScoreboardLine(client, is119, formatLoc(oldZone), formatLoc(zoneName), 9);

  pData.currentZoneScoreboardName = zoneName;
  client._currentZoneScoreboardName = zoneName;
  updateTablist(client, is119, zoneName);
}

export function updateTablist(client: any, is119: boolean = true, islandName: string = 'Your Island'): void {
  try {
    const formattedArea = islandName.startsWith('§') ? islandName : `§a${islandName}`;
    const headerStr = '§6§lZYLARPIXEL NETWORK §7(SkyBlock)\n§fplay.zylarpixel.net';
    const footerStr = `\n§7Area: ${formattedArea} §8| §7Server: §6ZL-01\n§7Type §e/island §7or §e/is §7to return home`;

    if (is119) {
      client.write('playerlist_header', {
        header: JSON.stringify({ text: headerStr }),
        footer: JSON.stringify({ text: footerStr })
      });
    } else {
      client.write('playerlist_header', {
        header: nbt.comp({ text: nbt.string(headerStr) }),
        footer: nbt.comp({ text: nbt.string(footerStr) })
      });
    }
  } catch (e) {}
}

export function updatePlayerScoreboardLocation(target: any, arg2?: any, arg3?: any): void {
  let client: any;
  let is119: boolean;
  let islandName: string;
  let pData: any;

  if (target && target.client) {
    pData = target;
    client = target.client;
    is119 = target.is119;
    islandName = typeof arg2 === 'string' ? arg2 : 'Your Island';
  } else {
    client = target;
    is119 = !!arg2;
    islandName = typeof arg3 === 'string' ? arg3 : 'Your Island';
  }

  const oldName = (pData && pData.currentIslandScoreboardName) || client._currentIslandScoreboardName || 'Your Island';
  if (oldName === islandName) return;

  try {
    if (is119) {
      // 1. Remove old score lines
      client.write('scoreboard_score', {
        itemName: `§fIsland: §a${oldName}`,
        action: 1,
        scoreName: 'sb'
      });
      client.write('scoreboard_score', {
        itemName: `§fLocation: §a${oldName}`,
        action: 1,
        scoreName: 'sb'
      });

      // 2. Add new score lines
      client.write('scoreboard_score', {
        itemName: `§fIsland: §a${islandName}`,
        action: 0,
        scoreName: 'sb',
        value: 12
      });
      client.write('scoreboard_score', {
        itemName: `§fLocation: §a${islandName}`,
        action: 0,
        scoreName: 'sb',
        value: 9
      });
    } else {
      // 1.21.1 uses reset_score to delete lines
      client.write('reset_score', {
        entity_name: `§fIsland: §a${oldName}`,
        objective_name: 'sb'
      });
      client.write('reset_score', {
        entity_name: `§fLocation: §a${oldName}`,
        objective_name: 'sb'
      });

      // Add new score lines
      client.write('scoreboard_score', {
        itemName: `§fIsland: §a${islandName}`,
        scoreName: 'sb',
        value: 12,
        display_name: undefined,
        number_format: undefined
      });
      client.write('scoreboard_score', {
        itemName: `§fLocation: §a${islandName}`,
        scoreName: 'sb',
        value: 9,
        display_name: undefined,
        number_format: undefined
      });
    }
  } catch (e) {}

  if (pData) pData.currentIslandScoreboardName = islandName;
  client._currentIslandScoreboardName = islandName;
  updateTablist(client, is119, islandName);
}

function shortPlayerTeamKey(username: string): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (clean.length <= 11 && clean.length === username.length) return clean;
  let hash = 2166136261;
  for (let i = 0; i < username.length; i++) {
    hash ^= username.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36).padStart(4, '0').slice(-4);
  return `${clean.slice(0, 6)}_${suffix}`;
}

export function sendScoreboardTeam(client: any, username: string, rank: RankDefinition, is119: boolean = true): void {
  const sortOrder = String(Math.max(0, 999 - rank.weight)).padStart(3, '0');
  const teamName = `r${sortOrder}_${shortPlayerTeamKey(username)}`;
  const prefixStr = `${rank.prefix} `;

  try {
    try { client.write('teams', { team: teamName, mode: 1 }); } catch (e) {}

    if (is119) {
      client.write('teams', {
        team: teamName,
        mode: 0,
        name: JSON.stringify({ text: rank.name }),
        friendlyFire: 0,
        nameTagVisibility: 'always',
        collisionRule: 'never',
        formatting: rank.colorCode,
        prefix: JSON.stringify({ text: prefixStr }),
        suffix: JSON.stringify({ text: '' }),
        players: [username]
      });
    } else {
      client.write('teams', {
        team: teamName,
        mode: 0,
        name: nbt.comp({ text: nbt.string(rank.name) }),
        friendlyFire: 0,
        nameTagVisibility: 'always',
        collisionRule: 'never',
        formatting: rank.colorCode,
        prefix: nbt.comp({ text: nbt.string(prefixStr) }),
        suffix: nbt.comp({ text: nbt.string('') }),
        players: [username]
      });
    }
  } catch (e) {}
}

let scoreboardAnimationInterval: NodeJS.Timeout | null = null;

export function stopScoreboardAnimation(): void {
  if (scoreboardAnimationInterval) {
    clearInterval(scoreboardAnimationInterval);
    scoreboardAnimationInterval = null;
  }
}

export function startScoreboardAnimation(playersMap: Map<any, any>): NodeJS.Timeout {
  stopScoreboardAnimation();
  scoreboardAnimationInterval = setInterval(() => {
    try {
      currentTitleIndex = (currentTitleIndex + 1) % TITLE_FRAMES.length;
      const titleText = TITLE_FRAMES[currentTitleIndex];

      for (const [_, p] of playersMap) {
        if (!p?.client || p.client.ended || p.client.state === 'closed') continue;
        try {
          if (p.is119 !== false) {
            p.client.write('scoreboard_objective', {
              name: 'sb',
              action: 2,
              displayText: JSON.stringify({ text: titleText }),
              type: 0
            });
          } else {
            p.client.write('scoreboard_objective', {
              name: 'sb',
              action: 2,
              displayText: nbt.comp({ text: nbt.string(titleText) }),
              type: 0,
              number_format: undefined
            });
          }
        } catch (e) {}
      }
    } catch (_) {}
  }, 250);
  return scoreboardAnimationInterval;
}

export function initBelowNameHealth(client: any, is119: boolean = true): void {
  try {
    try {
      client.write('scoreboard_objective', {
        name: 'health',
        action: 1 // REMOVE
      });
    } catch (_) {}

    if (is119) {
      client.write('scoreboard_objective', {
        name: 'health',
        action: 0, // CREATE
        displayText: JSON.stringify({ text: '§c❤' }),
        type: 0 // integer
      });
    } else {
      client.write('scoreboard_objective', {
        name: 'health',
        action: 0,
        displayText: nbt.comp({ text: nbt.string('§c❤') }),
        type: 0,
        number_format: undefined
      });
    }

    client.write('scoreboard_display_objective', {
      position: 2, // 2 = below_name
      name: 'health'
    });
  } catch (e) {}
}

export function updatePlayerHealthScore(observerClient: any, targetUsername: string, health: number, is119: boolean = true): void {
  try {
    const val = Math.max(0, Math.ceil(health));
    if (is119) {
      observerClient.write('scoreboard_score', {
        itemName: targetUsername,
        action: 0,
        scoreName: 'health',
        value: val
      });
    } else {
      observerClient.write('scoreboard_score', {
        itemName: targetUsername,
        scoreName: 'health',
        value: val,
        display_name: undefined,
        number_format: undefined
      });
    }
  } catch (_) {}
}

