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

let hub: ZylarServer | null = null;

process.on('uncaughtException', (err: any) => {
  const msg = err?.stack || err?.message || String(err);
  console.error('[HUB] [CRITICAL] Uncaught Exception (shielded):', msg);
  try {
    hub?.log('ERROR', 'Uncaught Exception (shielded):', msg);
  } catch (_) {}
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.stack || reason?.message || String(reason);
  console.error('[HUB] [CRITICAL] Unhandled Rejection (shielded):', msg);
  try {
    hub?.log('ERROR', 'Unhandled Rejection (shielded):', msg);
  } catch (_) {}
});

hub = new ZylarServer({
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
