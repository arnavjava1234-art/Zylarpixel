/**
 * ZylarPixel Unified Server Engine (TypeScript)
 * The shared, centralized core engine for all ZylarPixel server instances.
 * Powers both Hub (Port 25566) and Private Islands (Port 25567) without code duplication!
 */

import * as mc from 'minecraft-protocol';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as nbt from 'prismarine-nbt';

import {
  mcData1192,
  mcData1211,
  setWorldBlock,
  getWorldBlockName,
  dumpChunkPacket,
  BLOCK_DROPS,
  ITEM_TO_BLOCK
} from '../world/worldManager';
import {
  generateStarterIslands,
  generatePlayerIsland,
  resetPlayerIsland
} from '../world/islandGenerator';
import {
  HUB_SPAWN_X,
  HUB_SPAWN_Y,
  HUB_SPAWN_Z,
  dumpHubChunkPacket,
  loadHubChunk,
  preWarmHubSpawn,
  getHubBlockName
} from '../world/hubRegionProvider';
import {
  sendScoreboard,
  updateTablist,
  updatePlayerScoreboardLocation,
  sendScoreboardTeam,
  startScoreboardAnimation,
  initBelowNameHealth,
  updatePlayerHealthScore
} from './scoreboard';
import { spawnDamageIndicator } from '../combat/damageIndicator';
import { formatPlayerName, formatChatMessage, RANKS, RankDefinition } from '../config/ranks';
import {
  players,
  createPlayerSession,
  removePlayerSession,
  setPlayerRank,
  sendSystemMessage,
  persistPlayerSession
} from '../players/playerManager';
import { handleCommand, teleportPlayerWithChunks } from '../commands/commandHandler';
import { openAdminMenu } from '../gui/adminMenu';
import { openRankSelector, RANK_SLOT_MAP } from '../gui/rankSelector';
import { openPlayerSelector } from '../gui/playerSelector';
import {
  savePlayerIslandBlock,
  getAllDiskPlayerNames,
  loadPlayerData
} from '../storage/diskStorage';
import { sendDeclaredCommands, handleTabComplete } from '../commands/commandRegistry';
import {
  formatActionBar,
  sendActionBar,
  syncVanillaHealthAndHunger,
  syncPlayerAttributes,
  calculateHealthRegen,
  calculateManaRegen,
  calculateDamage,
  applyDefense
} from '../stats/statsManager';
import { openStatsMenu } from '../gui/statsMenu';
import {
  openSkyBlockMenu,
  handleSkyBlockMenuClick,
  giveNetherStar,
  SKYBLOCK_MENU_WINDOW_ID,
  HOTBAR_NETHER_STAR_SLOT
} from '../gui/skyblockMenu';
import {
  CRAFTING_TABLE_WINDOW_ID,
  openCraftingTableMenu,
  handleCraftingTableClick,
  handleCraftingTableClose
} from '../gui/craftingTableMenu';
import {
  spawnBankerNpc,
  tickBankerNpc,
  handleBankerInteraction
} from '../npc/bankerNpc';
import {
  spawnCropGuardians,
  tickCropGuardians,
  isHarvestableHubCrop,
  handleHubCropHarvest,
  isHubMinionExclusionZone
} from '../world/cropGuardian';
import {
  handleBankClick,
  handleSignUpdate,
  restoreSignBlock,
  BANK_MAIN_WINDOW_ID,
  BANK_DEPOSIT_WINDOW_ID,
  BANK_WITHDRAW_WINDOW_ID,
  BANK_UPGRADES_WINDOW_ID
} from '../gui/bankMenu';
import {
  openCoinPlayerSelector,
  handleAdminCoinMenuClick,
  handleAdminSignUpdate,
  ADMIN_COIN_SELECTOR_WINDOW_ID,
  ADMIN_COIN_ACTION_WINDOW_ID
} from '../gui/adminCoinMenu';
import {
  openAdminItemSpawner,
  handleAdminItemSpawnerClick,
  ADMIN_ITEM_SPAWNER_WINDOW_ID
} from '../gui/adminItemMenu';
import { tagVanillaItemStack, formatSlotForClient, isSkyBlockItemStack, handleItemAbility, createItem, applySpeedBoost } from '../items';

const Vec3 = require('vec3');

export interface ZylarServerConfig {
  serverId: 'hub' | 'islands' | string;
  serverName: string;
  port: number;
  motd?: string;
  gamemode: number; // 0 = survival, 2 = adventure
  pvp: boolean; // false for hub, true for islands
  allowBlockBreaking: boolean; // false for hub, true for islands
  allowBlockPlacement: boolean; // false for hub, true for islands
  scoreboardLocation: string; // 'Village' for Hub, 'Your Island' for Islands
  worldType: 'hub' | 'islands';
  spawnPoint: { x: number; y: number; z: number; yaw?: number; pitch?: number };
}

interface DroppedItem {
  entityId: number;
  itemId: number;
  count: number;
  name: string;
  x: number;
  y: number;
  z: number;
  spawnTime: number;
  owner?: string;
  pickupDelay?: number;
}

function generateOfflineUuid(username: string): string {
  const raw = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
  return [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join('-');
}

interface ServerSideBot {
  name: string;
  uuid: string;
  entityId: number;
  rank: RankDefinition;
  pos: { x: number; y: number; z: number; yaw: number; pitch: number };
  angleOffset: number;
}

// Server-side follow bots disabled per user request
const SERVER_SIDE_BOTS: ServerSideBot[] = [];

export class ZylarServer {
  public config: ZylarServerConfig;
  public serverInstance: any = null;
  public droppedItems = new Map<number, DroppedItem>();
  private nextEntityId = 5000;
  private teleportCounter = 1;
  private isRestarting = false;
  private logStream: fs.WriteStream | null = null;
  private botTickerInterval: NodeJS.Timeout | null = null;

  constructor(config: ZylarServerConfig) {
    this.config = config;
    this.initLogger();
  }

  private initLogger() {
    const logsDir = path.resolve(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, `${this.config.serverId}.log`);
    this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  }

  public log(level: string, ...args: any[]) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    console.log(`[${this.config.serverId.toUpperCase()}] [${level}] ${msg}`);
    if (this.logStream) {
      try {
        this.logStream.write(`[${ts}] [${level}] ${msg}\n`);
      } catch (_) {}
    }
  }

  private toProtocolByte(deg: number): number {
    let b = Math.floor((deg || 0) * 256 / 360) % 256;
    if (b < 0) b += 256;
    if (b > 127) b -= 256;
    return b;
  }

  private sendPositionPacket(client: any, x: number, y: number, z: number, yaw: number, pitch: number, teleportId: number, is119: boolean): void {
    if (is119) {
      client.write('position', {
        x,
        y,
        z,
        yaw,
        pitch,
        flags: 0x00,
        teleportId,
        dismountVehicle: false
      });
    } else {
      client.write('player_position', {
        teleportId,
        x,
        y,
        z,
        yaw,
        pitch,
        flags: 0x00
      });
    }
  }

  private getIslandOwnerForCoords(x: number, z: number, fallbackUser: string): string {
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

  private spawnPlayerForObserver(observerPData: any, targetPData: any): void {
    if (observerPData.client.id === targetPData.client.id) return;
    if (observerPData.spawnedPlayers.has(targetPData.entityId)) return;

    observerPData.spawnedPlayers.add(targetPData.entityId);

    try {
      const yawByte = this.toProtocolByte(targetPData.yaw || 0);
      const pitchByte = this.toProtocolByte(targetPData.pitch || 0);

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
        observerPData.client.write('entity_metadata', {
          entityId: targetPData.entityId,
          metadata: [{ key: 17, type: 0, value: 127 }]
        });
        observerPData.client.write('entity_head_rotation', {
          entityId: targetPData.entityId,
          headYaw: yawByte
        });
      } else {
        observerPData.client.write('spawn_entity', {
          entityId: targetPData.entityId,
          objectUUID: targetPData.client.uuid,
          type: 128,
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
          metadata: [{ key: 17, type: 0, value: 127 }]
        });
        observerPData.client.write('entity_head_rotation', {
          entityId: targetPData.entityId,
          headYaw: yawByte
        });
      }
    } catch (_) {}
  }

  private despawnPlayerForObserver(observerPData: any, targetPData: any): void {
    if (!observerPData.spawnedPlayers.has(targetPData.entityId)) return;
    observerPData.spawnedPlayers.delete(targetPData.entityId);

    try {
      observerPData.client.write('entity_destroy', {
        entityIds: [targetPData.entityId]
      });
    } catch (_) {}
  }

  private syncNearbyPlayers(pData: any): void {
    for (const [_, other] of players) {
      if (other.client.id === pData.client.id) continue;
      const dist = Math.hypot(pData.x - other.x, pData.y - other.y, pData.z - other.z);
      if (dist <= 96.0) {
        this.spawnPlayerForObserver(pData, other);
        this.spawnPlayerForObserver(other, pData);
      } else if (dist > 128.0) {
        this.despawnPlayerForObserver(pData, other);
        this.despawnPlayerForObserver(other, pData);
      }
    }
  }

  private spawnServerBotsForPlayer(client: any, is119: boolean): void {
    for (const bot of SERVER_SIDE_BOTS) {
      try {
        if (is119) {
          client.write('player_info', {
            action: 'add_player',
            data: [{
              uuid: bot.uuid,
              name: bot.name,
              properties: [],
              gamemode: 2,
              ping: 1,
              displayName: JSON.stringify({ text: `§8[§6Hub§8] ${formatPlayerName(bot.rank || RANKS.default, bot.name)}` }),
              crypto: undefined
            }]
          });
          client.write('named_entity_spawn', {
            entityId: bot.entityId,
            playerUUID: bot.uuid,
            x: bot.pos.x,
            y: bot.pos.y,
            z: bot.pos.z,
            yaw: this.toProtocolByte(bot.pos.yaw),
            pitch: this.toProtocolByte(bot.pos.pitch)
          });
          client.write('entity_head_rotation', {
            entityId: bot.entityId,
            headYaw: this.toProtocolByte(bot.pos.yaw)
          });
          client.write('entity_metadata', {
            entityId: bot.entityId,
            metadata: [{ key: 17, type: 0, value: 127 }]
          });
          sendScoreboardTeam(client, bot.name, bot.rank || RANKS.default, true);
        } else {
          client.write('player_info', {
            action: 1 | 4 | 8 | 16,
            data: [{
              uuid: bot.uuid,
              player: { name: bot.name, properties: [] },
              gamemode: 2,
              listed: 1,
              latency: 1,
              displayName: JSON.stringify({ text: `§8[§6Hub§8] ${formatPlayerName(bot.rank || RANKS.default, bot.name)}` })
            }]
          });
          client.write('spawn_entity', {
            entityId: bot.entityId,
            objectUUID: bot.uuid,
            type: 128,
            x: bot.pos.x,
            y: bot.pos.y,
            z: bot.pos.z,
            pitch: this.toProtocolByte(bot.pos.pitch),
            yaw: this.toProtocolByte(bot.pos.yaw),
            headPitch: this.toProtocolByte(bot.pos.pitch),
            objectData: 0,
            velocity: { x: 0, y: 0, z: 0 }
          });
          client.write('entity_head_rotation', {
            entityId: bot.entityId,
            headYaw: this.toProtocolByte(bot.pos.yaw)
          });
          client.write('entity_metadata', {
            entityId: bot.entityId,
            metadata: [{ key: 17, type: 0, value: 127 }]
          });
          sendScoreboardTeam(client, bot.name, bot.rank || RANKS.default, false);
        }
      } catch (_) {}
    }
  }

  private tickServerBots(): void {
    if (players.size === 0) return;

    let target: any = null;
    for (const [_, p] of players) {
      if (p.username.toLowerCase() === 'arnavjava') {
        target = p;
        break;
      }
    }
    if (!target) {
      for (const [_, p] of players) {
        if (p.username.toLowerCase() === 'chuchichan') {
          target = p;
          break;
        }
      }
    }
    if (!target) {
      target = players.values().next().value;
    }
    if (!target) return;

    const targetX = target.x;
    const targetY = target.y;
    const targetZ = target.z;
    const targetYawRad = ((target.yaw || 0) * Math.PI) / 180;

    for (const bot of SERVER_SIDE_BOTS) {
      const currentAngle = targetYawRad + bot.angleOffset;
      const destX = targetX + Math.sin(currentAngle) * 3.0;
      const destZ = targetZ - Math.cos(currentAngle) * 3.0;
      const destY = targetY;

      const dx = destX - bot.pos.x;
      const dz = destZ - bot.pos.z;
      const dy = destY - bot.pos.y;
      const distToDest = Math.hypot(dx, dz);
      const distToPlayer = Math.hypot(targetX - bot.pos.x, targetZ - bot.pos.z);

      const toPlayerX = targetX - bot.pos.x;
      const toPlayerZ = targetZ - bot.pos.z;
      const lookYaw = Math.atan2(-toPlayerX, toPlayerZ) * (180 / Math.PI);
      const lookPitch = Math.atan2(-(targetY + 1.4 - (bot.pos.y + 1.6)), Math.max(0.1, distToPlayer)) * (180 / Math.PI);

      const oldX = bot.pos.x;
      const oldY = bot.pos.y;
      const oldZ = bot.pos.z;

      let moved = false;
      let teleported = false;

      if (distToPlayer > 35) {
        bot.pos.x = destX;
        bot.pos.y = destY;
        bot.pos.z = destZ;
        bot.pos.yaw = lookYaw;
        bot.pos.pitch = lookPitch;
        teleported = true;
      } else if (distToDest > 0.2) {
        const speed = distToDest > 6 ? 0.55 : (distToDest > 2 ? 0.38 : 0.22);
        const step = Math.min(distToDest, speed);

        bot.pos.x += (dx / distToDest) * step;
        bot.pos.z += (dz / distToDest) * step;
        if (Math.abs(dy) > 0.1) {
          bot.pos.y += Math.sign(dy) * Math.min(Math.abs(dy), 0.35);
        } else {
          bot.pos.y = destY;
        }
        bot.pos.yaw = lookYaw;
        bot.pos.pitch = lookPitch;
        moved = true;
      } else {
        if (Math.abs(bot.pos.yaw - lookYaw) > 2 || Math.abs(bot.pos.pitch - lookPitch) > 2) {
          bot.pos.yaw = lookYaw;
          bot.pos.pitch = lookPitch;
          moved = true;
        }
      }

      if (teleported) {
        for (const [_, p] of players) {
          try {
            p.client.write('entity_teleport', {
              entityId: bot.entityId,
              x: bot.pos.x,
              y: bot.pos.y,
              z: bot.pos.z,
              yaw: this.toProtocolByte(bot.pos.yaw),
              pitch: this.toProtocolByte(bot.pos.pitch),
              onGround: true
            });
            p.client.write('entity_head_rotation', {
              entityId: bot.entityId,
              headYaw: this.toProtocolByte(bot.pos.yaw)
            });
          } catch (_) {}
        }
      } else if (moved) {
        const dX = Math.round((bot.pos.x - oldX) * 4096);
        const dY = Math.round((bot.pos.y - oldY) * 4096);
        const dZ = Math.round((bot.pos.z - oldZ) * 4096);

        for (const [_, p] of players) {
          try {
            if (Math.abs(dX) < 32768 && Math.abs(dY) < 32768 && Math.abs(dZ) < 32768 && (dX !== 0 || dY !== 0 || dZ !== 0)) {
              p.client.write('entity_move_look', {
                entityId: bot.entityId,
                dX, dY, dZ,
                yaw: this.toProtocolByte(bot.pos.yaw),
                pitch: this.toProtocolByte(bot.pos.pitch),
                onGround: true
              });
            } else {
              p.client.write('entity_look', {
                entityId: bot.entityId,
                yaw: this.toProtocolByte(bot.pos.yaw),
                pitch: this.toProtocolByte(bot.pos.pitch),
                onGround: true
              });
            }
            p.client.write('entity_head_rotation', {
              entityId: bot.entityId,
              headYaw: this.toProtocolByte(bot.pos.yaw)
            });
          } catch (_) {}
        }
      }
    }
  }

  public reGenerateWorld(client: any, is119: boolean): void {
    const pData = players.get(client.id);
    if (!pData || !pData.island) return;

    resetPlayerIsland(pData.username, pData.island.originX, pData.island.originZ);
    pData.loadedChunks = new Set<string>();
    const baseChunkX = Math.floor(pData.island.spawnX / 16);
    const baseChunkZ = Math.floor(pData.island.spawnZ / 16);
    pData.currentChunkX = baseChunkX;
    pData.currentChunkZ = baseChunkZ;

    try {
      client.write('update_view_position', { chunkX: baseChunkX, chunkZ: baseChunkZ });
    } catch (_) {}

    if (!is119) {
      try { client.write('chunk_batch_start', {}); } catch (_) {}
    }
    for (let cx = baseChunkX - 4; cx <= baseChunkX + 4; cx++) {
      for (let cz = baseChunkZ - 4; cz <= baseChunkZ + 4; cz++) {
        pData.loadedChunks.add(`${cx},${cz}`);
        client.write('map_chunk', dumpChunkPacket(cx, cz, is119));
      }
    }
    if (!is119) {
      try { client.write('chunk_batch_finished', { batchSize: 81 }); } catch (_) {}
    }
  }

  public triggerServerRestart(): void {
    if (this.isRestarting) return;
    this.isRestarting = true;

    this.log('INFO', '🔄 Server restart triggered! Saving all players and rebooting fresh process from disk...');

    if (this.botTickerInterval) {
      clearInterval(this.botTickerInterval);
      this.botTickerInterval = null;
    }

    for (const [_, p] of players) {
      try {
        persistPlayerSession(p);
        sendSystemMessage(p.client, '§c§l[ZylarPixel] §eServer restart initiated! Transferring to Limbo...', p.is119);
        // Destroy the backend socket so the Master Proxy immediately catches it and transitions the player into Limbo!
        p.client.destroy();
      } catch (_) {}
    }
    players.clear();
    this.droppedItems.clear();

    let hasReloaded = false;
    const doReloadAndStart = () => {
      if (hasReloaded) return;
      hasReloaded = true;
      try {
        this.log('INFO', '🔄 Purging module cache to hot-reload all new code from disk...');
        for (const key of Object.keys(require.cache)) {
          if (key.includes('arena-server') && !key.includes('node_modules')) {
            delete require.cache[key];
          }
        }
      } catch (err: any) {
        this.log('WARN', `Error clearing module cache: ${err?.message || err}`);
      }

      setTimeout(() => {
        try {
          this.start();
          this.isRestarting = false;
          this.log('INFO', '🚀 Hot reload complete! Server is running and listening.');
        } catch (startErr: any) {
          this.log('ERROR', `Failed to restart server: ${startErr?.message || startErr}`);
          this.isRestarting = false;
        }
      }, 350);
    };

    const safetyTimeout = setTimeout(doReloadAndStart, 1200);

    if (this.serverInstance) {
      try {
        this.serverInstance.close(() => {
          clearTimeout(safetyTimeout);
          this.log('INFO', 'Socket server closed cleanly. Reloading code and rebinding in 300ms...');
          setTimeout(doReloadAndStart, 300);
        });
      } catch (_) {
        setTimeout(doReloadAndStart, 500);
      }
    } else {
      setTimeout(doReloadAndStart, 500);
    }
  }

  public stop(): void {
    if (this.botTickerInterval) clearInterval(this.botTickerInterval);
    for (const [_, p] of players) {
      try { p.client.destroy(); } catch (_) {}
    }
    players.clear();
    this.droppedItems.clear();
    if (this.serverInstance) {
      try { this.serverInstance.close(); } catch (_) {}
    }
  }

  public start(): void {
    const startTime = performance.now();
    this.log('INFO', `⚡ Initializing ZylarPixel Unified Server: ${this.config.serverName} on port ${this.config.port}...`);

    // 1. World Initialization
    if (this.config.worldType === 'hub') {
      this.log('INFO', '⚡ Loading Authentic Hypixel SkyBlock Hub Chunks from Region Files...');
      preWarmHubSpawn();
    } else {
      generateStarterIslands();
    }

    // 2. Start Animated Scoreboard Loop
    startScoreboardAnimation(players);

    // 3. Start Core Gameplay Loops
    this.initLoops();

    // 4. Create Network Listener
    const isHub = this.config.worldType === 'hub';
    this.serverInstance = (mc as any).createServer({
      'online-mode': false,
      encryption: false,
      host: '0.0.0.0',
      port: this.config.port,
      version: isHub ? '1.19.2' : false,
      fallbackVersion: isHub ? '1.19.2' : '1.21.1',
      maxPlayers: 50,
      motd: this.config.motd || `§d§lZYLARPIXEL §7[${this.config.serverName}]`,
      registryCodec: isHub ? mcData1192.loginPacket.dimensionCodec : mcData1211.loginPacket.dimensionCodec
    } as any);

    this.serverInstance.on('error', (err: any) => {
      this.log('ERROR', '⚠️ Server socket error:', err.message);
    });

    this.serverInstance.on('playerJoin', (client: any) => {
      this.handlePlayerJoin(client);
    });

    const bootTime = (performance.now() - startTime).toFixed(2);
    const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

    console.log(`\n=================================================`);
    console.log(`🚀 ZYLARPIXEL [${this.config.serverName.toUpperCase()}] LIVE!`);
    console.log(`🌐 Host:          0.0.0.0:${this.config.port}`);
    console.log(`⚔️ PvP:           ${this.config.pvp ? 'ENABLED (Damage & Crits Active)' : 'DISABLED (Peaceful Safe Zone)'}`);
    console.log(`🧱 Building:      ${this.config.allowBlockBreaking ? 'Enabled (Island Protection)' : 'Disabled (Hub Protected)'}`);
    console.log(`⚡ Boot Time:     ${bootTime} ms!`);
    console.log(`💾 Memory (RSS):  ${memoryUsage} MB!`);
    console.log(`=================================================\n`);
  }

  private initLoops(): void {
    // A. Action Bar Ticker (every 100ms)
    setInterval(() => {
      for (const [_, p] of players) {
        if (!p.client || !p.stats) continue;
        try {
          if (p.actionBarOverride && Date.now() < p.actionBarOverride.expiresAt) {
            sendActionBar(p.client, p.is119, p.actionBarOverride.text);
          } else {
            p.actionBarOverride = undefined;
            const text = formatActionBar(p.stats);
            sendActionBar(p.client, p.is119, text);
          }
        } catch (_) {}
      }
    }, 100);

    // B. Mana Regeneration Loop (every 1s)
    setInterval(() => {
      for (const [_, p] of players) {
        if (!p.stats) continue;
        if (p.stats.mana < p.stats.maxMana) {
          const regen = calculateManaRegen(p.stats.maxMana);
          p.stats.mana = Math.min(p.stats.maxMana, p.stats.mana + regen);
        }
      }
    }, 1000);

    // C. Health Regeneration Loop (every 2s)
    setInterval(() => {
      for (const [_, p] of players) {
        if (!p.stats || !p.client) continue;
        if (p.stats.health < p.stats.maxHealth && p.stats.health > 0) {
          const hpRegen = calculateHealthRegen(p.stats.maxHealth);
          p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + hpRegen);
          syncVanillaHealthAndHunger(p.client, p.stats);
          for (const [__, observer] of players) {
            updatePlayerHealthScore(observer.client, p.username, p.stats.health, observer.is119);
          }
        }
      }
    }, 2000);

    // D. Proximity Player Sync Loop (every 500ms)
    setInterval(() => {
      for (const [_, p] of players) {
        if (!p.client) continue;
        this.syncNearbyPlayers(p);
      }
    }, 500);

    // E. Dropped Items Pickup Loop (every 100ms)
    setInterval(() => {
      this.tickDroppedItems();
    }, 100);

    // F. Hub Banker NPC & Crop Guardians Ticker (every 50ms / 20 TPS)
    if (this.config.worldType === 'hub') {
      this.botTickerInterval = setInterval(() => {
        tickBankerNpc(players, (deg: number) => this.toProtocolByte(deg));
        tickCropGuardians(this, players, (deg: number) => this.toProtocolByte(deg));
      }, 50);
    }
  }

  private tickDroppedItems(): void {
    const now = Date.now();
    for (const [entityId, item] of this.droppedItems) {
      // 5-minute (300 seconds) Despawn Timer
      if (now - item.spawnTime > 300000) {
        for (const [__, observer] of players) {
          try {
            observer.client.write('entity_destroy', {
              entityIds: [entityId]
            });
          } catch (_) {}
        }
        this.droppedItems.delete(entityId);
        continue;
      }

      for (const [_, p] of players) {
        if (!p.client) continue;

        // Strict Anti-Theft: Only the breaker who owns the crop drop can pick it up!
        if (item.owner && item.owner !== p.username) {
          continue;
        }

        const dist = Math.hypot(p.x - item.x, p.y - item.y, p.z - item.z);
        if (dist <= 1.8 && (now - item.spawnTime > 300)) {
          // Candidate slots: hotbar 36..43 (skipping slot 44 Nether Star), then main inventory 9..35
          const candidateSlots: number[] = [];
          for (let s = 36; s <= 43; s++) candidateSlots.push(s);
          for (let s = 9; s <= 35; s++) candidateSlots.push(s);

          const pMcData = p.is119 ? mcData1192 : mcData1211;
          const pItemDef = pMcData.itemsByName[item.name] || pMcData.blocksByName[item.name];
          const pItemId = pItemDef ? pItemDef.id : item.itemId;
          const maxStack = pItemDef?.stackSize || 64;

          // 1. Calculate available space in player inventory for this item
          let availableSpace = 0;
          let emptySlotCount = 0;
          for (const slot of candidateSlots) {
            const existing = p.inventory.get(slot);
            if (!existing) {
              availableSpace += maxStack;
              emptySlotCount++;
            } else {
              const hasUniqueUuid = !!existing?.nbtData?.value?.ExtraAttributes?.value?.uuid?.value;
              if (!hasUniqueUuid && existing.name === item.name && existing.count < maxStack) {
                availableSpace += (maxStack - existing.count);
              }
            }
          }

          // If inventory cannot accept any items, do NOT void or destroy the item!
          if (availableSpace <= 0) {
            if (emptySlotCount === 0) {
              this.showInventoryFullTitle(p);
            }
            continue;
          }

          const toTake = Math.min(item.count, availableSpace);
          let remainingToPlace = toTake;

          // 2. Pass 1: Add to existing matching stacks < maxStack (commodities stack cleanly up to 64!)
          for (const slot of candidateSlots) {
            if (remainingToPlace <= 0) break;
            const existing = p.inventory.get(slot);
            if (existing) {
              const hasUniqueUuid = !!existing?.nbtData?.value?.ExtraAttributes?.value?.uuid?.value;
              if (!hasUniqueUuid && existing.name === item.name && existing.count < maxStack) {
                const space = maxStack - existing.count;
                const addCount = Math.min(space, remainingToPlace);
                existing.count += addCount;
                remainingToPlace -= addCount;
                existing.itemId = pItemId;

                const tagged = tagVanillaItemStack({
                  present: true,
                  itemId: pItemId,
                  itemCount: existing.count,
                  nbtData: existing.nbtData
                }, p.is119);
                existing.nbtData = tagged.nbtData;

                try {
                  p.client.write('set_slot', {
                    windowId: 0,
                    stateId: 1,
                    slot,
                    item: formatSlotForClient(tagged, p.is119)
                  });
                } catch (_) {}
              }
            }
          }

          // 3. Pass 2: Place into empty slots
          if (remainingToPlace > 0) {
            for (const slot of candidateSlots) {
              if (remainingToPlace <= 0) break;
              if (!p.inventory.has(slot)) {
                const putCount = Math.min(maxStack, remainingToPlace);
                remainingToPlace -= putCount;

                const rawStack = {
                  present: true,
                  itemId: pItemId,
                  itemCount: putCount
                };
                const tagged = tagVanillaItemStack(rawStack, p.is119);

                p.inventory.set(slot, {
                  slot,
                  name: item.name,
                  itemId: pItemId,
                  count: putCount,
                  nbtData: tagged.nbtData
                });

                try {
                  p.client.write('set_slot', {
                    windowId: 0,
                    stateId: 1,
                    slot,
                    item: formatSlotForClient(tagged, p.is119)
                  });
                } catch (_) {}
              }
            }
          }

          const actuallyTaken = toTake - remainingToPlace;
          if (actuallyTaken <= 0) {
            continue;
          }

          // 4. Play pickup sound
          try {
            p.client.write('named_sound_effect', {
              soundName: 'entity.item.pickup',
              soundCategory: 0,
              x: Math.floor(p.x * 8),
              y: Math.floor(p.y * 8),
              z: Math.floor(p.z * 8),
              volume: 0.8,
              pitch: 1.2,
              seed: [0, 0]
            });
          } catch (_) {}

          // 5. Send collect animation to all observers
          for (const [__, observer] of players) {
            try {
              observer.client.write('collect', {
                collectedEntityId: entityId,
                collectorEntityId: p.entityId,
                pickupItemCount: actuallyTaken
              });
            } catch (_) {}
          }

          // 6. Complete pickup vs partial pickup handling
          persistPlayerSession(p);
          if (actuallyTaken >= item.count) {
            for (const [__, observer] of players) {
              try {
                observer.client.write('entity_destroy', {
                  entityIds: [entityId]
                });
              } catch (_) {}
            }
            this.droppedItems.delete(entityId);
          } else {
            item.count -= actuallyTaken;
            for (const [__, observer] of players) {
              if (!observer.client) continue;
              const obsIs119 = observer.is119;
              const obsMcData = obsIs119 ? mcData1192 : mcData1211;
              const obsDef = obsMcData.itemsByName[item.name] || obsMcData.blocksByName[item.name];
              if (obsDef) {
                try {
                  const metaValue = obsIs119
                    ? { present: true, itemId: obsDef.id, itemCount: item.count }
                    : {
                        itemCount: item.count,
                        itemId: obsDef.id,
                        addedComponentCount: 0,
                        removedComponentCount: 0,
                        components: [],
                        removeComponents: []
                      };
                  observer.client.write('entity_metadata', {
                    entityId,
                    metadata: [{
                      key: 8,
                      type: obsIs119 ? 6 : 'item_stack',
                      value: metaValue
                    }]
                  });
                } catch (_) {}
              }
            }
          }

          break; // Item processed for this tick
        }
      }
    }
  }

  public showInventoryFullTitle(p: any): void {
    const lastWarning = p._lastInvFullWarning || 0;
    const now = Date.now();
    if (now - lastWarning >= 20000) { // 20-second cooldown per player
      p._lastInvFullWarning = now;
      try {
        if (p.is119) {
          p.client.write('set_title_time', { fadeIn: 10, stay: 50, fadeOut: 20 });
          p.client.write('set_title_text', { text: JSON.stringify({ text: '§c§lINVENTORY FULL' }) });
        } else {
          p.client.write('set_title_time', { fadeIn: 10, stay: 50, fadeOut: 20 });
          p.client.write('set_title_text', { text: nbt.comp({ text: nbt.string('§c§lINVENTORY FULL') }) });
        }
        p.client.write('named_sound_effect', {
          soundName: 'block.chest.locked',
          soundCategory: 0,
          x: Math.floor(p.x * 8),
          y: Math.floor(p.y * 8),
          z: Math.floor(p.z * 8),
          volume: 1.0,
          pitch: 0.8,
          seed: [0, 0]
        });
      } catch (_) {}
    }
  }

  public spawnDroppedItem(name: string, count: number, x: number, y: number, z: number, owner?: string): void {
    const itemDef119 = mcData1192.itemsByName[name] || mcData1192.blocksByName[name];
    const itemDef121 = mcData1211.itemsByName[name] || mcData1211.blocksByName[name];
    if (!itemDef119 && !itemDef121) return;

    const baseDef = itemDef119 || itemDef121;
    const itemEntityId = this.nextEntityId++;
    const spawnX = x + 0.5 + (Math.random() - 0.5) * 0.2;
    const spawnY = y + 0.2;
    const spawnZ = z + 0.5 + (Math.random() - 0.5) * 0.2;

    this.droppedItems.set(itemEntityId, {
      entityId: itemEntityId,
      itemId: baseDef.id,
      count,
      name,
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      spawnTime: Date.now(),
      owner
    });

    const velX = Math.floor((Math.random() - 0.5) * 400);
    const velY = 1600; // Natural upward pop (~0.2 blocks/tick)
    const velZ = Math.floor((Math.random() - 0.5) * 400);

    for (const [_, p] of players) {
      if (!p.client) continue;
      const is119 = p.is119;
      const pItemDef = is119 ? (itemDef119 || itemDef121) : (itemDef121 || itemDef119);
      if (!pItemDef) continue;

      try {
        p.client.write('spawn_entity', {
          entityId: itemEntityId,
          objectUUID: crypto.randomUUID(),
          type: is119 ? 44 : 58,
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          pitch: 0,
          yaw: 0,
          headPitch: 0,
          objectData: 1,
          data: 1,
          velocity: { x: velX, y: velY, z: velZ },
          velocityX: velX,
          velocityY: velY,
          velocityZ: velZ
        });

        const metaValue = is119
          ? { present: true, itemId: pItemDef.id, itemCount: count }
          : {
              itemCount: count,
              itemId: pItemDef.id,
              addedComponentCount: 0,
              removedComponentCount: 0,
              components: [],
              removeComponents: []
            };

        p.client.write('entity_metadata', {
          entityId: itemEntityId,
          metadata: [{
            key: 8,
            type: is119 ? 6 : 'item_stack',
            value: metaValue
          }]
        });
      } catch (_) {}
    }
  }

  private handlePlayerJoin(client: any): void {
    const is119 = (client.protocolVersion === 760 || client.version === '1.19.2');
    const verLabel = is119 ? '1.19.2 (Protocol 760)' : '1.21.1 (Protocol 767)';

    this.log('INFO', `[+] Player joined ${this.config.serverName}: ${client.username} [${verLabel}]`);

    const pData = createPlayerSession(client, is119);
    (pData as any).server = this;

    let spawnX = this.config.spawnPoint.x;
    let spawnY = this.config.spawnPoint.y;
    let spawnZ = this.config.spawnPoint.z;
    let spawnYaw = this.config.spawnPoint.yaw || 0;
    let spawnPitch = this.config.spawnPoint.pitch || 0;

    if (this.config.worldType === 'islands') {
      generatePlayerIsland(pData.username, pData.island.originX, pData.island.originZ);
      spawnX = pData.island.spawnX;
      spawnY = pData.island.spawnY;
      spawnZ = pData.island.spawnZ;
    }

    pData.x = spawnX;
    pData.y = spawnY;
    pData.z = spawnZ;
    pData.yaw = spawnYaw;
    pData.pitch = spawnPitch;
    pData.currentWorld = this.config.worldType === 'hub' ? 'zylarpixel:hub' : 'zylarpixel:islands';

    // 1. Handshake & Login Packet
    if (is119) {
      client.write('login', {
        entityId: client.id,
        isHardcore: false,
        gameMode: this.config.gamemode,
        previousGameMode: -1,
        worldNames: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
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
        isFlat: false,
        death: undefined
      });
    } else {
      client.write('login', {
        entityId: client.id,
        isHardcore: false,
        dimensionNames: ['minecraft:overworld'],
        maxPlayers: 50,
        viewDistance: 12,
        simulationDistance: 12,
        reducedDebugInfo: false,
        enableRespawnScreen: true,
        doLimitedCrafting: false,
        dimensionType: 'minecraft:overworld',
        dimensionName: 'minecraft:overworld',
        hashedSeed: [0, 0],
        gameMode: this.config.gamemode,
        previousGameMode: 255,
        isDebug: false,
        isFlat: false,
        enforcesSecureChat: false
      });
    }

    // 1b. Add Player to Self Tablist
    if (is119) {
      client.write('player_info', {
        action: 'add_player',
        data: [{
          uuid: client.uuid || generateOfflineUuid(pData.username),
          name: client.username,
          properties: [],
          gamemode: this.config.gamemode,
          ping: 1,
          displayName: JSON.stringify({ text: `§8[§6${this.config.scoreboardLocation}§8] ${formatPlayerName(pData.rank, client.username)}` }),
          crypto: undefined
        }]
      });
    } else {
      client.write('player_info', {
        action: 1 | 4 | 8 | 16,
        data: [{
          uuid: client.uuid || generateOfflineUuid(pData.username),
          player: { name: client.username, properties: [] },
          gamemode: this.config.gamemode,
          listed: 1,
          latency: 1,
          displayName: JSON.stringify({ text: `§8[§6${this.config.scoreboardLocation}§8] ${formatPlayerName(pData.rank, client.username)}` })
        }]
      });
    }

    // 2. Abilities
    const initialAbilitiesFlags = (this.config.worldType === 'hub') ? 0x01 : (pData.isOp ? 0x07 : 0x00);
    client._abilitiesFlags = initialAbilitiesFlags;
    client._isHub = (this.config.worldType === 'hub');
    client.write('abilities', {
      flags: initialAbilitiesFlags,
      flyingSpeed: 0.05,
      walkingSpeed: 0.1 * ((pData.stats.speed || 100) / 100.0)
    });

    // 3. View Distance & View Center
    client.write('update_view_distance', { viewDistance: 12 });

    const baseChunkX = Math.floor(spawnX / 16);
    const baseChunkZ = Math.floor(spawnZ / 16);
    pData.loadedChunks = new Set<string>();
    pData.currentChunkX = baseChunkX;
    pData.currentChunkZ = baseChunkZ;

    client.write('update_view_position', { chunkX: baseChunkX, chunkZ: baseChunkZ });

    // 4. Stream Chunks
    if (this.config.worldType === 'hub') {
      const initialRadius = 6;
      const chunkCoords: { cx: number; cz: number; dist: number }[] = [];
      for (let cx = baseChunkX - initialRadius; cx <= baseChunkX + initialRadius; cx++) {
        for (let cz = baseChunkZ - initialRadius; cz <= baseChunkZ + initialRadius; cz++) {
          const dist = (cx - baseChunkX) ** 2 + (cz - baseChunkZ) ** 2;
          chunkCoords.push({ cx, cz, dist });
        }
      }
      chunkCoords.sort((a, b) => a.dist - b.dist);

      // Send immediate floor chunks directly under player's feet FIRST so floor is 100% solid
      const immediate = chunkCoords.filter(c => c.dist <= 2);
      for (const c of immediate) {
        pData.loadedChunks.add(`${c.cx},${c.cz}`);
        try {
          client.write('map_chunk', dumpHubChunkPacket(c.cx, c.cz, is119));
        } catch (_) {}
      }

      // Send Initial Position
      const joinTpId = ++this.teleportCounter;
      pData.pendingTeleportId = joinTpId;
      pData.teleportLockUntil = Date.now() + 2000;
      pData.voidImmunityUntil = Date.now() + 1500;
      this.sendPositionPacket(client, spawnX, spawnY, spawnZ, spawnYaw, spawnPitch, joinTpId, is119);

      // Stream remaining outer chunks smoothly right after
      const outer = chunkCoords.filter(c => c.dist > 2);
      for (const c of outer) {
        pData.loadedChunks.add(`${c.cx},${c.cz}`);
        try {
          client.write('map_chunk', dumpHubChunkPacket(c.cx, c.cz, is119));
        } catch (_) {}
      }
    } else {
      if (!is119) {
        try { client.write('chunk_batch_start', {}); } catch (_) {}
      }

      for (let cx = baseChunkX - 4; cx <= baseChunkX + 4; cx++) {
        for (let cz = baseChunkZ - 4; cz <= baseChunkZ + 4; cz++) {
          pData.loadedChunks.add(`${cx},${cz}`);
          client.write('map_chunk', dumpChunkPacket(cx, cz, is119));
        }
      }

      if (!is119) {
        try { client.write('chunk_batch_finished', { batchSize: 81 }); } catch (_) {}
      }

      // Send Initial Position
      const joinTpId = ++this.teleportCounter;
      pData.pendingTeleportId = joinTpId;
      pData.teleportLockUntil = Date.now() + 1500;
      pData.voidImmunityUntil = Date.now() + 3500;
      this.sendPositionPacket(client, spawnX, spawnY, spawnZ, spawnYaw, spawnPitch, joinTpId, is119);
    }

    // 5. Restore Inventory & Give Nether Star in Slot 9
    for (const [slot, item] of pData.inventory) {
      if (slot === HOTBAR_NETHER_STAR_SLOT) continue;
      try {
        const tagged = tagVanillaItemStack({
          present: true,
          itemId: item.itemId,
          itemCount: item.count,
          nbtData: item.nbtData
        }, is119);
        item.nbtData = tagged.nbtData;
        client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot,
          item: formatSlotForClient(tagged, is119)
        });
      } catch (_) {}
    }
    giveNetherStar(client);

    // 6. Scoreboard & Below-Name Health
    sendScoreboard(client, is119, this.config.scoreboardLocation, pData.purse);
    initBelowNameHealth(client, is119);
    updatePlayerHealthScore(client, pData.username, pData.stats.health, is119);

    // 7. Global Tablist & Nametag Teams
    for (const [_, p] of players) {
      updateTablist(p.client, p.is119, this.config.scoreboardLocation);
    }
    for (const [_, other] of players) {
      sendScoreboardTeam(client, other.username, other.rank, is119);
      sendScoreboardTeam(other.client, pData.username, pData.rank, other.is119);
      updatePlayerHealthScore(client, other.username, other.stats.health, is119);
      updatePlayerHealthScore(other.client, pData.username, pData.stats.health, other.is119);
    }

    // Purge old follow bots from client tablist cache
    const oldBotUuids = [
      generateOfflineUuid('Village_Alex'),
      generateOfflineUuid('Village_Kai'),
      generateOfflineUuid('Village_Sam'),
      generateOfflineUuid('Village_Leo'),
      generateOfflineUuid('Village_Mia')
    ];
    if (is119) {
      try {
        client.write('player_info', {
          action: 'remove_player',
          data: oldBotUuids.map(uuid => ({ uuid }))
        });
      } catch (_) {}
    } else {
      try {
        client.write('player_remove', {
          players: oldBotUuids
        });
      } catch (_) {}
    }

    // 8. Server-Side Banker NPC (if Hub) - Crop Guardians are dynamically spawned via proximity ticker
    if (this.config.worldType === 'hub') {
      spawnBankerNpc(client, is119, (deg: number) => this.toProtocolByte(deg));
    }

    // 8b. Active Dropped Items
    for (const [entityId, drop] of this.droppedItems) {
      const pMcData = is119 ? mcData1192 : mcData1211;
      const pItemDef = pMcData.itemsByName[drop.name] || pMcData.blocksByName[drop.name];
      if (!pItemDef) continue;
      try {
        client.write('spawn_entity', {
          entityId,
          objectUUID: crypto.randomUUID(),
          type: is119 ? 44 : 58,
          x: drop.x,
          y: drop.y,
          z: drop.z,
          pitch: 0,
          yaw: 0,
          headPitch: 0,
          objectData: 1,
          data: 1,
          velocity: { x: 0, y: 0, z: 0 },
          velocityX: 0,
          velocityY: 0,
          velocityZ: 0
        });
        const metaVal = is119
          ? { present: true, itemId: pItemDef.id, itemCount: drop.count }
          : {
              itemCount: drop.count,
              itemId: pItemDef.id,
              addedComponentCount: 0,
              removedComponentCount: 0,
              components: [],
              removeComponents: []
            };
        client.write('entity_metadata', {
          entityId,
          metadata: [{
            key: 8,
            type: is119 ? 6 : 'item_stack',
            value: metaVal
          }]
        });
      } catch (_) {}
    }

    // 9. Stats Sync
    syncVanillaHealthAndHunger(client, pData.stats);

    // Synchronize active speed boost across server warps
    if (pData.activeBuffs && typeof pData.activeBuffs.speedBoostUntil === 'number') {
      const remainingMs = pData.activeBuffs.speedBoostUntil - Date.now();
      if (remainingMs > 0) {
        applySpeedBoost(pData, this, remainingMs, false);
      } else {
        pData.stats.speed = pData.baseSpeed || 100;
        syncPlayerAttributes(client, pData.entityId, pData.stats.speed, is119);
      }
    } else {
      syncPlayerAttributes(client, pData.entityId, pData.stats.speed, is119);
    }

    // 10. Command Palette Declarations
    const isMaster = (pData.username || '').toLowerCase() === 'arnavjava';
    sendDeclaredCommands(client, !!pData.isOp, isMaster);

    // 11. Synchronize Nearby Players
    setTimeout(() => this.syncNearbyPlayers(pData), 150);

    // 12. Register Client Packet Listeners
    this.registerPacketHandlers(client, pData, is119);
  }

  private registerPacketHandlers(client: any, pData: any, is119: boolean): void {
    // A. Movement & Collision
    const handleMovement = (data: any) => {
      const now = Date.now();

      // Discard stale in-flight packets while teleporting
      if (pData.pendingTeleportId || (pData.teleportLockUntil && now < pData.teleportLockUntil)) {
        const distToTarget = Math.hypot((data.x || pData.x) - pData.x, (data.z || pData.z) - pData.z);
        if (distToTarget > 12.0 || Math.abs((data.y || pData.y) - pData.y) > 16.0) {
          return; // Drop stale movement packet while teleporting
        }
        pData.pendingTeleportId = undefined;
        pData.teleportLockUntil = 0;
      }

      const oldX = pData.x;
      const oldY = pData.y;
      const oldZ = pData.z;

      pData.x = (typeof data.x === 'number') ? data.x : pData.x;
      pData.y = (typeof data.y === 'number') ? data.y : pData.y;
      pData.z = (typeof data.z === 'number') ? data.z : pData.z;
      if (typeof data.yaw === 'number') pData.yaw = data.yaw;
      if (typeof data.pitch === 'number') pData.pitch = data.pitch;

      // 1. Void Rescue Protection
      if (this.config.worldType === 'hub') {
        if (pData.y < 20.0 && (!pData.voidImmunityUntil || now >= pData.voidImmunityUntil)) {
          pData.voidImmunityUntil = now + 2500;
          pData.teleportLockUntil = now + 1500;
          const rescueTpId = ++this.teleportCounter;
          pData.pendingTeleportId = rescueTpId;

          const spawnCx = Math.floor(HUB_SPAWN_X / 16);
          const spawnCz = Math.floor(HUB_SPAWN_Z / 16);
          pData.currentChunkX = spawnCx;
          pData.currentChunkZ = spawnCz;
          try {
            client.write('update_view_position', { chunkX: spawnCx, chunkZ: spawnCz });
          } catch (_) {}

          for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
              const targetCx = spawnCx + dx;
              const targetCz = spawnCz + dz;
              pData.loadedChunks.add(`${targetCx},${targetCz}`);
              try {
                client.write('map_chunk', dumpHubChunkPacket(targetCx, targetCz, is119));
              } catch (_) {}
            }
          }

          this.sendPositionPacket(client, HUB_SPAWN_X, 71.0, HUB_SPAWN_Z, 180, 0, rescueTpId, is119);
          pData.x = HUB_SPAWN_X;
          pData.y = 71.0;
          pData.z = HUB_SPAWN_Z;

          sendSystemMessage(client, '§e[Void Rescue] Safely rescued and teleported to Hub spawn!', is119);
          try {
            client.write('named_sound_effect', {
              soundName: 'entity.enderman.teleport',
              soundCategory: 0,
              x: Math.floor(HUB_SPAWN_X * 8),
              y: Math.floor(71.0 * 8),
              z: Math.floor(HUB_SPAWN_Z * 8),
              volume: 1.0,
              pitch: 1.0,
              seed: [0, 0]
            });
          } catch (_) {}
          return;
        }
      } else {
        if (pData.y < 30.0 && (!pData.voidImmunityUntil || now >= pData.voidImmunityUntil)) {
          pData.voidImmunityUntil = now + 3000;
          pData.teleportLockUntil = now + 1500;

          const spawnX = pData.island ? pData.island.spawnX : 0.5;
          const spawnY = pData.island ? pData.island.spawnY : 101.0;
          const spawnZ = pData.island ? pData.island.spawnZ : 0.5;

          teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
          this.syncNearbyPlayers(pData);
          updatePlayerScoreboardLocation(client, is119, 'Your Island');

          for (const [slot, item] of pData.inventory) {
            try {
              const tagged = tagVanillaItemStack({
                present: true,
                itemId: item.itemId,
                itemCount: item.count,
                nbtData: item.nbtData
              }, is119);
              client.write('set_slot', {
                windowId: 0,
                stateId: 1,
                slot,
                item: tagged
              });
            } catch (_) {}
          }
          giveNetherStar(client);

          sendSystemMessage(client, '§7[§dZylarPixel§7] §cYou fell into the void! Teleported back to your island. §a(Inventory Kept)', is119);
          return;
        }
      }

      // 2. Portal Step Detection
      this.checkPortalStep(pData, data.x, data.y, data.z);

      // 3. Dynamic Chunk Streaming & View Center Sync
      const currentCx = Math.floor(data.x / 16);
      const currentCz = Math.floor(data.z / 16);

      if (currentCx !== pData.currentChunkX || currentCz !== pData.currentChunkZ) {
        pData.currentChunkX = currentCx;
        pData.currentChunkZ = currentCz;

        try {
          client.write('update_view_position', { chunkX: currentCx, chunkZ: currentCz });
        } catch (_) {}

        const streamRadius = (this.config.worldType === 'hub') ? 6 : 5;
        const pruneRadius = streamRadius + 3;
        let newChunksStreamed = 0;

        if (!is119) {
          try { client.write('chunk_batch_start', {}); } catch (_) {}
        }

        if (pData.loadedChunks) {
          for (const key of pData.loadedChunks) {
            const commaIdx = key.indexOf(',');
            const cx = parseInt(key.slice(0, commaIdx), 10);
            const cz = parseInt(key.slice(commaIdx + 1), 10);
            if (Math.abs(cx - currentCx) > pruneRadius || Math.abs(cz - currentCz) > pruneRadius) {
              pData.loadedChunks.delete(key);
            }
          }
        }

        const chunksToStream: { cx: number; cz: number; dist: number }[] = [];
        for (let dx = -streamRadius; dx <= streamRadius; dx++) {
          for (let dz = -streamRadius; dz <= streamRadius; dz++) {
            const targetCx = currentCx + dx;
            const targetCz = currentCz + dz;
            const key = `${targetCx},${targetCz}`;
            if (pData.loadedChunks && !pData.loadedChunks.has(key)) {
              pData.loadedChunks.add(key);
              chunksToStream.push({ cx: targetCx, cz: targetCz, dist: dx * dx + dz * dz });
            }
          }
        }

        if (chunksToStream.length > 0) {
          // Send closest chunks first for instant floor stability
          chunksToStream.sort((a, b) => a.dist - b.dist);

          const immediate = chunksToStream.slice(0, 4);
          for (const c of immediate) {
            try {
              const chunkPacket = (this.config.worldType === 'hub')
                ? dumpHubChunkPacket(c.cx, c.cz, is119)
                : dumpChunkPacket(c.cx, c.cz, is119);
              client.write('map_chunk', chunkPacket);
              newChunksStreamed++;
            } catch (_) {}
          }

          const remaining = chunksToStream.slice(4);
          if (remaining.length > 0) {
            const streamBatch = () => {
              const batch = remaining.splice(0, 6);
              for (const c of batch) {
                try {
                  const chunkPacket = (this.config.worldType === 'hub')
                    ? dumpHubChunkPacket(c.cx, c.cz, is119)
                    : dumpChunkPacket(c.cx, c.cz, is119);
                  client.write('map_chunk', chunkPacket);
                  newChunksStreamed++;
                } catch (_) {}
              }
              if (remaining.length > 0) {
                setImmediate(streamBatch);
              } else if (!is119 && newChunksStreamed > 0) {
                try { client.write('chunk_batch_finished', { batchSize: newChunksStreamed }); } catch (_) {}
              }
            };
            setImmediate(streamBatch);
          } else if (!is119 && newChunksStreamed > 0) {
            try { client.write('chunk_batch_finished', { batchSize: newChunksStreamed }); } catch (_) {}
          }
        }
      }

      // 4. Smooth Relative Movement Broadcast to Observers (60FPS Interpolation)
      const prevX = (typeof pData.lastBroadcastX === 'number') ? pData.lastBroadcastX : data.x;
      const prevY = (typeof pData.lastBroadcastY === 'number') ? pData.lastBroadcastY : data.y;
      const prevZ = (typeof pData.lastBroadcastZ === 'number') ? pData.lastBroadcastZ : data.z;

      const deltaX = data.x - prevX;
      const deltaY = data.y - prevY;
      const deltaZ = data.z - prevZ;
      const distSq = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

      pData.lastBroadcastX = data.x;
      pData.lastBroadcastY = data.y;
      pData.lastBroadcastZ = data.z;

      const yawByte = this.toProtocolByte(pData.yaw);
      const pitchByte = this.toProtocolByte(pData.pitch);

      for (const [_, other] of players) {
        if (other.client.id !== client.id && other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          try {
            if (distSq > 0.0001 && distSq < 64.0) {
              const dX = Math.round(deltaX * 4096);
              const dY = Math.round(deltaY * 4096);
              const dZ = Math.round(deltaZ * 4096);
              if (Math.abs(dX) < 32768 && Math.abs(dY) < 32768 && Math.abs(dZ) < 32768 && (dX !== 0 || dY !== 0 || dZ !== 0)) {
                other.client.write('entity_move_look', {
                  entityId: pData.entityId,
                  dX, dY, dZ,
                  yaw: yawByte,
                  pitch: pitchByte,
                  onGround: true
                });
              } else {
                other.client.write('entity_look', {
                  entityId: pData.entityId,
                  yaw: yawByte,
                  pitch: pitchByte,
                  onGround: true
                });
              }
            } else if (distSq >= 64.0) {
              other.client.write('entity_teleport', {
                entityId: pData.entityId,
                x: data.x,
                y: data.y,
                z: data.z,
                yaw: yawByte,
                pitch: pitchByte,
                onGround: true
              });
            }
            other.client.write('entity_head_rotation', {
              entityId: pData.entityId,
              headYaw: yawByte
            });
          } catch (_) {}
        }
      }
    };

    client.on('position', handleMovement);
    client.on('position_look', handleMovement);

    client.on('look', (data: any) => {
      pData.yaw = (typeof data.yaw === 'number') ? data.yaw : (pData.yaw || 0);
      pData.pitch = (typeof data.pitch === 'number') ? data.pitch : (pData.pitch || 0);
      const yawByte = this.toProtocolByte(pData.yaw);
      const pitchByte = this.toProtocolByte(pData.pitch);
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
          } catch (_) {}
        }
      }
    });

    client.on('teleport_confirm', (data: any) => {
      if (data && data.teleportId === pData.pendingTeleportId) {
        pData.pendingTeleportId = undefined;
        pData.teleportLockUntil = 0;
      }
    });

    client.on('held_item_slot', (data: any) => {
      if (typeof data.slotId === 'number') {
        pData.selectedSlot = data.slotId;
      }
    });

    client.on('abilities', (data: any) => {
      if (data && typeof data.flags === 'number') {
        client._abilitiesFlags = data.flags;
      }
    });

    client.on('arm_animation', (data: any) => {
      for (const [_, other] of players) {
        if (other.client.id !== client.id && other.spawnedPlayers && other.spawnedPlayers.has(pData.entityId)) {
          try {
            other.client.write('animation', {
              entityId: pData.entityId,
              animation: (data && data.hand === 1) ? 3 : 0
            });
          } catch (_) {}
        }
      }
    });

    client.on('client_command', (data: any) => {
      if (data && data.action === 0) {
        const spawnX = pData.island ? pData.island.spawnX : 0.5;
        const spawnY = pData.island ? pData.island.spawnY : 101.0;
        const spawnZ = pData.island ? pData.island.spawnZ : 0.5;
        teleportPlayerWithChunks(pData, spawnX, spawnY, spawnZ);
        this.syncNearbyPlayers(pData);
        updatePlayerScoreboardLocation(client, is119, 'Your Island');

        for (const [slot, item] of pData.inventory) {
          if (slot === HOTBAR_NETHER_STAR_SLOT) continue;
          try {
            const tagged = tagVanillaItemStack({
              present: true,
              itemId: item.itemId,
              itemCount: item.count,
              nbtData: item.nbtData
            }, is119);
            item.nbtData = tagged.nbtData;
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot,
              item: tagged
            });
          } catch (_) {}
        }
        giveNetherStar(client);
      }
    });

    // B. Window / GUI Clicks
    client.on('window_click', (data: any) => {
      const clickedSlot = data.slot;

      // Case 1: Survival inventory (WindowId = 0)
      if (data.windowId === 0 || pData.openWindowId === 0) {
        // Locking Hotbar Slot 9 (Slot 44): Nether Star is completely unmovable
        if (clickedSlot === HOTBAR_NETHER_STAR_SLOT || (data.mode === 2 && data.button === 8)) {
          client.write('set_slot', {
            windowId: -1,
            stateId: data.stateId,
            slot: -1,
            item: { present: false }
          });
          giveNetherStar(client);
          openSkyBlockMenu(client, pData);
          return;
        }

        if (Array.isArray(data.changedSlots)) {
          const mcData = is119 ? mcData1192 : mcData1211;
          for (const change of data.changedSlots) {
            const slot = change.location;
            const item = change.item;
            if (slot >= 0 && slot !== HOTBAR_NETHER_STAR_SLOT) {
              if (!item || !item.present) {
                pData.inventory.delete(slot);
              } else {
                const tagged = tagVanillaItemStack(item, is119);
                const itemDef = mcData.items[tagged.itemId];
                pData.inventory.set(slot, {
                  slot,
                  name: itemDef ? itemDef.name : 'unknown',
                  itemId: tagged.itemId,
                  count: tagged.itemCount,
                  nbtData: tagged.nbtData
                });
                try {
                  client.write('set_slot', {
                    windowId: 0,
                    stateId: data.stateId,
                    slot,
                    item: tagged
                  });
                } catch (_) {}
              }
            }
          }
          persistPlayerSession(pData);
        }
        giveNetherStar(client);
        return;
      }

      // Case 2: Interactive Custom Chest GUI (WindowId > 0)
      if (pData.openWindowId && pData.openWindowId > 0) {
        // Special Case: Crafting Table GUI (WindowId = 15) handles active crafting, cursor items & inventory
        if (pData.openWindowId === CRAFTING_TABLE_WINDOW_ID) {
          handleCraftingTableClick(client, pData, data, sendSystemMessage, is119);
          return;
        }

        // Clear cursor item immediately
        client.write('set_slot', {
          windowId: -1,
          stateId: data.stateId,
          slot: -1,
          item: { present: false }
        });

        // CRITICAL FIX: Restore clicked slot item in GUI so items (like player head!) NEVER disappear!
        if (pData.currentGuiItems && clickedSlot >= 0 && clickedSlot < 54) {
          client.write('set_slot', {
            windowId: pData.openWindowId,
            stateId: data.stateId,
            slot: clickedSlot,
            item: pData.currentGuiItems[clickedSlot] || { present: false }
          });
        }

        // 1. SkyBlock Menu (WindowId = 6)
        if (pData.openWindowId === SKYBLOCK_MENU_WINDOW_ID) {
          handleSkyBlockMenuClick(client, pData, clickedSlot, sendSystemMessage, is119);
          return;
        }

        // 2. Stats Menu (WindowId = 5)
        if (pData.openWindowId === 5) {
          if (clickedSlot === 49) {
            pData.openWindowId = 0;
            client.write('close_window', { windowId: 5 });
          }
          return;
        }

        // 3. Master Admin Menu (WindowId = 1)
        if (pData.openWindowId === 1) {
          if (clickedSlot === 8) {
            // Restart Server (Redstone Block, Top-Right Corner)
            pData.openWindowId = 0;
            try { client.write('close_window', { windowId: 1 }); } catch (_) {}
            this.triggerServerRestart();
          } else if (clickedSlot === 21) {
            // Rank Manager (Nether Star)
            if (players.size > 1) openPlayerSelector(client, pData, players);
            else openRankSelector(client, pData, pData);
          } else if (clickedSlot === 23) {
            // Purse & Economy Manager (Gold Ingot)
            openCoinPlayerSelector(client, pData, players, false);
          } else if (clickedSlot === 25) {
            // Item & Combat Spawner (Diamond Sword)
            openAdminItemSpawner(client, pData, 0);
          } else if (clickedSlot === 49) {
            pData.openWindowId = 0;
            client.write('close_window', { windowId: 1 });
          }
          return;
        }

        // 4. Player Selector (WindowId = 3)
        if (pData.openWindowId === 3) {
          if (clickedSlot === 49) {
            openAdminMenu(client, pData);
          } else if (pData.playerSelectorSlots && pData.playerSelectorSlots.has(clickedSlot)) {
            const target = pData.playerSelectorSlots.get(clickedSlot);
            openRankSelector(client, pData, target);
          }
          return;
        }

        // 5. Centered Rank Selector Sub-GUI (WindowId = 2)
        if (pData.openWindowId === 2) {
          if (clickedSlot === 49) {
            if (players.size > 1) openPlayerSelector(client, pData, players);
            else openAdminMenu(client, pData);
            return;
          }
          const rankKey = RANK_SLOT_MAP[clickedSlot];
          if (rankKey && RANKS[rankKey]) {
            const chosenRank = RANKS[rankKey];
            const target = pData.targetPlayerForRank || pData;
            setPlayerRank(target, chosenRank);
            for (const [_, observer] of players) {
              updateTablist(observer.client, observer.is119, this.config.scoreboardLocation);
              sendScoreboardTeam(observer.client, target.username, chosenRank, observer.is119);
            }
            sendSystemMessage(client, `§aUpdated §e${target.username}'s §arank to ${chosenRank.prefix}§a!`, is119);
            // CRITICAL FIX: Keep user on the Rank Selector page with updated checkmark!
            openRankSelector(client, pData, target);
          }
          return;
        }

        // 6. Bank Menus (WindowId = 7, 8, 9, 10)
        if (
          pData.openWindowId === BANK_MAIN_WINDOW_ID ||
          pData.openWindowId === BANK_DEPOSIT_WINDOW_ID ||
          pData.openWindowId === BANK_WITHDRAW_WINDOW_ID ||
          pData.openWindowId === BANK_UPGRADES_WINDOW_ID
        ) {
          handleBankClick(client, pData, pData.openWindowId, clickedSlot, is119);
          return;
        }

        // 7. Admin Coin / Purse Manager (WindowId = 11, 12)
        if (
          pData.openWindowId === ADMIN_COIN_SELECTOR_WINDOW_ID ||
          pData.openWindowId === ADMIN_COIN_ACTION_WINDOW_ID
        ) {
          handleAdminCoinMenuClick(client, pData, pData.openWindowId, clickedSlot, players, is119);
          return;
        }

        // 8. Admin Item & Combat Spawner (WindowId = 13)
        if (pData.openWindowId === ADMIN_ITEM_SPAWNER_WINDOW_ID) {
          handleAdminItemSpawnerClick(client, pData, clickedSlot, is119);
          return;
        }
      }
    });

    client.on('close_window', () => {
      if (pData.openWindowId === CRAFTING_TABLE_WINDOW_ID) {
        handleCraftingTableClose(client, pData, is119);
      }
      pData.openWindowId = 0;
      pData.currentGuiItems = null;
      pData.targetPlayerForRank = null;
      pData.playerSelectorSlots = undefined;
      pData.adminItemSpawnerState = undefined;
      if (pData.pendingSignPrompt) {
        if (pData.pendingSignPrompt.timeout) clearTimeout(pData.pendingSignPrompt.timeout);
        restoreSignBlock(client, pData, pData.pendingSignPrompt.location);
        pData.pendingSignPrompt = null;
      }
      if (pData.pendingAdminSignPrompt) {
        if (pData.pendingAdminSignPrompt.timeout) clearTimeout(pData.pendingAdminSignPrompt.timeout);
        restoreSignBlock(client, pData, pData.pendingAdminSignPrompt.location);
        pData.pendingAdminSignPrompt = null;
      }
    });

    // D. Incoming Sign Text Update (Real Oak Sign GUI for Banking & Admin Coin Management)
    client.on('update_sign', (data: any) => {
      if (pData.pendingAdminSignPrompt) {
        handleAdminSignUpdate(client, pData, data, is119);
        return;
      }
      handleSignUpdate(client, pData, data, is119);
    });

    // C. Right-Clicking Held Item (Nether Star & SkyBlock Abilities)
    client.on('use_item', (data: any) => {
      const activeSlot = 36 + pData.selectedSlot;
      if (activeSlot === HOTBAR_NETHER_STAR_SLOT || pData.selectedSlot === 8) {
        openSkyBlockMenu(client, pData);
        return;
      }

      const heldItem = pData.inventory.get(activeSlot);
      if (heldItem) {
        const itemStack = {
          present: true,
          itemId: heldItem.itemId,
          itemCount: heldItem.count,
          nbtData: heldItem.nbtData
        };
        handleItemAbility(pData, this, itemStack, 'RIGHT CLICK');
      }
    });

    // D. Block Digging (Breaking) with Hardness & Dig Status Handling
    client.on('block_dig', (data: any) => {
      // Drop item key (Q) while holding Nether Star
      if ((data.status === 3 || data.status === 4) && pData.selectedSlot === 8) {
        giveNetherStar(client);
        openSkyBlockMenu(client, pData);
        return;
      }

      const { location, sequence } = data;
      const x = location.x;
      const y = location.y;
      const z = location.z;

      // Hub Protection: Silent reset with authentic block state, EXCEPT 4 core Hub crops!
      if (!this.config.allowBlockBreaking || this.config.worldType === 'hub') {
        const cx = Math.floor(x / 16);
        const cz = Math.floor(z / 16);
        const chunk = loadHubChunk(cx, cz, is119);
        const rx = ((x % 16) + 16) % 16;
        const rz = ((z % 16) + 16) % 16;
        const stateId = chunk ? chunk.getBlockStateId(new Vec3(rx, y, rz)) : 1;
        const mcData = is119 ? mcData1192 : mcData1211;
        const blockName = mcData.blocksByStateId[stateId]?.name || '';

        // Check 5x5 Hub Wheat Minion Exclusion Zone (X: 45..49, Y: 70, Z: -139..-135)
        if (this.config.worldType === 'hub' && isHubMinionExclusionZone(x, y, z)) {
          handleHubCropHarvest(this, pData, x, y, z, 'wheat', sequence);
          return;
        }

        // Special-case the 4 core Hub crops: wheat, carrots, potatoes, nether_wart
        if (this.config.worldType === 'hub' && isHarvestableHubCrop(blockName)) {
          if (data.status === 0 || data.status === 2) {
            handleHubCropHarvest(this, pData, x, y, z, blockName, sequence);
          }
          return;
        }

        client.write('block_change', {
          location,
          type: stateId
        });
        if (typeof sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
        }
        return;
      }

      const currentBlock = getWorldBlockName(x, y, z, is119);
      if (!currentBlock || currentBlock === 'air' || currentBlock === 'bedrock' || currentBlock === 'nether_portal') {
        return;
      }

      const mcData = is119 ? mcData1192 : mcData1211;
      const blockDef = mcData.blocksByName[currentBlock];
      const isInstantBreak = blockDef && (blockDef.hardness === 0 || blockDef.hardness === null);

      // Digging: status 2 = finished digging; status 0 = instant break blocks (e.g. flowers/torches)
      if (data.status === 2 || (data.status === 0 && isInstantBreak)) {
        // Island Guest Protection
        const islandOwner = this.getIslandOwnerForCoords(x, z, pData.username);
        if (islandOwner.toLowerCase() !== pData.username.toLowerCase() && !pData.isOp && !pData.bypassGuestProtection) {
          sendSystemMessage(client, `§cYou cannot build or break blocks on §e${islandOwner}'s §cisland! You are a guest.`, is119);
          client.write('block_change', {
            location,
            type: blockDef ? blockDef.defaultState : 0
          });
          if (typeof sequence === 'number') {
            try { client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
          }
          return;
        }

        setWorldBlock(x, y, z, 'air', pData.username);
        savePlayerIslandBlock(islandOwner, x, y, z, 'air');

        // Broadcast block break to breaker AND all nearby observers
        for (const [_, observer] of players) {
          const dist = Math.hypot((observer.x || 0) - x, (observer.z || 0) - z);
          if (dist <= 128.0) {
            try {
              observer.client.write('block_change', { location, type: 0 });
            } catch (_) {}
          }
        }

        if (typeof sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: sequence }); } catch (_) {}
        }

        // Spawn dropped item entity
        const dropName = BLOCK_DROPS[currentBlock] || currentBlock;
        this.spawnDroppedItem(dropName, 1, x, y, z);
      }
    });

    // E. Block Placement
    client.on('block_place', (data: any) => {
      const activeSlot = 36 + pData.selectedSlot;
      if (activeSlot === HOTBAR_NETHER_STAR_SLOT || pData.selectedSlot === 8) {
        openSkyBlockMenu(client, pData);
        return;
      }

      if (!data || !data.location) return;

      const clickedX = data.location.x;
      const clickedY = data.location.y;
      const clickedZ = data.location.z;

      // Intercept right-clicking Crafting Table anywhere in the world (Hub & Islands)
      const isHub = (this.config.worldType === 'hub' || pData.currentWorld === 'zylarpixel:hub');
      let clickedBlockName = 'air';
      if (isHub) {
        clickedBlockName = getHubBlockName(clickedX, clickedY, clickedZ);
      } else {
        clickedBlockName = getWorldBlockName(clickedX, clickedY, clickedZ, is119);
      }

      if (clickedBlockName === 'crafting_table') {
        if (typeof data.sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: data.sequence }); } catch (_) {}
        }
        const held = pData.inventory.get(activeSlot);
        if (held && held.count > 0) {
          const currentTagged = tagVanillaItemStack({
            present: true,
            itemId: held.itemId,
            itemCount: held.count,
            nbtData: held.nbtData
          }, is119);
          try {
            client.write('set_slot', {
              windowId: 0,
              stateId: 1,
              slot: activeSlot,
              item: currentTagged
            });
          } catch (_) {}
        }
        openCraftingTableMenu(client, pData);
        return;
      }

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

      const held = pData.inventory.get(activeSlot);
      if (!held || held.count <= 0) return;

      const currentTagged = tagVanillaItemStack({
        present: true,
        itemId: held.itemId,
        itemCount: held.count,
        nbtData: held.nbtData
      }, is119);

      // Hub Protection
      if (!this.config.allowBlockPlacement || this.config.worldType === 'hub') {
        client.write('block_change', {
          location: { x: targetX, y: targetY, z: targetZ },
          type: 0
        });
        client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot: activeSlot,
          item: currentTagged
        });
        if (typeof data.sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: data.sequence }); } catch (_) {}
        }
        // Seamless ability execution on right click against blocks in Hub!
        handleItemAbility(pData, this, currentTagged, 'RIGHT CLICK');
        return;
      }

      // Island Guest Protection
      const islandOwner = this.getIslandOwnerForCoords(targetX, targetZ, pData.username);
      if (islandOwner.toLowerCase() !== pData.username.toLowerCase() && !pData.isOp && !pData.bypassGuestProtection) {
        sendSystemMessage(client, `§cYou cannot build or break blocks on §e${islandOwner}'s §cisland! You are a guest.`, is119);
        client.write('block_change', {
          location: { x: targetX, y: targetY, z: targetZ },
          type: 0
        });
        client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot: activeSlot,
          item: currentTagged
        });
        if (typeof data.sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: data.sequence }); } catch (_) {}
        }
        handleItemAbility(pData, this, currentTagged, 'RIGHT CLICK');
        return;
      }

      const blockToPlace = ITEM_TO_BLOCK[held.name] || held.name;
      const mcData = is119 ? mcData1192 : mcData1211;
      const blockDef = mcData.blocksByName[blockToPlace];

      // Non-placeable item (e.g. Swords, tools, items without a block)
      if (!blockDef) {
        client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot: activeSlot,
          item: currentTagged
        });
        handleItemAbility(pData, this, currentTagged, 'RIGHT CLICK');
        return;
      }

      if (blockDef) {
        setWorldBlock(targetX, targetY, targetZ, blockToPlace, pData.username);
        savePlayerIslandBlock(islandOwner, targetX, targetY, targetZ, blockToPlace);

        for (const [_, p] of players) {
          const dist = Math.hypot((p.x || 0) - targetX, (p.z || 0) - targetZ);
          if (dist <= 128.0) {
            try {
              p.client.write('block_change', {
                location: { x: targetX, y: targetY, z: targetZ },
                type: blockDef.defaultState
              });
            } catch (_) {}
          }
        }

        held.count--;
        if (held.count <= 0) pData.inventory.delete(activeSlot);
        const updatedTagged = held.count > 0 ? tagVanillaItemStack({
          present: true,
          itemId: held.itemId,
          itemCount: held.count,
          nbtData: held.nbtData
        }, is119) : { present: false };

        client.write('set_slot', {
          windowId: 0,
          stateId: 1,
          slot: activeSlot,
          item: updatedTagged
        });

        persistPlayerSession(pData);

        if (typeof data.sequence === 'number') {
          try { client.write('acknowledge_player_digging', { sequenceId: data.sequence }); } catch (_) {}
        }
      }
    });

    // F. Combat & NPC Interactions
    client.on('use_entity', (data: any) => {
      if (!data) return;

      // 1. Hub Banker NPC Interaction Check
      if (this.config.worldType === 'hub') {
        const handled = handleBankerInteraction(
          client,
          data.target,
          data.mouse,
          is119,
          (c, msg, v) => sendSystemMessage(c, msg, v),
          pData
        );
        if (handled) return;
      }

      if (data.mouse !== 1) return; // 1 = Attack

      // Peaceful Hub Safe Zone Check
      if (!this.config.pvp || this.config.worldType === 'hub') {
        return;
      }

      const targetEntityId = data.target;
      let targetPData: any = null;
      for (const [_, p] of players) {
        if (p.entityId === targetEntityId) {
          targetPData = p;
          break;
        }
      }
      if (!targetPData) return;

      // Operator Check for Island PvP
      if (!pData.isOp) {
        const now = Date.now();
        if (!pData.lastPvpNotice || now - pData.lastPvpNotice > 1500) {
          pData.lastPvpNotice = now;
          sendSystemMessage(client, `§cYou cannot attack players on ZylarPixel! Only Operators can attack.`, is119);
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
          } catch (_) {}
        }
        return;
      }

      const targetClient = targetPData.client;

      // Red Hurt Status
      for (const [_, p] of players) {
        try {
          p.client.write('entity_status', {
            entityId: targetEntityId,
            entityStatus: 2 // Hurt
          });
        } catch (_) {}
      }

      // Hurt Sound Effect
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
        } catch (_) {}
      }

      // Knockback Velocity
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
      } catch (_) {}

      for (const [_, p] of players) {
        if (p.client.id !== targetClient.id) {
          try {
            p.client.write('entity_velocity', {
              entityId: targetEntityId,
              velocity: { x: vx, y: vy, z: vz }
            });
          } catch (_) {}
        }
      }

      // SkyBlock Combat Damage Calculation
      const activeSlot = 36 + pData.selectedSlot;
      const held = pData.inventory.get(activeSlot);
      let weaponBaseDamage = 0;
      if (held) {
        const itemLower = (held.name || '').toLowerCase();
        if (itemLower.includes('diamond_sword')) weaponBaseDamage = 35;
        else if (itemLower.includes('iron_sword')) weaponBaseDamage = 30;
        else if (itemLower.includes('stone_sword')) weaponBaseDamage = 25;
        else if (itemLower.includes('golden_sword') || itemLower.includes('wood')) weaponBaseDamage = 20;
      }

      const { damage: rawDamage, isCrit } = calculateDamage(pData.stats, weaponBaseDamage);
      const finalDamage = applyDefense(rawDamage, targetPData.stats.defense);

      targetPData.stats.health = Math.max(0, targetPData.stats.health - finalDamage);
      syncVanillaHealthAndHunger(targetClient, targetPData.stats);

      // Spawn Floating ArmorStand Damage Indicator (Zero Chat Spam!)
      const allClients = Array.from(players.values()).map(p => p.client);
      spawnDamageIndicator(allClients, targetPData.x, targetPData.y, targetPData.z, finalDamage, isCrit);

      // Sync Below-Name Health Score
      for (const [_, p] of players) {
        updatePlayerHealthScore(p.client, targetPData.username, targetPData.stats.health, p.is119);
      }

      // Death Check
      if (targetPData.stats.health <= 0) {
        sendSystemMessage(targetClient, `§c☠ You died! Respawning at island...`, targetPData.is119);
        for (const [_, p] of players) {
          sendSystemMessage(p.client, `§c☠ §e${targetPData.username} §7was slain by §c${pData.username}§7!`, p.is119);
        }
        targetPData.stats.health = targetPData.stats.maxHealth;
        targetPData.stats.mana = targetPData.stats.maxMana;
        const sX = targetPData.island ? targetPData.island.spawnX : 0.5;
        const sY = targetPData.island ? targetPData.island.spawnY : 101.0;
        const sZ = targetPData.island ? targetPData.island.spawnZ : 0.5;
        teleportPlayerWithChunks(targetPData, sX, sY, sZ);
        syncVanillaHealthAndHunger(targetClient, targetPData.stats);
        for (const [_, p] of players) {
          updatePlayerHealthScore(p.client, targetPData.username, targetPData.stats.health, p.is119);
        }
      }
    });

    // G. Chat & Commands
    const processIncomingChat = (rawMessage: string) => {
      const clean = rawMessage.trim();
      if (!clean) return;

      if (clean.startsWith('/')) {
        handleCommand(
          pData,
          clean,
          (c: any) => this.reGenerateWorld(c, is119),
          () => this.triggerServerRestart(),
          (tp: any) => this.syncNearbyPlayers(tp)
        );
      } else {
        const formatted = formatChatMessage(pData.rank, pData.username, clean);
        console.log(`[CHAT] ${formatted.replace(/§[0-9a-fk-or]/g, '')}`);
        for (const [_, p] of players) {
          sendSystemMessage(p.client, formatted, p.is119);
        }
      }
    };

    client.on('chat_message', (d: any) => { if (d && d.message) processIncomingChat(d.message); });
    client.on('chat_command', (d: any) => { if (d && d.command) processIncomingChat('/' + d.command); });
    client.on('chat', (d: any) => { if (d && d.message) processIncomingChat(d.message); });

    // H. Tab Complete
    client.on('tab_complete', (data: any) => {
      handleTabComplete(client, pData, data, players);
    });

    // I. Player Disconnect
    client.on('end', () => {
      persistPlayerSession(pData);
      removePlayerSession(client.id);
      for (const [_, p] of players) {
        updateTablist(p.client, p.is119, this.config.scoreboardLocation);
      }
      for (const [_, other] of players) {
        this.despawnPlayerForObserver(other, pData);
      }
      this.log('INFO', `[-] Player left ${this.config.serverName}: ${client.username}`);
    });
  }

  private checkPortalStep(pData: any, x: number, y: number, z: number): void {
    const now = Date.now();
    if (now - (pData.lastPortalNotice || 0) < 3500) return;

    if (this.config.worldType === 'hub') {
      // Portal in Hub leading to Islands (portal near spawn and portal arch)
      const inHubPortal = (x >= -5.0 && x <= 0.0 && y >= 69.0 && y <= 73.0 && z >= -65.0 && z <= -61.0) ||
                          (Math.abs(x - 10.5) <= 2.5 && Math.abs(z - (-78.5)) <= 2.5 && y >= 69 && y <= 74);
      if (inHubPortal) {
        pData.lastPortalNotice = now;
        sendSystemMessage(pData.client, '§a[Portal] Warping you to your Private Island...', pData.is119);
        try {
          pData.client.write('custom_payload', {
            channel: 'zylarpixel:proxy',
            data: Buffer.from('connect:islands')
          });
        } catch (_) {}
      }
    } else {
      // Ancient Stone Arch Portal on Private Island leading to Hub (x: 0.5, y: 101-107, z: 34)
      const currentIslandX = Math.round(x / 1000) * 1000;
      const inPortalX = (x >= currentIslandX - 1.5 && x <= currentIslandX + 1.5);
      const inPortalY = (y >= 101.0 && y <= 107.0);
      const inPortalZ = (z >= 33.2 && z <= 34.8);

      if (inPortalX && inPortalY && inPortalZ) {
        pData.lastPortalNotice = now;
        sendSystemMessage(pData.client, '§a[Portal] Warping you to the Village Hub...', pData.is119);
        try {
          pData.client.write('custom_payload', {
            channel: 'zylarpixel:proxy',
            data: Buffer.from('connect:hub')
          });
        } catch (_) {}
      }
    }
  }
}
