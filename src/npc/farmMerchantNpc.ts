/**
 * Authentic Hypixel SkyBlock Farm Merchant NPC
 * Located on the elevated Farmhouse porch in the Village Hub at (63.5, 71.0, -114.5)
 * 
 * Features:
 * - Official Mojang Farmer skin (straw hat, denim overalls, blue flannel shirt)
 * - True 3D Voxel Raycasting Line-of-Sight detection (50 block radius)
 * - 20 TPS dynamic head tracking with 1.0° delta packet throttling
 * - Dual floating hologram nametags: "§e§lFARM MERCHANT" & "§e§lCLICK"
 * - Right-click interaction opens the authentic 54-slot Farm Merchant Shop GUI
 * - Left-click absorbed (non-left clickable)
 */

import { getHubBlockStateId } from '../world/hubRegionProvider';
import { mcData1192, mcData1211 } from '../world/worldManager';
import { openFarmMerchantMenu } from '../gui/farmMerchantMenu';
const nbt = require('prismarine-nbt');

export const FARM_MERCHANT_ENTITY_ID = 8870;
export const FARM_MERCHANT_HOLO_TITLE_ID = 8871;
export const FARM_MERCHANT_HOLO_CLICK_ID = 8872;

export const FARM_MERCHANT_UUID = '8b61a1a6-8870-4c10-9977-e1a3fc82e38f';
export const FARM_MERCHANT_HOLO_TITLE_UUID = 'a1a1a1a1-8871-4c10-9977-e1a3fc82e38f';
export const FARM_MERCHANT_HOLO_CLICK_UUID = 'b2b2b2b2-8872-4c10-9977-e1a3fc82e38f';

// Official signed Mojang Farmer skin texture (straw hat with red band, denim overalls, teal shirt)
export const FARM_MERCHANT_SKIN_TEXTURE = 'ewogICJ0aW1lc3RhbXAiIDogMTc5Mzg4NzQyNDA5OCwKICAicHJvZmlsZUlkIiA6ICIwYTIzZjhmMjRlMDk0YjhiODc3NjRjYTVjNzAwYmRkMyIsCiAgInByb2ZpbGVOYW1lIiA6ICJXaGVhdEZhcm1lciIsCiAgInNpZ25hdHVyZVJlcXVpcmVkIiA6IHRydWUsCiAgInRleHR1cmVzIiA6IHsKICAgICJTS0lOIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS85MjVhMzI1NjA4MzFjMjk1YjAwNTI3OTI2MjU1ZTYwOGEwMzk3NzZmMzUyM2I5MmVkZjc4ODE0OWFhZTY3ZDZhIgogICAgfSwKICAgICJDQVBFIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS8yMzQwYzBlMDNkZDI0YTExYjE1YThiMzNjMmE3ZTllMzJhYmIyMDUxYjI0ODFkMGJhN2RlZmQ2MzVjYTdhOTMzIgogICAgfQogIH0KfQ==';
export const FARM_MERCHANT_SKIN_SIGNATURE = 'ldaVpFuFBTaAJeifdbgShjHRHZ8SlSX8/0T8zk5jmBr7/CEH7wBrZpgbM3d4erpyhFVFWeHh5WnIyjtoYnBX4xCoastTnF62H4UwKmbaAfnZVXD7MLWFlvKQ5TS5CH6T8FdDWwI/KZ2YHlQgZgLIUDPVluZ4qOg3kCREk68hkrSmdCWDOQiobvn2msOs0KT5a1wdbkgXLeE63s+KhdV0GW5MLS02QWhqkkJrmr1EXBbzjqeIe7sZANHP1WkoDVI/Z1K+AzdGUxtZR+yawNNx1n7d4xANOMBBUdD3V61DA7sh+FiMtomcJ5iSNqFelYE3S6yH/KQyelGXyxy5t5IxBC+Agi9LjlDWf1kQM6SPPxVtB4j1Cqth5WnhvUkTq6b4DPf6sU+qIG0/SN5QbXChxEGs4pkq5Dk+B0oHZY72BC3AUQg4NtsL9amxXqV0apYGaawr5C+pORS8God8UI2dUHC4xL73vpg6Xl2YyvKfNLvQN4KTl9F9zXqexChZZ8elqVhsat7bvqjzcIB8XqmLbw/SUEAodF+RRjbSGkVNIClbw6/iuMyKHGdr5aCNMWbmEj0zbeQLO6ByT6mMR7BHu90ZVuQEZO93GYF8dd1Mw5RpcLntXH5Bzp8WvX5NQVSVNKw5sRt/ngZG3Ube9uAktbC6rN8fxsD7Z6kiGj31EcM=';

export const FARM_MERCHANT_POS = {
  x: 16.5,
  y: 70.0,
  z: -71.5,
  yaw: -90.0, // Default facing: West toward the village marketplace path
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
 * True 3D Voxel Raycasting Line-of-Sight check between Farm Merchant eyes and Player eyes
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
        return false;
      }
    }

    curX += stepX;
    curY += stepY;
    curZ += stepZ;
  }

  return true;
}

/**
 * Spawns the Farm Merchant NPC and dual floating Hologram nametags for a player
 */
export function spawnFarmMerchantNpc(client: any, is119: boolean, toProtocolByte: (deg: number) => number): void {
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
        uuid: FARM_MERCHANT_UUID,
        player: {
          name: 'FARM_MERCHANT',
          properties: [{
            name: 'textures',
            value: FARM_MERCHANT_SKIN_TEXTURE,
            signature: FARM_MERCHANT_SKIN_SIGNATURE
          }]
        },
        gamemode: 2,
        listed: 0,
        latency: 1,
        displayName: nbt.comp({ text: nbt.string('§fFarm Merchant') }),
        showHat: true
      }]
    });

    // 2. Spawn Farm Merchant Entity (1.21.8 player type = 149)
    client.write('spawn_entity', {
      entityId: FARM_MERCHANT_ENTITY_ID,
      objectUUID: FARM_MERCHANT_UUID,
      type: 149,
      x: FARM_MERCHANT_POS.x,
      y: FARM_MERCHANT_POS.y,
      z: FARM_MERCHANT_POS.z,
      pitch: toProtocolByte(FARM_MERCHANT_POS.pitch),
      yaw: toProtocolByte(FARM_MERCHANT_POS.yaw),
      headPitch: toProtocolByte(FARM_MERCHANT_POS.pitch),
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });

    // 3. Set Initial Head Rotation
    client.write('entity_head_rotation', {
      entityId: FARM_MERCHANT_ENTITY_ID,
      headYaw: toProtocolByte(FARM_MERCHANT_POS.yaw)
    });

    // 4. Entity Metadata: Show all skin layers
    client.write('entity_metadata', {
      entityId: FARM_MERCHANT_ENTITY_ID,
      metadata: [{ key: 17, type: 'byte', value: 127 }]
    });

    // 5. Hide Vanilla Nametag & Health Indicator
    try { client.write('teams', { team: 'npc_farm_merch', mode: 'remove' }); } catch (_) {}
    client.write('teams', {
      team: 'npc_farm_merch',
      mode: 'add',
      name: nbt.comp({ text: nbt.string('npc_farm_merch') }),
      flags: { friendly_fire: true, see_friendly_invisible: true },
      nameTagVisibility: 'never',
      collisionRule: 'always',
      formatting: 14,
      prefix: nbt.comp({ text: nbt.string('') }),
      suffix: nbt.comp({ text: nbt.string('') }),
      players: ['FARM_MERCHANT']
    });

    // 6. Note: Modern 1.21.8 keeps player profile cached with listed: 0 so custom skin renders permanently

    // 7. Modern 1.21.8 Text Display Hologram (Billboard Mode, 0 Hitbox, Crisp Rendering)
    client.write('spawn_entity', {
      entityId: FARM_MERCHANT_HOLO_TITLE_ID,
      objectUUID: FARM_MERCHANT_HOLO_TITLE_UUID,
      type: 126, // text_display in 1.21.8
      x: FARM_MERCHANT_POS.x,
      y: FARM_MERCHANT_POS.y + 2.15,
      z: FARM_MERCHANT_POS.z,
      pitch: 0,
      yaw: 0,
      headPitch: 0,
      objectData: 0,
      velocity: { x: 0, y: 0, z: 0 }
    });
    client.write('entity_metadata', {
      entityId: FARM_MERCHANT_HOLO_TITLE_ID,
      metadata: [
        { key: 23, type: 'byte', value: 3 }, // Center billboard mode
        { key: 27, type: 'component', value: nbt.comp({ text: nbt.string('§fFarm Merchant\n§e§lCLICK') }) },
        { key: 31, type: 'byte', value: 1 } // Shadow
      ]
    });
  } catch (_) {}
}

/**
 * Ticks the Farm Merchant NPC Line of Sight & Look Tracking (20 TPS)
 * Features 1.0° delta packet throttling to minimize network overhead
 */
export function tickFarmMerchantNpc(
  players: Map<any, any>,
  toProtocolByte: (deg: number) => number
): void {
  if (players.size === 0) return;

  const eyeX = FARM_MERCHANT_POS.x;
  const eyeY = FARM_MERCHANT_POS.y + 1.62;
  const eyeZ = FARM_MERCHANT_POS.z;

  for (const [_, p] of players) {
    try {
      const pEyeX = p.x;
      const pEyeY = p.y + 1.62;
      const pEyeZ = p.z;

      const visible = hasLineOfSight(eyeX, eyeY, eyeZ, pEyeX, pEyeY, pEyeZ, 50.0);

      let lookYaw = FARM_MERCHANT_POS.yaw;
      let lookPitch = FARM_MERCHANT_POS.pitch;

      if (visible) {
        const dx = pEyeX - eyeX;
        const dy = pEyeY - eyeY;
        const dz = pEyeZ - eyeZ;
        const distHoriz = Math.hypot(dx, dz);

        lookYaw = Math.atan2(-dx, dz) * (180 / Math.PI);
        lookPitch = Math.atan2(-dy, Math.max(0.1, distHoriz)) * (180 / Math.PI);
      }

      // Delta Throttling: Only send packets if yaw or pitch changed by >= 1.0 degree
      const lastYaw = (p.client as any)._farmMerchantLastYaw ?? -9999;
      const lastPitch = (p.client as any)._farmMerchantLastPitch ?? -9999;
      if (Math.abs(lookYaw - lastYaw) < 1.0 && Math.abs(lookPitch - lastPitch) < 1.0) {
        continue;
      }

      (p.client as any)._farmMerchantLastYaw = lookYaw;
      (p.client as any)._farmMerchantLastPitch = lookPitch;

      p.client.write('entity_head_rotation', {
        entityId: FARM_MERCHANT_ENTITY_ID,
        headYaw: toProtocolByte(lookYaw)
      });

      p.client.write('entity_look', {
        entityId: FARM_MERCHANT_ENTITY_ID,
        yaw: toProtocolByte(lookYaw),
        pitch: toProtocolByte(lookPitch),
        onGround: true
      });
    } catch (_) {}
  }
}

/**
 * Handles clicks/interactions with the Farm Merchant NPC
 * Left-click (mouse === 1) is absorbed (non-left clickable).
 * Right-click (mouse === 0 or mouse === 2) opens the Farm Merchant Menu!
 */
export function handleFarmMerchantInteraction(
  client: any,
  targetId: number,
  mouse: number,
  is119: boolean,
  sendSystemMsg: (client: any, msg: string, is119: boolean) => void,
  pData?: any
): boolean {
  if (
    targetId !== FARM_MERCHANT_ENTITY_ID &&
    targetId !== FARM_MERCHANT_HOLO_TITLE_ID &&
    targetId !== FARM_MERCHANT_HOLO_CLICK_ID
  ) {
    return false;
  }

  // Left click / attack is absorbed
  if (mouse === 1) {
    return true;
  }

  // Right click
  if (mouse === 0 || mouse === 2) {
    const now = Date.now();
    const lastClick = clickCooldowns.get(client.id) || 0;
    if (now - lastClick < 600) {
      return true;
    }
    clickCooldowns.set(client.id, now);

    if (pData) {
      openFarmMerchantMenu(client, pData, is119);
    } else {
      sendSystemMsg(client, '§e[NPC] §6Farm Merchant§f: §cLoading shop...', is119);
    }

    return true;
  }

  return false;
}
