import { getHubBlockName } from './src/world/hubRegionProvider';

const blockCounts = new Map<string, number>();
for (let y = 69; y <= 74; y++) {
  for (let z = -81; z <= -76; z++) {
    for (let x = 8; x <= 13; x++) {
      const b = getHubBlockName(x, y, z);
      if (b && b !== 'air') {
        blockCounts.set(b, (blockCounts.get(b) || 0) + 1);
        console.log(`x: ${x}, y: ${y}, z: ${z} -> ${b}`);
      }
    }
  }
}
console.log('Summary:', Object.fromEntries(blockCounts));
