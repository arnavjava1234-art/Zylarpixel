/**
 * ZylarPixel SkyBlock Item Registry & Ability Execution Engine
 * Central catalog of all SkyBlock items and automated ability handling.
 */

import { SkyBlockItemDefinition, ItemStats, AbilityTrigger } from './itemTypes';
import { createSkyBlockItemStack, getSkyBlockExtraAttributes } from './itemBuilder';
import { ROGUE_SWORD } from '../weapons/rogueSword';
import { showActionBarMessage } from '../../stats/statsManager';
import { loadPlayerProfile, savePlayerProfile } from '../../storage/sharedProfile';

const itemCatalog = new Map<string, SkyBlockItemDefinition>();

// Cooldown tracking: playerKey (lowercase username) -> abilityName -> expiry timestamp ms
const playerCooldowns = new Map<string, Map<string, number>>();

export function registerSkyBlockItem(def: SkyBlockItemDefinition): void {
  if (!def || !def.id) return;
  itemCatalog.set(def.id.toUpperCase(), def);
}

// Register built-in SkyBlock weapons
registerSkyBlockItem(ROGUE_SWORD);

export function getSkyBlockItem(id: string): SkyBlockItemDefinition | undefined {
  if (!id) return undefined;
  return itemCatalog.get(id.toUpperCase());
}

export function getAllRegisteredItems(): SkyBlockItemDefinition[] {
  return Array.from(itemCatalog.values());
}

export function getAllItemIds(): string[] {
  return Array.from(itemCatalog.keys());
}

export function createItem(
  id: string,
  options?: {
    count?: number;
    customStats?: Partial<ItemStats>;
    uuid?: string;
    customData?: Record<string, any>;
  }
): any {
  const def = getSkyBlockItem(id);
  if (!def) {
    throw new Error(`[ItemRegistry] SkyBlock item with ID "${id}" is not registered!`);
  }
  return createSkyBlockItemStack(def, options);
}

export function handleItemAbility(
  player: any,
  server: any,
  itemStack: any,
  trigger: AbilityTrigger = 'RIGHT CLICK'
): boolean {
  if (!itemStack || !player || !player.stats) return false;

  const extra = getSkyBlockExtraAttributes(itemStack);
  if (!extra || !extra.id) return false;

  const def = getSkyBlockItem(extra.id);
  if (!def) return false;

  const abilities = def.abilities || (def.ability ? [def.ability] : []);
  const matchingAbility = abilities.find(ab => ab.trigger === trigger);
  if (!matchingAbility) return false;

  const playerKey = (player.username || 'unknown').toLowerCase();
  if (!playerCooldowns.has(playerKey)) {
    playerCooldowns.set(playerKey, new Map<string, number>());
  }
  const cooldownMap = playerCooldowns.get(playerKey)!;
  const now = Date.now();

  // 1. Check Cooldown
  let cooldownExpiry = cooldownMap.get(matchingAbility.name) || 0;
  if (now >= cooldownExpiry) {
    try {
      const prof = loadPlayerProfile(player.username);
      if (prof.cooldowns && prof.cooldowns[matchingAbility.name]) {
        const diskExpiry = prof.cooldowns[matchingAbility.name];
        if (diskExpiry > cooldownExpiry) {
          cooldownExpiry = diskExpiry;
          cooldownMap.set(matchingAbility.name, diskExpiry);
        }
      }
    } catch (_) {}
  }

  if (now < cooldownExpiry) {
    const remainingSeconds = Math.ceil((cooldownExpiry - now) / 1000);
    try {
      player.client.write('named_sound_effect', {
        soundName: 'entity.villager.no',
        soundCategory: 0,
        x: Math.floor(player.x * 8),
        y: Math.floor(player.y * 8),
        z: Math.floor(player.z * 8),
        volume: 0.8,
        pitch: 1.0,
        seed: [0, 0]
      });
    } catch (_) {}
    showActionBarMessage(player, `§cThis ability is on cooldown for §e${remainingSeconds}s§c!`, 2000);
    if (server.sendSystemMessage) {
      server.sendSystemMessage(player.client, `§cThis ability is on cooldown for §e${remainingSeconds}s§c!`, player.is119);
    }
    return false;
  }

  // 2. Check Mana Cost
  const manaCost = matchingAbility.manaCost || 0;
  if (manaCost > 0) {
    if (player.stats.mana < manaCost) {
      try {
        player.client.write('named_sound_effect', {
          soundName: 'entity.villager.no',
          soundCategory: 0,
          x: Math.floor(player.x * 8),
          y: Math.floor(player.y * 8),
          z: Math.floor(player.z * 8),
          volume: 0.8,
          pitch: 1.0,
          seed: [0, 0]
        });
      } catch (_) {}
      showActionBarMessage(player, '§cNot enough mana!', 2000);
      if (server.sendSystemMessage) {
        server.sendSystemMessage(player.client, '§cNot enough mana!', player.is119);
      }
      return false;
    }

    // Deduct Mana
    player.stats.mana = Math.max(0, player.stats.mana - manaCost);

    // Replace the entire action bar with the mana consumption message!
    showActionBarMessage(player, `§b-${manaCost} Mana (§6${matchingAbility.name}§b)`, 2000);
  }

  // 3. Set Cooldown
  const cooldownSec = matchingAbility.cooldownSeconds || 0;
  if (cooldownSec > 0) {
    const expiry = now + (cooldownSec * 1000);
    cooldownMap.set(matchingAbility.name, expiry);
    try {
      const prof = loadPlayerProfile(player.username);
      if (!prof.cooldowns) prof.cooldowns = {};
      prof.cooldowns[matchingAbility.name] = expiry;
      savePlayerProfile(prof);
    } catch (_) {}
  }

  // 4. Execute Ability Logic
  if (typeof matchingAbility.onExecute === 'function') {
    matchingAbility.onExecute(player, server, itemStack);
  }

  return true;
}

export function cleanupPlayerCooldowns(playerKey: string): void {
  playerCooldowns.delete(playerKey.toLowerCase());
}
