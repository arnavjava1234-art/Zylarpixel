# BRIEFING — 2026-11-04T13:56:00Z

## Mission
Investigate protocol-level NPC lifecycle, packet-level entity spawning, dual holograms, raycast head-tracking, and bankerNpc.ts patterns to architect the authentic Hypixel SkyBlock Farm Merchant NPC.

## 🔒 My Identity
- Archetype: explorer
- Roles: Protocol & NPC Lifecycle Explorer
- Working directory: C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol
- Original parent: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Milestone: Farm Merchant NPC Technical Blueprint

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strict No Code Changes (NCC) — zero source code changes (no edits to src/, dist/, etc.)
- Output comprehensive findings in handoff.md in working directory
- Communicate via send_message to parent (99561df3-f966-4222-9228-8bd9c0a14bd7)

## Current Parent
- Conversation ID: 99561df3-f966-4222-9228-8bd9c0a14bd7
- Updated: 2026-11-04T13:56:00Z

## Investigation State
- **Explored paths**: `src/npc/bankerNpc.ts`, `src/core/ZylarServer.ts`, `src/world/hubRegionProvider.ts`, `src/world/cropGuardian.ts`, `src/gui/bankMenu.ts`, `src/gui/statsMenu.ts`, `src/storage/skinService.ts`, Anvil region chunk telemetry.
- **Key findings**:
  - Exact coordinates verified from chunk data: X: 63.5, Y: 71.0, Z: -114.5 (oak_planks at Y:70, red_carpet at Y:71, air at Y:72, 73).
  - Idle facing orientation: Yaw = 0.0° (South) / +31.0° (angled toward doorway entrance), Pitch = 0.0°.
  - Entity ID allocation: 8870 (NPC), 8871 (Title Holo), 8872 (Click Holo) to avoid collision with Banker (8888-8890) and Crop Guardians (8801-8810).
  - Packet-level spawning: 6-packet pipeline across 1.19.2 and 1.21.1 protocols with skin layer mask 127 and teams nametag suppression.
  - Dual holograms: ArmorStands at Y+2.05 ("§e§lFARM MERCHANT") and Y+1.75 ("§e§lCLICK"), small marker invisible.
  - 3D LOS Head Tracking: 20 TPS voxel raycast with personalized per-client head_rotation and entity_look packets.
  - Click interaction: `use_entity` interception, attack absorption, debounced right-click opening 54-slot chest GUI.
- **Unexplored areas**: None. All 5 areas completely investigated and documented in `handoff.md`.

## Key Decisions Made
- Allocated distinct entity IDs in the 8870-8872 range.
- Full compliance with Strict No Code Changes (NCC).
- Completed comprehensive 5-component handoff report.

## Artifact Index
- handoff.md — Authoritative Protocol & NPC Lifecycle handoff report
- progress.md — Heartbeat and progress tracker
- DISPATCH.md — Incoming task dispatches
