# Architecture & Click-to-Sell Explorer Dispatch

## Objective
Investigate the codebase (packet pipeline, window click listeners, inventory transaction confirmation, network architecture, and event handling) to design the Click-to-Sell mechanics and client-server desync prevention architecture.

## Strict NCC Constraint
Under NO circumstances may you create, modify, or delete any source code files (in `src/`, `dist/`, etc.). This is a pure technical investigation and architectural planning task.

## Key Focus Areas
1. Window Click Packet Interception:
   - Minecraft 1.8.9 protocol `window_click` packet structure (windowId, slot, button, mode, actionNumber, item).
   - Distinguishing top container clicks (slots 0-53) from player inventory clicks (slots 54-89) in a 54-slot chest container.
2. Click-to-Sell Mechanics:
   - Validating clicked item stack against sellable items (commodity check, non-sellable items check like SkyBlock menu nether star, armor, tools).
   - Sell price calculation (unit price * count).
   - Instant stack removal from player inventory slot and instant purse balance update.
   - Slot 48 "Sell Item" Hopper interaction (sell inventory option, sell single item).
3. Client-Server Inventory Desync Prevention:
   - Window Transaction Confirmation packets (`confirm_transaction` / `transaction` packet accept/reject).
   - Window Set Slot packets (`set_slot`) to force client inventory state synchronization.
   - Race conditions & rapid clicking protection (atomic per-player transaction lock / debounce queue).
   - Anti-duplication mechanisms (verifying item stack server-side before crediting coins; reject transaction if client item doesn't match server state).
4. System Integration & Multi-Server Architecture:
   - How `bankerNpc.ts` or similar services integrate with the server lifecycle.
   - Clean modular architecture for `src/npc/farmMerchantNpc.ts` and `src/gui/farmMerchantGui.ts`.
   - Event bus / message bus / state synchronization across the server.

## Output
Write your comprehensive analysis and findings to `.agents/teamwork/explorer_architecture/handoff.md`.


## 2026-11-04T13:48:24Z
From: 99561df3-f966-4222-9228-8bd9c0a14bd7
Message:
You are the Architecture & Click-to-Sell Explorer.
Your working directory is: C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture

Read the following files before beginning:
1. C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\ORIGINAL_REQUEST.md
2. C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture\DISPATCH.md

CRITICAL CONSTRAINT: STRICT NO CODE CHANGES (NCC).
Do NOT create, edit, or delete any source code files (under src/, dist/, etc.).
Perform read-only investigation of the codebase (packet listeners, window_click handling, player inventory management, event loop, network synchronization) and formulate an authoritative technical report on:
1. Window Click Packet Interception: Structure of window_click packets (windowId, slot, button, mode, actionNumber, item). Mapping top container slots (0-53) vs bottom player inventory slots (54-89) in 54-slot chest.
2. Click-to-Sell Mechanics: Validating clicked inventory stacks, sell price calculation, instantaneous purse increment, stack removal, Slot 48 Hopper interaction.
3. Desync Prevention & Anti-Cheat/Duplication: Window transaction confirmation (actionNumber ACK/NACK), set_slot packet synchronization, atomic per-player locks against rapid clicking/macro exploitation, client-server state verification.
4. Modular Integration: Architecture design for farmMerchantNpc.ts, farmMerchantGui.ts, transaction managers, and integration into the server's lifecycle.

Write your full, comprehensive findings to C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_architecture\handoff.md and report back when finished.
