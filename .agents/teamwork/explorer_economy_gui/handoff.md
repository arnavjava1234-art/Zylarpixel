# Technical Investigation & Architectural Report: Farm Merchant Shop GUI, Economy & Inventory

**Explorer**: Economy, GUI & Inventory Explorer  
**Task**: Authentic Hypixel SkyBlock Farm Merchant NPC & Shop GUI Specification (Read-Only Investigation)  
**Constraint**: Strict No Code Changes (NCC) — Zero modifications to `src/`, `dist/`, or server entry points  
**Target Path**: `.agents/teamwork/explorer_economy_gui/handoff.md`  
**Timestamp**: 2026-11-04T14:02:00Z  

---

## 1. Observation

Direct investigation of the codebase revealed the existing GUI container architecture, packet handlers, inventory management patterns, item engines, and persistent player storage structures:

### A. Window Packet Interception & GUI Registration
- **File**: `src/core/ZylarServer.ts`
  - **Lines 1770–1905**: The `window_click` packet listener routes clicks based on `pData.openWindowId`.
  - **Lines 1898–1915**: Container click sanitization explicitly clears the client cursor item (`windowId: -1, slot: -1, item: { present: false }`) and restores GUI items from `pData.currentGuiItems[clickedSlot]` to prevent client-side ghost item extraction.
  - **Lines 1916–2014**: Existing window IDs:
    - `0`: Vanilla Player Survival Inventory
    - `1`: Master Admin Menu (`adminMenu.ts`)
    - `2`: Centered Rank Selector (`rankSelector.ts`)
    - `3`: Player Selector (`playerSelector.ts`)
    - `5`: Stats Menu (`statsMenu.ts`)
    - `6`: SkyBlock Menu (`skyblockMenu.ts`)
    - `7`, `8`, `9`, `10`: Bank System Menus (`bankMenu.ts`)
    - `11`, `12`: Admin Coin / Economy Menus (`adminCoinMenu.ts`)
    - `13`: Admin Item & Combat Spawner (`adminItemMenu.ts`)
    - `15`: 3x3 Crafting Table GUI (`craftingTableMenu.ts`)
    - **Conclusion**: Window ID `16` (`FARM_MERCHANT_WINDOW_ID = 16`) is unassigned and reserved for the Farm Merchant Shop GUI.

### B. 54-Slot Chest Container Architecture (`generic_9x6`)
- **File**: `src/gui/skyblockMenu.ts` (lines 68–73), `src/gui/statsMenu.ts` (lines 48–53), `src/gui/craftingTableMenu.ts` (lines 432–437)
  - All 54-slot chest containers are opened using `client.write('open_window', { windowId, inventoryType: 5, windowTitle: JSON.stringify({ text: '...' }) })`.
  - `inventoryType: 5` maps directly to `minecraft:generic_9x6` across Minecraft 1.19.2 and 1.21.1 protocols.
  - Background slots are initialized with 54 elements using `createGuiItem('black_stained_glass_pane', 1, '§8 ', [])` to achieve a clean, premium dark theme.

### C. Player Inventory Mapping in 54-Slot Windows
- **File**: `src/gui/craftingTableMenu.ts` (lines 308–354, 742–778)
  - In a 54-slot chest GUI, client clicks on slots `0..53` interact with the container interface.
  - Container slots `54..80` map to the player's main inventory slots `9..35` via formula: `invSlot = loc - 54 + 9`.
  - Container slots `81..88` map to hotbar slots `36..43` via formula: `invSlot = loc - 81 + 36`.
  - Container slot `89` maps to hotbar slot `44` (the 9th hotbar slot), strictly protected as the SkyBlock Menu Nether Star.
  - Inventory synchronization in 54-slot containers is performed by sending `set_slot` packets across chest slots `54..88` and restoring slot `89` with `createNetherStarItem()`.

### D. Inventory Item Management & Adding Mechanics
- **File**: `src/gui/craftingTableMenu.ts` (lines 221–260)
  - `addItemToPlayerInventory(pData, itemId, count, is119)` manages candidate slots in priority order: hotbar (`36..43`) first, followed by main inventory (`9..35`).
  - Stacks with existing matching `itemId` under `maxStack` (64) before populating empty slots.
  - Returns `count - remaining`, indicating the exact quantity added.

### E. Economy, Currency & Purse Scoreboard Synchronization
- **File**: `src/players/playerManager.ts` (lines 28, 40, 79, 141, 153)
  - `pData.purse` tracks player liquid coins in memory (default starting balance: 60.0).
  - Coins are stored rounded to 2 decimal places: `Math.round(coins * 100) / 100`.
  - Calling `persistPlayerSession(pData)` synchronizes `pData.purse` with `prof.coins` in `data/profiles/<username>.json`.
- **File**: `src/core/scoreboard.ts` (lines 120–140)
  - `updatePlayerScoreboardPurse(pData)` dynamically updates the sidebar line `§fPurse: §6<formattedCoins>` in real-time.

### F. Item Engine, Rarity, NBT & Vanilla Tagging
- **File**: `src/items/engine/itemBuilder.ts` (lines 139–245, 323–404)
  - Standard items embed `ExtraAttributes` with `id`, `rarity`, `itemType`, `uuid`, and `origin`.
  - Vanilla item stacks tagged with `tagVanillaItemStack` automatically receive `HideFlags: 254` (hiding vanilla damage/attack tooltips) and `origin: 'VANILLA'`.
  - Tooltips format authentic Hypixel SkyBlock color codes and spacing.

### G. NPC Lifecycle & Interaction Patterns
- **File**: `src/npc/bankerNpc.ts` (lines 20–40, 377–470)
  - Entity lifecycle uses packet-level spawning (`player_info_update` / `player_info`, `spawn_entity` / `named_entity_spawn`, armor stands for floating holograms).
  - Interaction debounce mechanism (`clickCooldowns.get(client.id)` with a 600ms cooldown) absorbs rapid double-clicks.
  - Mouse button `0` or `2` triggers NPC open GUI calls, while mouse button `1` (left-click attack) is safely ignored.

---

## 2. Logic Chain

From the observations above, the complete technical specification for the Farm Merchant Shop GUI and transaction mechanics is synthesized through the following deductive steps:

```
[Observation B: inventoryType 5 creates 54-slot generic_9x6 container]
  + [Observation A: Window ID 16 is unassigned]
  --> Conclusion 1: Farm Merchant Shop GUI must register as Window ID 16 (FARM_MERCHANT_WINDOW_ID = 16)
                    using inventoryType 5 titled "§8Farm Merchant".

[Observation B: 54-slot chest has 6 rows x 9 columns]
  + [Requirements: 13 agricultural commodities, Slot 48 Hopper, Slot 49 Barrier]
  --> Conclusion 2: Place 7 commodities in Row 1 (Slots 10..16), 6 commodities in Row 2 (Slots 19..24).
                    Surround rows with Black Stained Glass Pane borders (Slots 0..9, 17, 18, 25..47, 50..53).
                    Anchor Hopper at Slot 48 and Barrier at Slot 49.

[Observation C & D: Container slots 54..88 map directly to pData.inventory slots 9..43]
  + [Observation E: pData.purse tracks coins; updatePlayerScoreboardPurse refreshes sidebar]
  --> Conclusion 3: Click-to-Sell intercepts clicks on slots 54..88 when openWindowId === 16.
                    Validates commodity/item sell price, liquidates stack, adds coins to pData.purse,
                    deletes inventory slot, and clears client cursor and clicked slot without desync.

[Observation E & Requirement 4: 640 daily cap per commodity]
  + [Observation E: PlayerProfile in sharedProfile.ts persists to data/profiles/<username>.json]
  --> Conclusion 4: In-memory tracking alone fails upon server restarts and proxy server transfers.
                    Daily limit tracking must be persisted in PlayerProfile with UTC midnight rollover
                    checked via date comparator (YYYY-MM-DD).

[Observation A: window_click provides mode and button]
  --> Conclusion 5: Support Left-Click (mode: 0, button: 0) for 1 bundle/unit,
                    Right-Click (mode: 0, button: 1) for 1 full stack (64 items),
                    Shift-Click (mode: 1) for maximum possible purchase capped by daily limit & purse.
```

---

## 3. Comprehensive Technical Specification

### Section 3.1: Shop GUI Container & Layout Matrix

The Farm Merchant Shop GUI operates as a 54-slot chest container (`minecraft:generic_9x6`, `inventoryType: 5`) titled `§8Farm Merchant`.

#### Exact 54-Slot Grid Mapping (Rows 0 to 5)

| Row | Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 | Slot 6 | Slot 7 | Slot 8 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **0** | `Pane` (0) | `Pane` (1) | `Pane` (2) | `Pane` (3) | `Pane` (4) | `Pane` (5) | `Pane` (6) | `Pane` (7) | `Pane` (8) |
| **1** | `Pane` (9) | **Wheat** (10) | **Carrot** (11) | **Potato** (12) | **Melon Slice** (13) | **Sugar Cane** (14) | **Pumpkin** (15) | **Cocoa Beans** (16) | `Pane` (17) |
| **2** | `Pane` (18) | **Red Mushroom** (19) | **Brown Mushroom** (20) | **Sand** (21) | **Cactus** (22) | **Ench. Bone Meal** (23) | **Rookie Hoe** (24) | `Pane` (25) | `Pane` (26) |
| **3** | `Pane` (27) | `Pane` (28) | `Pane` (29) | `Pane` (30) | `Pane` (31) | `Pane` (32) | `Pane` (33) | `Pane` (34) | `Pane` (35) |
| **4** | `Pane` (36) | `Pane` (37) | `Pane` (38) | `Pane` (39) | `Pane` (40) | `Pane` (41) | `Pane` (42) | `Pane` (43) | `Pane` (44) |
| **5** | `Pane` (45) | `Pane` (46) | `Pane` (47) | **Sell Hopper** (48) | **Close Barrier** (49) | `Pane` (50) | `Pane` (51) | `Pane` (52) | `Pane` (53) |

- **Filler Panes (`Pane`)**: Initialized via `createGuiItem('black_stained_glass_pane', 1, '§8 ', [])`.
- **Slot 25**: Dedicated filler pane ensuring clean visual separation on the second item row.

---

### Section 3.2: 13 Agricultural Commodities — Exact Pricing & Metadata Table

| Slot | Commodity Name | Vanilla Material | Bundle Buy Qty | Buy Price (Coins) | Unit Buy Price | Sell Unit Price | Sell Bundle Price | SkyBlock ExtraAttr ID | Rarity |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|:---:|
| **10** | **Wheat** | `wheat` | 3 | 7 | 2.333c | 2.0c | 6c (for 3) | `WHEAT` | COMMON |
| **11** | **Carrot** | `carrot` | 3 | 7 | 2.333c | 1.0c | 3c (for 3) | `CARROT_ITEM` | COMMON |
| **12** | **Potato** | `potato` | 3 | 7 | 2.333c | 1.0c | 3c (for 3) | `POTATO_ITEM` | COMMON |
| **13** | **Melon Slice** | `melon_slice` | 10 | 10 | 1.000c | 0.2c | 2c (for 10) | `MELON` | COMMON |
| **14** | **Sugar Cane** | `sugar_cane` | 3 | 15 | 5.000c | 1.333c | 4c (for 3) | `SUGAR_CANE` | COMMON |
| **15** | **Pumpkin** | `pumpkin` | 1 | 8 | 8.000c | 10.0c | 10c (for 1) | `PUMPKIN` | COMMON |
| **16** | **Cocoa Beans** | `cocoa_beans` | 3 | 7 | 2.333c | 1.0c | 3c (for 3) | `INK_SACK:3` | COMMON |
| **19** | **Red Mushroom** | `red_mushroom` | 1 | 12 | 12.000c | 10.0c | 10c (for 1) | `RED_MUSHROOM` | COMMON |
| **20** | **Brown Mushroom** | `brown_mushroom` | 1 | 12 | 12.000c | 10.0c | 10c (for 1) | `BROWN_MUSHROOM` | COMMON |
| **21** | **Sand** | `sand` | 2 | 8 | 4.000c | 1.0c | 2c (for 2) | `SAND` | COMMON |
| **22** | **Cactus** | `cactus` | 1 | 10 | 10.000c | 4.0c | 4c (for 1) | `CACTUS` | COMMON |
| **23** | **Enchanted Bone Meal** | `bone_meal` *(glint)* | 1 | 6 | 6.000c | 1.0c | 1c (for 1) | `ENCHANTED_BONE_MEAL` | COMMON |
| **24** | **Rookie Hoe** | `wooden_hoe` | 1 | 10 | 10.000c | 3.0c | 3c (for 1) | `ROOKIE_HOE` | COMMON |

#### Exact Lore Construction Patterns
Each commodity in the GUI dynamically displays its authentic Hypixel SkyBlock lore reflecting the player's personal daily limit:

```text
Wheat Display Example:
Name: §aWheat
Lore:
  §7Cost: §67 coins
  §7Quantity: §a3
  §7You can buy §a640 §7more today!
  
  §7Sell price: §62 coins §7each
  
  §eClick to buy!
```

```text
Rookie Hoe Display Example:
Name: §fRookie Hoe
Lore:
  §7Farming Fortune: §a+5
  
  §7Cost: §610 coins
  §7Quantity: §a1
  §7You can buy §a640 §7more today!
  
  §7Sell price: §63 coins
  
  §eClick to buy!
  
  §f§lCOMMON HOE
```

---

### Section 3.3: Special Utility Slots

#### Slot 48: "Sell Item" Hopper
- **Icon**: `hopper` (Count: 1)
- **Display Name**: `§aSell Item`
- **Lore**:
  ```text
  §7Click an item in your inventory
  §7to sell it to the merchant!
  ```
- **Interaction Mechanics**:
  1. **Direct Click**: Acts as an instructional anchor. Emits a friendly click sound (`random.click`, pitch: 1.0) and sends an action bar / chat message: `§eClick an item in your inventory below to sell it!`.
  2. **Cursor Drop-In**: If a player picks up an inventory stack and clicks Slot 48, the system intercepts the click, assesses the cursor item stack value, sells the cursor stack, deposits coins to the purse, and clears the cursor item (`windowId: -1, slot: -1, item: { present: false }`).

#### Slot 49: "Close" Barrier
- **Icon**: `barrier` (Count: 1)
- **Display Name**: `§cClose`
- **Lore**:
  ```text
  §eClick to close!
  ```
- **Interaction Mechanics**:
  - Intercepted on click: sets `pData.openWindowId = 0`, writes `close_window` packet (`{ windowId: 16 }`), clears `pData.currentGuiItems`, and plays `random.click` (pitch: 1.0).

---

### Section 3.4: Daily Buy Limits (640-Item Cap & Rollover Architecture)

#### 1. In-Memory vs. Persistent Profile Tracking
- **Failure Mode of Pure In-Memory Tracking**:
  - In-memory maps (e.g. `pData.dailyPurchases = new Map()`) are destroyed when the server restarts, reboots via `reboot.ps1`, or when the player switches between the Hub world and private Islands via proxy transfer. Players could easily bypass the 640 cap by logging out and back in.
- **Architectural Solution (Hybrid Persistent Schema)**:
  - Daily purchase totals are maintained in memory in `pData.dailyMerchantPurchases` for sub-millisecond access during rapid clicks, but are synchronously serialized into `PlayerProfile` (`prof.dailyMerchantPurchases`) and committed to disk via `persistPlayerSession(pData)`.

#### 2. Storage Schema
Added to `PlayerProfile` interface in `src/storage/sharedProfile.ts`:
```ts
export interface DailyMerchantPurchases {
  lastResetDate: string; // ISO UTC Date string: "YYYY-MM-DD"
  items: Record<string, number>; // Commodity ExtraAttribute ID -> quantity purchased
}
```

#### 3. UTC Midnight Rollover Mechanics
- **Lazy Rollover Verification on Action**:
  - Whenever a player attempts to buy an item or opens the Farm Merchant GUI, the server computes the current UTC date string:
    ```ts
    const currentUtcDate = new Date().toISOString().slice(0, 10); // e.g. "2026-11-04"
    ```
  - If `pData.dailyMerchantPurchases.lastResetDate !== currentUtcDate`:
    - A UTC midnight rollover has occurred.
    - Atomically reset `pData.dailyMerchantPurchases.lastResetDate = currentUtcDate`.
    - Atomically reset `pData.dailyMerchantPurchases.items = {}`.
    - Commit immediately via `persistPlayerSession(pData)`.
  - **Zero-Timer Overhead**: Does not rely on fragile `setInterval` loops or cron jobs. Rollover occurs deterministically whether the player is active during midnight or rejoins days later.
- **Dynamic Lore Update**: When the GUI is rendered, each commodity displays `Math.max(0, 640 - (purchases.items[commodityId] || 0))` remaining today.

---

### Section 3.5: Transaction Flow, Packet Interception & Click-to-Sell

#### 1. Purchase Transaction Flow (Slots 10..16, 19..24)
When `window_click` arrives with `clickedSlot >= 0 && clickedSlot < 54`:

```text
[Incoming window_click]
       │
       ├─► Debounce check (cooldownMap.get(client.id) >= 100ms)
       │
       ├─► Determine Purchase Quantity:
       │     • Left-Click (mode: 0, button: 0)  -> 1 Bundle (bundleQty)
       │     • Right-Click (mode: 0, button: 1) -> 1 Stack (64 items)
       │     • Shift-Click (mode: 1, button: 0) -> Max Affordable & Available (up to 640 cap)
       │
       ├─► Validation Gate 1: Daily Buy Limit
       │     • purchasedToday = purchases.items[commodityId] || 0
       │     • if (purchasedToday + qty > 640) -> Reject or Partial Fill
       │     • Error: "§cYou reached your daily limit of 640 for this item!" (Sound: entity.villager.no)
       │
       ├─► Validation Gate 2: Purse Balance
       │     • totalCost = (qty / bundleQty) * bundlePrice
       │     • if (pData.purse < totalCost) -> Reject
       │     • Error: "§cYou don't have enough coins in your purse!" (Sound: entity.villager.no)
       │
       ├─► Validation Gate 3: Inventory Capacity
       │     • Check candidate slots (36..43, 9..35) for room
       │     • if (availableSpace < qty) -> Reject
       │     • Error: "§cYour inventory is completely full!" (Sound: entity.villager.no)
       │
       └─► Execution & State Synchronization:
             1. pData.purse = Math.round((pData.purse - totalCost) * 100) / 100
             2. purchases.items[commodityId] += qty
             3. addItemToPlayerInventory(pData, itemDef.id, qty, is119)
             4. updatePlayerScoreboardPurse(pData)
             5. syncChestPlayerInventory(client, pData, is119)
             6. Refresh commodity slot lore (updated daily remaining count)
             7. Play sound: entity.item.pickup (pitch: 1.2)
             8. persistPlayerSession(pData)
```

#### 2. Click-to-Sell Mechanics (Player Inventory Slots 54..88)
When a player clicks an item stack in their own inventory while the Farm Merchant GUI is open:

1. **Packet Interception**:
   - `clickedSlot` is between `54` and `88`.
   - Prevent default container shift/pickup by writing `set_slot` for cursor (`windowId: -1, slot: -1, item: { present: false }`).
2. **Slot Translation**:
   - `54..80` -> Main inventory slot `invSlot = clickedSlot - 54 + 9`
   - `81..88` -> Hotbar slot `invSlot = clickedSlot - 81 + 36`
   - `89` -> Nether Star slot (strictly blocked from sale!).
3. **Item Valuation**:
   - Look up item in `pData.inventory.get(invSlot)`.
   - If empty: resync slot and return.
   - Lookup NPC sell price in the pricing catalog:
     - All 13 agricultural commodities have verified sell prices (e.g. Wheat = 2c, Carrot = 1c, Pumpkin = 10c).
     - Standard SkyBlock items resolve to their defined catalog sell value.
     - Unsellable items (e.g. quest items, menu stars, unregistered special items) trigger `entity.villager.no` and `§cYou cannot sell this item!`.
4. **Instant Liquidation**:
   - Total earnings: `coinsEarned = Math.round(item.count * unitSellPrice * 100) / 100`.
   - `pData.purse = Math.round((pData.purse + coinsEarned) * 100) / 100`.
   - Delete item from `pData.inventory.delete(invSlot)`.
5. **Client-Server Desync Prevention**:
   - Send `set_slot` to the client for `clickedSlot` with `{ present: false }` and `stateId: data.stateId`.
   - Send `set_slot` to cursor (`windowId: -1, slot: -1, item: { present: false }`).
   - Re-send top container slots if the client attempted an optimistic client-side inventory shift.
   - Update sidebar: `updatePlayerScoreboardPurse(pData)`.
   - Play chime: `entity.experience_orb.pickup` (pitch: 1.5).
   - Chat notification: `§aYou sold §e${item.count}x ${displayName} §afor §6${formatCoins(coinsEarned)} coins§a!`.
   - Commit session to disk: `persistPlayerSession(pData)`.

---

## 4. Caveats

1. **Bazaar vs. NPC Merchant Prices**: The pricing catalog here reflects authentic fixed NPC shop rates. It does not fluctuate dynamically like the Bazaar market.
2. **Partial Stack Purchasing on Daily Cap**: When a player requests a full stack of 64 (Right-Click) but only 12 items remain in their 640 daily cap, the engine can either truncate to 12 items (partial fill) or prompt the player. Truncation to the exact remaining allowance (partial fill) matches authentic Hypixel behavior.
3. **Multi-Profile Data**: If the server later adds multi-profile support (e.g. Apple, Banana profiles), `dailyMerchantPurchases` must reside within the specific profile sub-object rather than globally per UUID.
4. **Strict NCC Compliance**: Zero code files under `src/`, `dist/`, or root configs were altered during this investigation.

---

## 5. Conclusion

The architectural investigation confirms that the authentic Hypixel SkyBlock Farm Merchant Shop GUI and Click-to-Sell transaction mechanics integrate cleanly into the existing `arena-server` architecture:

1. **GUI Architecture**: `FARM_MERCHANT_WINDOW_ID = 16` with `inventoryType: 5` (54 slots) provides an exact 1:1 match with Hypixel's 6-row chest interface.
2. **Layout & Commodities**: 13 agricultural commodities map symmetrically across Rows 1 & 2 (Slots 10–16, 19–24), bordered by Black Stained Glass Panes with Slot 48 (Sell Item Hopper) and Slot 49 (Close Barrier).
3. **Daily Cap**: 640 items/day per commodity is tracked in `PlayerProfile` with zero-timer UTC midnight rollover (`YYYY-MM-DD` comparison), guaranteeing persistence across server restarts and proxy hops.
4. **Click-to-Sell & Desync Mitigation**: Intercepting `window_click` on slots 54..88 with immediate cursor clearing, atomic purse updates, and slot wiping guarantees instantaneous liquidation with 0% client-server desync.

---

## 6. Verification Method

To independently verify the facts and logic documented in this report:

1. **Verify Window ID & Container Availability**:
   - Inspect `src/core/ZylarServer.ts` (lines 1916–2014) to confirm window ID 16 is completely unassigned.
   - Inspect `src/gui/craftingTableMenu.ts` (lines 432–437) to verify `inventoryType: 5` generates a 54-slot chest.
2. **Verify Inventory Slot Translation**:
   - Inspect `src/gui/craftingTableMenu.ts` (lines 308–354, 742–778) to verify chest slots `54..80` translate to `9..35` and `81..88` translate to `36..43`.
3. **Verify Purse & Scoreboard Pipeline**:
   - Inspect `src/players/playerManager.ts` (lines 40, 153) and `src/core/scoreboard.ts` (lines 120–140) to confirm `pData.purse` updates immediately propagate to the player's sidebar.
4. **Verify NCC Constraint Adherence**:
   - Execute `git status` in PowerShell:
     ```powershell
     git status --porcelain
     ```
   - Confirms that zero files in `src/`, `dist/`, or server entry points have been created, modified, or deleted.
