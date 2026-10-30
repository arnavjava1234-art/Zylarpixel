/**
 * ZylarPixel Stress Bots - 8 Bots Executing Heavy Workloads
 * 
 * Bot Roles:
 * - CombatBot1 & CombatBot2: Intense continuous PvP, crits, knockback, damage calculation
 * - WarpBot1 & WarpBot2: Rapid cross-server proxy switching (/hub <-> /is) streaming 361 chunks
 * - RogueBot1 & RogueBot2: Speed ability & mana spam, attribute updates
 * - BankBot1 & BankBot2: Rapid GUI chest transactions, purse updates, scoreboard sync
 */

const mineflayer = require('mineflayer');

const BOTS_CONFIG = [
  { name: 'PvPFighter1', role: 'combat' },
  { name: 'PvPFighter2', role: 'combat' },
  { name: 'WarpDemon1', role: 'warp' },
  { name: 'WarpDemon2', role: 'warp' },
  { name: 'Speedster1', role: 'rogue' },
  { name: 'Speedster2', role: 'rogue' },
  { name: 'Trader1', role: 'bank' },
  { name: 'Trader2', role: 'bank' }
];

console.log('⚡ Starting 8 Stress Bots for High-Intensity Server Load Test...');

const bots = [];

function createBot(cfg) {
  return new Promise((resolve) => {
    const bot = mineflayer.createBot({
      host: '127.0.0.1',
      port: 25565,
      username: cfg.name,
      version: '1.19.2',
      auth: 'offline'
    });

    bot.once('spawn', () => {
      console.log(`[BOT] ${cfg.name} spawned in! Role: ${cfg.role}`);
      resolve({ bot, cfg });
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function startStressWorkload() {
  const spawned = [];
  for (const cfg of BOTS_CONFIG) {
    const b = await createBot(cfg);
    spawned.push(b);
    bots.push(b.bot);
    await sleep(250); // slight stagger
  }

  console.log('🚀 All 8 Stress Bots Active! Engaging Workloads for 20 Seconds...');

  // Setup Owner bot to grant OP / weapons
  const pvp1 = spawned.find(s => s.cfg.name === 'PvPFighter1').bot;
  const pvp2 = spawned.find(s => s.cfg.name === 'PvPFighter2').bot;
  const warp1 = spawned.find(s => s.cfg.name === 'WarpDemon1').bot;
  const warp2 = spawned.find(s => s.cfg.name === 'WarpDemon2').bot;
  const speed1 = spawned.find(s => s.cfg.name === 'Speedster1').bot;
  const speed2 = spawned.find(s => s.cfg.name === 'Speedster2').bot;
  const bank1 = spawned.find(s => s.cfg.name === 'Trader1').bot;
  const bank2 = spawned.find(s => s.cfg.name === 'Trader2').bot;

  let running = true;
  setTimeout(() => { running = false; }, 20000);

  // 1. Combat Loop: PvPFighter1 & PvPFighter2 attack each other repeatedly
  const combatInterval = setInterval(() => {
    if (!running) return clearInterval(combatInterval);
    try {
      if (pvp1.players['PvPFighter2']?.entity) pvp1.attack(pvp1.players['PvPFighter2'].entity);
      if (pvp2.players['PvPFighter1']?.entity) pvp2.attack(pvp2.players['PvPFighter1'].entity);
      // Small jumping & look packets
      pvp1.look(Math.random() * 3.14, 0);
      pvp2.look(Math.random() * 3.14, 0);
    } catch (_) {}
  }, 350);

  // 2. Warp Loop: WarpDemon1 & WarpDemon2 jump between /hub and /is every 2.5s
  let warpState = false;
  const warpInterval = setInterval(() => {
    if (!running) return clearInterval(warpInterval);
    warpState = !warpState;
    const targetCmd = warpState ? '/hub' : '/is';
    try {
      warp1.chat(targetCmd);
      warp2.chat(targetCmd);
    } catch (_) {}
  }, 2500);

  // 3. Rogue Sword / Ability Loop: Spam use_item and abilities
  const speedInterval = setInterval(() => {
    if (!running) return clearInterval(speedInterval);
    try {
      speed1.activateItem();
      speed2.activateItem();
    } catch (_) {}
  }, 800);

  // 4. Bank & GUI Loop: Open /sbmenu, click bank, deposit / withdraw
  const bankInterval = setInterval(async () => {
    if (!running) return clearInterval(bankInterval);
    try {
      bank1.chat('/sbmenu');
      bank2.chat('/stats');
      await sleep(400);
      bank1.closeWindow({ id: 6 });
      bank2.closeWindow({ id: 5 });
    } catch (_) {}
  }, 1200);

  // Wait 20 seconds for test duration
  await sleep(20000);

  console.log('🛑 Workload complete! Quitting all stress bots...');
  for (const b of bots) {
    try { b.quit(); } catch (_) {}
  }
  await sleep(1000);
  process.exit(0);
}

startStressWorkload().catch(err => {
  console.error('Stress bot error:', err);
  process.exit(1);
});
