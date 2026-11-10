// Clear require cache so it reloads additionalRegistries1218.json
const { sanitizedDimensionCodec1218 } = require('./src/world/worldManager.ts');
console.log('Sanitized Codec Keys count:', Object.keys(sanitizedDimensionCodec1218).length);
console.log('Contains zombie_nautilus_variant:', 'minecraft:zombie_nautilus_variant' in sanitizedDimensionCodec1218);
if ('minecraft:zombie_nautilus_variant' in sanitizedDimensionCodec1218) {
  console.log('Entries:', JSON.stringify(sanitizedDimensionCodec1218['minecraft:zombie_nautilus_variant'], null, 2));
}
