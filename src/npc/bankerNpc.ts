/**
 * Authentic Hypixel SkyBlock Banker NPC
 * Located in the Village Bank at (-24.5, 71.0, -58.5)
 * 
 * Features:
 * - Exact Hypixel Steve in Charcoal Suit with Red Tie skin (Official Signed Mojang Texture)
 * - True 3D Voxel Raycasting Line-of-Sight detection (50 block radius)
 * - Dynamic head tracking and body rotation towards players in line-of-sight
 * - Reset to counter facing when players walk behind walls/pillars or exit 50m range
 * - Hologram floating nametags: "§e§lBANKER" & "§e§lCLICK"
 * - Right-click interaction: "§e[NPC] §6Banker§f: §cThis feature has not been made yet!"
 * - Left-click disabled (non-left clickable)
 */

import { getHubBlockStateId } from '../world/hubRegionProvider';
import { mcData1192, mcData1211 } from '../world/worldManager';
import { openBankMainMenu } from '../gui/bankMenu';
const nbt = require('prismarine-nbt');

export const BANKER_ENTITY_ID = 8888;
export const BANKER_HOLO_TITLE_ID = 8889;
export const BANKER_HOLO_CLICK_ID = 8890;

export const BANKER_UUID = '8b61a1a6-a2a2-4c10-9977-e1a3fc82e38f';
export const BANKER_HOLO_TITLE_UUID = 'a1a1a1a1-8889-4c10-9977-e1a3fc82e38f';
export const BANKER_HOLO_CLICK_UUID = 'b2b2b2b2-8890-4c10-9977-e1a3fc82e38f';

// Official signed Mojang texture for authentic Hypixel Banker (pinstripe charcoal suit, red tie, brown parted hair, blue eyes)
export const BANKER_SKIN_TEXTURE = 'ewogICJ0aW1lc3RhbXAiIDogMTYyMjMxMTAxOTE2NCwKICAicHJvZmlsZUlkIiA6ICJhYTZhNDA5NjU4YTk0MDIwYmU3OGQwN2JkMzVlNTg5MyIsCiAgInByb2ZpbGVOYW1lIiA6ICJiejE0IiwKICAic2lnbmF0dXJlUmVxdWlyZWQiIDogdHJ1ZSwKICAidGV4dHVyZXMiIDogewogICAgIlNLSU4iIDogewogICAgICAidXJsIiA6ICJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlLzNkMTI3NjUxMGE5MzZmYTRiYjA2MWIzMGQ4N2RlYjlmNGI4YjY0MGJiYjUwYTZkNzhkOTllOTIwZjBhMThiZmIiCiAgICB9CiAgfQp9';
export const BANKER_SKIN_SIGNATURE = 'k8mFqXCePwx37iVMFi/HjI+mFYC8zIfAZVuuHeyWQRE45spGSXBecbBckwWQi/pm0vJ3HPbhLIqJNjFIlB0WdXaU34XP1pMTqjBH6UHIGxDDYtbcXdPmQoJ3tRAWGNGZQXkvfA7SniQ2YN/RIzNZTkHeiqkDQgLYHKd1wcPVQal5tzdmOAXq9frqYnIg6XyZr9z+zz3a9+mHS+TAxa/2rCc1KcB+Len4GY9jsa2StQNiWE8HKvIpr8e1Jud14k88l7th9/zmNOdsqMHUoWgdlEUYYSGlsovl5uDIRPeNqPBzv5LpWtT4eLDdQNZPIxtmrtoilmEL6oB15sgn96IoQOobm/eErAtKGnBKI59lQ/g4X78qR/Os5ye/spVBu9ltYjzi+3qYdm5CjQsclTu6JtS4Bx5aKmJrB3ikSkk1QSYhST+z9N0+lkI/cf6IpEjdBnUv3hDXmEXG6YBr68/p4d2AZYklIB5dM1/jH56Ls9lf2XaHZ9DT+xsqiwLCU3vXrjTZjshTGR69pDIe7GingFtJ7p4Xo3CiylKNqnIQEpzRC0nDWhLrxCsF4WBrBBRYPPnnZzmuh09E2/DC5XMz9ZZqM+evRw2DzInkWKfrsUncsAx6Hoxfeu5xgsvMiHTS5P9r8bunPW8ytShiQGY5T3s1D41LU3A1ZE9R+uOMeac=';

export const BANKER_POS = {
  x: -24.5,
  y: 71.0,
  z: -58.5,
  yaw: -90.0, // Default facing: towards bank lobby counter entrance
  pitch: 0.0
};

// Player click cooldown tracker: client.id -> timestamp
const clickCooldowns = new Map<number, number>();

/**
 * Checks if a block state in the Hub occludes vision
 */
function isBlockOccluding(stateId: number): boolean {
  if (stateId === 0) return false;
  const b = mcData1192.blocksByStateId[stateId];
  if (!b) return false;
  const name = b.name;
  if (name === 'air' || name === 'cave_air' || name === 'void_air') return false;
  
  // Non-occluding or vision-permeable blocks
  if (
    name.includes('glass') ||
    name.includes('bars') ||
    name.includes('torch') ||
    name.includes('lantern') ||
    name.includes('flower') ||
    name.includes('grass') ||
    name.includes('fern') ||
    name.includes('sign') ||
    name.includes('banner') ||
    name.includes('button') ||
    name.includes('lever') ||
    name.includes('tripwire') ||
    name.includes('carpet') ||
    name === 'water'
  ) {
    return false;
  }
  return true;
}

/**
 * True 3D Voxel Raycasting Line-of-Sight check between Banker eyes and Player eyes
 * Returns true if ray reaches player without colliding with any solid occluding block.
 */
export function hasLineOfSight(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  maxDistance: number = 50.0
): boolean {
  const dx = targetX - eyeX;
  const dy = targetY - eyeY;
  const dz = targetZ - eyeZ;
  const dist = Math.hypot(dx, dy, dz);

  if (dist > maxDistance) return false;
  if (dist < 0.6) return true;

  // Step size: 0.25 blocks for precise voxel collision detection
  const steps = Math.ceil(dist / 0.25);
  const stepX = dx / steps;
  const stepY = dy / steps;
  const stepZ = dz / steps;

  let curX = eyeX + stepX * 2;
  let curY = eyeY + stepY * 2;
  let curZ = eyeZ + stepZ * 2;

  let lastBx = -999999;
  let lastBy = -999999;
  let lastBz = -999999;

  for (let i = 2; i < steps - 1; i++) {
    const bx = Math.floor(curX);
    const by = Math.floor(curY);
    const bz = Math.floor(curZ);

    if (bx !== lastBx || by !== lastBy || bz !== lastBz) {
      lastBx = bx;
      lastBy = by;
      lastBz = bz;

      const stateId = getHubBlockStateId(bx, by, bz);
      if (isBlockOccluding(stateId)) {
        return false; // Vision ray obstructed by solid block!
      }
    }

    curX += stepX;
    curY += stepY;
    curZ += stepZ;
  }

  return true;
}

/**
 * Spawns the Banker NPC and floating Hologram nametags for a player
 */
export function spawnBankerNpc(client: any, is119: boolean, toProtocolByte: (deg: number) => number): void {
  try {
    // 1.21.8 Player Info Update
    client.write('player_info', {
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
        uuid: BANKER_UUID,
        player: {
          name: 'BANKER',
          properties: [{
            name: 'textures',
            value: BANKER_SKIN_TEXTURE,
            signature: BANKER_SKIN_SIGNATURE
          }]
        },
        gamemode: 2,
        listed: 0,
        latency: 1,
        displayName: nbt.comp({ text: nbt.string('§fBanker') }),
        showHat: true
      }]
    });

    // 2. Spawn Banker Entity (1.21.8 player type = 149)
    client.write('spawn_entity', {
      entityId: BANKER_ENTITY_ID,
      objectUUID: BANKER_UUID,
      type: 149,
      x: BANKER_POS.x,
      y: BANKER_POS.y,
      z: BANKER_POS.z,
      pitch: toProtocolByte(BANKER_POS.pitch),
      yaw: toProtocolByte(BANKER_POS.yaw),
      headPitch: toProtocolByte(BANKER_POS.pitch),
      objectData: 0,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0
    });

    // 3. Set Head Rotation
    client.write('entity_head_rotation', {
      entityId: BANKER_ENTITY_ID,
      headYaw: toProtocolByte(BANKER_POS.yaw)
    });

    // 4. Entity Metadata: Show all skin layers
    client.write('entity_metadata', {
      entityId: BANKER_ENTITY_ID,
      metadata: [{ key: 17, type: 'byte', value: 127 }]
    });

    // 5. Hide Vanilla Nametag & Health Indicator
    try { client.write('teams', { team: 'npc_banker', mode: 'remove' }); } catch (_) {}
    client.write('teams', {
      team: 'npc_banker',
      mode: 'add',
      name: nbt.comp({ text: nbt.string('npc_banker') }),
      flags: { friendly_fire: true, see_friendly_invisible: true },
      nameTagVisibility: 'never',
      collisionRule: 'always',
      formatting: 14,
      prefix: nbt.comp({ text: nbt.string('') }),
      suffix: nbt.comp({ text: nbt.string('') }),
      players: ['BANKER']
    });

    // 6. Remove from tablist after 2 seconds
    setTimeout(() => {
      try {
        client.write('player_remove', {
          players: [BANKER_UUID]
        });
      } catch (_) {}
    }, 2000);

    // 7. Modern 1.21.8 Text Display Hologram (Billboard Mode, 0 Hitbox, Crisp Rendering)
    client.write('spawn_entity', {
      entityId: BANKER_HOLO_TITLE_ID,
      objectUUID: BANKER_HOLO_TITLE_UUID,
      type: 126, // text_display in 1.21.8
      x: BANKER_POS.x,
      y: BANKER_POS.y + 2.15,
      z: BANKER_POS.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: 0,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0
    });
    client.write('entity_metadata', {
      entityId: BANKER_HOLO_TITLE_ID,
      metadata: [
        { key: 23, type: 'byte', value: 3 }, // Center billboard mode
        { key: 27, type: 'component', value: nbt.comp({ text: nbt.string('§fBanker\n§e§lCLICK') }) },
        { key: 31, type: 'byte', value: 1 } // Shadow
      ]
    });
  } catch (_) {}
}

/**
 * Ticks the Banker NPC Line of Sight & Look Tracking
 * Checks each player's line of sight; if visible, turns Banker head and body towards them.
 */
export function tickBankerNpc(
  players: Map<any, any>,
  toProtocolByte: (deg: number) => number
): void {
  if (players.size === 0) return;

  const bankerEyeX = BANKER_POS.x;
  const bankerEyeY = BANKER_POS.y + 1.62;
  const bankerEyeZ = BANKER_POS.z;

  for (const [_, p] of players) {
    try {
      const pEyeX = p.x;
      const pEyeY = p.y + 1.62;
      const pEyeZ = p.z;

      const visible = hasLineOfSight(bankerEyeX, bankerEyeY, bankerEyeZ, pEyeX, pEyeY, pEyeZ, 50.0);

      let lookYaw = BANKER_POS.yaw;
      let lookPitch = BANKER_POS.pitch;

      if (visible) {
        const dx = pEyeX - bankerEyeX;
        const dy = pEyeY - bankerEyeY;
        const dz = pEyeZ - bankerEyeZ;
        const distHoriz = Math.hypot(dx, dz);

        lookYaw = Math.atan2(-dx, dz) * (180 / Math.PI);
        lookPitch = Math.atan2(-dy, Math.max(0.1, distHoriz)) * (180 / Math.PI);
      }

      // Rotate head smoothly
      p.client.write('entity_head_rotation', {
        entityId: BANKER_ENTITY_ID,
        headYaw: toProtocolByte(lookYaw)
      });

      // Rotate body & pitch
      p.client.write('entity_look', {
        entityId: BANKER_ENTITY_ID,
        yaw: toProtocolByte(lookYaw),
        pitch: toProtocolByte(lookPitch),
        onGround: true
      });
    } catch (_) {}
  }
}

/**
 * Handles clicks/interactions with the Banker NPC
 * Left-click (mouse === 1) is completely ignored (non-left clickable).
 * Right-click (mouse === 0 or mouse === 2) sends "This feature has not been made yet!"
 */
export function handleBankerInteraction(
  client: any,
  targetId: number,
  mouse: number,
  is119: boolean,
  sendSystemMsg: (client: any, msg: string, is119: boolean) => void,
  pData?: any
): boolean {
  if (targetId !== BANKER_ENTITY_ID && targetId !== BANKER_HOLO_TITLE_ID && targetId !== BANKER_HOLO_CLICK_ID) {
    return false;
  }

  // Mouse === 1 is Attack / Left Click -> Disallow (non left clickable)
  if (mouse === 1) {
    return true; // Absorbed, do nothing
  }

  // Mouse === 0 (Interact) or Mouse === 2 (Interact_At) -> Right Click
  if (mouse === 0 || mouse === 2) {
    const now = Date.now();
    const lastClick = clickCooldowns.get(client.id) || 0;
    if (now - lastClick < 600) {
      return true; // Debounce rapid double events
    }
    clickCooldowns.set(client.id, now);

    if (pData) {
      openBankMainMenu(client, pData);
    } else {
      sendSystemMsg(
        client,
        '§e[NPC] §6Banker§f: §cThis feature has not been made yet!',
        is119
      );
    }

    return true;
  }

  return false;
}
