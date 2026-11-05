import { getHubBlockName } from './src/world/hubRegionProvider';

console.log('Mapping Crypts Underground Cavity (Y: 45-60):');
let cryptRooms: Array<{x: number, y: number, z: number, floorBlock: string}> = [];

for (let x = -50; x >= -140; x -= 5) {
  for (let z = -60; z >= -150; z -= 5) {
    for (let y = 60; y >= 45; y--) {
      const b = getHubBlockName(x, y, z);
      const floor = getHubBlockName(x, y - 1, z);
      if ((b === 'air' || b === 'cave_air') && floor && floor !== 'air' && floor !== 'cave_air') {
        cryptRooms.push({ x, y, z, floorBlock: floor });
        break;
      }
    }
  }
}

console.log(`Found ${cryptRooms.length} underground crypt walkable points:`);
for (const p of cryptRooms) {
  console.log(`Crypt Walkable -> X: ${p.x}, Y: ${p.y}, Z: ${p.z} (Floor: ${p.floorBlock})`);
}
