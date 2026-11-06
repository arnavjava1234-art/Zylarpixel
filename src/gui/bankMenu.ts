/**
 * ZylarPixel Authentic Hypixel SkyBlock Bank GUI & Banking System
 * 
 * Features:
 * - 4-Row (36 slots / generic_9x4) Chest Containers matching Hypixel 1:1
 * - Main Bank Menu (Personal Bank Account) with Deposit, Withdraw, Transactions, Upgrades
 * - Last 8 persistent transactions with real timestamps and delta amounts
 * - Bank Deposit Submenu (Whole Purse 64, Half Purse 32, Custom Sign)
 * - Bank Withdrawal Submenu (Everything 64, Half 32, 20% 1, Custom Sign)
 * - Real Vanilla Oak Sign Editor GUI for custom coin input (open_sign_entity + update_sign)
 * - Supports k/K, m/M, b/B units, comma formatting, and decimal inputs
 * - Starter Bank capacity cap (50,000,000 coins) with overflow checks
 * - Bank Account Upgrades Submenu (Tiers 1-7 display with lore, click -> 'Feature not available yet')
 * - Instant access via SkyBlock Menu (Gold Block) & Hub Banker NPC with 0 cooldown and 0 requirements
 */

import { mcData1192, mcData1211 } from '../world/worldManager';
import { createGuiItem } from './statsMenu';
import { persistPlayerSession, sendSystemMessage } from '../players/playerManager';
import { updatePlayerScoreboardPurse } from '../core/scoreboard';
import { sendWindow } from './guiHelper';

export const BANK_MAIN_WINDOW_ID = 7;
export const BANK_DEPOSIT_WINDOW_ID = 8;
export const BANK_WITHDRAW_WINDOW_ID = 9;
export const BANK_UPGRADES_WINDOW_ID = 10;

export const STARTER_BANK_CAP = 50_000_000;

export interface BankTransaction {
  type: 'deposit' | 'withdraw';
  amount: number;
  timestamp: number;
}

/**
 * Format coin numbers with commas (e.g., 50,000,000)
 */
export function formatCoins(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '0';
  if (Number.isInteger(amount)) {
    return amount.toLocaleString('en-US');
  }
  return amount.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/**
 * Relative time formatter for transaction history
 */
export function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Parses user coin string supporting k/K, m/M, b/B, decimals, and commas
 * Examples: '0.5', '1.5', '500', '10k', '2.5m', '1B', '100,000'
 */
export function parseCoinInput(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s$]/g, '').trim().toLowerCase();
  if (!cleaned) return null;

  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) return null;

  const numPart = parseFloat(match[1]);
  if (isNaN(numPart) || numPart <= 0) return null;

  const multiplierChar = match[2];
  let multiplier = 1;
  if (multiplierChar === 'k') multiplier = 1_000;
  else if (multiplierChar === 'm') multiplier = 1_000_000;
  else if (multiplierChar === 'b') multiplier = 1_000_000_000;

  const total = Math.round(numPart * multiplier * 100) / 100;
  if (total <= 0 || !isFinite(total)) return null;
  return total;
}

/**
 * Plays a named sound effect at the player's position
 */
export function playSound(client: any, pData: any, soundName: string, pitch = 1.0, volume = 1.0): void {
  try {
    const x = Math.floor((pData.x || pData.pos?.x || 0) * 8);
    const y = Math.floor((pData.y || pData.pos?.y || 0) * 8);
    const z = Math.floor((pData.z || pData.pos?.z || 0) * 8);
    client.write('named_sound_effect', {
      soundName,
      soundCategory: 0,
      x,
      y,
      z,
      volume,
      pitch,
      seed: [0, 0]
    });
  } catch (_) {}
}

/**
 * Record a transaction into player's session and keep only recent 20
 */
export function recordTransaction(pData: any, type: 'deposit' | 'withdraw', amount: number): void {
  if (!Array.isArray(pData.bankTransactions)) {
    pData.bankTransactions = [];
  }
  pData.bankTransactions.push({
    type,
    amount,
    timestamp: Date.now()
  });
  if (pData.bankTransactions.length > 20) {
    pData.bankTransactions = pData.bankTransactions.slice(-20);
  }
}

// ==========================================
// 1. MAIN BANK MENU: "Personal Bank Account"
// ==========================================
export function openBankMainMenu(client: any, pData: any): void {
  pData.openWindowId = BANK_MAIN_WINDOW_ID;

  if (typeof pData.bank !== 'number') pData.bank = 0;
  if (typeof pData.purse !== 'number') pData.purse = 0;

  // 1. Base fillers: Dark Gray / Black Stained Glass Pane
  const items = new Array(36).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  // Slot 11: Deposit Coins
  items[11] = createGuiItem(
    'chest',
    1,
    '§aDeposit Coins',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      ' ',
      '§7Keep your coins safe in the bank!',
      '§7Earn §a2% §7interest every SkyBlock',
      '§7season (31 hours).',
      ' ',
      '§7Next interest in: §e18h 32m',
      `§7Estimated interest: §6+${formatCoins(Math.floor(pData.bank * 0.02))} coins`,
      ' ',
      '§eClick to deposit coins!'
    ]
  );

  // Slot 13: Withdraw Coins
  items[13] = createGuiItem(
    'dropper',
    1,
    '§aWithdraw Coins',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      ' ',
      '§7Take your coins out of the bank',
      '§7to spend them!',
      ' ',
      '§eClick to withdraw coins!'
    ]
  );

  // Slot 15: Recent Transactions (Show last 8 transactions)
  const txHistory: BankTransaction[] = (pData.bankTransactions || []).slice(-8).reverse();
  const txLore: string[] = ['§7Here are your last 8 transactions:'];
  if (txHistory.length === 0) {
    txLore.push(' ');
    txLore.push('§7No recent transactions!');
  } else {
    txLore.push(' ');
    for (const tx of txHistory) {
      const timeStr = formatTimeAgo(tx.timestamp);
      if (tx.type === 'deposit') {
        txLore.push(`§a+${formatCoins(tx.amount)} coins §7(Deposit, ${timeStr})`);
      } else {
        txLore.push(`§c-${formatCoins(tx.amount)} coins §7(Withdrawal, ${timeStr})`);
      }
    }
  }

  items[15] = createGuiItem('map', 1, '§aRecent transactions', txLore);

  // Slot 31: Close Barrier
  items[31] = createGuiItem('barrier', 1, '§cClose', ['§eClick to close!']);

  // Slot 32: Information
  items[32] = createGuiItem(
    'redstone_torch',
    1,
    '§aInformation',
    [
      '§7The Bank is a secure place to',
      '§7store your coins!',
      ' ',
      '§7• Earn interest every §e31 hours§7.',
      `§7• Bank limit: §6${formatCoins(STARTER_BANK_CAP)} coins§7.`,
      '§7• Upgrade your bank at the Bank Upgrades',
      '§7  menu to store even more coins!'
    ]
  );

  // Slot 35: Bank Upgrades
  items[35] = createGuiItem(
    'gold_block',
    1,
    '§6Bank Upgrades',
    [
      '§7Current Tier: §aStarter',
      `§7Max Account Coins: §6${formatCoins(STARTER_BANK_CAP)}`,
      ' ',
      '§7Upgrade your bank account to hold',
      '§7more coins and gain higher',
      '§7interest payouts!',
      ' ',
      '§eClick to view upgrades!'
    ]
  );

  pData.currentGuiItems = items;

  // 3. Write items to window
  try {
    client.write('window_items', {
      windowId: BANK_MAIN_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

// ==========================================
// 2. BANK DEPOSIT MENU: "Bank Deposit"
// ==========================================
export function openBankDepositMenu(client: any, pData: any): void {
  pData.openWindowId = BANK_DEPOSIT_WINDOW_ID;

  if (typeof pData.bank !== 'number') pData.bank = 0;
  if (typeof pData.purse !== 'number') pData.purse = 0;

  client.write('open_window', {
    windowId: BANK_DEPOSIT_WINDOW_ID,
    inventoryType: 3,
    windowTitle: JSON.stringify({ text: '§8Bank Deposit' })
  });

  const items = new Array(36).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  const wholePurse = Math.round(pData.purse * 100) / 100;
  const halfPurse = Math.round((pData.purse / 2) * 100) / 100;

  // Slot 11: Whole purse (Stack 64)
  items[11] = createGuiItem(
    'chest',
    64,
    '§aYour whole purse',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      `§7Amount to deposit: §6${formatCoins(wholePurse)} coins`,
      ' ',
      '§eClick to deposit whole purse!'
    ]
  );

  // Slot 13: Half purse (Stack 32)
  items[13] = createGuiItem(
    'chest',
    32,
    '§aHalf your purse',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      `§7Amount to deposit: §6${formatCoins(halfPurse)} coins`,
      ' ',
      '§eClick to deposit half purse!'
    ]
  );

  // Slot 15: Specific amount (Oak Sign)
  items[15] = createGuiItem(
    'oak_sign',
    1,
    '§aSpecific amount',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      ' ',
      '§eClick to deposit a custom amount!'
    ]
  );

  // Slot 31: Go Back Arrow
  items[31] = createGuiItem('arrow', 1, '§aGo Back', ['§7To Personal Bank Account']);

  pData.currentGuiItems = items;

  try {
    client.write('window_items', {
      windowId: BANK_DEPOSIT_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

// ==========================================
// 3. BANK WITHDRAWAL MENU: "Bank Withdrawal"
// ==========================================
export function openBankWithdrawMenu(client: any, pData: any): void {
  pData.openWindowId = BANK_WITHDRAW_WINDOW_ID;

  if (typeof pData.bank !== 'number') pData.bank = 0;
  if (typeof pData.purse !== 'number') pData.purse = 0;

  client.write('open_window', {
    windowId: BANK_WITHDRAW_WINDOW_ID,
    inventoryType: 3,
    windowTitle: JSON.stringify({ text: '§8Bank Withdrawal' })
  });

  const items = new Array(36).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  const wholeBank = Math.round(pData.bank * 100) / 100;
  const halfBank = Math.round((pData.bank / 2) * 100) / 100;
  const fifthBank = Math.round((pData.bank * 0.2) * 100) / 100;

  // Slot 10: Everything in the account (Stack 64)
  items[10] = createGuiItem(
    'dropper',
    64,
    '§aEverything in the account',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      `§7Amount to withdraw: §6${formatCoins(wholeBank)} coins`,
      ' ',
      '§eClick to withdraw everything!'
    ]
  );

  // Slot 12: Half the account (Stack 32)
  items[12] = createGuiItem(
    'dropper',
    32,
    '§aHalf the account',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      `§7Amount to withdraw: §6${formatCoins(halfBank)} coins`,
      ' ',
      '§eClick to withdraw half!'
    ]
  );

  // Slot 14: Withdraw 20% (Stack 1)
  items[14] = createGuiItem(
    'dropper',
    1,
    '§aWithdraw 20%',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      `§7Amount to withdraw: §6${formatCoins(fifthBank)} coins`,
      ' ',
      '§eClick to withdraw 20%!'
    ]
  );

  // Slot 16: Specific amount (Oak Sign)
  items[16] = createGuiItem(
    'oak_sign',
    1,
    '§aSpecific amount',
    [
      `§7Current balance: §6${formatCoins(pData.bank)} coins`,
      ' ',
      '§eClick to withdraw a custom amount!'
    ]
  );

  // Slot 31: Go Back Arrow
  items[31] = createGuiItem('arrow', 1, '§aGo Back', ['§7To Personal Bank Account']);

  pData.currentGuiItems = items;

  try {
    client.write('window_items', {
      windowId: BANK_WITHDRAW_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

// ==========================================
// 4. BANK UPGRADES MENU: "Bank Account Upgrades"
// ==========================================
export function openBankUpgradesMenu(client: any, pData: any): void {
  pData.openWindowId = BANK_UPGRADES_WINDOW_ID;

  client.write('open_window', {
    windowId: BANK_UPGRADES_WINDOW_ID,
    inventoryType: 3,
    windowTitle: JSON.stringify({ text: '§8Bank Account Upgrades' })
  });

  const items = new Array(36).fill(null).map(() =>
    createGuiItem('black_stained_glass_pane', 1, '§8 ', [])
  );

  // Slot 10: Starter Account (Current)
  items[10] = createGuiItem(
    'wheat_seeds',
    1,
    '§aStarter Account',
    [
      '§7Maximum Coins: §650,000,000',
      '§7Interest: §a2%',
      ' ',
      '§aCURRENT TIER'
    ]
  );

  // Slot 11: Gold Account
  items[11] = createGuiItem(
    'gold_nugget',
    1,
    '§6Gold Account',
    [
      '§7Maximum Coins: §6100,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§65,000,000 coins',
      '§a1x Enchanted Gold Block',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 12: Deluxe Account
  items[12] = createGuiItem(
    'gold_ingot',
    1,
    '§6Deluxe Account',
    [
      '§7Maximum Coins: §6250,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§610,000,000 coins',
      '§a5x Enchanted Gold Blocks',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 13: Super Deluxe Account
  items[13] = createGuiItem(
    'golden_chestplate',
    1,
    '§6Super Deluxe Account',
    [
      '§7Maximum Coins: §6500,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§625,000,000 coins',
      '§a20x Enchanted Gold Blocks',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 14: Premier Account
  items[14] = createGuiItem(
    'golden_horse_armor',
    1,
    '§5Premier Account',
    [
      '§7Maximum Coins: §61,000,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§650,000,000 coins',
      '§a50x Enchanted Gold Blocks',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 15: Luxurious Account
  items[15] = createGuiItem(
    'nether_star',
    1,
    '§dLuxurious Account',
    [
      '§7Maximum Coins: §66,000,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§6200,000,000 coins',
      '§a10x Enchanted Gold Blocks',
      '§cRequires Museum Rank',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 16: Palatial Account
  items[16] = createGuiItem(
    'nether_star',
    1,
    '§cPalatial Account',
    [
      '§7Maximum Coins: §660,000,000,000',
      '§7Interest: §a2%',
      ' ',
      '§7Cost:',
      '§61,000,000,000 coins',
      '§cRequires Museum Rank',
      ' ',
      '§eClick to upgrade!'
    ]
  );

  // Slot 31: Go Back Arrow
  items[31] = createGuiItem('arrow', 1, '§aGo Back', ['§7To Personal Bank Account']);

  pData.currentGuiItems = items;

  try {
    client.write('window_items', {
      windowId: BANK_UPGRADES_WINDOW_ID,
      stateId: 1,
      items,
      carriedItem: { present: false }
    });
  } catch (_) {}
}

// ==========================================
// 5. REAL VANILLA OAK SIGN GUI LOGIC
// ==========================================
export function promptOakSignGui(client: any, pData: any, type: 'deposit' | 'withdraw'): void {
  // 1. Close active container first
  pData.openWindowId = 0;
  pData.currentGuiItems = null;
  try {
    client.write('close_window', { windowId: type === 'deposit' ? BANK_DEPOSIT_WINDOW_ID : BANK_WITHDRAW_WINDOW_ID });
  } catch (_) {}

  // 2. Clear any lingering sign timeout/prompt
  if (pData.pendingSignPrompt && pData.pendingSignPrompt.timeout) {
    clearTimeout(pData.pendingSignPrompt.timeout);
    restoreSignBlock(client, pData, pData.pendingSignPrompt.location);
  }

  // 3. Choose a block location deep underground at bedrock (100% invisible to the player!)
  const loc = {
    x: Math.floor(pData.x || pData.pos?.x || 0),
    y: 1,
    z: Math.floor(pData.z || pData.pos?.z || 0)
  };

  const is119 = pData.is119;
  const signBlockStateId = is119 ? 3637 : 4303; // oak_sign default state

  // 4. Send fake block change so the client's world registers an oak_sign at loc
  try {
    client.write('block_change', {
      location: loc,
      type: signBlockStateId
    });
  } catch (_) {}

  // 5. Send open_sign_entity packet to display the full-screen wooden Oak Sign editor!
  try {
    if (is119) {
      client.write('open_sign_entity', { location: loc });
    } else {
      client.write('open_sign_entity', { location: loc, isFrontText: true });
    }
  } catch (_) {}

  // 6. Set timeout to safely restore block if player disconnects or client drops packet
  const safetyTimeout = setTimeout(() => {
    if (pData.pendingSignPrompt && pData.pendingSignPrompt.location) {
      restoreSignBlock(client, pData, pData.pendingSignPrompt.location);
      pData.pendingSignPrompt = null;
    }
  }, 45000);

  pData.pendingSignPrompt = {
    type,
    location: loc,
    timeout: safetyTimeout
  };
}

export function restoreSignBlock(client: any, pData: any, loc: { x: number; y: number; z: number }): void {
  try {
    client.write('block_change', {
      location: loc,
      type: 0 // Air block
    });
  } catch (_) {}
}

/**
 * Handles incoming update_sign packet when player clicks Done or Escapes
 */
export function handleSignUpdate(
  client: any,
  pData: any,
  data: any,
  is119: boolean
): void {
  const prompt = pData.pendingSignPrompt;
  if (!prompt) return;

  if (prompt.timeout) {
    clearTimeout(prompt.timeout);
  }
  pData.pendingSignPrompt = null;

  // 1. Immediately restore the fake block back to Air
  restoreSignBlock(client, pData, prompt.location);

  // 2. Extract and concatenate lines entered by the player
  const rawLines = [data.text1, data.text2, data.text3, data.text4]
    .map(t => (typeof t === 'string' ? t.trim() : ''))
    .filter(t => t.length > 0);

  const fullText = rawLines.join('');
  const amount = parseCoinInput(fullText);

  // 3. Validation: If empty, escaped, or invalid syntax
  if (amount === null || amount <= 0) {
    playSound(client, pData, 'entity.villager.no', 1.0);
    sendSystemMessage(client, '§cThat is an invalid amount of coins!', is119);
    openBankMainMenu(client, pData);
    return;
  }

  if (typeof pData.bank !== 'number') pData.bank = 0;
  if (typeof pData.purse !== 'number') pData.purse = 0;

  // 4. Execution for DEPOSIT
  if (prompt.type === 'deposit') {
    if (amount > pData.purse) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMessage(client, '§cYou do not have enough coins in your purse!', is119);
      openBankDepositMenu(client, pData);
      return;
    }

    if (pData.bank + amount > STARTER_BANK_CAP) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMessage(client, '§cYou dont have enough space in bank to deposit the coins!', is119);
      openBankDepositMenu(client, pData);
      return;
    }

    pData.purse = Math.round((pData.purse - amount) * 100) / 100;
    pData.bank = Math.round((pData.bank + amount) * 100) / 100;
    recordTransaction(pData, 'deposit', amount);
    persistPlayerSession(pData);
    updatePlayerScoreboardPurse(pData);

    playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
    sendSystemMessage(
      client,
      `§a[Banker] Deposited §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
      is119
    );
    openBankMainMenu(client, pData);
    return;
  }

  // 5. Execution for WITHDRAWAL
  if (prompt.type === 'withdraw') {
    if (amount > pData.bank) {
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMessage(client, '§cYou do not have that many coins in your bank account!', is119);
      openBankWithdrawMenu(client, pData);
      return;
    }

    pData.bank = Math.round((pData.bank - amount) * 100) / 100;
    pData.purse = Math.round((pData.purse + amount) * 100) / 100;
    recordTransaction(pData, 'withdraw', amount);
    persistPlayerSession(pData);
    updatePlayerScoreboardPurse(pData);

    playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
    sendSystemMessage(
      client,
      `§a[Banker] Withdrew §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
      is119
    );
    openBankMainMenu(client, pData);
    return;
  }
}

// ==========================================
// 6. WINDOW CLICK DISPATCHER
// ==========================================
export function handleBankClick(
  client: any,
  pData: any,
  windowId: number,
  clickedSlot: number,
  is119: boolean
): boolean {
  if (typeof pData.bank !== 'number') pData.bank = 0;
  if (typeof pData.purse !== 'number') pData.purse = 0;

  // 1. MAIN BANK MENU (WindowId = 7)
  if (windowId === BANK_MAIN_WINDOW_ID) {
    if (clickedSlot === 11) {
      // Deposit Coins
      playSound(client, pData, 'random.click', 1.0);
      openBankDepositMenu(client, pData);
      return true;
    }
    if (clickedSlot === 13) {
      // Withdraw Coins
      playSound(client, pData, 'random.click', 1.0);
      openBankWithdrawMenu(client, pData);
      return true;
    }
    if (clickedSlot === 35) {
      // Bank Upgrades
      playSound(client, pData, 'random.click', 1.0);
      openBankUpgradesMenu(client, pData);
      return true;
    }
    if (clickedSlot === 31) {
      // Close Barrier
      pData.openWindowId = 0;
      pData.currentGuiItems = null;
      playSound(client, pData, 'random.chestclosed', 1.0);
      try {
        client.write('close_window', { windowId: BANK_MAIN_WINDOW_ID });
      } catch (_) {}
      return true;
    }
    return true; // Absorb other clicks
  }

  // 2. BANK DEPOSIT MENU (WindowId = 8)
  if (windowId === BANK_DEPOSIT_WINDOW_ID) {
    if (clickedSlot === 31) {
      // Go Back
      playSound(client, pData, 'random.click', 1.0);
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 11) {
      // Whole purse
      const amount = Math.round(pData.purse * 100) / 100;
      if (amount <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou do not have any coins to deposit!', is119);
        return true;
      }
      if (pData.bank + amount > STARTER_BANK_CAP) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou dont have enough space in bank to deposit the coins!', is119);
        return true;
      }

      pData.purse = Math.round((pData.purse - amount) * 100) / 100;
      pData.bank = Math.round((pData.bank + amount) * 100) / 100;
      recordTransaction(pData, 'deposit', amount);
      persistPlayerSession(pData);
      updatePlayerScoreboardPurse(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
      sendSystemMessage(
        client,
        `§a[Banker] Deposited §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
        is119
      );
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 13) {
      // Half purse
      const amount = Math.round((pData.purse / 2) * 100) / 100;
      if (amount <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou do not have any coins to deposit!', is119);
        return true;
      }
      if (pData.bank + amount > STARTER_BANK_CAP) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou dont have enough space in bank to deposit the coins!', is119);
        return true;
      }

      pData.purse = Math.round((pData.purse - amount) * 100) / 100;
      pData.bank = Math.round((pData.bank + amount) * 100) / 100;
      recordTransaction(pData, 'deposit', amount);
      persistPlayerSession(pData);
      updatePlayerScoreboardPurse(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
      sendSystemMessage(
        client,
        `§a[Banker] Deposited §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
        is119
      );
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 15) {
      // Specific amount -> Real Oak Sign GUI!
      playSound(client, pData, 'random.click', 1.0);
      promptOakSignGui(client, pData, 'deposit');
      return true;
    }

    return true;
  }

  // 3. BANK WITHDRAWAL MENU (WindowId = 9)
  if (windowId === BANK_WITHDRAW_WINDOW_ID) {
    if (clickedSlot === 31) {
      // Go Back
      playSound(client, pData, 'random.click', 1.0);
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 10) {
      // Everything in the account
      const amount = Math.round(pData.bank * 100) / 100;
      if (amount <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou do not have that many coins in your bank account!', is119);
        return true;
      }

      pData.bank = 0;
      pData.purse = Math.round((pData.purse + amount) * 100) / 100;
      recordTransaction(pData, 'withdraw', amount);
      persistPlayerSession(pData);
      updatePlayerScoreboardPurse(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
      sendSystemMessage(
        client,
        `§a[Banker] Withdrew §6${formatCoins(amount)} coins§a! Your new balance is §60 coins§a.`,
        is119
      );
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 12) {
      // Half the account
      const amount = Math.round((pData.bank / 2) * 100) / 100;
      if (amount <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou do not have that many coins in your bank account!', is119);
        return true;
      }

      pData.bank = Math.round((pData.bank - amount) * 100) / 100;
      pData.purse = Math.round((pData.purse + amount) * 100) / 100;
      recordTransaction(pData, 'withdraw', amount);
      persistPlayerSession(pData);
      updatePlayerScoreboardPurse(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
      sendSystemMessage(
        client,
        `§a[Banker] Withdrew §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
        is119
      );
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 14) {
      // Withdraw 20%
      const amount = Math.round((pData.bank * 0.2) * 100) / 100;
      if (amount <= 0) {
        playSound(client, pData, 'entity.villager.no', 1.0);
        sendSystemMessage(client, '§cYou do not have that many coins in your bank account!', is119);
        return true;
      }

      pData.bank = Math.round((pData.bank - amount) * 100) / 100;
      pData.purse = Math.round((pData.purse + amount) * 100) / 100;
      recordTransaction(pData, 'withdraw', amount);
      persistPlayerSession(pData);
      updatePlayerScoreboardPurse(pData);

      playSound(client, pData, 'entity.experience_orb.pickup', 1.0);
      sendSystemMessage(
        client,
        `§a[Banker] Withdrew §6${formatCoins(amount)} coins§a! Your new balance is §6${formatCoins(pData.bank)} coins§a.`,
        is119
      );
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot === 16) {
      // Specific amount -> Real Oak Sign GUI!
      playSound(client, pData, 'random.click', 1.0);
      promptOakSignGui(client, pData, 'withdraw');
      return true;
    }

    return true;
  }

  // 4. BANK UPGRADES MENU (WindowId = 10)
  if (windowId === BANK_UPGRADES_WINDOW_ID) {
    if (clickedSlot === 31) {
      // Go Back
      playSound(client, pData, 'random.click', 1.0);
      openBankMainMenu(client, pData);
      return true;
    }

    if (clickedSlot >= 10 && clickedSlot <= 16) {
      // Upgrade tiers: feature not available yet!
      playSound(client, pData, 'entity.villager.no', 1.0);
      sendSystemMessage(client, '§cThis feature is not available yet!', is119);
      return true;
    }

    return true;
  }

  return false;
}
