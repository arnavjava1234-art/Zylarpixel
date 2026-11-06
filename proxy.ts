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
import * as nbt from 'prismarine-nbt';
import { mcData1218 } from './src/world/worldManager';
import { loadPlayerProfile } from './src/storage/sharedProfile';
import { getRankOrDefault, formatPlayerName } from './src/config/ranks';

const Vec3 = require('vec3');
const Chunk1218 = require('prismarine-chunk')('1.21.8');

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

const proxyServer = (mc as any).createServer({
  'online-mode': false,
  encryption: false,
  host: '0.0.0.0',
  port: PROXY_PORT,
  version: '1.21.8',
  maxPlayers: 100,
  motd: '§d§lZYLARPIXEL §7[Proxy Network] ⚡ Hypixel SkyBlock',
  registryCodec: mcData1218.loginPacket.dimensionCodec
} as any);

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
          action: {
            add_player: true,
            initialize_chat: false,
            update_game_mode: true,
            update_listed: true,
            update_latency: true,
            update_display_name: true,
            update_hat: true,
            update_list_order: false
          },
          data: [{
            uuid: target.client.uuid,
            player: { name: target.username.substring(0, 16), properties: [] },
            gamemode: 0,
            listed: 1,
            latency: 1,
            displayName: nbt.comp({ text: nbt.string(formatted) }),
            showHat: true
          }]
        });
      } catch (_) {}

      try {
        observer.client.write('player_info', {
          action: {
            add_player: false,
            initialize_chat: false,
            update_game_mode: false,
            update_listed: false,
            update_latency: false,
            update_display_name: true,
            update_hat: false,
            update_list_order: false
          },
          data: [{
            uuid: target.client.uuid,
            displayName: nbt.comp({ text: nbt.string(formatted) })
          }]
        });
      } catch (_) {}
    }

    // Purge any lingering dummy bots or NPC player entries from Tablist
    try {
      observer.client.write('player_remove', {
        players: [
          generateOfflineUuid('Village_Alex'),
          generateOfflineUuid('Village_Kai'),
          generateOfflineUuid('Village_Sam'),
          generateOfflineUuid('Village_Leo'),
          generateOfflineUuid('Village_Mia'),
          '8b61a1a6-a2a2-4c10-9977-e1a3fc82e38f' // Banker UUID
        ]
      });
    } catch (_) {}

    try {
      const currentLoc = observer.isInLimbo ? '§dTemporary Limbo (Proxy Host)' : (observer.currentServer === 'hub' ? '§6Village Hub' : '§aPrivate Island');
      observer.client.write('playerlist_header', {
        header: nbt.comp({ text: nbt.string('\n§d§lZYLARPIXEL SKYBLOCK NETWORK\n§7play.zylarpixel.net\n') }),
        footer: nbt.comp({
          text: nbt.string(`\n§7Current Server: ${currentLoc} §8• §7Network Players: §a${activeSessions.length}§7/§a100\n§eType §f/hub §eor §f/is §eto switch servers!\n`)
        })
      });
    } catch (_) {}
  }
}

setInterval(() => {
  broadcastGlobalProxyTablist();
}, 2500);

function enterLimbo(session: ProxySession, lastServer: 'hub' | 'islands') {
  if (session.isInLimbo) return;
  if (!session.client || session.client.state !== mc.states.PLAY) return;

  session.isInLimbo = true;
  session.previousServer = lastServer;
  session.currentServer = 'limbo';
  session.isSwitching = false;

  log('INFO', `[Limbo] Moving ${session.username} to Temporary Limbo Host (Backend ${lastServer} dropped/restarting)`);

  if (session.backend) {
    try {
      const oldBackend = session.backend;
      session.backend = null;
      oldBackend.removeAllListeners();
      oldBackend.on('error', () => {});
      oldBackend.end();
    } catch (_) {}
  }

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
      teleportId: 99999,
      x: LIMBO_X,
      y: LIMBO_Y,
      z: LIMBO_Z,
      dx: 0,
      dy: 0,
      dz: 0,
      yaw: 0,
      pitch: 0,
      flags: { _value: 0 }
    });

    // 3. Invulnerable flying abilities in void
    session.client.write('abilities', {
      flags: 0x0F, // invulnerable, flying, can fly, creative/spectator
      flyingSpeed: 0.05,
      walkingSpeed: 0.1
    });

    // 5. Notify player: clear title, subtitle, and informative chat
    session.client.write('set_title_text', {
      text: nbt.comp({ text: nbt.string('§d§lZYLARPIXEL LIMBO') })
    });
    session.client.write('set_title_subtitle', {
      text: nbt.comp({ text: nbt.string('§eServer is restarting... Reconnecting soon!') })
    });
    session.client.write('set_title_time', {
      fadeIn: 10,
      stay: 80,
      fadeOut: 20
    });

    session.client.write('system_chat', {
      content: nbt.comp({
        text: nbt.string('\n§8-----------------------------------------------------\n§c§l[ZylarPixel Network] §eGame server is restarting for an update!\n§7You have been temporarily transferred to the §dProxy Limbo Host§7.\n§aHolding your connection safe... Reconnecting in a few seconds!\n§8-----------------------------------------------------\n')
      }),
      isActionBar: false
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
        text: nbt.comp({
          text: nbt.string(`§e⚡ Holding in Proxy Limbo... Checking ${targetServer === 'hub' ? 'Village Hub' : 'Private Island'}${dots}`)
        })
      });
    } catch (_) {}

    // TCP Probe
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort, timeout: 800 }, () => {
      socket.destroy();
      if (session.limboRetryTimer) {
        clearInterval(session.limboRetryTimer);
        session.limboRetryTimer = undefined;
      }
      log('INFO', `[Limbo] Detected backend ${targetServer} on port ${targetPort} is UP! Reconnecting ${session.username}...`);

      try {
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string(`§a✔ Backend server is back online! Reconnecting you now...`) }),
          isActionBar: false
        });
      } catch (_) {}

      session.isSwitching = true;
      connectToBackend(session, targetServer);
    });

    socket.on('error', () => {
      socket.destroy();
      // If island server is down for >15s, probe Hub as fallback
      if (attempts > 15 && targetServer === 'islands') {
        const hubSocket = net.createConnection({ host: '127.0.0.1', port: HUB_PORT, timeout: 800 }, () => {
          hubSocket.destroy();
          if (session.limboRetryTimer) {
            clearInterval(session.limboRetryTimer);
            session.limboRetryTimer = undefined;
          }
          log('INFO', `[Limbo] Islands took long, falling back to Hub for ${session.username}...`);
          session.previousServer = 'hub';
          session.isSwitching = true;
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
  const targetPort = target === 'hub' ? HUB_PORT : ISLANDS_PORT;
  log('INFO', `Connecting ${session.username} to backend ${target} (: ${targetPort})...`);

  session.pendingCommand = initialCommand;

  if (session.backend) {
    try {
      const oldBackend = session.backend;
      session.backend = null;
      oldBackend.removeAllListeners();
      oldBackend.on('error', () => {}); // Catch lingering keepalive timeouts!
      oldBackend.end();
    } catch (_) {}
  }

  session.isSwitching = session.hasInitialJoined;
  session.currentServer = target;

  const backendClient = (mc as any).createClient({
    host: '127.0.0.1',
    port: targetPort,
    username: session.username,
    version: '1.21.8',
    auth: 'offline',
    checkTimeoutInterval: 120000
  });

  session.backend = backendClient;

  backendClient.on('error', (err: any) => {
    log('WARN', `Backend ${target} error for ${session.username}:`, err.message);
    if (!session.isInLimbo) {
      enterLimbo(session, target);
    }
  });

  backendClient.on('connect', () => {
    log('INFO', `Backend connection opened for ${session.username} on : ${targetPort}`);
  });

  // Intercept proxy custom payload communication from backend
  backendClient.on('packet', (data: any, meta: any) => {
    if (meta.name === 'custom_payload' && data && data.channel === 'zylarpixel:proxy') {
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
    if (session.client.state !== mc.states.PLAY) return;

    // Suppress non-play state packets (login, configuration, etc.), duplicate server_data, and proxy internal channels
    if (meta.state !== mc.states.PLAY && meta.state !== 'play') {
      return;
    }
    if (meta.name === 'compress' || meta.name === 'success' || meta.name === 'server_data') {
      return;
    }
    if (meta.name === 'custom_payload' && buffer.includes('zylarpixel:proxy')) {
      return;
    }

    // Intercept and suppress kick/disconnect packets from backend so player is NEVER kicked to multiplayer menu!
    if (meta.name === 'kick_disconnect' || meta.name === 'disconnect') {
      log('INFO', `[Proxy] Intercepted backend ${target} disconnect/kick for ${session.username} - redirecting to Limbo!`);
      if (!session.isInLimbo) {
        enterLimbo(session, target);
      }
      return;
    }

    if (meta.name === 'login') {
      log('INFO', `Backend login received for ${session.username} on ${target}`);
      session.lastPortalWarp = Date.now() + 3500;
      const wasInLimbo = session.isInLimbo;
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
              worldState: {
                dimension: 0,
                name: 'minecraft:the_nether',
                hashedSeed: [0, 0],
                gamemode: 'survival',
                previousGamemode: 255,
                isDebug: false,
                isFlat: false,
                death: undefined,
                portalCooldown: 0,
                seaLevel: 63
              },
              copyMetadata: 0
            });
            session.client.write('respawn', {
              worldState: {
                dimension: 0,
                name: 'minecraft:overworld',
                hashedSeed: [0, 0],
                gamemode: 'survival',
                previousGamemode: 255,
                isDebug: false,
                isFlat: false,
                death: undefined,
                portalCooldown: 0,
                seaLevel: 63
              },
              copyMetadata: 0
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
        }

        if (wasInLimbo) {
          try {
            session.client.write('set_title_text', {
              text: nbt.comp({ text: nbt.string('§a§lRECONNECTED!') })
            });
            session.client.write('set_title_subtitle', {
              text: nbt.comp({ text: nbt.string(`§7Welcome back to ${target === 'hub' ? 'Village Hub' : 'Private Island'}`) })
            });
            session.client.write('set_title_time', {
              fadeIn: 5,
              stay: 40,
              fadeOut: 15
            });
          } catch (_) {}
        }

        if (session.pendingCommand) {
          const cmdToExec = session.pendingCommand;
          session.pendingCommand = undefined;
          setTimeout(() => {
            try {
              const cleanCmd = cmdToExec.startsWith('/') ? cmdToExec.slice(1) : cmdToExec;
              backendClient.write('chat_command', {
                command: cleanCmd
              });
              log('INFO', `Dispatched pending command for ${session.username}: ${cleanCmd}`);
            } catch (cmdErr: any) {
              log('WARN', `Error executing pending command:`, cmdErr.message);
            }
          }, 650);
        }
        setTimeout(() => broadcastGlobalProxyTablist(), 700);
      } else {
        session.hasInitialJoined = true;
        if (session.pendingCommand) {
          const cmdToExec = session.pendingCommand;
          session.pendingCommand = undefined;
          setTimeout(() => {
            try {
              const cleanCmd = cmdToExec.startsWith('/') ? cmdToExec.slice(1) : cmdToExec;
              backendClient.write('chat_command', {
                command: cleanCmd
              });
              log('INFO', `Dispatched pending command for ${session.username}: ${cleanCmd}`);
            } catch (cmdErr: any) {
              log('WARN', `Error executing pending command:`, cmdErr.message);
            }
          }, 650);
        }
        setTimeout(() => broadcastGlobalProxyTablist(), 700);
      }
      return;
    }

    try {
      session.client.writeRaw(buffer);
    } catch (e: any) {
      log('WARN', `Error writing backend packet to client:`, e.message);
    }
  });

  backendClient.on('end', () => {
    log('INFO', `Backend ${target} disconnected for ${session.username}`);
    if (!session.isSwitching && !session.isInLimbo) {
      enterLimbo(session, target);
    }
  });
}

proxyServer.on('playerJoin', (client: any) => {
  const username = client.username;
  log('INFO', `[+] Player connected to Proxy: ${username} [Version: ${client.version}]`);

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
      worldNames: ['minecraft:overworld'],
      maxPlayers: 100,
      viewDistance: 12,
      simulationDistance: 12,
      reducedDebugInfo: false,
      enableRespawnScreen: true,
      doLimitedCrafting: false,
      worldState: {
        dimension: 0,
        name: 'minecraft:overworld',
        hashedSeed: [0, 0],
        gamemode: 'survival',
        previousGamemode: 255,
        isDebug: false,
        isFlat: false,
        death: undefined,
        portalCooldown: 0,
        seaLevel: 63
      },
      enforcesSecureChat: false
    });
  } catch (err: any) {
    log('WARN', `Error sending proxy login packet:`, err.message);
  }

  // High-level navigation command interceptor at the Master Proxy layer
  const handleProxyCommand = (rawText: string) => {
    if (session.isInLimbo) {
      session.client.write('system_chat', {
        content: nbt.comp({ text: nbt.string('§e[Limbo] The game server is currently restarting. Reconnecting automatically in a few seconds!') }),
        isActionBar: false
      });
      return true;
    }

    const cmdText = rawText.startsWith('/') ? rawText.slice(1).trim().toLowerCase() : rawText.trim().toLowerCase();
    const cmdParts = cmdText.split(/\s+/);
    const cmdBase = cmdParts[0];

    if (cmdBase === 'hub' || cmdBase === 'warphub' || cmdBase === 'spawn' || (cmdBase === 'warp' && cmdParts[1] === 'hub')) {
      if (session.currentServer !== 'hub') {
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string('§a[Proxy] Connecting you to the Hub Server...') }),
          isActionBar: false
        });
        connectToBackend(session, 'hub');
        return true;
      }
      // Already in Hub: allow hub backend to warp player back to spawn
      return false;
    }

    if (cmdBase === 'is' || cmdBase === 'island') {
      if (session.currentServer !== 'islands') {
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string('§a[Proxy] Connecting you to your Private Island...') }),
          isActionBar: false
        });
        connectToBackend(session, 'islands');
        return true;
      }
      // Already on Islands: allow islands backend to handle /is teleport
      return false;
    }

    if (cmdBase === 'visit') {
      const targetPlayer = cmdParts[1];
      if (!targetPlayer) {
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string('§eUsage: §f/visit <player>') }),
          isActionBar: false
        });
        return true;
      }
      if (session.currentServer !== 'islands') {
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string(`§a[Proxy] Connecting you to the Islands Server to visit §f${targetPlayer}§a...`) }),
          isActionBar: false
        });
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
    if (session.isInLimbo) return;
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
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string('§a[Portal] Warping you to the Village Hub...') }),
          isActionBar: false
        });
        connectToBackend(session, 'hub');
      }
    } else if (session.currentServer === 'hub') {
      const inHubPortal = (x >= -5.0 && x <= 0.0 && y >= 69.0 && y <= 72.0 && z >= -65.0 && z <= -61.0);
      if (inHubPortal) {
        session.lastPortalWarp = now + 4000;
        session.client.write('system_chat', {
          content: nbt.comp({ text: nbt.string('§a[Portal] Warping you to your Private Island...') }),
          isActionBar: false
        });
        connectToBackend(session, 'islands');
      }
    }
  };

  const handleLimboSafety = (packet: any) => {
    if (session.isInLimbo && packet && typeof packet.y === 'number' && packet.y < 100) {
      try {
        session.client.write('position', {
          teleportId: Math.floor(Math.random() * 10000),
          x: LIMBO_X,
          y: LIMBO_Y,
          z: LIMBO_Z,
          dx: 0,
          dy: 0,
          dz: 0,
          yaw: 0,
          pitch: 0,
          flags: { _value: 0 }
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

  // Forward packets from player client to backend
  client.on('raw', (buffer: Buffer, meta: any) => {
    if (session.isInLimbo) return;
    if (session.backend && session.backend.state === mc.states.PLAY) {
      try {
        session.backend.writeRaw(buffer);
      } catch (e: any) {
        log('WARN', `Error writing client packet to backend:`, e.message);
      }
    }
  });

  // Default initial server: Hub
  connectToBackend(session, 'hub');
  setTimeout(() => broadcastGlobalProxyTablist(), 800);

  client.on('end', () => {
    log('INFO', `[-] Player disconnected from Proxy: ${username}`);
    if (session.limboRetryTimer) {
      clearInterval(session.limboRetryTimer);
      session.limboRetryTimer = undefined;
    }
    if (session.backend) {
      try {
        const oldBackend = session.backend;
        session.backend = null;
        oldBackend.removeAllListeners();
        oldBackend.on('error', () => {});
        oldBackend.end();
      } catch (_) {}
    }
    sessions.delete(username.toLowerCase());

    // Broadcast remove_player for disconnected player to all remaining players
    for (const remaining of sessions.values()) {
      if (remaining.client && remaining.client.state === mc.states.PLAY) {
        try {
          remaining.client.write('player_remove', {
            players: [client.uuid]
          });
        } catch (_) {}
      }
    }
    broadcastGlobalProxyTablist();
  });

  client.on('error', (err: any) => {
    log('ERROR', `Proxy Client error for ${username}:`, err.message);
  });
});

log('INFO', `🚀 ZylarPixel Master Proxy live on 0.0.0.0:${PROXY_PORT}`);
