/**
 * ZylarPixel Command Registry & Tab Completion Engine
 * Sends declare_commands to turn command text white and enables Brigadier suggestions
 * Handles packet_tab_complete for dynamic suggestions (/visit <player>, /rank <rank>)
 */

import { getAllDiskPlayerNames } from '../storage/diskStorage';
import { PlayerSession } from '../types';

export interface CommandDefinition {
  name: string;
  description: string;
  opOnly?: boolean;
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { name: 'is', description: 'Teleport to your private island' },
  { name: 'island', description: 'Teleport to your private island' },
  { name: 'visit', description: 'Visit any player island' },
  { name: 'help', description: 'Display available commands' },
  { name: 'reset', description: 'Reset your island modifications' },
  { name: 'admin', description: 'Open Master Staff Admin GUI', opOnly: true },
  { name: 'rank', description: 'Assign ranks to players', opOnly: true },
  { name: 'bypass', description: 'Toggle Admin Guest Build Bypass', opOnly: true },
  { name: 'restart', description: 'Instant in-memory hot reboot', opOnly: true },
  { name: 'op', description: 'Grant operator status', opOnly: true },
  { name: 'deop', description: 'Revoke operator status', opOnly: true }
];

export function sendDeclaredCommands(client: any, isOp: boolean): void {
  const allowed = COMMAND_DEFINITIONS.filter(c => !c.opOnly || isOp);

  const nodes: any[] = [];

  // Root node is index 0
  const rootNode = {
    flags: {
      command_node_type: 0,
      has_command: 0,
      has_redirect_node: 0,
      has_custom_suggestions: 0,
      unused: 0
    },
    children: [] as number[],
    redirectNode: undefined,
    extraNodeData: undefined
  };
  nodes.push(rootNode);

  for (const c of allowed) {
    const literalIndex = nodes.length;
    rootNode.children.push(literalIndex);

    // Literal command node
    const literalNode: any = {
      flags: {
        command_node_type: 1, // literal command
        has_command: 1,       // executable
        has_redirect_node: 0,
        has_custom_suggestions: 0,
        unused: 0
      },
      children: [] as number[],
      redirectNode: undefined,
      extraNodeData: { name: c.name }
    };
    nodes.push(literalNode);

    // /visit, /op, /deop -> <player> argument child node
    if (c.name === 'visit' || c.name === 'op' || c.name === 'deop') {
      const argPlayerIndex = nodes.length;
      literalNode.children.push(argPlayerIndex);

      nodes.push({
        flags: {
          command_node_type: 2, // argument node
          has_command: 1,       // executable with argument
          has_redirect_node: 0,
          has_custom_suggestions: 1, // asks server for custom suggestions
          unused: 0
        },
        children: [] as number[],
        redirectNode: undefined,
        extraNodeData: {
          name: 'player',
          parser: 'brigadier:string',
          properties: 'SINGLE_WORD',
          suggestionType: 'minecraft:ask_server'
        }
      });
    }

    // /rank -> <player> -> <rank> argument chain
    else if (c.name === 'rank') {
      const argPlayerIndex = nodes.length;
      literalNode.children.push(argPlayerIndex);

      const argRankIndex = nodes.length + 1;

      // <player> node
      nodes.push({
        flags: {
          command_node_type: 2,
          has_command: 1,
          has_redirect_node: 0,
          has_custom_suggestions: 1,
          unused: 0
        },
        children: [argRankIndex],
        redirectNode: undefined,
        extraNodeData: {
          name: 'player',
          parser: 'brigadier:string',
          properties: 'SINGLE_WORD',
          suggestionType: 'minecraft:ask_server'
        }
      });

      // <rank> node
      nodes.push({
        flags: {
          command_node_type: 2,
          has_command: 1,
          has_redirect_node: 0,
          has_custom_suggestions: 1,
          unused: 0
        },
        children: [] as number[],
        redirectNode: undefined,
        extraNodeData: {
          name: 'rank',
          parser: 'brigadier:string',
          properties: 'SINGLE_WORD',
          suggestionType: 'minecraft:ask_server'
        }
      });
    }
  }

  try {
    client.write('declare_commands', {
      nodes,
      rootIndex: 0
    });
  } catch (e) {}
}

export function handleTabComplete(client: any, pData: any, data: any, onlinePlayersMap: Map<number, any>): void {
  if (!data || typeof data.text !== 'string') return;

  const raw = data.text;
  const transactionId = data.transactionId;

  // Only handle commands (starting with /)
  if (!raw.startsWith('/')) {
    try {
      client.write('tab_complete', {
        transactionId,
        start: 0,
        length: raw.length,
        matches: []
      });
    } catch (e) {}
    return;
  }

  const clean = raw.slice(1);
  const parts = clean.split(' ');
  const mainCmd = parts[0].toLowerCase();

  const allowedCmds = COMMAND_DEFINITIONS
    .filter(c => !c.opOnly || pData.isOp)
    .map(c => c.name);

  // Case 1: Primary command suggestion, e.g. "/v" or "/"
  if (parts.length === 1) {
    const query = parts[0].toLowerCase();
    const matches = allowedCmds
      .filter(cmd => cmd.startsWith(query))
      .map(cmd => ({ match: '/' + cmd, tooltip: undefined }));

    try {
      client.write('tab_complete', {
        transactionId,
        start: 0,
        length: raw.length,
        matches
      });
    } catch (e) {}
    return;
  }

  // Case 2: Argument suggestions, e.g. "/visit z" or "/rank zylarbot "
  const currentArgIndex = parts.length - 1;
  const currentArg = parts[currentArgIndex].toLowerCase();
  const startPos = raw.length - parts[currentArgIndex].length;

  // Helper to obtain case-insensitive distinct player names preserving true original casing
  function getUniquePlayerNames(): string[] {
    const nameMap = new Map<string, string>(); // lowercase -> exact original casing

    // 1. Stored disk players (provides exact casing from .json profile)
    for (const diskName of getAllDiskPlayerNames()) {
      if (diskName) nameMap.set(diskName.toLowerCase(), diskName);
    }

    // 2. Currently online players (highest priority for active session casing)
    for (const [_, p] of onlinePlayersMap) {
      if (p && p.username) {
        nameMap.set(p.username.toLowerCase(), p.username);
      }
    }

    return Array.from(nameMap.values());
  }

  let candidateMatches: any[] = [];

  // Sub-case A: /visit <player>
  if (mainCmd === 'visit' && currentArgIndex === 1) {
    const allNames = getUniquePlayerNames();
    candidateMatches = allNames
      .filter(n => n.toLowerCase().startsWith(currentArg))
      .map(n => ({ match: n, tooltip: undefined }));
  }

  // Sub-case B: /rank <player> [rank]
  else if (mainCmd === 'rank' && pData.isOp) {
    if (currentArgIndex === 1) {
      const allNames = getUniquePlayerNames();
      candidateMatches = allNames
        .filter(n => n.toLowerCase().startsWith(currentArg))
        .map(n => ({ match: n, tooltip: undefined }));
    } else if (currentArgIndex === 2) {
      const rankIds = ['vip', 'vip_plus', 'mvp', 'mvp_plus', 'admin', 'developer', 'owner', 'default'];
      candidateMatches = rankIds
        .filter(r => r.startsWith(currentArg))
        .map(r => ({ match: r, tooltip: undefined }));
    }
  }

  // Sub-case C: /op <player> or /deop <player>
  else if ((mainCmd === 'op' || mainCmd === 'deop') && pData.isOp && currentArgIndex === 1) {
    const allNames = getUniquePlayerNames();
    candidateMatches = allNames
      .filter(n => n.toLowerCase().startsWith(currentArg))
      .map(n => ({ match: n, tooltip: undefined }));
  }

  try {
    client.write('tab_complete', {
      transactionId,
      start: startPos,
      length: parts[currentArgIndex].length,
      matches: candidateMatches
    });
  } catch (e) {}
}
