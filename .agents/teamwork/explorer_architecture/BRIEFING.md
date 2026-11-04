# BRIEFING — 2026-11-04T14:15:00Z

## Mission
Investigate packet pipeline, window click listeners, inventory transaction confirmation, network architecture, and event handling for Farm Merchant Click-to-Sell mechanics & desync prevention without making code changes.

## 🔒 My Identity
- Archetype: explorer
- Roles: Architecture & Click-to-Sell Explorer
- Working directory: C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture
- Original parent: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Milestone: Farm Merchant NPC & Shop GUI Architectural Planning (NCC)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strict No Code Changes (NCC) — zero edits/additions/deletions under src/, dist/, etc.
- Deliver findings to .agents/teamwork/explorer_architecture/handoff.md and report to parent via send_message.

## Current Parent
- Conversation ID: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Updated: 2026-11-04T13:48:24Z

## Investigation State
- **Explored paths**:
  - `src/core/ZylarServer.ts` (lines 754-760, 1350-1353, 1770-2015, 2375-2389): Event loop, 20 TPS NPC ticker, login packet handlers, `window_click` packet interception router, `use_entity` interactions.
  - `src/npc/bankerNpc.ts`: Official Mojang signed textures, line-of-sight raycasting, dual floating holograms, head/look tracking Euler math, 600ms interaction debounce.
  - `src/gui/craftingTableMenu.ts`: 54-slot chest container layout (`generic_9x6`), slot mapping (0-53 top container vs 54-89 bottom player inventory), shift-click handling, candidate slot prioritization, `tagVanillaItemStack`.
  - `src/gui/bankMenu.ts`: Coin parsing, formatted coin output, window ID dispatching, scoreboard purse updating.
  - `src/gui/skyblockMenu.ts`: `HOTBAR_NETHER_STAR_SLOT = 44` (container slot 89), immutable item protection.
  - `src/players/playerManager.ts` & `src/core/scoreboard.ts`: `pData.purse`, `pData.inventory`, `persistPlayerSession`, `updatePlayerScoreboardPurse`.
  - `src/items/engine/itemBuilder.ts`: `formatSlotForClient`, `tagVanillaItemStack`, `ExtraAttributes`.
  - Peer reports: `explorer_protocol/handoff.md` and `explorer_economy_gui/handoff.md`.
- **Key findings**:
  - Window ID 16 (`FARM_MERCHANT_WINDOW_ID = 16`) is verified completely unassigned and reserved for the Farm Merchant Shop GUI.
  - Exact bidirectional slot mapping formula discovered: `invSlot = loc - 45` and `loc = invSlot + 45` uniformly maps player inventory slots 9..44 to container slots 54..89.
  - Slot 89 (hotbar 9 / inventory slot 44) is strictly the SkyBlock Menu Nether Star and MUST be protected against selling.
  - Click-to-Sell requires synchronized 3-way `set_slot` updates (container slot, player inventory slot 0, and cursor -1) plus transaction confirmation (ACK/NACK) to prevent client-side ghost item duplication.
  - Atomic per-player transaction lock (`isTransactionLocked` boolean) and 50ms click debounce completely prevent rapid clicking and macro exploits.
- **Unexplored areas**: None for architectural scope. Ready to compile handoff report.

## Key Decisions Made
- Confirmed Window ID 16 for `farmMerchantGui.ts`.
- Mapped Slot 48 as "Sell Item" Hopper with dual functionality: single-stack sale on cursor drop, and bulk inventory sale on click.
- Established strict 5-component handoff structure for `handoff.md`.

## Artifact Index
- DISPATCH.md — Initial dispatch instructions
- BRIEFING.md — Persistent working memory
- progress.md — Heartbeat and liveness log
- handoff.md — Comprehensive technical findings report
