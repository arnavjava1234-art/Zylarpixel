import { hasLineOfSight } from '../../../src/npc/bankerNpc';

// Benchmark 20 TPS Head Tracking Raycasting Load
console.log('=== BENCHMARK: 20 TPS Line-Of-Sight Raycasting Load ===');

// Farm Merchant coordinates
const NPC_POS = { x: 63.5, y: 71.0, z: -114.5 };
const npcEyeX = NPC_POS.x;
const npcEyeY = NPC_POS.y + 1.62;
const npcEyeZ = NPC_POS.z;

// Generate test player positions
// Scenario A: 20 players inside Farmhouse / nearby Hub (5 to 40 blocks away, some occluded, some unoccluded)
const scenarios = [
  { name: '10 players nearby (10-30m)', count: 10, maxDist: 30 },
  { name: '30 players nearby (10-45m)', count: 30, maxDist: 45 },
  { name: '50 players at max distance (45-50m, unoccluded view)', count: 50, maxDist: 50 },
  { name: '50 players behind walls (occluded at ~10m)', count: 50, maxDist: 50, occluded: true }
];

for (const sc of scenarios) {
  const players = [];
  for (let i = 0; i < sc.count; i++) {
    const angle = (i / sc.count) * Math.PI * 2;
    const dist = sc.maxDist * (0.5 + 0.5 * Math.random());
    const px = sc.occluded ? 63.5 + (Math.random() - 0.5) * 10 : npcEyeX + Math.cos(angle) * dist;
    const py = 71.0;
    const pz = sc.occluded ? -140.0 : npcEyeZ + Math.sin(angle) * dist;
    players.push({ x: px, y: py, z: pz });
  }

  // Measure single tick execution time (1 tick = 50ms budget for the entire server!)
  const iterations = 100;
  const start = performance.now();
  let checks = 0;
  for (let it = 0; it < iterations; it++) {
    for (const p of players) {
      hasLineOfSight(npcEyeX, npcEyeY, npcEyeZ, p.x, p.y + 1.62, p.z, 50.0);
      checks++;
    }
  }
  const totalMs = performance.now() - start;
  const avgTickMs = totalMs / iterations;
  const percentageOfTick = (avgTickMs / 50.0) * 100;

  console.log(`Scenario: ${sc.name}`);
  console.log(`  Total checks: ${checks} over ${iterations} ticks`);
  console.log(`  Avg CPU time per tick: ${avgTickMs.toFixed(3)} ms (${percentageOfTick.toFixed(1)}% of 50ms tick budget)`);
  console.log(`  Estimated packet generation: ${sc.count * 20 * 2} packets/sec`);
}
