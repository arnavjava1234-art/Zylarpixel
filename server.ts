/**
 * ZylarPixel Private Islands Server Instance
 * Powered by the Unified ZylarServer Engine
 * Port: 25567 (or process.env.PORT)
 * 
 * Features:
 * - 1,000-Block Void Spaced Private Islands
 * - Personal Island Generation & Persistent Block Modifications
 * - Full Survival Mode with Island Guest Protection
 * - PvP Combat with Floating Damage Indicators & Below-Name Hearts
 * - Ancient Stone Arch Portal to Village Hub
 * - In-Memory Hot Reboot & Void Rescue
 */

import { ZylarServer } from './src/core/ZylarServer';

let islands: ZylarServer | null = null;

process.on('uncaughtException', (err: any) => {
  const msg = err?.stack || err?.message || String(err);
  console.error('[ISLANDS] [CRITICAL] Uncaught Exception (shielded):', msg);
  try {
    islands?.log('ERROR', 'Uncaught Exception (shielded):', msg);
  } catch (_) {}
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.stack || reason?.message || String(reason);
  console.error('[ISLANDS] [CRITICAL] Unhandled Rejection (shielded):', msg);
  try {
    islands?.log('ERROR', 'Unhandled Rejection (shielded):', msg);
  } catch (_) {}
});

const islandPort = parseInt(process.env.PORT || '25567', 10);

islands = new ZylarServer({
  serverId: 'islands',
  serverName: 'Private Islands',
  port: islandPort,
  motd: '§d§lZYLARPIXEL §7[SkyBlock Islands]',
  gamemode: 0, // Survival Mode
  pvp: true,   // Combat enabled (damage formulas, crits & below-name hearts)
  allowBlockBreaking: true,
  allowBlockPlacement: true,
  scoreboardLocation: 'Your Island',
  worldType: 'islands',
  spawnPoint: { x: 0.5, y: 101.0, z: 0.5, yaw: 0, pitch: 0 }
});

islands.start();
