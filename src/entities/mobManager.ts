/**
 * ZylarPixel Mob & Combat Architecture (Minecraft 1.21.8 pure Protocol 772)
 * Features:
 *  - [Lv1] Graveyard Zombie (100 HP, 20 Dmg)
 *  - [Lv2] Graveyard Zombie Villager (120 HP, 24 Dmg)
 *  - [Lv30] Crypt Ghoul (2,000 HP, 350 Dmg, Iron Sword & Chainmail)
 *  - [Lv60] Golden Ghoul (20,000 HP, 500 Dmg, Full Gold Armor & Golden Sword)
 *  - Native 1.21.8 Text Display floating health nametags
 *  - Accurate Hypixel damage calculations, loot drops, coins, and Combat XP
 */

import * as crypto from 'crypto';
import * as nbt from 'prismarine-nbt';
import { calculateDamage, applyDefense, showActionBarMessage, syncPlayerAttributes, syncVanillaHealthAndHunger } from '../stats/statsManager';
import { spawnDamageIndicator } from '../combat/damageIndicator';
import { getSkyBlockExtraAttributes } from '../items/engine/itemBuilder';
import { getSkyBlockItem } from '../items/engine/itemRegistry';
import { loadPlayerProfile, savePlayerProfile } from '../storage/sharedProfile';

export interface MobDrop {
  name: string;
  count: number;
  chance: number;
  isRare?: boolean;
}

export interface MobTemplate {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  damage: number;
  entityType: number; // 145 = zombie, 147 = zombie_villager in 1.21.8
  combatXp: number;
  coinsMin: number;
  coinsMax: number;
  drops: MobDrop[];
  equipment?: {
    mainhand?: number;
    chestplate?: number;
    helmet?: number;
    leggings?: number;
    boots?: number;
  };
  zone: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  count: number;
  speed: number;
}

export interface ActiveMob {
  entityId: number;
  nametagId: number;
  template: MobTemplate;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  isDead: boolean;
  respawnAt: number;
  lastAttackTime: number;
  lastWanderTime: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
}

// 1. Precise Zone Templates
export const MOB_TEMPLATES: MobTemplate[] = [
  {
    id: 'graveyard_zombie',
    name: 'Zombie',
    level: 1,
    maxHp: 100,
    damage: 20,
    entityType: 145, // zombie in 1.21.8
    combatXp: 6,
    coinsMin: 1,
    coinsMax: 2,
    speed: 0.18,
    drops: [
      { name: 'rotten_flesh', count: 1, chance: 1.0 },
      { name: 'rotten_flesh', count: 1, chance: 0.5 },
      { name: 'poisonous_potato', count: 1, chance: 0.05, isRare: true }
    ],
    zone: {
      minX: -165,
      maxX: -100,
      minY: 68,
      maxY: 72,
      minZ: -115,
      maxZ: -50
    },
    count: 14
  },
  {
    id: 'graveyard_zombie_villager',
    name: 'Zombie Villager',
    level: 2,
    maxHp: 120,
    damage: 24,
    entityType: 147, // zombie_villager in 1.21.8
    combatXp: 7,
    coinsMin: 2,
    coinsMax: 3,
    speed: 0.19,
    drops: [
      { name: 'rotten_flesh', count: 2, chance: 1.0 },
      { name: 'poisonous_potato', count: 1, chance: 0.12, isRare: true }
    ],
    zone: {
      minX: -165,
      maxX: -100,
      minY: 68,
      maxY: 72,
      minZ: -115,
      maxZ: -50
    },
    count: 6
  },
  {
    id: 'crypt_ghoul',
    name: 'Crypt Ghoul',
    level: 30,
    maxHp: 2000,
    damage: 350,
    entityType: 145, // zombie in 1.21.8
    combatXp: 30,
    coinsMin: 10,
    coinsMax: 15,
    speed: 0.24,
    equipment: {
      mainhand: 890, // iron_sword
      chestplate: 918 // chainmail_chestplate
    },
    drops: [
      { name: 'rotten_flesh', count: 3, chance: 1.0 },
      { name: 'bone', count: 1, chance: 0.5 },
      { name: 'bone', count: 2, chance: 0.25 }
    ],
    zone: {
      minX: -140,
      maxX: -50,
      minY: 46,
      maxY: 59,
      minZ: -145,
      maxZ: -85
    },
    count: 12
  },
  {
    id: 'golden_ghoul',
    name: 'Golden Ghoul',
    level: 60,
    maxHp: 20000,
    damage: 500,
    entityType: 145, // zombie in 1.21.8
    combatXp: 60,
    coinsMin: 80,
    coinsMax: 120,
    speed: 0.22,
    equipment: {
      mainhand: 885, // golden_sword
      helmet: 929, // golden_helmet
      chestplate: 930 // golden_chestplate
    },
    drops: [
      { name: 'gold_ingot', count: 2, chance: 1.0 },
      { name: 'gold_ingot', count: 3, chance: 0.5 },
      { name: 'rotten_flesh', count: 6, chance: 1.0 }
    ],
    zone: {
      minX: -140,
      maxX: -130,
      minY: 46,
      maxY: 50,
      minZ: -130,
      maxZ: -115
    },
    count: 2
  }
];

let nextMobEntityId = 20000;
let nextNametagEntityId = 25000;

export const activeMobs = new Map<number, ActiveMob>();
let mobTicker: NodeJS.Timeout | null = null;
let boundServer: any = null;

function toProtocolByte(deg: number): number {
  let b = Math.floor((deg || 0) * 256 / 360) % 256;
  if (b < 0) b += 256;
  if (b > 127) b -= 256;
  return b;
}

export function formatMobNametag(mob: ActiveMob): string {
  const hpRatio = mob.hp / mob.maxHp;
  let hpColor = '§a';
  if (hpRatio <= 0.25) {
    hpColor = '§c';
  } else if (hpRatio <= 0.5) {
    hpColor = '§e';
  }
  const formattedHp = Math.round(mob.hp).toLocaleString();
  const formattedMax = Math.round(mob.maxHp).toLocaleString();
  return `§8[§7Lv${mob.template.level}§8] §c${mob.template.name} ${hpColor}${formattedHp}§f/§a${formattedMax}§c❤`;
}

function getRandomZoneCoord(zone: MobTemplate['zone']): { x: number; y: number; z: number } {
  const x = Math.floor(Math.random() * (zone.maxX - zone.minX + 1)) + zone.minX + 0.5;
  const y = Math.floor(Math.random() * (zone.maxY - zone.minY + 1)) + zone.minY;
  const z = Math.floor(Math.random() * (zone.maxZ - zone.minZ + 1)) + zone.minZ + 0.5;
  return { x, y, z };
}

function createEquipmentPackets(entityId: number, equipment: NonNullable<MobTemplate['equipment']>): any[] {
  const packets: any[] = [];
  const addSlot = (slot: number, itemId: number) => {
    packets.push({
      entityId,
      equipments: [{
        slot,
        item: {
          itemCount: 1,
          itemId,
          addedComponentCount: 0,
          removedComponentCount: 0,
          components: [],
          removeComponents: []
        }
      }]
    });
  };

  if (equipment.mainhand) addSlot(0, equipment.mainhand);
  if (equipment.boots) addSlot(2, equipment.boots);
  if (equipment.leggings) addSlot(3, equipment.leggings);
  if (equipment.chestplate) addSlot(4, equipment.chestplate);
  if (equipment.helmet) addSlot(5, equipment.helmet);

  return packets;
}

export function spawnMobToClient(client: any, mob: ActiveMob): void {
  if (mob.isDead) return;

  try {
    // 1. Mob Entity (Zombie / Zombie Villager)
    client.write('spawn_entity', {
      entityId: mob.entityId,
      objectUUID: crypto.randomUUID(),
      type: mob.template.entityType,
      x: mob.x,
      y: mob.y,
      z: mob.z,
      pitch: toProtocolByte(mob.pitch),
      yaw: toProtocolByte(mob.yaw),
      headPitch: toProtocolByte(mob.pitch),
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    // 2. Equipment (Weapons / Armor)
    if (mob.template.equipment) {
      for (const eqPacket of createEquipmentPackets(mob.entityId, mob.template.equipment)) {
        client.write('entity_equipment', eqPacket);
      }
    }

    // 3. Floating Nametag (Native 1.21.8 text_display)
    client.write('spawn_entity', {
      entityId: mob.nametagId,
      objectUUID: crypto.randomUUID(),
      type: 126, // text_display
      x: mob.x,
      y: mob.y + 2.15,
      z: mob.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    client.write('entity_metadata', {
      entityId: mob.nametagId,
      metadata: [
        { key: 23, type: 'byte', value: 3 }, // Center billboard
        { key: 27, type: 'component', value: nbt.comp({ text: nbt.string(formatMobNametag(mob)) }) },
        { key: 31, type: 'byte', value: 1 } // Shadow
      ]
    });
  } catch (_) {}
}

export function despawnMobFromClient(client: any, mob: ActiveMob): void {
  try {
    client.write('entity_destroy', {
      entityIds: [mob.entityId, mob.nametagId]
    });
  } catch (_) {}
}

export function initMobManager(server: any): void {
  boundServer = server;
  activeMobs.clear();

  // Populate active pool according to templates
  for (const template of MOB_TEMPLATES) {
    for (let i = 0; i < template.count; i++) {
      const entityId = nextMobEntityId++;
      const nametagId = nextNametagEntityId++;
      const pos = getRandomZoneCoord(template.zone);

      activeMobs.set(entityId, {
        entityId,
        nametagId,
        template,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: Math.floor(Math.random() * 360),
        pitch: 0,
        hp: template.maxHp,
        maxHp: template.maxHp,
        isDead: false,
        respawnAt: 0,
        lastAttackTime: 0,
        lastWanderTime: Date.now() + Math.floor(Math.random() * 3000),
        spawnX: pos.x,
        spawnY: pos.y,
        spawnZ: pos.z
      });
    }
  }

  server.log('INFO', `[MobManager] Initialized ${activeMobs.size} Graveyard & Crypt mobs.`);

  if (mobTicker) clearInterval(mobTicker);
  // Mob AI loop: 5 ticks/second (200ms)
  mobTicker = setInterval(() => {
    tickMobManager(server);
  }, 200);
}

function tickMobManager(server: any): void {
  if (!server || server.config.worldType !== 'hub') return;
  const now = Date.now();
  const players = Array.from(server.getPlayers() as Map<any, any>).map(([_, p]) => p);
  if (players.length === 0) return;

  for (const [_, mob] of activeMobs) {
    // 1. Respawn dead mobs
    if (mob.isDead) {
      if (now >= mob.respawnAt) {
        mob.isDead = false;
        mob.hp = mob.template.maxHp;
        const newPos = getRandomZoneCoord(mob.template.zone);
        mob.x = newPos.x;
        mob.y = newPos.y;
        mob.z = newPos.z;
        mob.spawnX = newPos.x;
        mob.spawnY = newPos.y;
        mob.spawnZ = newPos.z;

        // Broadcast spawn to all players within 64 blocks
        for (const player of players) {
          if (!player.client) continue;
          const dist = Math.hypot(player.x - mob.x, player.z - mob.z);
          if (dist <= 64) {
            spawnMobToClient(player.client, mob);
          }
        }
      }
      continue;
    }

    // 2. Find closest target player within 14 blocks
    let nearestPlayer: any = null;
    let nearestDist = 14.0;

    for (const player of players) {
      if (!player.client || (player.stats && player.stats.health <= 0)) continue;
      const d = Math.hypot(player.x - mob.x, player.z - mob.z);
      const dy = Math.abs(player.y - mob.y);
      if (d < nearestDist && dy <= 6) {
        nearestDist = d;
        nearestPlayer = player;
      }
    }

    // 3. AI Navigation & Attack
    if (nearestPlayer) {
      const dx = nearestPlayer.x - mob.x;
      const dz = nearestPlayer.z - mob.z;
      const lookYaw = Math.atan2(-dx, dz) * (180 / Math.PI);
      mob.yaw = lookYaw;

      if (nearestDist > 1.6) {
        // Step forward towards player
        const step = Math.min(mob.template.speed, nearestDist - 1.5);
        mob.x += (dx / nearestDist) * step;
        mob.z += (dz / nearestDist) * step;

        // Broadcast movement teleport to nearby players
        for (const player of players) {
          if (!player.client) continue;
          const distToMob = Math.hypot(player.x - mob.x, player.z - mob.z);
          if (distToMob <= 56) {
            try {
              player.client.write('entity_teleport', {
                entityId: mob.entityId,
                x: mob.x,
                y: mob.y,
                z: mob.z,
                dx: 0,
                dy: 0,
                dz: 0,
                yaw: mob.yaw,
                pitch: 0,
                flags: { _value: 0 },
                onGround: true
              });
              player.client.write('entity_head_rotation', {
                entityId: mob.entityId,
                headYaw: toProtocolByte(mob.yaw)
              });
              // Keep nametag tightly bound to mob crown
              player.client.write('entity_teleport', {
                entityId: mob.nametagId,
                x: mob.x,
                y: mob.y + 2.15,
                z: mob.z,
                dx: 0,
                dy: 0,
                dz: 0,
                yaw: 0,
                pitch: 0,
                flags: { _value: 0 },
                onGround: false
              });
            } catch (_) {}
          }
        }
      } else {
        // Within 1.6 blocks: Melee Attack!
        if (now - mob.lastAttackTime >= 1000) {
          mob.lastAttackTime = now;

          const playerDefense = nearestPlayer.stats?.defense || 0;
          const damageTaken = applyDefense(mob.template.damage, playerDefense);
          nearestPlayer.stats.health = Math.max(0, nearestPlayer.stats.health - damageTaken);

          // Broadcast mob attack animation
          for (const player of players) {
            if (!player.client) continue;
            const dist = Math.hypot(player.x - mob.x, player.z - mob.z);
            if (dist <= 48) {
              try {
                player.client.write('entity_animation', {
                  entityId: mob.entityId,
                  animation: 0 // Swing main arm
                });
                player.client.write('entity_status', {
                  entityId: nearestPlayer.entityId,
                  entityStatus: 2 // Hurt red flash
                });
              } catch (_) {}
            }
          }

          syncPlayerAttributes(nearestPlayer.client, nearestPlayer.entityId, nearestPlayer.stats?.speed || 100);
          syncVanillaHealthAndHunger(nearestPlayer.client, nearestPlayer.stats);
          showActionBarMessage(nearestPlayer, `§c-${damageTaken} ❤`);

          // Player Death Handling
          if (nearestPlayer.stats.health <= 0) {
            handlePlayerDeathByMob(server, nearestPlayer, mob);
          }
        }
      }
    } else {
      // Idle wander
      if (now - mob.lastWanderTime >= 4000) {
        mob.lastWanderTime = now;
        const wanderDx = (Math.random() - 0.5) * 2.0;
        const wanderDz = (Math.random() - 0.5) * 2.0;
        const nextX = mob.x + wanderDx;
        const nextZ = mob.z + wanderDz;

        if (nextX >= mob.template.zone.minX && nextX <= mob.template.zone.maxX &&
            nextZ >= mob.template.zone.minZ && nextZ <= mob.template.zone.maxZ) {
          mob.x = nextX;
          mob.z = nextZ;
          mob.yaw = Math.atan2(-wanderDx, wanderDz) * (180 / Math.PI);

          for (const player of players) {
            if (!player.client) continue;
            const distToMob = Math.hypot(player.x - mob.x, player.z - mob.z);
            if (distToMob <= 48) {
              try {
                player.client.write('entity_teleport', {
                  entityId: mob.entityId,
                  x: mob.x,
                  y: mob.y,
                  z: mob.z,
                  dx: 0,
                  dy: 0,
                  dz: 0,
                  yaw: mob.yaw,
                  pitch: 0,
                  flags: { _value: 0 },
                  onGround: true
                });
                player.client.write('entity_teleport', {
                  entityId: mob.nametagId,
                  x: mob.x,
                  y: mob.y + 2.15,
                  z: mob.z,
                  dx: 0,
                  dy: 0,
                  dz: 0,
                  yaw: 0,
                  pitch: 0,
                  flags: { _value: 0 },
                  onGround: false
                });
              } catch (_) {}
            }
          }
        }
      }
    }
  }
}

function handlePlayerDeathByMob(server: any, player: any, mob: ActiveMob): void {
  server.log('INFO', `Player ${player.username} was slain by ${mob.template.name}`);
  player.stats.health = player.stats.maxHealth || 100;

  // Safe Hub Spawn Coordinates
  const spawnX = -2.5;
  const spawnY = 70.0;
  const spawnZ = -68.5;
  player.x = spawnX;
  player.y = spawnY;
  player.z = spawnZ;

  try {
    player.client.write('position', {
      teleportId: Math.floor(Math.random() * 10000),
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      dx: 0,
      dy: 0,
      dz: 0,
      yaw: 0,
      pitch: 0,
      flags: {}
    });

    player.client.write('set_title_text', {
      text: nbt.comp({ text: nbt.string('§c§lYOU DIED!') })
    });
    player.client.write('set_title_subtitle', {
      text: nbt.comp({ text: nbt.string(`§7Killed by §c${mob.template.name}§7.`) })
    });
    player.client.write('set_title_time', {
      fadeIn: 5,
      stay: 40,
      fadeOut: 15
    });

    player.client.write('system_chat', {
      content: nbt.comp({
        text: nbt.string(`§c☠ §7You were killed by §c${mob.template.name}§7!`)
      }),
      isActionBar: false
    });
  } catch (_) {}

  syncPlayerAttributes(player.client, player.entityId, player.stats?.speed || 100);
  syncVanillaHealthAndHunger(player.client, player.stats);
}

export function handleMobAttack(player: any, targetEntityId: number, server: any): boolean {
  const mob = activeMobs.get(targetEntityId);
  if (!mob || mob.isDead) return false;

  const now = Date.now();
  const playerStats = player.stats || { strength: 0, critChance: 30, critDamage: 50 };

  // Calculate Weapon Base Damage
  let weaponDamage = 0;
  let bonusMultipliers = 1.0;

  // Inspect held weapon in hotbar slot
  const heldItem = player.inventory?.get(player.activeSlot || 36);
  if (heldItem) {
    const extra = getSkyBlockExtraAttributes(heldItem);
    if (extra && extra.id) {
      const def = getSkyBlockItem(extra.id);
      if (def && def.stats && def.stats.damage) {
        weaponDamage = def.stats.damage;
      }
    } else {
      // Vanilla weapon fallbacks
      const name = heldItem.name || '';
      if (name.includes('diamond_sword')) weaponDamage = 7;
      else if (name.includes('iron_sword')) weaponDamage = 6;
      else if (name.includes('stone_sword')) weaponDamage = 5;
      else if (name.includes('golden_sword') || name.includes('wooden_sword')) weaponDamage = 4;
    }
  }

  const { damage, isCrit } = calculateDamage(playerStats, weaponDamage, bonusMultipliers);
  mob.hp = Math.max(0, mob.hp - damage);

  const players = Array.from(server.getPlayers() as Map<any, any>).map(([_, p]) => p);
  const nearbyPlayers = players.filter(p => p.client && Math.hypot(p.x - mob.x, p.z - mob.z) <= 48);

  // 1. Authentic Hypixel Floating Damage Hologram
  spawnDamageIndicator(nearbyPlayers, mob.x, mob.y, mob.z, damage, isCrit);

  // 2. Red Hurt Animation & Sound
  for (const observer of nearbyPlayers) {
    try {
      observer.client.write('entity_status', {
        entityId: mob.entityId,
        entityStatus: 2 // Hurt
      });
    } catch (_) {}
  }

  // 3. Update Nametag Health Text
  for (const observer of nearbyPlayers) {
    try {
      observer.client.write('entity_metadata', {
        entityId: mob.nametagId,
        metadata: [
          { key: 23, type: 'byte', value: 3 },
          { key: 27, type: 'component', value: nbt.comp({ text: nbt.string(formatMobNametag(mob)) }) },
          { key: 31, type: 'byte', value: 1 }
        ]
      });
    } catch (_) {}
  }

  // 4. Mob Slain Handling
  if (mob.hp <= 0) {
    mob.isDead = true;
    mob.respawnAt = now + 10000; // 10 second respawn

    // Despawn Mob & Nametag
    for (const observer of nearbyPlayers) {
      despawnMobFromClient(observer.client, mob);
    }

    // Award Combat XP
    const profile = loadPlayerProfile(player.username);
    if (profile) {
      if (!profile.skills) profile.skills = { combat: 0, mining: 0, foraging: 0, farming: 0 };
      profile.skills.combat = (profile.skills.combat || 0) + mob.template.combatXp;

      // Award Coins
      const coins = Math.floor(Math.random() * (mob.template.coinsMax - mob.template.coinsMin + 1)) + mob.template.coinsMin;
      player.purse = (player.purse || 0) + coins;
      profile.coins = player.purse;
      savePlayerProfile(profile);

      // Notification
      try {
        player.client.write('system_chat', {
          content: nbt.comp({
            text: nbt.string(`§3+${mob.template.combatXp} Combat XP §8• §6+${coins} Coins! §7(${mob.template.name})`)
          }),
          isActionBar: false
        });
      } catch (_) {}
    }

    // Drops
    for (const drop of mob.template.drops) {
      if (Math.random() <= drop.chance) {
        server.spawnDroppedItem(drop.name, drop.count, mob.x, mob.y, mob.z);
        if (drop.isRare) {
          try {
            player.client.write('system_chat', {
              content: nbt.comp({
                text: nbt.string(`§6§lRARE DROP! §f${drop.name.replace(/_/g, ' ')}`)
              }),
              isActionBar: false
            });
          } catch (_) {}
        }
      }
    }
  }

  return true;
}

export function sendMobsToPlayer(client: any): void {
  for (const [_, mob] of activeMobs) {
    if (!mob.isDead) {
      spawnMobToClient(client, mob);
    }
  }
}

export function destroyAllMobsFromClient(client: any): void {
  for (const [_, mob] of activeMobs) {
    despawnMobFromClient(client, mob);
  }
}
