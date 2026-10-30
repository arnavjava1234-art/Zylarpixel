/**
 * ZylarPixel Command Registry & Tab Completion Engine
 * Sends declare_commands to turn command text white and enables Brigadier suggestions
 * Handles packet_tab_complete for dynamic suggestions (/visit <player>, /rank <rank>)
 */

import { getAllDiskPlayerNames } from '../storage/diskStorage';
import { PlayerSession } from '../types';
import { getAllItemIds } from '../items';

export interface CommandDefinition {
  name: string;
  description: string;
  opOnly?: boolean;
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { name: 'hub', description: 'Warp to Village Island Portal' },
  { name: 'spawn', description: 'Warp to Village Island Portal' },
  { name: 'warp', description: 'Warp to locations (/warp hub)' },
  { name: 'is', description: 'Teleport to your private island' },
  { name: 'island', description: 'Teleport to your private island' },
  { name: 'visit', description: 'Visit any player island' },
  { name: 'sbmenu', description: 'Open the SkyBlock Menu' },
  { name: 'menu', description: 'Open the SkyBlock Menu' },
  { name: 'craft', description: 'Open your portable SkyBlock crafting table' },
  { name: 'workbench', description: 'Open your portable SkyBlock crafting table' },
  { name: 'stats', description: 'View your SkyBlock combat & survivability stats' },
  { name: 'help', description: 'Display available commands' },
  { name: 'reset', description: 'Reset your island modifications' },
  { name: 'admin', description: 'Open Master Staff Admin GUI', opOnly: true },
  { name: 'rank', description: 'Assign ranks to players', opOnly: true },
  { name: 'bypass', description: 'Toggle Admin Guest Build Bypass', opOnly: true },
  { name: 'restart', description: 'Reboot backend server and reload code from disk', opOnly: true },
  { name: 'op', description: 'Grant operator status', opOnly: true },
  { name: 'deop', description: 'Revoke operator status', opOnly: true },
  { name: 'coins', description: 'Manage player purse balance (/coins <player> set/add/remove <amount>)', opOnly: true },
  { name: 'money', description: 'Manage player purse balance (/money <player> set/add/remove <amount>)', opOnly: true },
  { name: 'coin', description: 'Manage player purse balance (/coin <player> set/add/remove <amount>)', opOnly: true },
  { name: 'give', description: 'Give custom SkyBlock item (/give [player] <itemId> [count])', opOnly: true },
  { name: 'item', description: 'Spawn custom SkyBlock item (/item <itemId> [count])', opOnly: true }
];

export function sendDeclaredCommands(client: any, isOp: boolean, isMaster: boolean = false): void {
  const allowed = COMMAND_DEFINITIONS.filter(c => !c.opOnly || isOp || (isMaster && (c.name === 'op' || c.name === 'deop')));

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
    // /warp -> <location> argument child node (e.g. hub)
    else if (c.name === 'warp') {
      const argLocIndex = nodes.length;
      literalNode.children.push(argLocIndex);

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
          name: 'location',
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

    // /coins, /money, /coin -> <player> -> <action> -> <amount>
    else if (c.name === 'coins' || c.name === 'money' || c.name === 'coin') {
      const argPlayerIndex = nodes.length;
      literalNode.children.push(argPlayerIndex);

      const actionIndex = argPlayerIndex + 1;
      const amountIndex = argPlayerIndex + 2;

      // <player>
      nodes.push({
        flags: {
          command_node_type: 2,
          has_command: 0,
          has_redirect_node: 0,
          has_custom_suggestions: 1,
          unused: 0
        },
        children: [actionIndex],
        redirectNode: undefined,
        extraNodeData: {
          name: 'player',
          parser: 'brigadier:string',
          properties: 'SINGLE_WORD',
          suggestionType: 'minecraft:ask_server'
        }
      });

      // <action> (set, add, remove)
      nodes.push({
        flags: {
          command_node_type: 2,
          has_command: 0,
          has_redirect_node: 0,
          has_custom_suggestions: 1,
          unused: 0
        },
        children: [amountIndex],
        redirectNode: undefined,
        extraNodeData: {
          name: 'action',
          parser: 'brigadier:string',
          properties: 'SINGLE_WORD',
          suggestionType: 'minecraft:ask_server'
        }
      });

      // <amount>
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
          name: 'amount',
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

  const isMaster = (pData.username || '').toLowerCase() === 'arnavjava';

  const allowedCmds = COMMAND_DEFINITIONS
    .filter(c => !c.opOnly || pData.isOp || (isMaster && (c.name === 'op' || c.name === 'deop')))
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

  // Sub-case B: /rank <player> [rank] OR /rank <rank>
  else if (mainCmd === 'rank' && pData.isOp) {
    const rankIds = ['owner', 'admin', 'developer', 'mod', 'helper', 'mvp++', 'mvp+', 'mvp', 'vip+', 'vip', 'default'];
    if (currentArgIndex === 1) {
      const allNames = getUniquePlayerNames();
      const rankMatches = rankIds
        .filter(r => r.toLowerCase().startsWith(currentArg))
        .map(r => ({ match: r, tooltip: undefined }));
      const nameMatches = allNames
        .filter(n => n.toLowerCase().startsWith(currentArg))
        .map(n => ({ match: n, tooltip: undefined }));
      candidateMatches = [...rankMatches, ...nameMatches];
    } else if (currentArgIndex === 2) {
      candidateMatches = rankIds
        .filter(r => r.toLowerCase().startsWith(currentArg))
        .map(r => ({ match: r, tooltip: undefined }));
    }
  }

  // Sub-case C: /op <player> or /deop <player>
  else if ((mainCmd === 'op' || mainCmd === 'deop') && (pData.isOp || isMaster) && currentArgIndex === 1) {
    const allNames = getUniquePlayerNames();
    candidateMatches = allNames
      .filter(n => n.toLowerCase().startsWith(currentArg))
      .map(n => ({ match: n, tooltip: undefined }));
  }

  // Sub-case D: /warp <location> (hub)
  else if (mainCmd === 'warp' && currentArgIndex === 1) {
    const warpLocs = ['hub'];
    candidateMatches = warpLocs
      .filter(loc => loc.startsWith(currentArg))
      .map(loc => ({ match: loc, tooltip: undefined }));
  }

  // Sub-case E: /coins, /money, /coin <player> <action> <amount>
  else if ((mainCmd === 'coins' || mainCmd === 'money' || mainCmd === 'coin') && pData.isOp) {
    if (currentArgIndex === 1) {
      const allNames = getUniquePlayerNames();
      candidateMatches = allNames
        .filter(n => n.toLowerCase().startsWith(currentArg))
        .map(n => ({ match: n, tooltip: undefined }));
    } else if (currentArgIndex === 2) {
      const actions = ['set', 'add', 'remove'];
      candidateMatches = actions
        .filter(a => a.toLowerCase().startsWith(currentArg))
        .map(a => ({ match: a, tooltip: undefined }));
    } else if (currentArgIndex === 3) {
      const amounts = ['1000', '10k', '100k', '1m', '10m', '50m'];
      candidateMatches = amounts
        .filter(amt => amt.toLowerCase().startsWith(currentArg))
        .map(amt => ({ match: amt, tooltip: undefined }));
    }
  }

  // Sub-case F: /give <player> <item> or /item <item>
  else if ((mainCmd === 'give' || mainCmd === 'item') && pData.isOp) {
    const itemIds = getAllItemIds();
    if (mainCmd === 'item' && currentArgIndex === 1) {
      candidateMatches = itemIds
        .filter(id => id.toLowerCase().startsWith(currentArg))
        .map(id => ({ match: id, tooltip: undefined }));
    } else if (mainCmd === 'give') {
      if (currentArgIndex === 1) {
        const allNames = getUniquePlayerNames();
        const nameMatches = allNames
          .filter(n => n.toLowerCase().startsWith(currentArg))
          .map(n => ({ match: n, tooltip: undefined }));
        const itemMatches = itemIds
          .filter(id => id.toLowerCase().startsWith(currentArg))
          .map(id => ({ match: id, tooltip: undefined }));
        candidateMatches = [...itemMatches, ...nameMatches];
      } else if (currentArgIndex === 2) {
        candidateMatches = itemIds
          .filter(id => id.toLowerCase().startsWith(currentArg))
          .map(id => ({ match: id, tooltip: undefined }));
      }
    }
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
