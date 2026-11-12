/**
 * ZylarPixel Player Skin & Skull Texture Service
 * Caches and resolves custom player head skins from Mojang & Ashcon API
 * Automatically embeds texture payloads into player_head NBT for instant authentic rendering!
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { mcData1192 } from '../world/worldManager';
import { applyUniversalItemFlags } from '../items';

const SKINS_DIR = path.resolve(__dirname, '../../data/skins');
if (!fs.existsSync(SKINS_DIR)) {
  fs.mkdirSync(SKINS_DIR, { recursive: true });
}

// In-memory texture cache: lowercase username -> base64 texture string
const skinCache = new Map<string, string>();

// Load pre-existing cached skins from disk
try {
  const files = fs.readdirSync(SKINS_DIR);
  for (const f of files) {
    if (f.endsWith('.json')) {
      const name = f.replace('.json', '').toLowerCase();
      const content = fs.readFileSync(path.join(SKINS_DIR, f), 'utf-8');
      const data = JSON.parse(content);
      if (data && data.texture) {
        skinCache.set(name, data.texture);
      }
    }
  }
} catch (_) {}

export function getSkinTexture(username: string): string | undefined {
  if (!username) return undefined;
  return skinCache.get(username.toLowerCase());
}

export function setSkinTexture(username: string, textureBase64: string): void {
  if (!username || !textureBase64) return;
  const key = username.toLowerCase();
  skinCache.set(key, textureBase64);
  try {
    const filePath = path.join(SKINS_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ username, texture: textureBase64, timestamp: Date.now() }, null, 2));
  } catch (_) {}
}

export async function fetchAndCacheSkin(username: string): Promise<string | undefined> {
  if (!username || username.toLowerCase() === 'banker') return undefined;
  const key = username.toLowerCase();
  if (skinCache.has(key)) return skinCache.get(key);

  try {
    // 1. Try Mojang Official API
    const mojangProfileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
    if (mojangProfileRes.ok) {
      const profileData: any = await mojangProfileRes.json();
      if (profileData && profileData.id) {
        const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profileData.id}?unsigned=false`);
        if (sessionRes.ok) {
          const sessionData: any = await sessionRes.json();
          if (Array.isArray(sessionData.properties)) {
            const texProp = sessionData.properties.find((p: any) => p.name === 'textures');
            if (texProp && texProp.value) {
              setSkinTexture(username, texProp.value);
              return texProp.value;
            }
          }
        }
      }
    }

    // 2. Fallback to Ashcon API
    const ashconRes = await fetch(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(username)}`);
    if (ashconRes.ok) {
      const ashconData: any = await ashconRes.json();
      const val = ashconData?.textures?.raw?.value;
      if (val) {
        setSkinTexture(username, val);
        return val;
      }
    }
  } catch (_) {}

  return undefined;
}

/**
 * Creates an authentic player_head item with SkullOwner NBT
 * Embeds full texture payload if cached, or triggers background fetch while providing Name fallback!
 */
export function createPlayerSkullItem(
  username: string,
  displayName: string,
  loreArray: string[] = []
): any {
  const itemDef = mcData1192.itemsByName['player_head'] || { id: 938 };
  const loreStrings = loreArray.map(l => JSON.stringify({ text: l }));

  const cachedTexture = getSkinTexture(username);
  if (!cachedTexture) {
    // Fire-and-forget background fetch
    fetchAndCacheSkin(username).catch(() => {});
  }

  const nbtValue: any = {
    display: {
      type: 'compound',
      value: {
        Name: { type: 'string', value: JSON.stringify({ text: displayName }) },
        Lore: {
          type: 'list',
          value: {
            type: 'string',
            value: loreStrings
          }
        }
      }
    }
  };

  if (cachedTexture) {
    // Deterministic UUID for head texture rendering
    const hash = crypto.createHash('md5').update(`SkinHead:${username}`).digest();
    const intUuid = [
      hash.readInt32BE(0),
      hash.readInt32BE(4),
      hash.readInt32BE(8),
      hash.readInt32BE(12)
    ];

    nbtValue.SkullOwner = {
      type: 'compound',
      value: {
        Id: { type: 'intArray', value: intUuid },
        Name: { type: 'string', value: username },
        Properties: {
          type: 'compound',
          value: {
            textures: {
              type: 'list',
              value: {
                type: 'compound',
                value: [
                  {
                    Value: { type: 'string', value: cachedTexture }
                  }
                ]
              }
            }
          }
        }
      }
    };
  } else {
    // Vanilla Name-based resolution fallback
    nbtValue.SkullOwner = {
      type: 'compound',
      value: {
        Name: { type: 'string', value: username }
      }
    };
  }

  return applyUniversalItemFlags({
    present: true,
    itemId: itemDef.id,
    itemCount: 1,
    nbtData: {
      type: 'compound',
      name: '',
      value: nbtValue
    }
  }, true);
}
