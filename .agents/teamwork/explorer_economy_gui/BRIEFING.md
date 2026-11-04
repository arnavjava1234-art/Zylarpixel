# BRIEFING — 2026-11-04T13:58:45Z

## Mission
Investigate codebase architecture for Farm Merchant Shop GUI, 13 agricultural commodities pricing, special utility slots, daily buy limits, and transaction flows under strict NCC.

## 🔒 My Identity
- Archetype: explorer
- Roles: Economy, GUI & Inventory Explorer
- Working directory: C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_economy_gui
- Original parent: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Milestone: Farm Merchant Shop GUI & Transaction Mechanics Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strict No Code Changes (NCC) — no modifications to src/, dist/, or server entry points

## Current Parent
- Conversation ID: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `src/core/ZylarServer.ts` (window_click packet handling, window IDs, slot restoration, stateId)
  - `src/core/scoreboard.ts` (purse formatting, scoreboard updates)
  - `src/gui/bankMenu.ts` (custom chest GUI creation, sound effects, transactions)
  - `src/gui/craftingTableMenu.ts` (54-slot chest container, inventory slot mapping 54..80 & 81..88, addItemToPlayerInventory, cursor handling)
  - `src/gui/skyblockMenu.ts` (54-slot container, Slot 49 Close button, Slot 89 Nether Star)
  - `src/gui/statsMenu.ts` (createGuiItem utility, NBT display/lore builder)
  - `src/items/engine/itemBuilder.ts` (ExtraAttributes, tagVanillaItemStack, formatSlotForClient)
  - `src/items/engine/itemRegistry.ts` (item catalog, ability triggers)
  - `src/items/engine/itemTypes.ts` (item rarity, types, stats)
  - `src/npc/bankerNpc.ts` (NPC packet spawning, raycast head tracking, right-click debounce)
  - `src/players/playerManager.ts` (player session data, purse synchronization, profile persistence)
  - `src/storage/sharedProfile.ts` (cross-server PlayerProfile schema)
  - `src/world/cropGuardian.ts` (harvestable hub crops and farming fortune)
- **Key findings**:
  - 54-slot container layout (`inventoryType: 5 = generic_9x6`) perfectly accommodates the 13 commodities in Rows 1 & 2 (slots 10-16, 19-24), surrounded by Black Stained Glass Pane borders, with Hopper at Slot 48 and Barrier at Slot 49.
  - Player inventory during 54-slot chest interactions maps slots 54..80 to main inventory (9..35) and 81..88 to hotbar (36..43). Slot 89 is the protected SkyBlock Menu Nether Star.
  - Click-to-Sell can be executed with zero client desync by intercepting `window_click` on slots 54..88, liquidating stacks to `pData.purse`, deleting from inventory, sending `{ present: false }` to the client slot, and wiping cursor slot `-1`.
  - Daily buy limit of 640 must be persisted in `PlayerProfile` with UTC midnight rollover (`YYYY-MM-DD` date comparator) to survive server restarts, relogs, and proxy transfers.
- **Unexplored areas**: None for this investigation scope; ready to formulate handoff report.

## Key Decisions Made
- Architecture maps Farm Merchant Shop GUI to `FARM_MERCHANT_WINDOW_ID = 16`.
- Commodity slot layout: Row 1 (10..16) holds Wheat, Carrot, Potato, Melon Slice, Sugar Cane, Pumpkin, Cocoa Beans; Row 2 (19..24) holds Red Mushroom, Brown Mushroom, Sand, Cactus, Enchanted Bone Meal, Rookie Hoe. Slot 25 is black glass pane.
- Persistent daily limit schema embedded directly into player profile.

## Artifact Index
- DISPATCH.md — Task assignment and instructions
- BRIEFING.md — Persistent working memory
- progress.md — Liveness heartbeat
- handoff.md — Final investigation report
