/**
 * Rogue Sword - Hypixel SkyBlock Authentic Weapon
 * Rarity: COMMON
 * Ability: Speed Boost (RIGHT CLICK)
 * Modern Hypixel Standard:
 * - Cost: 50 Mana
 * - Cooldown: 5 Seconds
 * - Buff: +100 Speed for 30 seconds (200 total speed, non-stacking, refreshes duration)
 */

import { defineSkyBlockItem } from '../engine/itemBuilder';
import { syncPlayerAttributes } from '../../stats/statsManager';
import { loadPlayerProfile, savePlayerProfile } from '../../storage/sharedProfile';

export function applySpeedBoost(
  player: any,
  server: any,
  durationMs: number = 30000,
  isInitial: boolean = true
): void {
  if (player.speedBoostTimer) {
    clearTimeout(player.speedBoostTimer);
    player.speedBoostTimer = undefined;
  }

  const expiresAt = Date.now() + durationMs;
  player.speedBoostExpiresAt = expiresAt;

  // Persist buff timestamp to cross-server profile
  try {
    const prof = loadPlayerProfile(player.username);
    if (!prof.activeBuffs) prof.activeBuffs = {};
    prof.activeBuffs.speedBoostUntil = expiresAt;
    savePlayerProfile(prof);
  } catch (_) {}

  // Set speed to 200 (+100 Speed, Modern Hypixel standard)
  player.stats.speed = 200;
  syncPlayerAttributes(player.client, player.entityId, player.stats.speed, player.is119);

  if (isInitial) {
    try {
      player.client.write('named_sound_effect', {
        soundName: 'entity.generic.drink',
        soundCategory: 0,
        x: Math.floor((player.x || 0) * 8),
        y: Math.floor((player.y || 70) * 8),
        z: Math.floor((player.z || 0) * 8),
        volume: 0.9,
        pitch: 1.2,
        seed: [0, 0]
      });
    } catch (_) {}

    if (server && server.sendSystemMessage) {
      server.sendSystemMessage(
        player.client,
        '§aUsed §6Speed Boost§a! Gain §a+100 ✦ Speed §7for §a30s§a!',
        player.is119
      );
    }
  }

  player.speedBoostTimer = setTimeout(() => {
    player.speedBoostTimer = undefined;
    player.speedBoostExpiresAt = undefined;
    player.stats.speed = player.baseSpeed !== undefined ? player.baseSpeed : 100;
    syncPlayerAttributes(player.client, player.entityId, player.stats.speed, player.is119);

    try {
      const prof = loadPlayerProfile(player.username);
      if (prof.activeBuffs && prof.activeBuffs.speedBoostUntil) {
        delete prof.activeBuffs.speedBoostUntil;
        savePlayerProfile(prof);
      }
    } catch (_) {}

    try {
      player.client.write('named_sound_effect', {
        soundName: 'block.fire.extinguish',
        soundCategory: 0,
        x: Math.floor((player.x || 0) * 8),
        y: Math.floor((player.y || 70) * 8),
        z: Math.floor((player.z || 0) * 8),
        volume: 0.6,
        pitch: 0.8,
        seed: [0, 0]
      });
    } catch (_) {}

    if (server && server.sendSystemMessage && player.client) {
      server.sendSystemMessage(
        player.client,
        '§cYour §6Speed Boost §chas worn off.',
        player.is119
      );
    }
  }, durationMs);
}

export const ROGUE_SWORD = defineSkyBlockItem({
  id: 'ROGUE_SWORD',
  name: 'Rogue Sword',
  material: 'golden_sword',
  rarity: 'COMMON',
  type: 'SWORD',
  stats: {
    damage: 20
  },
  ability: {
    name: 'Speed Boost',
    trigger: 'RIGHT CLICK',
    manaCost: 50,
    cooldownSeconds: 5,
    description: [
      'Gain §a+100 ✦ Speed §7for §a30 seconds§7.'
    ],
    onExecute: (player: any, server: any) => {
      applySpeedBoost(player, server, 30000, true);
    }
  }
});
