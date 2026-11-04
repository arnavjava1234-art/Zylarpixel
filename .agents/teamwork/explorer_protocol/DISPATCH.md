# Protocol & NPC Lifecycle Explorer Dispatch

## Objective
Investigate the codebase (specifically `src/npc/bankerNpc.ts`, other NPC implementations, packet definitions, hologram handling, entity metadata, skin properties, and raycast head tracking) to provide an authoritative technical blueprint for the authentic Hypixel SkyBlock Farm Merchant NPC.

## Strict NCC Constraint
Under NO circumstances may you create, modify, or delete any source code files (in `src/`, `dist/`, etc.). This is a pure technical investigation and architectural planning task.

## Key Focus Areas
1. Verified Coordinates & Orientation: X: 63.5, Y: 71.0, Z: -114.5, Yaw, Pitch in Hub World.
2. Packet-level Player Entity Spawning: Player info packet (UUID, profile properties, skin textures/signatures), Named Entity Spawn packet, Entity Metadata packet (skin layers, cape/jacket/sleeves).
3. Dual Floating Holograms: ArmorStand entities with custom names "§e§lFARM MERCHANT" and "§e§lCLICK", invisible, marker, no-gravity, exact relative Y offsets.
4. 3D Line-of-Sight Raycast Head Tracking: Pitch/yaw calculation towards players within range, tick frequency, packet transmission (Entity Head Look & Entity Look).
5. Existing Patterns in `src/npc/bankerNpc.ts`: Examine how bankerNpc.ts creates NPCs, handles player proximity, sends packets, and handles interaction packets (`use_entity`).

## Output
Write your comprehensive analysis and findings to `.agents/teamwork/explorer_protocol/handoff.md`.
