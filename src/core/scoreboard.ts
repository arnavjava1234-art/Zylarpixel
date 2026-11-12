/**
 * ZylarPixel Animated Scoreboard & Tablist Manager
 * Controls the sidebar objective, tablist headers, and 3D nametag teams
 * Supports both 1.19.2 (JSON strings) and 1.21.1 (anonymousNbt) protocols
 */

import * as nbt from 'prismarine-nbt';
import { PlayerSession } from '../types';
import { RankDefinition } from '../config/ranks';

export const TITLE_FRAMES = [
  '§d§lZYLARPIXEL',
  '§d§lZYLARPIXEL',
  '§d§lZYLARPIXEL',
  '§f§lZYLARPIXEL',
  '§d§lZYLARPIXEL',
  '§e§lSKYBLOCK',
  '§e§lSKYBLOCK',
  '§6§lS§e§lKYBLOCK',
  '§e§lS§6§lK§e§lYBLOCK',
  '§e§lSK§6§lY§e§lBLOCK',
  '§e§lSKY§6§lB§e§lLOCK',
  '§e§lSKYB§6§lL§e§lOCK',
  '§e§lSKYBL§6§lO§e§lCK',
  '§e§lSKYBLO§6§lC§e§lK',
  '§e§lSKYBLOC§6§lK',
  '§f§lSKYBLOCK',
  '§e§lSKYBLOCK',
  '§e§lSKYBLOCK'
];

let currentTitleIndex = 0;

export function formatScoreboardPurse(purse: number): string {
  const p = typeof purse === 'number' && !isNaN(purse) ? purse : 0.0;
  return p.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function sendScoreboard(client: any, is119: boolean = true, islandName: string = 'Your Island', initialPurse: number = 0.0): void {
  try {
    const title = TITLE_FRAMES[currentTitleIndex];

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

    // 2. Display on Sidebar (position: 1)
    client.write('scoreboard_display_objective', {
      position: 1,
      name: 'sb'
    });

    const purseFormatted = formatScoreboardPurse(initialPurse);
    client._lastScoreboardPurseStr = purseFormatted;

    // 3. Set Scores (Hypixel layout with Bits & Quest Objective)
    const lines = [
      '§701/10/26 §8mini01A',
      ' ',
      `§fIsland: §a${islandName}`,
      '§fDate: §bLate Autumn 1st',
      '§fTime: §712:00pm',
      `§fLocation: §a${islandName}`,
      '  ',
      `§fPurse: §6${purseFormatted}`,
      '§fBits: §b0',
      '   ',
      '§eObjective',
      '§7Currently no active quests',
      '    ',
      '§dplay.zylarpixel.net'
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
  const is119 = pData.is119;
  const oldPurseStr = client._lastScoreboardPurseStr || pData.lastScoreboardPurseStr || '0.0';
  const newPurseStr = formatScoreboardPurse(pData.purse || 0);

  if (oldPurseStr === newPurseStr) return;

  try {
    if (is119) {
      client.write('scoreboard_score', {
        itemName: `§fPurse: §6${oldPurseStr}`,
        action: 1,
        scoreName: 'sb'
      });
      client.write('scoreboard_score', {
        itemName: `§fPurse: §6${newPurseStr}`,
        action: 0,
        scoreName: 'sb',
        value: 7
      });
    } else {
      client.write('reset_score', {
        entity_name: `§fPurse: §6${oldPurseStr}`,
        objective_name: 'sb'
      });
      client.write('scoreboard_score', {
        itemName: `§fPurse: §6${newPurseStr}`,
        scoreName: 'sb',
        value: 7,
        display_name: undefined,
        number_format: undefined
      });
    }
    client._lastScoreboardPurseStr = newPurseStr;
    pData.lastScoreboardPurseStr = newPurseStr;
  } catch (_) {}
}

export function updateTablist(client: any, is119: boolean = true, islandName: string = 'Your Island'): void {
  try {
    const headerStr = '§d§lZYLARPIXEL NETWORK §7(SkyBlock)\n§fplay.zylarpixel.net';
    const footerStr = `\n§7Area: §a${islandName} §8| §7Server: §dZL-01\n§7Type §e/island §7or §e/is §7to return home`;

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

export function sendScoreboardTeam(client: any, username: string, rank: RankDefinition, is119: boolean = true): void {
  const teamName = 'team_' + rank.id;
  const prefixStr = rank.id === 'default' ? '§7' : `${rank.prefix} `;

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

