/**
 * ZylarPixel SkyBlock Stats Manager
 * Implements 100% authentic Hypixel SkyBlock damage, defense, mana, and speed mechanics.
 */

import { PlayerStats } from '../types';

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  health: 100,
  maxHealth: 100,
  defense: 0,
  strength: 0,
  damage: 0,
  critChance: 30,
  critDamage: 50,
  intelligence: 0,
  mana: 100,      // Max Mana = 100 + Intelligence
  maxMana: 100,
  speed: 100,
  farmingFortune: 0
};

export function createDefaultStats(custom?: Partial<PlayerStats>): PlayerStats {
  const stats: PlayerStats = { ...DEFAULT_PLAYER_STATS, ...custom };
  stats.maxMana = 100 + stats.intelligence;
  if (stats.mana === undefined || stats.mana > stats.maxMana) {
    stats.mana = stats.maxMana;
  }
  if (stats.health === undefined || stats.health > stats.maxHealth) {
    stats.health = stats.maxHealth;
  }
  return stats;
}

/**
 * Hypixel SkyBlock Master Damage Formula:
 * BaseDamage = 5 + WeaponDamage + floor(Strength / 5)
 * Dmg (no crit) = BaseDamage * (1 + Strength / 100) * bonusMultipliers
 * Dmg (crit)    = BaseDamage * (1 + Strength / 100) * (1 + CritDamage / 100) * bonusMultipliers
 * FinalDamage = floor(Dmg)
 */
export function calculateDamage(
  attackerStats: PlayerStats,
  weaponDamage = 0,
  bonusMultipliers = 1.0
): { damage: number; isCrit: boolean } {
  const strength = attackerStats.strength || 0;
  const critChance = attackerStats.critChance || 0;
  const critDamage = attackerStats.critDamage || 0;
  const statDamage = attackerStats.damage || 0;

  const totalWeaponDamage = weaponDamage + statDamage;
  const baseDamage = 5 + totalWeaponDamage + Math.floor(strength / 5);

  const roll = Math.random() * 100;
  const isCrit = roll < Math.min(critChance, 100);

  const critMultiplier = isCrit ? (1 + critDamage / 100) : 1.0;
  const strengthMultiplier = 1 + strength / 100;

  const rawDamage = baseDamage * strengthMultiplier * critMultiplier * bonusMultipliers;
  return {
    damage: Math.max(1, Math.floor(rawDamage)),
    isCrit
  };
}

/**
 * Hypixel SkyBlock Defense Formula:
 * damageTaken = incomingDamage * (100 / (Defense + 100))
 * Effective Health (EHP) = Health * (1 + Defense / 100)
 */
export function applyDefense(incomingDamage: number, defense: number): number {
  if (defense <= 0) return Math.max(1, Math.round(incomingDamage));
  const damageTaken = incomingDamage * (100 / (defense + 100));
  return Math.max(1, Math.ceil(damageTaken));
}

export function calculateEHP(health: number, defense: number): number {
  return Math.round(health * (1 + (defense || 0) / 100));
}

/**
 * Natural Health Regen per 2 seconds:
 * Regen = (MaxHealth / 100 + 1.5)
 */
export function calculateHealthRegen(maxHealth: number): number {
  return (maxHealth / 100) + 1.5;
}

/**
 * Natural Mana Regen per 1 second:
 * 2% of Max Mana per second = MaxMana * 0.02
 */
export function calculateManaRegen(maxMana: number): number {
  return maxMana * 0.02;
}

/**
 * Formats the exact authentic Hypixel SkyBlock Action Bar:
 * Only Health, Defense, and Mana are shown!
 * e.g.: §c❤ 100/100   §a❈ 0   §b✎ 200/200
 */
export function formatActionBar(stats: PlayerStats | any): string {
  const hp = Math.max(0, Math.ceil(typeof stats?.health === 'number' ? stats.health : 100));
  const maxHp = Math.ceil(typeof stats?.maxHealth === 'number' ? stats.maxHealth : 100);
  const def = Math.floor(typeof stats?.defense === 'number' ? stats.defense : 0);
  const maxMana = Math.floor(typeof stats?.maxMana === 'number' ? stats.maxMana : 100);
  const mana = Math.max(0, Math.floor(typeof stats?.mana === 'number' ? stats.mana : maxMana));

  return `§c❤ ${hp}/${maxHp}   §a❈ ${def}   §b✎ ${mana}/${maxMana}`;
}

/**
 * Sends non-flickering action bar to client in 1.21.8
 */
export function sendActionBar(client: any, _is119?: boolean, text?: string): void {
  try {
    const msg = text || '';
    client.write('system_chat', {
      content: {
        type: 'compound',
        name: '',
        value: { text: { type: 'string', value: msg } }
      },
      isActionBar: true
    });
  } catch (e) {}
}

/**
 * Sets a temporary action bar override message (e.g. Mana usage, cooldowns, alerts)
 * that takes over the action bar for the specified duration (default 2000ms).
 */
export function showActionBarMessage(player: any, text: string, durationMs: number = 2000): void {
  if (!player) return;
  player.actionBarOverride = {
    text,
    expiresAt: Date.now() + durationMs
  };
  if (player.client) {
    sendActionBar(player.client, player.is119, text);
  }
}

/**
 * Syncs Vanilla Health & Hunger bar with SkyBlock Stats
 * Scales SkyBlock HP (100+) down to 0-20 hearts.
 * Locks food & saturation to max so hunger never depletes.
 */
export function syncVanillaHealthAndHunger(client: any, stats: PlayerStats): void {
  try {
    const fraction = stats.maxHealth > 0 ? (stats.health / stats.maxHealth) : 1.0;
    const vanillaHearts = Math.max(0.1, Math.min(20.0, fraction * 20.0));
    client.write('update_health', {
      health: vanillaHearts,
      food: 20,
      foodSaturation: 5.0
    });
  } catch (e) {}
}

/**
 * Syncs vanilla player movement speed attribute from SkyBlock speed stat
 * vanilla movement_speed = 0.1 * (SkyBlockSpeed / 100)
 */
export function syncPlayerAttributes(client: any, entityId: number, speedStat: number, _is119?: boolean): void {
  try {
    const effectiveSpeed = Math.max(20, Math.min(500, speedStat || 100));
    const vanillaSpeedAttr = 0.1 * (effectiveSpeed / 100.0);

    try {
      const currentFlags = client._abilitiesFlags !== undefined ? client._abilitiesFlags : (client._isHub ? 0x01 : 0x00);
      client.write('abilities', {
        flags: currentFlags,
        flyingSpeed: 0.05,
        walkingSpeed: vanillaSpeedAttr
      });
    } catch (_) {}

    const targetIds = [entityId];
    if (typeof client?.id === 'number' && !targetIds.includes(client.id)) targetIds.push(client.id);
    if (!targetIds.includes(99999)) targetIds.push(99999);

    for (const eid of targetIds) {
      client.write('entity_update_attributes', {
        entityId: eid,
        properties: [
          {
            key: 'generic.movement_speed',
            value: vanillaSpeedAttr,
            modifiers: []
          },
          {
            key: 'generic.attack_speed',
            value: 1024.0, // Removes 1.9+ attack cooldown delay
            modifiers: []
          }
        ]
      });
    }
  } catch (e) {}
}
