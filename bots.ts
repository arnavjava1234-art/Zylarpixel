/**
 * ZylarPixel Mineflayer Bot Swarm
 * Spawns 5 bots:
 *  - 3 bots stationed in the Village Hub (Village_Alex, Village_Kai, Village_Sam)
 *    -> Actively follow ARNAVJAVA while in range, maintaining a 3-block radius!
 *  - 2 bots stationed on their Private Islands (Island_Leo, Island_Mia)
 * They stay connected and populate the global network tablist!
 */

import mineflayer from 'mineflayer';
// @ts-ignore
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
// @ts-ignore
import minecraftData from 'minecraft-data';

const { GoalFollow } = goals;

interface BotConfig {
  name: string;
  target: 'hub' | 'islands';
}

const BOT_CONFIGS: BotConfig[] = [
  { name: 'Village_Alex', target: 'hub' },
  { name: 'Village_Kai', target: 'hub' },
  { name: 'Village_Sam', target: 'hub' },
  { name: 'Island_Leo', target: 'islands' },
  { name: 'Island_Mia', target: 'islands' },
];

const activeBots = new Map<string, any>();

function startBot(config: BotConfig, delayMs: number) {
  setTimeout(() => {
    createBotInstance(config);
  }, delayMs);
}

function createBotInstance(config: BotConfig) {
  console.log(`🤖 Starting bot [${config.name}] (Destination: ${config.target})...`);

  let hasWarped = false;
  let isAlive = true;
  let followInterval: any = null;

  const bot = mineflayer.createBot({
    host: '127.0.0.1',
    port: 25565,
    username: config.name,
    version: '1.21.8',
    auth: 'offline',
    checkTimeoutInterval: 120000
  });

  activeBots.set(config.name, bot);

  bot.on('login', () => {
    console.log(`✅ [${config.name}] Logged into Proxy.`);
  });

  bot.on('spawn', () => {
    console.log(`📍 [${config.name}] Spawned in world! Position: (${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)})`);

    if (config.target === 'islands' && !hasWarped) {
      hasWarped = true;
      setTimeout(() => {
        if (!isAlive) return;
        console.log(`🏝️ [${config.name}] Warping to Private Island via /is...`);
        try {
          bot.chat('/is');
        } catch (err: any) {
          console.warn(`⚠️ [${config.name}] Failed to send /is:`, err.message);
        }
      }, 3000);
    }

    // Hub bots actively follow ARNAVJAVA while in range, maintaining a 3-block radius
    if (config.target === 'hub') {
      try {
        bot.loadPlugin(pathfinder);
        const mcData = minecraftData(bot.version || '1.21.8');
        const defaultMove = new Movements(bot, mcData);
        defaultMove.canDig = false;
        defaultMove.allow1by1towers = false;
        defaultMove.allowParkour = true;
        defaultMove.allowSprinting = true;
        bot.pathfinder.setMovements(defaultMove);
        console.log(`🧭 [${config.name}] Pathfinder active! Tracking ARNAVJAVA...`);
      } catch (err: any) {
        console.warn(`⚠️ [${config.name}] Pathfinder init error:`, err.message);
      }

      if (!followInterval) {
        followInterval = setInterval(() => {
          if (!isAlive || !bot.entity || !bot.pathfinder) return;

          // Priority: 1. ARNAVJAVA -> 2. chuchichan -> 3. other real players
          let targetEntity: any = null;
          let targetName = '';

          for (const name in bot.players) {
            if (name.toLowerCase() === 'arnavjava') {
              const p = bot.players[name];
              if (p && p.entity) { targetEntity = p.entity; targetName = name; break; }
            }
          }
          if (!targetEntity) {
            for (const name in bot.players) {
              if (name.toLowerCase() === 'chuchichan') {
                const p = bot.players[name];
                if (p && p.entity) { targetEntity = p.entity; targetName = name; break; }
              }
            }
          }
          if (!targetEntity) {
            for (const name in bot.players) {
              if (!name.startsWith('Village_') && !name.startsWith('Island_')) {
                const p = bot.players[name];
                if (p && p.entity) { targetEntity = p.entity; targetName = name; break; }
              }
            }
          }

          if (targetEntity) {
            const dist = bot.entity.position.distanceTo(targetEntity.position);
            // In range (within 40 blocks) -> actively follow maintaining 3 block radius
            if (dist <= 40) {
              // Face player when close
              if (dist <= 3.5) {
                try {
                  bot.lookAt(targetEntity.position.offset(0, 1.6, 0));
                } catch (_) {}
              }
              const currentGoal = bot.pathfinder.goal;
              if (!currentGoal || !(currentGoal instanceof GoalFollow) || (currentGoal as any).entity !== targetEntity) {
                console.log(`🏃 [${config.name}] Following ${targetName} (Distance: ${dist.toFixed(1)} blocks, radius: 3)`);
                try {
                  bot.pathfinder.setGoal(new GoalFollow(targetEntity, 3), true);
                } catch (_) {}
              }
            } else {
              // Out of range (> 40 blocks) -> idle
              if (bot.pathfinder.goal) {
                try {
                  bot.pathfinder.setGoal(null);
                } catch (_) {}
              }
            }
          } else {
            if (bot.pathfinder.goal) {
              try {
                bot.pathfinder.setGoal(null);
              } catch (_) {}
            }
          }
        }, 1000);
      }
    }
  });

  bot.on('kicked', (reason: any) => {
    console.log(`⚠️ [${config.name}] Kicked:`, typeof reason === 'object' ? JSON.stringify(reason) : reason);
  });

  bot.on('error', (err: any) => {
    console.warn(`⚠️ [${config.name}] Error:`, err.message);
  });

  bot.on('end', () => {
    isAlive = false;
    if (followInterval) {
      clearInterval(followInterval);
      followInterval = null;
    }
    activeBots.delete(config.name);
    console.log(`❌ [${config.name}] Disconnected. Reconnecting in 5 seconds...`);
    setTimeout(() => {
      createBotInstance(config);
    }, 5000);
  });
}

// Stagger bot logins by 1.5 seconds each
console.log('🚀 Spawning 5 Mineflayer Bots with Active Follow AI for ZylarPixel Network...');
BOT_CONFIGS.forEach((cfg, index) => {
  startBot(cfg, index * 1500);
});

// Clean shutdown on Ctrl+C or process exit
process.on('SIGINT', () => {
  console.log('🛑 Shutting down bots...');
  for (const bot of activeBots.values()) {
    try { bot.quit(); } catch (_) {}
  }
  process.exit(0);
});
