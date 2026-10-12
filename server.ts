/**
 * ZylarPixel SkyBlock Server Core (TypeScript)
 * High-performance, modular custom Minecraft server engine
 * Features:
 * - Full Multiplayer Entity Synchronization (named_entity_spawn, 3D player avatars, skin layers)
 * - Complete Multiplayer Tablist Sync (all players visible with prefixes & ping)
 * - Guest Island Protection (visitors cannot grief/break blocks on other islands)
 * - Solid Void Fall Collision Fix (view position & chunk re-anchoring, zero block pass-through)
 * - In-Memory Hot Reboot: /restart cleanly re-initializes in 250ms without process exit
 * - Multi-Island Engine: 1,000 block void spacing per player
 * - /visit <player> system with disk persistence and offline player lookup
 */

import * as mc from 'minecraft-protocol';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  mcData1192,
  mcData1211,
  setWorldBlock,
  getWorldBlockName,
  dumpChunkPacket,
  BLOCK_DROPS,
  ITEM_TO_BLOCK
} from './src/world/worldManager';
import {
  generateStarterIslands,
  generatePlayerIsland,
  resetPlayerIsland
} from './src/world/islandGenerator';
import {
  sendScoreboard,
  updateTablist,
  updatePlayerScoreboardLocation,
  sendScoreboardTeam,
  startScoreboardAnimation
} from './src/core/scoreboard';
import { formatPlayerName, formatChatMessage, RANKS } from './src/config/ranks';
import {
  players,
  islandPvpSettings,
  createPlayerSession,
  removePlayerSession,
  setPlayerRank,
  sendSystemMessage,
  persistPlayerSession
} from './src/players/playerManager';
import { handleCommand, teleportPlayerWithChunks } from './src/commands/commandHandler';
import { openAdminMenu } from './src/gui/adminMenu';
import { openRankSelector, RANK_SLOT_MAP } from './src/gui/rankSelector';
import { openPlayerSelector } from './src/gui/playerSelector';
import {
  savePlayerIslandBlock,
  getAllDiskPlayerNames,
  loadPlayerData
} from './src/storage/diskStorage';
import { sendDeclaredCommands, handleTabComplete } from './src/commands/commandRegistry';

console.log('⚡ Initializing ZylarPixel Modular SkyBlock Engine (TypeScript)...');
const startTime = performance.now();

// 1. Generate Master Island
generateStarterIslands();

// 2. Start Animated Scoreboard Glint Loop
startScoreboardAnimation(players);

let teleportCounter = 1;
let nextEntityId = 5000;
let serverInstance: any = null;
let isRestarting = false;

// Dropped Item Entities in World: entityId -> { entityId, itemId, count, name, x, y, z, spawnTime }
interface DroppedItem {
  entityId: number;
  itemId: number;
  count: number;
  name: string;
  x: number;
  y: number;
  z: number;
  spawnTime: number;
}
const droppedItems = new Map<number, DroppedItem>();

function getIslandOwnerForCoords(x: number, z: number, fallbackUser: string): string {
  const originX = Math.round(x / 1000) * 1000;
  for (const [_, p] of players) {
    if (p.island && p.island.originX === originX) {
      return p.username;
    }
  }
  const diskNames = getAllDiskPlayerNames();
  for (const name of diskNames) {
    const data = loadPlayerData(name);
    if (data && data.island && data.island.originX === originX) {
      return data.username || name;
    }
  }
  return fallbackUser;
}

function reGenerateWorld(client: any, is119: boolean): void {
  const pData = players.get(client.id);
  if (!pData || !pData.island) return;

  resetPlayerIsland(pData.username, pData.island.originX, pData.island.originZ);
  pData.loadedChunks = new Set<string>();
  const baseChunkX = Math.floor(pData.island.spawnX / 16);
  const baseChunkZ = Math.floor(pData.island.spawnZ / 16);

  if (!is119) {
    try { client.write('chunk_batch_start', {}); } catch (e) {}
  }
  for (let cx = baseChunkX - 3; cx <= baseChunkX + 3; cx++) {
    for (let cz = baseChunkZ - 2; cz <= baseChunkZ + 4; cz++) {
      pData.loadedChunks.add(`${cx},${cz}`);
      client.write('map_chunk', dumpChunkPacket(cx, cz, is119));
    }
  }
  if (!is119) {
    try { client.write('chunk_batch_finished', { batchSize: 49 }); } catch (e) {}
  }
}

// ==========================================
// MULTIPLAYER 3D PLAYER ENTITY SYNCHRONIZATION
// ==========================================
function toProtocolByte(deg: number): number {
  let byte = Math.floor((deg || 0) * 256 / 360) % 256;
  if (byte < 0) byte += 256;
  if (byte > 127) byte -= 256;
  return byte;
}

function spawnPlayerForObserver(observerPData: any, targetPData: any): void {
  if (observerPData.client.id === targetPData.client.id) return;
  if (observerPData.spawnedPlayers.has(targetPData.entityId)) return;

  observerPData.spawnedPlayers.add(targetPData.entityId);

  try {
    const yawByte = toProtocolByte(targetPData.yaw);
    const pitchByte = toProtocolByte(targetPData.pitch);

    if (observerPData.is119) {
      observerPData.client.write('named_entity_spawn', {
        entityId: targetPData.entityId,
        playerUUID: targetPData.client.uuid,
        x: targetPData.x,
        y: targetPData.y,
        z: targetPData.z,
        yaw: yawByte,
        pitch: pitchByte
      });
      // Enable all 7 skin layers (jacket, sleeves, pants, hat)
      observerPData.client.write('entity_metadata', {
        entityId: targetPData.entityId,
        metadata: [
          { key: 17, type: 0, value: 127 }
        ]
      });
      observerPData.client.write('entity_head_rotation', {
        entityId: targetPData.entityId,
        headYaw: yawByte
      });
    } else {
      observerPData.client.write('spawn_entity', {
        entityId: targetPData.entityId,
        objectUUID: targetPData.client.uuid,
        type: 128, // Player in 1.21.1
        x: targetPData.x,
        y: targetPData.y,
        z: targetPData.z,
        pitch: pitchByte,
        yaw: yawByte,
        headPitch: pitchByte,
        objectData: 0,
        velocity: { x: 0, y: 0, z: 0 }
      });
      observerPData.client.write('entity_metadata', {
        entityId: targetPData.entityId,
        metadata: [
          { key: 17, type: 0, value: 127 }
        ]
      });
      observerPData.client.write('entity_head_rotation', {
        entityId: targetPData.entityId,
        headYaw: yawByte
      });
    }
  } catch (e) {}
}

function despawnPlayerForObserver(observerPData: any, targetPData: any): void {
  if (!observerPData.spawnedPlayers.has(targetPData.entityId)) return;
  observerPData.spawnedPlayers.delete(targetPData.entityId);

  try {
    observerPData.client.write('entity_destroy', {
      entityIds: [targetPData.entityId]
    });
  } catch (e) {}
}

function syncNearbyPlayers(pData: any): void {
  for (const [_, other] of players) {
    if (other.client.id === pData.client.id) continue;
    const dist = Math.hypot(pData.x - other.x, pData.y - other.y, pData.z - other.z);
    if (dist <= 96.0) {
      spawnPlayerForObserver(pData, other);
      spawnPlayerForObserver(other, pData);
    } else if (dist > 128.0) {
      despawnPlayerForObserver(pData, other);
      despawnPlayerForObserver(other, pData);
    }
  }
}

// In-Memory Hot Reboot: Zero process death, 100% reliable on Windows!
function triggerServerRestart(): void {
  if (isRestarting) return;
  isRestarting = true;

  console.log('\n=================================================');
  console.log('🔄 HOT RESTART TRIGGERED! Rebooting ZylarPixel Engine in-memory...');
  console.log('=================================================');

  for (const [_, p] of players) {
    try {
      persistPlayerSession(p);
      p.client.end('§d§lZYLARPIXEL SKYBLOCK\n\n§cServer is restarting!\n§ePlease reconnect in 2 seconds...');
      p.client.destroy();
    } catch (e) {}
  }
  players.clear();
  droppedItems.clear();

  if (serverInstance) {
    try {
      serverInstance.close();
    } catch (e) {}

    serverInstance.on('close', () => {
      console.log('🛑 Old network listener closed.');
      setTimeout(() => {
        console.log('⚡ Reloading world generator & island diffs...');
        generateStarterIslands();
        startServerInstance();
        isRestarting = false;
        console.log('✅ ZylarPixel Hot Reboot Complete! Port 25565 is open.');
      }, 250);
    });
  } else {
    startServerInstance();
    isRestarting = false;
  }
}

// Server Instance Factory
function startServerInstance(): void {
  serverInstance = (mc as any).createServer({
    'online-mode': false,
    encryption: false,
    host: '0.0.0.0',
    port: 25565,
    version: false,
    fallbackVersion: '1.21.1',
    maxPlayers: 50,
    motd: '§d§lZYLARPIXEL §7[SkyBlock Alpha]',
    registryCodec: mcData1211.loginPacket.dimensionCodec
  } as any);

  serverInstance.on('error', (err: any) => {
    console.error('⚠️ Server socket error:', err.message);
  });

  serverInstance.on('playerJoin', (client: any) => {
    const is119 = (client.protocolVersion === 760 || client.version === '1.19.2');
    const verLabel = is119 ? '1.19.2 (Protocol 760)' : '1.21.1 (Protocol 767)';

    console.log(`\n=================================================`);
    console.log(`[+] ZYLARPIXEL PLAYER JOINED: ${client.username} [${verLabel}]`);
    console.log(`=================================================`);

    const pData = createPlayerSession(client, is119);

    generatePlayerIsland(pData.username, pData.island.originX, pData.island.originZ);

    const spawnX = pData.island.spawnX;
    const spawnY = pData.island.spawnY;
    const spawnZ = pData.island.spawnZ;
    const baseChunkX = Math.floor(spawnX / 16);
    const baseChunkZ = Math.floor(spawnZ / 16);

    // Handshake & Login in Survival Mode (gamemode: 0)
    if (is119) {
      client.write('login', {
        entityId: pData.entityId,
        isHardcore: false,
        gameMode: 0,
        previousGameMode: -1,
        worldNames: ['minecraft:overworld'],
        dimensionCodec: mcData1192.loginPacket.dimensionCodec,
        worldType: 'minecraft:overworld',
        worldName: 'minecraft:overworld',
        hashedSeed: [0, 0],
        maxPlayers: 50,
        viewDistance: 12,
        simulationDistance: 12,
        reducedDebugInfo: false,
        enableRespawnScreen: true,
        isDebug: false,
        isFlat: true,
        death: undefined
      });

      // 1. Add Self to Tablist
      client.write('player_info', {
        action: 'add_player',
        data: [{
          uuid: client.uuid,
          name: client.username,
          properties: [],
          gamemode: 0,
          ping: 1,
          displayName: JSON.stringify({ text: formatPlayerName(pData.rank, client.username) }),
          crypto: undefined
        }]
      });

      // 2. Add All Other Existing Online Players to Self's Tablist
      for (const [_, existing] of players) {
        if (existing.client.id !== client.id) {
          if (is119) {
            client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: existing.client.uuid,
                name: existing.username,
                properties: [],
                gamemode: 0,
                ping: 1,
                displayName: JSON.stringify({ text: formatPlayerName(existing.rank, existing.username) }),
                crypto: undefined
              }]
            });
          }
          sendScoreboardTeam(client, existing.username, existing.rank, is119);
        }
      }

      // 3. Broadcast Self to All Other Online Players' Tablist!
      for (const [_, existing] of players) {
        if (existing.client.id !== client.id) {
          if (existing.is119) {
            existing.client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: client.uuid,
                name: client.username,
                properties: [],
                gamemode: 0,
                ping: 1,
                displayName: JSON.stringify({ text: formatPlayerName(pData.rank, client.username) }),
                crypto: undefined
              }]
            });
          } else {
            existing.client.write('player_info', {
              action: 1 | 4 | 8 | 16,
              data: [{
                uuid: client.uuid,
                player: { name: client.username, properties: [] },
                gamemode: 0,
                listed: 1,
                latency: 1,
                displayName: undefined
              }]
            });
          }
          sendScoreboardTeam(existing.client, client.username, pData.rank, existing.is119);
        }
      }

      client.write('abilities', {
        flags: 0x00,
        flyingSpeed: 0.05,
        walkingSpeed: 0.1
      });

      client.write('update_view_distance', { viewDistance: 12 });
      client.write('update_view_position', { chunkX: baseChunkX, chunkZ: baseChunkZ });

      pData.loadedChunks = new Set<string>();
      pData.currentChunkX = baseChunkX;
      pData.currentChunkZ = baseChunkZ;

      for (let cx = baseChunkX - 3; cx <= baseChunkX + 3; cx++) {
        for (let cz = baseChunkZ - 2; cz <= baseChunkZ + 4; cz++) {
          pData.loadedChunks.add(`${cx},${cz}`);
          client.write('map_chunk', dumpChunkPacket(cx, cz, true));
        }
      }

      client.write('position', {
        x: spawnX,
        y: spawnY,
        z: spawnZ,
        yaw: 0.0,
        pitch: 0.0,
        flags: 0x00,
        teleportId: ++teleportCounter,
        dismountVehicle: false
      });

    } else {
      // 1.21.1 Login
      client.write('login', {
        ...mcData1211.loginPacket,
        entityId: pData.entityId,
        worldState: {
          dimension: 0,
          name: 'minecraft:overworld',
          hashedSeed: [0, 0],
          gamemode: 'survival',
          previousGamemode: 255,
          isDebug: false,
          isFlat: true,
          portalCooldown: 0
        }
      });

      client.write('player_info', {
        action: 1 | 4 | 8 | 16,
        data: [{
          uuid: client.uuid,
          player: { name: client.username, properties: [] },
          gamemode: 0,
          listed: 1,
          latency: 1,
          displayName: undefined
        }]
      });

      // 2. Add All Other Existing Online Players to Self's Tablist (1.21.1)
      for (const [_, existing] of players) {
        if (existing.client.id !== client.id) {
          client.write('player_info', {
            action: 1 | 4 | 8 | 16,
            data: [{
              uuid: existing.client.uuid,
              player: { name: existing.username, properties: [] },
              gamemode: 0,
              listed: 1,
              latency: 1,
              displayName: undefined
            }]
          });
          sendScoreboardTeam(client, existing.username, existing.rank, false);
        }
      }

      // 3. Broadcast Self to All Other Online Players' Tablist! (1.21.1)
      for (const [_, existing] of players) {
        if (existing.client.id !== client.id) {
          if (existing.is119) {
            existing.client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: client.uuid,
                name: client.username,
                properties: [],
                gamemode: 0,
                ping: 1,
                displayName: JSON.stringify({ text: formatPlayerName(pData.rank, client.username) }),
                crypto: undefined
              }]
            });
          } else {
            existing.client.write('player_info', {
              action: 1 | 4 | 8 | 16,
              data: [{
                uuid: client.uuid,
                player: { name: client.username, properties: [] },
                gamemode: 0,
                listed: 1,
                latency: 1,
                displayName: undefined
              }]
            });
          }
          sendScoreboardTeam(existing.client, client.username, pData.rank, existing.is119);
        }
      }

      client.write('abilities', {
        flags: 0x00,
        flyingSpeed: 0.05,
        walkingSpeed: 0.1
      });

      client.write('update_view_position', { chunkX: baseChunkX, chunkZ: baseChunkZ });

      pData.loadedChunks = new Set<string>();
      pData.currentChunkX = baseChunkX;
      pData.currentChunkZ = baseChunkZ;

      client.write('chunk_batch_start', {});
      for (let cx = baseChunkX - 3; cx <= baseChunkX + 3; cx++) {
        for (let cz = baseChunkZ - 2; cz <= baseChunkZ + 4; cz++) {
          pData.loadedChunks.add(`${cx},${cz}`);
          client.write('map_chunk', dumpChunkPacket(cx, cz, false));
        }
      }
      client.write('chunk_batch_finished', { batchSize: 49 });

      client.write('position', {
        x: spawnX,
        y: spawnY,
        z: spawnZ,
        yaw: 0.0,
        pitch: 0.0,
        flags: {},
        teleportId: ++teleportCounter,
        dismountVehicle: false
      });
    }

    // Restore inventory
    for (const [slot, item] of pData.inventory) {
      client.write('set_slot', {
        windowId: 0,
        stateId: 1,
        slot,
        item: {
          present: true,
          itemId: item.itemId,
          itemCount: item.count
        }
      });
    }

    updateTablist(client, is119, 'Your Island');
    sendScoreboard(client, is119, 'Your Island');
    pData.currentIslandScoreboardName = 'Your Island';
    sendScoreboardTeam(client, pData.username, pData.rank, is119);
    sendDeclaredCommands(client, pData.isOp);

    // Initial check for nearby players
    setTimeout(() => syncNearbyPlayers(pData), 150);

    // Welcome Messages
    sendSystemMessage(client, '§r', is119);
    sendSystemMessage(client, `§d§lZYLARPIXEL §7- §bHypixel-Style Modular Engine §7[TypeScript]`, is119);
    sendSystemMessage(client, `§eWelcome back, ${pData.rank.prefix} ${client.username}§e!`, is119);
    sendSystemMessage(client, `§7Your Island Origin: §a(${pData.island.originX}, 100, 0)`, is119);
    sendSystemMessage(client, `§7Commands: §a/is§7, §b/visit <player>§7, §e/help§7${pData.isOp ? ', §e/admin§7, §6/rank§7, §c/restart' : ''}`, is119);
    sendSystemMessage(client, '§r', is119);

    client.on('held_item_slot', (data: any) => {
      if (typeof data.slotId === 'number') {
        pData.selectedSlot = data.slotId;
      }
    });

    client.on('teleport_confirm', (data: any) => {
      if (data && data.teleportId === pData.pendingTeleportId) {
        pData.pendingTeleportId = null;
        pData.teleportLockUntil = 0;
      }
    });

    client.on('tab_complete', (data: any) => {
      handleTabComplete(client, pData, data, players);
    });

    // Respawn Handler with Keep Inventory
    client.on('client_command', (data: any) => {
      if (data && data.action === 0) {
        const spawnX = pData.island ? pData.island.spawnX : 0.5;
        const spawnY = pData.island ? pData.island.spawnY : 101.0;
        const spawnZ = pData.island ? pData.island.spawnZ : 0.5;
        teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
        syncNearbyPlayers(pData);
        updatePlayerScoreboardLocation(client, is119, 'Your Island');

        for (const [slot, item] of pData.inventory) {
          try {
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot,
              item: {
                present: true,
                itemId: item.itemId,
                itemCount: item.count
              }
            });
          } catch (e) {}
        }
      }
    });

    // Arm Swing Animation Broadcast
    client.on('arm_animation', (data: any) => {
      for (const [_, other] of players) {
        if (other.client.id !== client.id && other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          try {
            other.client.write('animation', {
              entityId: pData.entityId,
              animation: (data && data.hand === 1) ? 3 : 0
            });
          } catch (e) {}
        }
      }
    });

    // Combat & Entity Attack Handler (OP-Only Combat System)
    client.on('use_entity', (data: any) => {
      if (!data || data.mouse !== 1) return; // 1 = ATTACK

      const targetEntityId = data.target;
      let targetPData: any = null;

      for (const [_, p] of players) {
        if (p.entityId === targetEntityId) {
          targetPData = p;
          break;
        }
      }

      if (!targetPData) return;

      // RULE: Only OP players can hurt players on other, any, or their own island!
      if (!pData.isOp) {
        const now = Date.now();
        if (!pData.lastPvpNotice || now - pData.lastPvpNotice > 1500) {
          pData.lastPvpNotice = now;
          sendSystemMessage(client, `§cYou cannot attack players on ZylarPixel! Only Operators can attack. 🔒`, is119);

          try {
            client.write('named_sound_effect', {
              soundName: 'entity.villager.no',
              soundCategory: 0,
              x: Math.floor(pData.x * 8),
              y: Math.floor(pData.y * 8),
              z: Math.floor(pData.z * 8),
              volume: 0.8,
              pitch: 1.0,
              seed: [0, 0]
            });
          } catch (e) {}
        }
        return;
      }

      // Attacker IS OP! Apply combat hit to target!
      const targetClient = targetPData.client;

      // A. Broadcast Hurt Animation (Red Flash) to ALL observers
      for (const [_, p] of players) {
        try {
          p.client.write('entity_status', {
            entityId: targetEntityId,
            entityStatus: 2 // 2 = Hurt
          });
        } catch (e) {}
      }

      // B. Sound Effect (entity.player.hurt)
      for (const [_, p] of players) {
        try {
          p.client.write('named_sound_effect', {
            soundName: 'entity.player.hurt',
            soundCategory: 0,
            x: Math.floor(targetPData.x * 8),
            y: Math.floor(targetPData.y * 8),
            z: Math.floor(targetPData.z * 8),
            volume: 1.0,
            pitch: 1.0,
            seed: [0, 0]
          });
        } catch (e) {}
      }

      // C. Knockback Velocity
      const yawRad = (pData.yaw || 0) * Math.PI / 180;
      const knockStrength = 4500;
      const vx = Math.round(-Math.sin(yawRad) * knockStrength);
      const vy = 3000;
      const vz = Math.round(Math.cos(yawRad) * knockStrength);

      try {
        targetClient.write('entity_velocity', {
          entityId: targetEntityId,
          velocity: { x: vx, y: vy, z: vz }
        });
      } catch (e) {}

      for (const [_, p] of players) {
        if (p.client.id !== targetClient.id) {
          try {
            p.client.write('entity_velocity', {
              entityId: targetEntityId,
              velocity: { x: vx, y: vy, z: vz }
            });
          } catch (e) {}
        }
      }
    });

    // Realistic Survival Block Breaking with Guest Island Protection & Instant-Break Fix
    client.on('block_dig', (data: any) => {
      const { x, y, z } = data.location;
      const currentBlock = getWorldBlockName(x, y, z, is119);

      if (!currentBlock || currentBlock === 'air' || currentBlock === 'bedrock' || currentBlock === 'nether_portal') {
        return;
      }

      const mcData = is119 ? mcData1192 : mcData1211;
      const blockDef = mcData.blocksByName[currentBlock];
      const isInstantBreak = blockDef && (blockDef.hardness === 0 || blockDef.hardness === null);

      if (data.status === 2 || (data.status === 0 && isInstantBreak)) {
        const islandOwner = getIslandOwnerForCoords(x, z, pData.username);

        // Guest Protection: Visitors cannot break blocks on other players' islands!
        if (islandOwner.toLowerCase() !== pData.username.toLowerCase() && !pData.bypassGuestProtection) {
          sendSystemMessage(client, `§cYou cannot build or break blocks on §e${islandOwner}'s §cisland! You are a guest. 🔒`, is119);
          client.write('block_change', {
            location: { x, y, z },
            type: blockDef ? blockDef.defaultState : 0
          });
          try {
            client.write('acknowledge_player_digging', { sequenceId: data.sequence });
          } catch (e) {}
          return;
        }

        setWorldBlock(x, y, z, 'air');
        savePlayerIslandBlock(islandOwner, x, y, z, 'air');

        client.write('block_change', {
          location: { x, y, z },
          type: 0
        });

        try {
          client.write('acknowledge_player_digging', { sequenceId: data.sequence });
        } catch (e) {}

        const dropName = BLOCK_DROPS[currentBlock] || currentBlock;
        const itemDef = mcData.itemsByName[dropName];

        if (itemDef) {
          const itemEntityId = nextEntityId++;
          const spawnX = x + 0.5;
          const spawnY = y + 0.35;
          const spawnZ = z + 0.5;

          droppedItems.set(itemEntityId, {
            entityId: itemEntityId,
            itemId: itemDef.id,
            count: 1,
            name: dropName,
            x: spawnX,
            y: spawnY,
            z: spawnZ,
            spawnTime: Date.now()
          });

          for (const [_, p] of players) {
            try {
              p.client.write('spawn_entity', {
                entityId: itemEntityId,
                objectUUID: crypto.randomUUID(),
                type: 44,
                x: spawnX,
                y: spawnY,
                z: spawnZ,
                pitch: 0,
                yaw: 0,
                headPitch: 0,
                data: 1,
                velocity: {
                  x: Math.floor((Math.random() - 0.5) * 600),
                  y: 1000,
                  z: Math.floor((Math.random() - 0.5) * 600)
                }
              });

              p.client.write('entity_metadata', {
                entityId: itemEntityId,
                metadata: [
                  {
                    key: 8,
                    type: 6,
                    value: {
                      present: true,
                      itemId: itemDef.id,
                      itemCount: 1
                    }
                  }
                ]
              });
            } catch (e) {}
          }
        }
      }
    });

    // Block Placing with Guest Protection
    client.on('block_place', (data: any) => {
      const faceOffsets = [
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 }
      ];

      const off = faceOffsets[data.direction] || { x: 0, y: 1, z: 0 };
      const targetX = data.location.x + off.x;
      const targetY = data.location.y + off.y;
      const targetZ = data.location.z + off.z;

      const activeSlot = 36 + pData.selectedSlot;
      const held = pData.inventory.get(activeSlot);

      if (held && held.count > 0) {
        const blockToPlace = ITEM_TO_BLOCK[held.name] || held.name;
        const mcData = is119 ? mcData1192 : mcData1211;
        const blockDef = mcData.blocksByName[blockToPlace];

        if (blockDef) {
          const islandOwner = getIslandOwnerForCoords(targetX, targetZ, pData.username);

          // Guest Protection: Guests cannot place blocks!
          if (islandOwner.toLowerCase() !== pData.username.toLowerCase() && !pData.bypassGuestProtection) {
            sendSystemMessage(client, `§cYou cannot build or break blocks on §e${islandOwner}'s §cisland! You are a guest. 🔒`, is119);
            client.write('block_change', {
              location: { x: targetX, y: targetY, z: targetZ },
              type: 0
            });
            // Immediately restore the held item slot so client prediction does not hide the item!
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot: activeSlot,
              item: {
                present: true,
                itemId: held.itemId,
                itemCount: held.count
              }
            });
            try {
              client.write('acknowledge_player_digging', { sequenceId: data.sequence });
            } catch (e) {}
            return;
          }

          setWorldBlock(targetX, targetY, targetZ, blockToPlace);
          savePlayerIslandBlock(islandOwner, targetX, targetY, targetZ, blockToPlace);

          client.write('block_change', {
            location: { x: targetX, y: targetY, z: targetZ },
            type: blockDef.defaultState
          });

          held.count--;
          if (held.count <= 0) {
            pData.inventory.delete(activeSlot);
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot: activeSlot,
              item: { present: false }
            });
          } else {
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot: activeSlot,
              item: {
                present: true,
                itemId: held.itemId,
                itemCount: held.count
              }
            });
          }

          persistPlayerSession(pData);

          try {
            client.write('acknowledge_player_digging', { sequenceId: data.sequence });
          } catch (e) {}
        }
      }
    });

    // Player Movement, Dynamic Chunk Streaming, 3D Player Tracking & Solid Void Fall Rescue
    function handleMovement(data: any): void {
      // Discard stale in-flight movement packets from the prior island!
      if (pData.pendingTeleportId || (pData.teleportLockUntil && Date.now() < pData.teleportLockUntil)) {
        const distToTarget = Math.hypot(data.x - pData.x, data.z - pData.z);
        if (distToTarget > 64.0) {
          return; // Drop stale movement packet from old island!
        }
        pData.pendingTeleportId = null;
        pData.teleportLockUntil = 0;
      }

      pData.x = data.x;
      pData.y = data.y;
      pData.z = data.z;
      pData.yaw = (typeof data.yaw === 'number') ? data.yaw : (pData.yaw || 0);
      pData.pitch = (typeof data.pitch === 'number') ? data.pitch : (pData.pitch || 0);

      // 1. Void Fall Protection (Y < 30) -> Return to personal island spawn with guaranteed solid collision!
      if (data.y < 30.0) {
        const spawnX = pData.island ? pData.island.spawnX : 0.5;
        const spawnY = pData.island ? pData.island.spawnY : 101.0;
        const spawnZ = pData.island ? pData.island.spawnZ : 0.5;

        teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
        syncNearbyPlayers(pData);
        updatePlayerScoreboardLocation(client, is119, 'Your Island');

        // Keep Inventory: Ensure all inventory slots stay 100% intact!
        for (const [slot, item] of pData.inventory) {
          try {
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot,
              item: {
                present: true,
                itemId: item.itemId,
                itemCount: item.count
              }
            });
          } catch (e) {}
        }

        sendSystemMessage(client, '§7[§dZylarPixel§7] §cYou fell into the void! Teleported back to your island. §a(Inventory Kept 🎒)', is119);
        return;
      }

      // 2. Dynamic Chunk Streaming & View Center Sync
      const currentCx = Math.floor(data.x / 16);
      const currentCz = Math.floor(data.z / 16);

      if (currentCx !== pData.currentChunkX || currentCz !== pData.currentChunkZ) {
        pData.currentChunkX = currentCx;
        pData.currentChunkZ = currentCz;

        try {
          client.write('update_view_position', { chunkX: currentCx, chunkZ: currentCz });
        } catch (e) {}

        const streamRadius = 5;
        let newChunksStreamed = 0;
        if (!is119) {
          try { client.write('chunk_batch_start', {}); } catch (e) {}
        }

        for (let dx = -streamRadius; dx <= streamRadius; dx++) {
          for (let dz = -streamRadius; dz <= streamRadius; dz++) {
            const targetCx = currentCx + dx;
            const targetCz = currentCz + dz;
            const key = `${targetCx},${targetCz}`;
            if (pData.loadedChunks && !pData.loadedChunks.has(key)) {
              pData.loadedChunks.add(key);
              try {
                client.write('map_chunk', dumpChunkPacket(targetCx, targetCz, is119));
                newChunksStreamed++;
              } catch (e) {}
            }
          }
        }

        if (!is119 && newChunksStreamed > 0) {
          try { client.write('chunk_batch_finished', { batchSize: newChunksStreamed }); } catch (e) {}
        }
      }

      // 3. Sync Nearby 3D Player Entities & Broadcast Movement
      syncNearbyPlayers(pData);

      for (const [_, other] of players) {
        if (other.client.id !== client.id && other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          try {
            const yawByte = toProtocolByte(pData.yaw);
            const pitchByte = toProtocolByte(pData.pitch);
            other.client.write('entity_teleport', {
              entityId: pData.entityId,
              x: data.x,
              y: data.y,
              z: data.z,
              yaw: yawByte,
              pitch: pitchByte,
              onGround: true
            });
            other.client.write('entity_head_rotation', {
              entityId: pData.entityId,
              headYaw: yawByte
            });
          } catch (e) {}
        }
      }

      // 4. Ancient Stone Arch Portal Collision Check
      const currentIslandX = Math.round(data.x / 1000) * 1000;
      const inPortalX = (data.x >= currentIslandX - 1.5 && data.x <= currentIslandX + 1.5);
      const inPortalY = (data.y >= 101.0 && data.y <= 107.0);
      const inPortalZ = (data.z >= 33.2 && data.z <= 34.8);

      if (inPortalX && inPortalY && inPortalZ) {
        const now = Date.now();
        if (now - pData.lastPortalNotice > 2500) {
          pData.lastPortalNotice = now;
          sendSystemMessage(client, '§cThe lobby has not been constructed yet', is119);
        }
      }
    }

    client.on('position', handleMovement);
    client.on('position_look', handleMovement);
    client.on('look', (data: any) => {
      pData.yaw = (typeof data.yaw === 'number') ? data.yaw : (pData.yaw || 0);
      pData.pitch = (typeof data.pitch === 'number') ? data.pitch : (pData.pitch || 0);
      const yawByte = toProtocolByte(pData.yaw);
      const pitchByte = toProtocolByte(pData.pitch);
      for (const [_, other] of players) {
        if (other.client.id !== client.id && other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          try {
            other.client.write('entity_head_rotation', {
              entityId: pData.entityId,
              headYaw: yawByte
            });
            other.client.write('entity_look', {
              entityId: pData.entityId,
              yaw: yawByte,
              pitch: pitchByte,
              onGround: true
            });
          } catch (e) {}
        }
      }
    });

    // Interactive GUI Click Sync & Survival Inventory Management
    client.on('window_click', (data: any) => {
      const clickedSlot = data.slot;

      // Case A: Player is managing survival inventory (WindowId = 0)
      if (pData.openWindowId === 0) {
        if (Array.isArray(data.changedSlots)) {
          const mcData = is119 ? mcData1192 : mcData1211;
          for (const change of data.changedSlots) {
            const slot = change.location;
            const item = change.item;
            if (slot >= 0) {
              if (!item || !item.present) {
                pData.inventory.delete(slot);
              } else {
                const itemDef = mcData.items[item.itemId];
                pData.inventory.set(slot, {
                  slot,
                  name: itemDef ? itemDef.name : 'unknown',
                  itemId: item.itemId,
                  count: item.itemCount
                });
              }
            }
          }
        }
        persistPlayerSession(pData);
        return;
      }

      // Case B: Admin / Staff Chest GUI is open (WindowId > 0) -> Prevent item theft!
      client.write('set_slot', {
        windowId: -1,
        stateId: data.stateId,
        slot: -1,
        item: { present: false }
      });

      if (pData.currentGuiItems && clickedSlot >= 0 && clickedSlot < 54) {
        client.write('set_slot', {
          windowId: pData.openWindowId,
          stateId: data.stateId,
          slot: clickedSlot,
          item: pData.currentGuiItems[clickedSlot] || { present: false }
        });
      }

      // Master Admin Menu (WindowId = 1)
      if (pData.openWindowId === 1) {
        if (clickedSlot === 22) {
          if (players.size > 1) {
            openPlayerSelector(client, pData, players);
          } else {
            openRankSelector(client, pData, pData);
          }
        } else if (clickedSlot === 49) {
          pData.openWindowId = 0;
          client.write('close_window', { windowId: 1 });
        }
        return;
      }

      // Online Player Selector (WindowId = 3)
      if (pData.openWindowId === 3) {
        if (clickedSlot === 49) {
          openAdminMenu(client, pData);
        } else if (pData.playerSelectorSlots && pData.playerSelectorSlots.has(clickedSlot)) {
          const targetPlayer = pData.playerSelectorSlots.get(clickedSlot);
          openRankSelector(client, pData, targetPlayer);
        }
        return;
      }

      // Centered Rank Selector Sub-GUI (WindowId = 2)
      if (pData.openWindowId === 2) {
        if (clickedSlot === 49) {
          if (players.size > 1) {
            openPlayerSelector(client, pData, players);
          } else {
            openAdminMenu(client, pData);
          }
        } else if (RANK_SLOT_MAP[clickedSlot]) {
          const targetRankId = RANK_SLOT_MAP[clickedSlot];
          const newRank = RANKS[targetRankId];
          const target = pData.targetPlayerForRank || pData;
          if (newRank && target) {
            setPlayerRank(target, newRank);
            if (target !== pData) {
              sendSystemMessage(client, `§7[§dZylarPixel§7] §aUpdated §f${target.username}'s §arank to ${newRank.prefix}§a!`, is119);
            }
            openRankSelector(client, pData, target);
          }
        }
        return;
      }
    });

    client.on('close_window', () => {
      pData.openWindowId = 0;
      pData.currentGuiItems = null;
      pData.targetPlayerForRank = null;
      pData.playerSelectorSlots = null;
    });

    // Chat & Command Router
    function processIncomingChat(msg: string): void {
      if (!msg) return;
      const clean = msg.trim();
      if (clean.startsWith('/')) {
        handleCommand(
          pData,
          clean,
          (c: any) => reGenerateWorld(c, is119),
          triggerServerRestart,
          (p: any) => syncNearbyPlayers(p)
        );
      } else {
        const formatted = formatChatMessage(pData.rank, pData.username, clean);
        console.log(`[CHAT] ${formatted.replace(/§[0-9a-fk-or]/g, '')}`);
        for (const [_, p] of players) {
          sendSystemMessage(p.client, formatted, p.is119);
        }
      }
    }

    client.on('chat_message', (d: any) => { if (d && d.message) processIncomingChat(d.message); });
    client.on('chat_command', (d: any) => { if (d && d.command) processIncomingChat('/' + d.command); });
    client.on('chat', (d: any) => { if (d && d.message) processIncomingChat(d.message); });

    client.on('end', () => {
      removePlayerSession(client.id);
      console.log(`[-] Player left: ${client.username}`);
    });
  });
}

// Physics & Item Pickup Loop (Runs every 100ms)
setInterval(() => {
  const now = Date.now();
  for (const [entityId, item] of droppedItems) {
    for (const [_, p] of players) {
      const dist = Math.hypot(p.x - item.x, p.y - item.y, p.z - item.z);
      if (dist <= 1.8 && (now - item.spawnTime > 400)) {
        for (const [__, observer] of players) {
          try {
            observer.client.write('collect', {
              collectedEntityId: entityId,
              collectorEntityId: p.entityId,
              pickupItemCount: item.count
            });
            observer.client.write('entity_destroy', {
              entityIds: [entityId]
            });
          } catch (e) {}
        }

        let placed = false;
        for (let slot = 36; slot <= 44; slot++) {
          const existing = p.inventory.get(slot);
          if (existing && existing.name === item.name && existing.count < 64) {
            existing.count += item.count;
            p.client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot,
              item: { present: true, itemId: existing.itemId, itemCount: existing.count }
            });
            placed = true;
            break;
          }
        }

        if (!placed) {
          for (let slot = 36; slot <= 44; slot++) {
            if (!p.inventory.has(slot)) {
              p.inventory.set(slot, {
                slot,
                name: item.name,
                itemId: item.itemId,
                count: item.count
              });
              p.client.write('set_slot', {
                windowId: 0,
                stateId: 1,
                slot,
                item: { present: true, itemId: item.itemId, itemCount: item.count }
              });
              placed = true;
              break;
            }
          }
        }

        try {
          p.client.write('named_sound_effect', {
            soundName: 'entity.item.pickup',
            soundCategory: 0,
            x: Math.floor(p.x * 8),
            y: Math.floor(p.y * 8),
            z: Math.floor(p.z * 8),
            volume: 0.5,
            pitch: 1.8,
            seed: [0, 0]
          });
        } catch (e) {}

        persistPlayerSession(p);
        droppedItems.delete(entityId);
        break;
      }
    }
  }
}, 100);

// Initial launch
startServerInstance();

const bootTime = (performance.now() - startTime).toFixed(2);
const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

console.log(`\n=================================================`);
console.log(`🚀 ZYLARPIXEL MULTI-ISLAND ENGINE LIVE! [TypeScript]`);
console.log(`🌐 Host:          0.0.0.0:25565`);
console.log(`👥 Multiplayer:   Real 3D Avatars, Skin Layers & Full Tablist`);
console.log(`🔒 Permissions:   Guest Island Grief Protection`);
console.log(`🧱 Physics:       Solid Collision On Teleport & Void Rescue`);
console.log(`🔄 Hot Reboot:    Instant In-Memory /restart in 250ms!`);
console.log(`⚡ Boot Time:     ${bootTime} ms!`);
console.log(`💾 Memory (RSS):  ${memoryUsage} MB!`);
console.log(`=================================================\n`);
