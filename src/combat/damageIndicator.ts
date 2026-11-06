/**
 * ZylarPixel Combat Damage Indicators
 * Spawns floating ArmorStand damage holograms that drift upward and cleanly despawn.
 * Supports authentic Hypixel normal hit (gray) and critical hit (multicolor rainbow with stars).
 */

import * as crypto from 'crypto';
const nbt = require('prismarine-nbt');

let nextDamageIndicatorId = 30000;

export function formatCritDamage(damage: number): string {
  const rounded = Math.round(damage);
  const str = rounded.toLocaleString();
  const colors = ['§e', '§6', '§c', '§4'];
  let res = '§f✧';
  for (let i = 0; i < str.length; i++) {
    res += colors[i % colors.length] + str[i];
  }
  res += '§c❤§f✧';
  return res;
}

export function formatNormalDamage(damage: number): string {
  return `§7${Math.round(damage).toLocaleString()}`;
}

export function spawnDamageIndicator(
  observers: any[],
  x: number,
  y: number,
  z: number,
  damage: number,
  isCrit: boolean
): void {
  const entityId = ++nextDamageIndicatorId;
  const uuid = crypto.randomUUID();
  const displayText = isCrit ? formatCritDamage(damage) : formatNormalDamage(damage);

  // Slight random horizontal and vertical offset around the hit impact
  let posX = x + (Math.random() - 0.5) * 0.6;
  let posY = y + 1.2 + Math.random() * 0.3;
  let posZ = z + (Math.random() - 0.5) * 0.6;

  // 1. Broadcast spawn_entity (text_display = 126 in 1.21.8) & entity_metadata to all observers
  for (const observer of observers) {
    try {
      const client = observer.client || observer;
      client.write('spawn_entity', {
        entityId,
        objectUUID: uuid,
        type: 126, // text_display in 1.21.8
        x: posX,
        y: posY,
        z: posZ,
        pitch: 0,
        yaw: 0,
        headPitch: 0,
        objectData: 0,
        velocity: { x: 0, y: 0, z: 0 }
      });

      client.write('entity_metadata', {
        entityId,
        metadata: [
          { key: 23, type: 'byte', value: 3 }, // Center billboard mode (faces camera)
          { key: 27, type: 'component', value: nbt.comp({ text: nbt.string(displayText) }) },
          { key: 31, type: 'byte', value: 1 } // Shadow
        ]
      });
    } catch (_) {}
  }

  // 2. Animate upward float over 16 ticks (~800ms)
  let ticks = 0;
  const maxTicks = 16;
  const interval = setInterval(() => {
    ticks++;
    posY += 0.035;

    for (const observer of observers) {
      try {
        const client = observer.client || observer;
        client.write('entity_teleport', {
          entityId,
          x: posX,
          y: posY,
          z: posZ,
          yaw: 0,
          pitch: 0,
          onGround: false
        });
      } catch (_) {}
    }

    if (ticks >= maxTicks) {
      clearInterval(interval);
      // 3. Despawn entity
      for (const observer of observers) {
        try {
          const client = observer.client || observer;
          client.write('entity_destroy', { entityIds: [entityId] });
        } catch (_) {}
      }
    }
  }, 50);
}
