/**
 * ZylarPixel Packet-Aware Master Proxy
 * Listens on public Port 25565
 * Routes between:
 *  - Hub Server (127.0.0.1:25566)
 *  - Islands Server (127.0.0.1:25567)
 * Intercepts /hub and /is at the packet layer, handles switching cleanly with zero crashes!
 */

import * as mc from 'minecraft-protocol';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { mcData1192 } from './src/world/worldManager';
import { loadPlayerProfile } from './src/storage/sharedProfile';
import { RANKS, getRankOrDefault, formatPlayerName } from './src/config/ranks';
import { startResourcePackServer, waitForResourcePackPayload, stopResourcePackServer } from './src/network/resourcePackServer';

const Vec3 = require('vec3');
const Chunk1192 = require('prismarine-chunk')('1.19.2');

const PROXY_PORT = 25565;
const HUB_PORT = 25566;
const ISLANDS_PORT = 25567;

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const proxyLogStream = fs.createWriteStream(path.join(logsDir, 'proxy.log'), { flags: 'a' });

function log(level: string, ...args: any[]) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(`[PROXY] [${level}] ${msg}`);
  try { proxyLogStream.write(`[${ts}] [${level}] ${msg}\n`); } catch (_) {}
}

// Global crash-protection for lingering socket timeouts
process.on('uncaughtException', (err: any) => {
  log('WARN', `Caught unhandled exception in proxy:`, err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  log('WARN', `Caught unhandled rejection in proxy:`, reason?.message || reason);
});

startResourcePackServer();
const cleanupProxy = () => {
  stopResourcePackServer();
  process.exit(0);
};
process.on('SIGINT', cleanupProxy);
process.on('SIGTERM', cleanupProxy);
process.on('exit', () => stopResourcePackServer());

const proxyServer = (mc as any).createServer({
  'online-mode': false,
  encryption: false,
  host: '0.0.0.0',
  port: PROXY_PORT,
  version: '1.19.2',
  maxPlayers: 100,
  motd: '§d§lZYLARPIXEL §7[Proxy Network] ⚡ Hypixel SkyBlock',
  registryCodec: mcData1192.loginPacket.dimensionCodec
} as any);

proxyServer.on('error', (err: any) => {
  log('ERROR', `Proxy server socket error:`, err?.message || err);
});

proxyServer.on('connection', (client: any) => {
  const preJoinErrorHandler = (err: any) => {
    const code = err?.code || '';
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT') {
      log('WARN', `Proxy client socket closed before join (${code}):`, err?.message || err);
      return;
    }
    log('WARN', `Proxy client pre-join error:`, err?.message || err);
  };
  client._proxyPreJoinErrorHandler = preJoinErrorHandler;
  client.on('error', preJoinErrorHandler);
});

// Limbo Void coordinates (deep space, zero chunk collisions, zero chunk streaming)
const LIMBO_X = 500000.5;
const LIMBO_Y = 150.0;
const LIMBO_Z = 500000.5;

interface ProxySession {
  client: any;
  backend: any;
  currentServer: 'hub' | 'islands' | 'limbo';
  previousServer?: 'hub' | 'islands';
  username: string;
  isSwitching: boolean;
  hasInitialJoined: boolean;
  isInLimbo?: boolean;
  limboRetryTimer?: any;
  pendingCommand?: string;
  lastPortalWarp?: number;
  backendEntityId?: number;
  resourcePackLoaded?: boolean;
  resourcePackTimeout?: NodeJS.Timeout;
}

const sessions = new Map<string, ProxySession>();

function getNetworkDisplayName(session: ProxySession): string {
  try {
    const profile = loadPlayerProfile(session.username);
    const rank = getRankOrDefault(profile ? profile.rank : undefined);
    const nameWithRank = formatPlayerName(rank, session.username);
    const serverTag = session.isInLimbo ? '§8[§dLimbo§8]' : (session.currentServer === 'hub' ? '§8[§6Hub§8]' : '§8[§aIsland§8]');
    return `${serverTag} ${nameWithRank}`;
  } catch (_) {
    const serverTag = session.isInLimbo ? '§8[§dLimbo§8]' : (session.currentServer === 'hub' ? '§8[§6Hub§8]' : '§8[§aIsland§8]');
    return `${serverTag} §7${session.username}`;
  }
}

function generateOfflineUuid(username: string): string {
  const raw = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
  return [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join('-');
}

const SERVER_SIDE_HUB_BOTS: any[] = [];

function broadcastGlobalProxyTablist(): void {
  const activeSessions = Array.from(sessions.values()).filter(s => s.client && s.client.state === mc.states.PLAY);
  if (activeSessions.length === 0) return;

  for (const observer of activeSessions) {
    for (const target of activeSessions) {
      const formatted = getNetworkDisplayName(target);

      try {
        observer.client.write('player_info', {
          action: 'add_player',
          data: [{
            uuid: target.client.uuid,
            name: target.username.substring(0, 16),
            properties: [],
            gamemode: 0,
            ping: 1,
            displayName: JSON.stringify({ text: formatted }),
            crypto: undefined
          }]
        });
      } catch (_) {}

      try {
        observer.client.write('player_info', {
          action: 'update_display_name',
          data: [{
            uuid: target.client.uuid,
            displayName: JSON.stringify({ text: formatted })
          }]
        });
      } catch (_) {}
    }

    // Purge any lingering dummy bots or NPC player entries from Tablist
    try {
      observer.client.write('player_info', {
        action: 'remove_player',
        data: [
          { uuid: generateOfflineUuid('Village_Alex') },
          { uuid: generateOfflineUuid('Village_Kai') },
          { uuid: generateOfflineUuid('Village_Sam') },
          { uuid: generateOfflineUuid('Village_Leo') },
          { uuid: generateOfflineUuid('Village_Mia') },
          { uuid: '8b61a1a6-a2a2-4c10-9977-e1a3fc82e38f' } // Banker UUID
        ]
      });
    } catch (_) {}

    try {
      const currentLoc = observer.isInLimbo ? '§dTemporary Limbo (Proxy Host)' : (observer.currentServer === 'hub' ? '§6Village Hub' : '§aPrivate Island');
      observer.client.write('playerlist_header', {
        header: JSON.stringify({ text: '\n§d§lZYLARPIXEL SKYBLOCK NETWORK\n§7play.zylarpixel.net\n' }),
        footer: JSON.stringify({
          text: `\n§7Current Server: ${currentLoc} §8• §7Network Players: §a${activeSessions.length}§7/§a100\n§eType §f/hub §eor §f/is §eto switch servers!\n`
        })
      });
    } catch (_) {}
  }
}

setInterval(() => {
  broadcastGlobalProxyTablist();
}, 2500);

function detachBackend(session: ProxySession): void {
  if (!session.backend) return;
  const oldBackend = session.backend;
  session.backend = null;
  oldBackend._proxyDetached = true;
  try {
    // Preserve internal minecraft-protocol 'end' listeners (e.g. keepalive timeout cleanup)
    // while keeping an error guard attached so lingering socket events never throw.
    if (oldBackend.listenerCount('error') === 0) {
      oldBackend.on('error', () => {});
    }
    oldBackend.end();
  } catch (_) {}
}

function enterLimbo(session: ProxySession, lastServer: 'hub' | 'islands') {
  if (session.isInLimbo) return;
  if (!session.client || session.client.state !== mc.states.PLAY) return;

  session.isInLimbo = true;
  session.previousServer = lastServer;
  session.currentServer = 'limbo';
  session.isSwitching = false;

  log('INFO', `[Limbo] Moving ${session.username} to Temporary Limbo Host (Backend ${lastServer} dropped/restarting)`);

  detachBackend(session);

  try {
    // 1. Put player in Spectator mode (gamemode: 3) so player cannot fall, take void damage, or die
    session.client.write('game_state_change', {
      reason: 3,
      gameMode: 3
    });

    // 2. Safe void coordinates (X: 500,000, Y: 150, Z: 500,000) - zero chunk collision with any world/island!
    const limboChunkCoord = Math.floor(LIMBO_X / 16);
    session.client.write('update_view_position', { chunkX: limboChunkCoord, chunkZ: limboChunkCoord });
    session.client.write('position', {
      x: LIMBO_X,
      y: LIMBO_Y,
      z: LIMBO_Z,
      yaw: 0,
      pitch: 0,
      flags: 0x00,
      teleportId: 99999
    });

    // 3. Invulnerable flying abilities in void
    session.client.write('abilities', {
      flags: 0x0F, // invulnerable, flying, can fly, creative/spectator
      flyingSpeed: 0.05,
      walkingSpeed: 0.1
    });

    // 5. Notify player: clear title, subtitle, and informative chat
    session.client.write('set_title_text', {
      text: JSON.stringify({ text: '§d§lZYLARPIXEL LIMBO' })
    });
    session.client.write('set_title_subtitle', {
      text: JSON.stringify({ text: '§eServer is restarting... Reconnecting soon!' })
    });
    session.client.write('set_title_time', {
      fadeIn: 10,
      stay: 80,
      fadeOut: 20
    });

    session.client.write('system_chat', {
      content: JSON.stringify({
        text: '\n§8-----------------------------------------------------\n§c§l[ZylarPixel Network] §eGame server is restarting for an update!\n§7You have been temporarily transferred to the §dProxy Limbo Host§7.\n§aHolding your connection safe... Reconnecting in a few seconds!\n§8-----------------------------------------------------\n'
      }),
      isOverlay: false
    });

    session.client.write('named_sound_effect', {
      soundName: 'block.portal.travel',
      soundCategory: 0,
      x: Math.floor(8.5 * 8),
      y: Math.floor(102.0 * 8),
      z: Math.floor(8.5 * 8),
      volume: 0.6,
      pitch: 1.2,
      seed: [0, 0]
    });
  } catch (err: any) {
    log('WARN', `Error moving ${session.username} to Limbo:`, err?.message);
  }

  startLimboPoller(session);
  broadcastGlobalProxyTablist();
}

function startLimboPoller(session: ProxySession) {
  if (session.limboRetryTimer) {
    clearInterval(session.limboRetryTimer);
    session.limboRetryTimer = undefined;
  }

  let attempts = 0;
  const targetServer = session.previousServer || 'hub';
  const targetPort = targetServer === 'hub' ? HUB_PORT : ISLANDS_PORT;

  session.limboRetryTimer = setInterval(() => {
    if (!session.isInLimbo || !session.client || session.client.state !== mc.states.PLAY) {
      if (session.limboRetryTimer) {
        clearInterval(session.limboRetryTimer);
        session.limboRetryTimer = undefined;
      }
      return;
    }

    attempts++;

    // Heartbeat action bar
    try {
      const dots = '.'.repeat((attempts % 3) + 1);
      session.client.write('action_bar', {
        text: JSON.stringify({
          text: `§e⚡ Holding in Proxy Limbo... Checking ${targetServer === 'hub' ? 'Village Hub' : 'Private Island'}${dots}`
        })
      });
    } catch (_) {}

    // TCP Probe
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort, timeout: 800 }, () => {
      socket.destroy();
      if (!session.isInLimbo || !session.client || session.client.state !== mc.states.PLAY) return;
      if (session.limboRetryTimer) {
        clearInterval(session.limboRetryTimer);
        session.limboRetryTimer = undefined;
      }
      log('INFO', `[Limbo] Detected backend ${targetServer} on port ${targetPort} is UP! Reconnecting ${session.username}...`);

      try {
        session.client.write('system_chat', {
          content: JSON.stringify({ text: `§a✔ Backend server is back online! Reconnecting you now...` }),
          isOverlay: false
        });
      } catch (_) {}

      connectToBackend(session, targetServer);
    });

    socket.on('error', () => {
      socket.destroy();
      if (!session.isInLimbo || !session.client || session.client.state !== mc.states.PLAY) return;
      // If island server is down for >15s, probe Hub as fallback
      if (attempts > 15 && targetServer === 'islands') {
        const hubSocket = net.createConnection({ host: '127.0.0.1', port: HUB_PORT, timeout: 800 }, () => {
          hubSocket.destroy();
          if (!session.isInLimbo || !session.client || session.client.state !== mc.states.PLAY) return;
          if (session.limboRetryTimer) {
            clearInterval(session.limboRetryTimer);
            session.limboRetryTimer = undefined;
          }
          log('INFO', `[Limbo] Islands took long, falling back to Hub for ${session.username}...`);
          session.previousServer = 'hub';
          connectToBackend(session, 'hub');
        });
        hubSocket.on('error', () => hubSocket.destroy());
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
    });
  }, 1000);
}

function connectToBackend(session: ProxySession, target: 'hub' | 'islands', initialCommand?: string) {
  if (!session.client || session.client.state !== mc.states.PLAY) return;

  const targetPort = target === 'hub' ? HUB_PORT : ISLANDS_PORT;
  log('INFO', `Connecting ${session.username} to backend ${target} (: ${targetPort})...`);

  session.pendingCommand = initialCommand;
  // Set isSwitching BEFORE detaching oldBackend so transient socket teardown never triggers false Limbo.
  session.isSwitching = session.hasInitialJoined || Boolean(session.isInLimbo);
  session.currentServer = target;

  detachBackend(session);

  const backendClient = (mc as any).createClient({
    host: '127.0.0.1',
    port: targetPort,
    username: session.username,
    version: '1.19.2',
    auth: 'offline',
    checkTimeoutInterval: 120000
  });

  session.backend = backendClient;

  const isStaleBackend = () => Boolean((backendClient as any)._proxyDetached || session.backend !== backendClient);

  backendClient.on('error', (err: any) => {
    if (isStaleBackend()) return;
    log('WARN', `Backend ${target} error for ${session.username}:`, err?.message || err);
    if (!session.isInLimbo) {
      enterLimbo(session, target);
    } else if (!session.limboRetryTimer && session.client && session.client.state === mc.states.PLAY) {
      startLimboPoller(session);
    }
  });

  backendClient.on('connect', () => {
    if (isStaleBackend()) return;
    log('INFO', `Backend connection opened for ${session.username} on : ${targetPort}`);
  });

  // Decoupled Keep-Alive Auto-Responder + proxy custom payload communication from backend
  backendClient.on('packet', (data: any, meta: any) => {
    if (isStaleBackend()) return;

    if (meta && meta.name === 'keep_alive' && data && data.keepAliveId !== undefined) {
      try {
        backendClient.write('keep_alive', { keepAliveId: data.keepAliveId });
      } catch (_) {}
      return;
    }

    if (meta && meta.name === 'login' && data && typeof data.entityId === 'number') {
      session.backendEntityId = data.entityId;
      return;
    }

    // Rewrite backend self-entityId -> proxy client entityId (99999) so knockback applies to player
    if (meta && meta.name === 'entity_velocity' && data) {
      if (!session.client || session.client.state !== mc.states.PLAY) return;
      try {
        const mappedId = (session.backendEntityId !== undefined && data.entityId === session.backendEntityId)
          ? 99999
          : data.entityId;
        session.client.write('entity_velocity', {
          entityId: mappedId,
          velocity: data.velocity
        });
      } catch (_) {}
      return;
    }

    if (meta && meta.name === 'custom_payload' && data && data.channel === 'zylarpixel:proxy') {
      const action = (Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data || '')).toString('utf-8');
      log('INFO', `Received backend proxy command for ${session.username}: ${action}`);
      if (action === 'connect:hub' && session.currentServer !== 'hub') {
        connectToBackend(session, 'hub');
      } else if (action === 'connect:islands' && session.currentServer !== 'islands') {
        connectToBackend(session, 'islands');
      }
    }
  });

  // Forward packets from backend to the player client
  backendClient.on('raw', (buffer: Buffer, meta: any) => {
    if (isStaleBackend()) return;
    if (!session.client || session.client.state !== mc.states.PLAY) return;

    // Intercept and suppress kick/disconnect packets from backend so player is NEVER kicked to multiplayer menu!
    if (meta && (meta.name === 'kick_disconnect' || meta.name === 'disconnect')) {
      log('INFO', `[Proxy] Intercepted backend ${target} disconnect/kick for ${session.username} - redirecting to Limbo!`);
      if (!session.isInLimbo) {
        enterLimbo(session, target);
      } else if (!session.limboRetryTimer) {
        startLimboPoller(session);
      }
      return;
    }

    // Suppress non-play packets (login, compress, success), duplicate server_data, keep_alive, and proxy internal channels
    if (!meta || meta.state === 'login' || meta.state !== mc.states.PLAY) {
      return;
    }
    if (meta.name === 'compress' || meta.name === 'success' || meta.name === 'server_data' || meta.name === 'keep_alive' || meta.name === 'entity_velocity') {
      return;
    }
    if (meta.name === 'custom_payload' && buffer.includes('zylarpixel:proxy')) {
      return;
    }

    if (meta.name === 'login') {
      log('INFO', `Backend login received for ${session.username} on ${target}`);
      session.lastPortalWarp = Date.now() + 3500;
      const wasInLimbo = Boolean(session.isInLimbo);
      if (session.isSwitching || wasInLimbo) {
        session.isSwitching = false;
        session.isInLimbo = false;
        if (session.limboRetryTimer) {
          clearInterval(session.limboRetryTimer);
          session.limboRetryTimer = undefined;
        }

        if (session.hasInitialJoined) {
          // Perform synchronous Nether -> Overworld dimension reset so Minecraft Java client
          // completely clears chunk cache BEFORE backend sends new chunks and position!
          try {
            session.client.write('respawn', {
              dimension: 'minecraft:the_nether',
              worldName: 'minecraft:the_nether',
              hashedSeed: [0, 0],
              gamemode: 0,
              previousGamemode: 255,
              isDebug: false,
              isFlat: false,
              copyMetadata: false,
              death: undefined
            });
            session.client.write('respawn', {
              dimension: 'minecraft:overworld',
              worldName: 'minecraft:overworld',
              hashedSeed: [0, 0],
              gamemode: 0,
              previousGamemode: 255,
              isDebug: false,
              isFlat: false,
              copyMetadata: false,
              death: undefined
            });
            // Ensure client gamemode is immediately synced to Survival (0)
            session.client.write('game_state_change', {
              reason: 3,
              gameMode: 0
            });
            log('INFO', `Successfully sent synchronous dimension reset to ${session.username} for ${target}`);
          } catch (e: any) {
            log('ERROR', `Error sending respawn to ${session.username}:`, e.message);
          }
        } else {
          session.hasInitialJoined = true;
          if (wasInLimbo) {
            try {
              session.client.write('game_state_change', {
                reason: 3,
                gameMode: 0
              });
            } catch (_) {}
          }
        }

        if (wasInLimbo) {
          try {
            session.client.write('set_title_text', {
              text: JSON.stringify({ text: '§a§lRECONNECTED!' })
            });
            session.client.write('set_title_subtitle', {
              text: JSON.stringify({ text: `§7Welcome back to ${target === 'hub' ? 'Village Hub' : 'Private Island'}` })
            });
            session.client.write('set_title_time', {
              fadeIn: 5,
              stay: 40,
              fadeOut: 15
            });
            session.client.write('named_sound_effect', {
              soundName: 'entity.player.levelup',
              soundCategory: 0,
              x: 0,
              y: 70 * 8,
              z: 0,
              volume: 0.8,
              pitch: 1.2,
              seed: [0, 0]
            });
          } catch (_) {}
        }
      } else {
        session.hasInitialJoined = true;
      }

      if (session.pendingCommand) {
        const cmdToExec = session.pendingCommand;
        session.pendingCommand = undefined;
        setTimeout(() => {
          if (isStaleBackend() || backendClient.state !== mc.states.PLAY) return;
          try {
            const cleanCmd = cmdToExec.startsWith('/') ? cmdToExec.slice(1) : cmdToExec;
            backendClient.write('chat_command', {
              command: cleanCmd,
              timestamp: BigInt(Date.now()),
              salt: 0n,
              argumentSignatures: [],
              signedPreview: false,
              previousMessages: []
            });
            log('INFO', `Dispatched pending command for ${session.username}: ${cleanCmd}`);
          } catch (cmdErr: any) {
            log('WARN', `Error executing pending command:`, cmdErr.message);
          }
        }, 650);
      }
      setTimeout(() => broadcastGlobalProxyTablist(), 700);
      return;
    }

    try {
      session.client.writeRaw(buffer);
    } catch (e: any) {
      log('WARN', `Error writing backend packet to client:`, e.message);
    }
  });

  backendClient.on('end', () => {
    if (isStaleBackend()) return;
    log('INFO', `Backend ${target} disconnected for ${session.username}`);
    if (!session.isInLimbo) {
      enterLimbo(session, target);
    } else if (!session.limboRetryTimer && session.client && session.client.state === mc.states.PLAY) {
      startLimboPoller(session);
    }
  });
}

function sendProxySystemChat(client: any, text: string): void {
  try {
    if (client && client.state === mc.states.PLAY) {
      client.write('system_chat', {
        content: JSON.stringify({ text }),
        isOverlay: false
      });
    }
  } catch (_) {}
}

proxyServer.on('playerJoin', (client: any) => {
  const username = client.username;
  if (client._proxyPreJoinErrorHandler) {
    client.removeListener('error', client._proxyPreJoinErrorHandler);
    delete client._proxyPreJoinErrorHandler;
  }
  client.on('error', (err: any) => {
    const code = err?.code || '';
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT') {
      log('WARN', `Proxy Client socket disconnected (${code}) for ${username}:`, err?.message || err);
      return;
    }
    log('ERROR', `Proxy Client error for ${username}:`, err?.message || err);
  });

  log('INFO', `[+] Player connected to Proxy: ${username} [Version: ${client.version}]`);

  const existingSession = sessions.get(username.toLowerCase());
  if (existingSession) {
    if (existingSession.limboRetryTimer) {
      clearInterval(existingSession.limboRetryTimer);
      existingSession.limboRetryTimer = undefined;
    }
    detachBackend(existingSession);
    try { existingSession.client?.end('Logged in from another location'); } catch (_) {}
  }

  const session: ProxySession = {
    client,
    backend: null,
    currentServer: 'hub',
    username,
    isSwitching: false,
    hasInitialJoined: false
  };
  sessions.set(username.toLowerCase(), session);

  // Transition client to PLAY state with a valid login packet (Survival Mode 0)
  try {
    client.write('login', {
      entityId: 99999,
      isHardcore: false,
      gameMode: 0,
      previousGameMode: -1,
      worldNames: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
      dimensionCodec: mcData1192.loginPacket.dimensionCodec,
      worldType: 'minecraft:overworld',
      worldName: 'minecraft:overworld',
      hashedSeed: [0, 0],
      maxPlayers: 100,
      viewDistance: 12,
      simulationDistance: 12,
      reducedDebugInfo: false,
      enableRespawnScreen: true,
      isDebug: false,
      isFlat: false,
      death: undefined
    });
  } catch (err: any) {
    log('WARN', `Error sending proxy login packet:`, err.message);
  }

  // High-level navigation command interceptor at the Master Proxy layer
  const handleProxyCommand = (rawText: string) => {
    if (!session.resourcePackLoaded) {
      sendProxySystemChat(session.client, '§e[ResourcePack] Please accept the required ZylarPixel Resource Pack first!');
      return true;
    }
    if (session.isInLimbo) {
      sendProxySystemChat(session.client, '§e[Limbo] The game server is currently restarting. Reconnecting automatically in a few seconds!');
      return true;
    }

    const cmdText = rawText.startsWith('/') ? rawText.slice(1).trim().toLowerCase() : rawText.trim().toLowerCase();
    const cmdParts = cmdText.split(/\s+/);
    const cmdBase = cmdParts[0];

    const isNavigationCmd =
      cmdBase === 'hub' ||
      cmdBase === 'warphub' ||
      cmdBase === 'spawn' ||
      (cmdBase === 'warp' && cmdParts[1] === 'hub') ||
      cmdBase === 'is' ||
      cmdBase === 'island' ||
      cmdBase === 'visit';

    if (session.isSwitching && isNavigationCmd) {
      sendProxySystemChat(session.client, '§e[Proxy] Server switch already in progress, please wait...');
      return true;
    }

    if (cmdBase === 'hub' || cmdBase === 'warphub' || cmdBase === 'spawn' || (cmdBase === 'warp' && cmdParts[1] === 'hub')) {
      if (session.currentServer !== 'hub') {
        sendProxySystemChat(session.client, '§a[Proxy] Connecting you to the Hub Server...');
        connectToBackend(session, 'hub');
        return true;
      }
      // Already in Hub: allow hub backend to warp player back to spawn
      return false;
    }

    if (cmdBase === 'is' || cmdBase === 'island') {
      if (session.currentServer !== 'islands') {
        sendProxySystemChat(session.client, '§a[Proxy] Connecting you to your Private Island...');
        connectToBackend(session, 'islands');
        return true;
      }
      // Already on Islands: allow islands backend to handle /is teleport
      return false;
    }

    if (cmdBase === 'visit') {
      const targetPlayer = cmdParts[1];
      if (!targetPlayer) {
        sendProxySystemChat(session.client, '§eUsage: §f/visit <player>');
        return true;
      }
      if (session.currentServer !== 'islands') {
        sendProxySystemChat(session.client, `§a[Proxy] Connecting you to the Islands Server to visit §f${targetPlayer}§a...`);
        connectToBackend(session, 'islands', `/visit ${targetPlayer}`);
        return true;
      }
      // Already on Islands: allow islands server to handle /visit target directly
      return false;
    }

    return false;
  };

  client.on('chat_command', (packet: any) => {
    if (packet && packet.command) {
      handleProxyCommand(packet.command);
    }
  });

  client.on('chat_message', (packet: any) => {
    const msg = packet?.message || '';
    if (msg.startsWith('/')) {
      handleProxyCommand(msg);
    }
  });

  // Portal Step Detection (Client-Side Collision Detection)
  const checkPortalStep = (x: number, y: number, z: number) => {
    if (!session.resourcePackLoaded || session.isInLimbo) return;
    const now = Date.now();
    if (session.isSwitching) return;
    if (session.lastPortalWarp && now < session.lastPortalWarp) return;

    if (session.currentServer === 'islands') {
      const currentIslandX = Math.round(x / 1000) * 1000;
      const inPortalX = (x >= currentIslandX - 1.5 && x <= currentIslandX + 1.5);
      const inPortalY = (y >= 101.0 && y <= 107.0);
      const inPortalZ = (z >= 33.0 && z <= 35.0);

      if (inPortalX && inPortalY && inPortalZ) {
        session.lastPortalWarp = now + 4000;
        sendProxySystemChat(session.client, '§a[Portal] Warping you to the Village Hub...');
        connectToBackend(session, 'hub');
      }
    } else if (session.currentServer === 'hub') {
      const inHubPortal = (x >= -5.0 && x <= 0.0 && y >= 69.0 && y <= 72.0 && z >= -65.0 && z <= -61.0);
      if (inHubPortal) {
        session.lastPortalWarp = now + 4000;
        sendProxySystemChat(session.client, '§a[Portal] Warping you to your Private Island...');
        connectToBackend(session, 'islands');
      }
    }
  };

  const handleLimboSafety = (packet: any) => {
    if (session.isInLimbo && packet && typeof packet.y === 'number' && packet.y < 100) {
      try {
        session.client.write('position', {
          x: LIMBO_X,
          y: LIMBO_Y,
          z: LIMBO_Z,
          yaw: 0,
          pitch: 0,
          flags: 0x00,
          teleportId: Math.floor(Math.random() * 10000)
        });
      } catch (_) {}
    }
  };

  client.on('position', (packet: any) => {
    handleLimboSafety(packet);
    if (packet && typeof packet.x === 'number') {
      checkPortalStep(packet.x, packet.y, packet.z);
    }
  });

  client.on('position_look', (packet: any) => {
    handleLimboSafety(packet);
    if (packet && typeof packet.x === 'number') {
      checkPortalStep(packet.x, packet.y, packet.z);
    }
  });

  // Forward packets from player client to backend (keep_alive is decoupled per connection)
  client.on('raw', (buffer: Buffer, meta: any) => {
    if (!session.resourcePackLoaded || session.isInLimbo || session.isSwitching) return;
    if (meta && (meta.name === 'keep_alive' || meta.name === 'resource_pack_receive')) return;
    if (session.backend && session.backend.state === mc.states.PLAY) {
      try {
        session.backend.writeRaw(buffer);
      } catch (e: any) {
        log('WARN', `Error writing client packet to backend:`, e.message);
      }
    }
  });

  // Force Resource Pack download on initial Proxy join BEFORE entering Hub
  const kickForResourcePack = (reasonText: string) => {
    if (session.resourcePackTimeout) {
      clearTimeout(session.resourcePackTimeout);
      session.resourcePackTimeout = undefined;
    }
    try {
      client.write('kick_disconnect', {
        reason: JSON.stringify({ text: reasonText })
      });
    } catch (_) {}
    setTimeout(() => {
      try { client.end(reasonText); } catch (_) {}
    }, 150);
  };

  const finishPackGateAndEnterHub = () => {
    if (session.resourcePackLoaded) return;
    session.resourcePackLoaded = true;
    if (session.resourcePackTimeout) {
      clearTimeout(session.resourcePackTimeout);
      session.resourcePackTimeout = undefined;
    }
    connectToBackend(session, 'hub');
    setTimeout(() => broadcastGlobalProxyTablist(), 800);
  };

  try {
    const limboChunkCoord = Math.floor(LIMBO_X / 16);
    client.write('update_view_position', { chunkX: limboChunkCoord, chunkZ: limboChunkCoord });
    client.write('abilities', { flags: 0x0F, flyingSpeed: 0.05, walkingSpeed: 0.1 });
    client.write('position', {
      x: LIMBO_X,
      y: LIMBO_Y,
      z: LIMBO_Z,
      yaw: 0,
      pitch: 0,
      flags: 0x00,
      teleportId: 1
    });
  } catch (_) {}

  client.on('resource_pack_receive', (pkt: any) => {
    if (session.resourcePackLoaded) return;
    const res = typeof pkt?.result === 'number' ? pkt.result : -1;
    if (res === 3) {
      log('INFO', `[ResourcePack] ${username} accepted pack, downloading...`);
      if (session.resourcePackTimeout) clearTimeout(session.resourcePackTimeout);
      session.resourcePackTimeout = setTimeout(() => {
        kickForResourcePack('§c§lResource Pack Download Timed Out!\n\n§7Please reconnect and accept the resource pack.');
      }, 30000);
    } else if (res === 0) {
      log('INFO', `[ResourcePack] ${username} loaded pack successfully! Entering Hub...`);
      finishPackGateAndEnterHub();
    } else if (res === 1) {
      log('WARN', `[ResourcePack] ${username} DECLINED required resource pack. Kicking.`);
      kickForResourcePack(
        '§c§lZylarPixel Resource Pack Required!\n\n' +
        '§7You must accept the server resource pack to play here.\n\n' +
        '§eHow to fix:\n' +
        '§fMultiplayer §8➜ §fEdit Server §8➜ §fServer Resource Packs: §aEnabled\n' +
        '§7Then reconnect!'
      );
    } else {
      log('WARN', `[ResourcePack] ${username} failed to download resource pack (result=${res}). Kicking.`);
      kickForResourcePack(
        '§c§lResource Pack Download Failed!\n\n' +
        '§7Your client could not download the custom icons pack.\n' +
        '§ePlease wait a few seconds and reconnect!'
      );
    }
  });

  waitForResourcePackPayload(22000).then(pack => {
    if (!client || client.state !== mc.states.PLAY || session.resourcePackLoaded) return;
    if (!pack) {
      log('WARN', `[ResourcePack] No pack payload available; allowing ${username} into Hub.`);
      finishPackGateAndEnterHub();
      return;
    }

    session.resourcePackTimeout = setTimeout(() => {
      if (!session.resourcePackLoaded) {
        log('WARN', `[ResourcePack] ${username} timed out responding to forced pack prompt.`);
        kickForResourcePack(
          '§c§lResource Pack Verification Timed Out!\n\n' +
          '§7Please set §fServer Resource Packs: §aEnabled §7and reconnect!'
        );
      }
    }, 120000);

    try {
      client.write('resource_pack_send', {
        url: pack.url,
        hash: pack.hash,
        forced: true,
        promptMessage: JSON.stringify({
          text: '§d§lZYLARPIXEL SKYBLOCK\n\n§fThis server uses a tiny custom §6Coin §f& §bBits §ficon pack (~2 KB).\n§eClick Proceed to download and join!'
        })
      });
      log('INFO', `[ResourcePack] Sent forced pack to ${username} -> ${pack.url} (sha1=${pack.hash})`);
    } catch (err: any) {
      log('WARN', `[ResourcePack] Error sending resource_pack_send to ${username}:`, err?.message || err);
      finishPackGateAndEnterHub();
    }
  });

  client.on('end', () => {
    log('INFO', `[-] Player disconnected from Proxy: ${username}`);
    if (session.resourcePackTimeout) {
      clearTimeout(session.resourcePackTimeout);
      session.resourcePackTimeout = undefined;
    }
    if (session.limboRetryTimer) {
      clearInterval(session.limboRetryTimer);
      session.limboRetryTimer = undefined;
    }
    detachBackend(session);
    if (sessions.get(username.toLowerCase()) === session) {
      sessions.delete(username.toLowerCase());
    }

    // Broadcast remove_player for disconnected player to all remaining players
    for (const remaining of sessions.values()) {
      if (remaining.client && remaining.client.state === mc.states.PLAY) {
        try {
          remaining.client.write('player_info', {
            action: 'remove_player',
            data: [{ uuid: client.uuid }]
          });
        } catch (_) {}
      }
    }
    broadcastGlobalProxyTablist();
  });
});

log('INFO', `🚀 ZylarPixel Master Proxy live on 0.0.0.0:${PROXY_PORT}`);
