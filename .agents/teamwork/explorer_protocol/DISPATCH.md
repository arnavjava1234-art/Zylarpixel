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

## 2026-11-04T13:48:02Z
From: 99561df3-f966-4222-9228-8bd9c0a14bd7
Message: You are the Protocol & NPC Lifecycle Explorer.
Your working directory is: C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol

Read the following files before beginning:
1. C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\ORIGINAL_REQUEST.md
2. C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol\DISPATCH.md

CRITICAL CONSTRAINT: STRICT NO CODE CHANGES (NCC).
Do NOT create, edit, or delete any source code files (under src/, dist/, etc.).
Perform read-only investigation of the codebase (e.g. src/npc/bankerNpc.ts, entity systems, packet helpers, coordinate data) and formulate an authoritative technical report on:
1. Verified Coordinates & Orientation: X: 63.5, Y: 71.0, Z: -114.5 in Hub World.
2. Packet-level Player Entity Spawning: Player info packet (UUID, skin texture/signature), Named Entity Spawn packet, Entity Metadata packet.
3. Dual Floating Holograms: ArmorStand entities with custom names "§e§lFARM MERCHANT" and "§e§lCLICK", invisible, marker, no-gravity, relative Y offsets.
4. 3D Line-of-Sight Raycast Head Tracking: Pitch/yaw calculation towards players within range, tick frequency, packet transmission.
5. Banker NPC patterns: How bankerNpc.ts is implemented and how Farm Merchant should adhere to or extend those patterns.

Write your full, comprehensive findings to C:\Users\Wing\.gemini\antigravity\scratch\arena-server\.agents\teamwork\explorer_protocol\handoff.md and report back when finished.
