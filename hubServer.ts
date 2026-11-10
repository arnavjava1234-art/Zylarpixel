/**
 * ZylarPixel Hub Server Instance
 * Powered by the Unified ZylarServer Engine
 * Port: 25566
 * 
 * Features:
 * - Authentic 49 Hypixel SkyBlock Hub Chunks from Region Files
 * - Adventure Mode Safe Zone (invulnerable, no PvP, grief-protected)
 * - Portal to Private Islands
 * - Full Hypixel SkyBlock Menu & Stats Sync
 */

import { ZylarServer } from './src/core/ZylarServer';
import { HUB_SPAWN_X, HUB_SPAWN_Y, HUB_SPAWN_Z } from './src/world/hubRegionProvider';

// Top-level crash isolation guards: ensure background ticker or network errors never crash the Hub process
process.on('uncaughtException', (err: any) => {
  console.error('[CRITICAL] Uncaught exception in Hub server:', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[CRITICAL] Unhandled promise rejection in Hub server:', reason?.stack || reason?.message || reason);
});

const hub = new ZylarServer({
  serverId: 'hub',
  serverName: 'Village Hub',
  port: 25566,
  motd: '§d§lZYLARPIXEL §7[Authentic Hub]',
  gamemode: 0, // Survival Mode (authentic Hypixel Hub with server-side block protection)
  pvp: false,  // Zero PvP in the Hub
  allowBlockBreaking: false,
  allowBlockPlacement: false,
  scoreboardLocation: 'Village',
  worldType: 'hub',
  spawnPoint: { x: HUB_SPAWN_X, y: HUB_SPAWN_Y, z: HUB_SPAWN_Z, yaw: 180, pitch: 0 }
});

hub.start();
