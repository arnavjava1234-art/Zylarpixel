const { jsonToNbtCompound } = require('./dist/src/world/worldManager.js');
const temperate = {
  asset_id: "minecraft:entity/nautilus/zombie_nautilus",
  spawn_conditions: [
    {
      priority: 0
    }
  ]
};
const warm = {
  asset_id: "minecraft:entity/nautilus/zombie_nautilus_coral",
  model: "warm",
  spawn_conditions: [
    {
      condition: {
        type: "minecraft:biome",
        biomes: "#minecraft:spawns_coral_variant_zombie_nautilus"
      },
      priority: 1
    }
  ]
};
console.log("Temperate NBT:", JSON.stringify(jsonToNbtCompound(temperate), null, 2));
console.log("Warm NBT:", JSON.stringify(jsonToNbtCompound(warm), null, 2));
