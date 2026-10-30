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

const islandPort = parseInt(process.env.PORT || '25567', 10);

const islands = new ZylarServer({
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
