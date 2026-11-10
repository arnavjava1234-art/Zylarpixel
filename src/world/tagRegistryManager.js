"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allTags1218 = exports.getAllTags = exports.getTagPacketData = exports.tagRegistryManager = exports.TagRegistryManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class TagRegistryManager {
    static instance;
    tags = [];
    constructor() {
        this.loadTags();
    }
    static getInstance() {
        if (!TagRegistryManager.instance) {
            TagRegistryManager.instance = new TagRegistryManager();
        }
        return TagRegistryManager.instance;
    }
    loadTags() {
        if (this.tags.length > 0)
            return this.tags;
        // 1. Look for allTags1218.json in candidate paths
        const candidatePaths = [
            path_1.default.resolve(__dirname, 'allTags1218.json'),
            path_1.default.resolve(__dirname, '../../data/allTags1218.json'),
            path_1.default.resolve(process.cwd(), 'data/allTags1218.json'),
            path_1.default.resolve(process.cwd(), 'allTags1218.json'),
            path_1.default.resolve(process.cwd(), 'src/world/allTags1218.json')
        ];
        for (const p of candidatePaths) {
            try {
                if (fs_1.default.existsSync(p)) {
                    const raw = JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
                    const data = Array.isArray(raw) ? raw : (raw.tags && Array.isArray(raw.tags) ? raw.tags : null);
                    if (data && data.length > 0) {
                        this.tags = data;
                        return this.tags;
                    }
                }
            }
            catch (err) {
                console.warn(`[TagRegistryManager] Failed to parse tags from ${p}:`, err);
            }
        }
        // 2. Generate baseline essential tags if JSON is missing
        this.tags = this.generateBaselineTags();
        return this.tags;
    }
    getTagPacketData() {
        if (!this.tags || this.tags.length === 0) {
            this.loadTags();
        }
        return this.tags;
    }
    getAllTags() {
        return this.getTagPacketData();
    }
    generateBaselineTags() {
        const mcData = require('minecraft-data')('1.21.8');
        const itemIds = (names) => names.map(n => mcData.itemsByName[n]?.id).filter((id) => id !== undefined);
        const enchantIds = (names) => names.map(n => mcData.enchantmentsByName[n]?.id).filter((id) => id !== undefined);
        const swordIds = itemIds([
            'wooden_sword', 'stone_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword'
        ]);
        const axeIds = itemIds([
            'wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe', 'netherite_axe'
        ]);
        const pickaxeIds = itemIds([
            'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'
        ]);
        const shovelIds = itemIds([
            'wooden_shovel', 'stone_shovel', 'iron_shovel', 'golden_shovel', 'diamond_shovel', 'netherite_shovel'
        ]);
        const hoeIds = itemIds([
            'wooden_hoe', 'stone_hoe', 'iron_hoe', 'golden_hoe', 'diamond_hoe', 'netherite_hoe'
        ]);
        return [
            {
                tagType: 'minecraft:item',
                tags: [
                    { tagName: 'minecraft:swords', entries: swordIds },
                    { tagName: 'minecraft:enchantable/sword', entries: swordIds },
                    { tagName: 'minecraft:axes', entries: axeIds },
                    { tagName: 'minecraft:enchantable/weapon', entries: [...swordIds, ...axeIds] },
                    { tagName: 'minecraft:pickaxes', entries: pickaxeIds },
                    { tagName: 'minecraft:shovels', entries: shovelIds },
                    { tagName: 'minecraft:hoes', entries: hoeIds },
                    { tagName: 'minecraft:enchantable/mining', entries: [...pickaxeIds, ...shovelIds, ...axeIds, ...hoeIds] }
                ]
            },
            {
                tagType: 'minecraft:enchantment',
                tags: [
                    {
                        tagName: 'minecraft:exclusive_set/armor',
                        entries: enchantIds(['protection', 'blast_protection', 'fire_protection', 'projectile_protection'])
                    },
                    {
                        tagName: 'minecraft:exclusive_set/damage',
                        entries: enchantIds(['sharpness', 'smite', 'bane_of_arthropods'])
                    },
                    {
                        tagName: 'minecraft:exclusive_set/mining',
                        entries: enchantIds(['fortune', 'silk_touch'])
                    },
                    {
                        tagName: 'minecraft:exclusive_set/bow',
                        entries: enchantIds(['infinity', 'mending'])
                    },
                    {
                        tagName: 'minecraft:exclusive_set/crossbow',
                        entries: enchantIds(['multishot', 'piercing'])
                    },
                    {
                        tagName: 'minecraft:tooltip_order',
                        entries: (mcData.enchantmentsArray || []).map((e) => e.id)
                    },
                    {
                        tagName: 'minecraft:non_controlling',
                        entries: []
                    }
                ]
            },
            {
                tagType: 'minecraft:dialog',
                tags: [
                    { tagName: 'minecraft:pause_screen_additions', entries: [] },
                    { tagName: 'minecraft:quick_actions', entries: [] }
                ]
            }
        ];
    }
}
exports.TagRegistryManager = TagRegistryManager;
exports.tagRegistryManager = TagRegistryManager.getInstance();
const getTagPacketData = () => exports.tagRegistryManager.getTagPacketData();
exports.getTagPacketData = getTagPacketData;
const getAllTags = () => exports.tagRegistryManager.getTagPacketData();
exports.getAllTags = getAllTags;
exports.allTags1218 = exports.tagRegistryManager.getTagPacketData();
exports.default = exports.tagRegistryManager;
