const fs = require('fs');
const path = require('path');

const srcAdd = path.join(__dirname, 'src/world/additionalRegistries1218.json');
const data = JSON.parse(fs.readFileSync(srcAdd, 'utf8'));

data['minecraft:zombie_nautilus_variant'] = [
  {
    key: 'minecraft:temperate',
    jsonText: JSON.stringify({
      asset_id: 'minecraft:entity/nautilus/zombie_nautilus',
      spawn_conditions: [
        {
          priority: 0
        }
      ]
    }, null, 2)
  },
  {
    key: 'minecraft:warm',
    jsonText: JSON.stringify({
      asset_id: 'minecraft:entity/nautilus/zombie_nautilus_coral',
      model: 'warm',
      spawn_conditions: [
        {
          condition: {
            type: 'minecraft:biome',
            biomes: '#minecraft:spawns_coral_variant_zombie_nautilus'
          },
          priority: 1
        }
      ]
    }, null, 2)
  }
];

// Verify JSON serialization
console.log('Valid JSON:', JSON.stringify(data['minecraft:zombie_nautilus_variant'], null, 2));
