/**
 * Factions.js - Faction definitions for the Geopolitical Macro-Layer
 *
 * Four factions control the retrofuturistic world:
 * - CHROMA_CORP: Tech megacorporation (NE quadrant) - Neon blues and chrome
 * - IRON_SYNOD: Industrial militarists (NW quadrant) - Rust reds and steel
 * - VERDANT_LINK: Eco-tech collective (SE quadrant) - Greens and organic forms
 * - NULL_DRIFTERS: Anarchist nomads (SW quadrant) - Purple and entropy
 */

export const Faction = Object.freeze({
    CHROMA_CORP: 'CHROMA_CORP',
    IRON_SYNOD: 'IRON_SYNOD',
    VERDANT_LINK: 'VERDANT_LINK',
    NULL_DRIFTERS: 'NULL_DRIFTERS'
});

export const FactionColors = Object.freeze({
    [Faction.CHROMA_CORP]: {
        primary: 0x00FFFF,      // Cyan
        secondary: 0x0088FF,    // Blue
        accent: 0xFFFFFF,       // Chrome white
        territory: 0x004466     // Dark cyan for map
    },
    [Faction.IRON_SYNOD]: {
        primary: 0xFF4400,      // Rust orange
        secondary: 0x880000,    // Dark red
        accent: 0xCCCCCC,       // Steel gray
        territory: 0x442200     // Dark rust for map
    },
    [Faction.VERDANT_LINK]: {
        primary: 0x00FF44,      // Bright green
        secondary: 0x008800,    // Forest green
        accent: 0xAAFFAA,       // Light green
        territory: 0x224400     // Dark green for map
    },
    [Faction.NULL_DRIFTERS]: {
        primary: 0xAA00FF,      // Purple
        secondary: 0x440088,    // Dark purple
        accent: 0xFF00FF,       // Magenta
        territory: 0x330044     // Dark purple for map
    }
});

export const FactionThemes = Object.freeze({
    [Faction.CHROMA_CORP]: {
        name: 'Chroma Corporation',
        shortName: 'Chroma',
        motto: 'Innovation Through Integration',
        style: 'cyberpunk_corporate',
        capitalStyle: 'DENSE_METROPOLIS',    // Glass towers, holo-ads, clean lines
        townStyle: 'RETRO_SUBURBAN',          // 50s diners with hover-car ports
        villageStyle: 'TECH_OUTPOST',         // Prefab labs, antenna arrays
        preferredBiomes: ['GRASSLAND', 'BEACH', 'HILLS'],
        resourceBonus: 'technology'
    },
    [Faction.IRON_SYNOD]: {
        name: 'The Iron Synod',
        shortName: 'Synod',
        motto: 'Forged in Fire',
        style: 'industrial_military',
        capitalStyle: 'INDUSTRIAL_FORTRESS',  // Smokestacks, factories, rail yards
        townStyle: 'MINING_TOWN',             // Smelters, worker housing
        villageStyle: 'SCRAP_FORT',           // Junk walls, guard towers
        preferredBiomes: ['MOUNTAIN', 'HILLS', 'RUINED_CITY'],
        resourceBonus: 'military'
    },
    [Faction.VERDANT_LINK]: {
        name: 'The Verdant Link',
        shortName: 'Verdant',
        motto: 'Growth Through Unity',
        style: 'eco_tech',
        capitalStyle: 'ARCOLOGY',             // Living buildings, vertical farms
        townStyle: 'GARDEN_VILLAGE',          // Solar panels, greenhouses
        villageStyle: 'RANGER_STATION',       // Watchtowers, bio-domes
        preferredBiomes: ['PINE_FOREST', 'GRASSLAND', 'BEACH'],
        resourceBonus: 'food'
    },
    [Faction.NULL_DRIFTERS]: {
        name: 'The Null Drifters',
        shortName: 'Drifters',
        motto: 'Freedom in Chaos',
        style: 'cyberpunk_western',
        capitalStyle: 'SPRAWL_NEXUS',         // Chaotic mega-market, neon chaos
        townStyle: 'NOMAD_HUB',               // Trailer parks, bazaars
        villageStyle: 'DUST_SALOON',          // Neon saloons, scrap fences
        preferredBiomes: ['DESERT', 'RUINED_CITY', 'BEACH'],
        resourceBonus: 'trade'
    }
});

// Settlement tier definitions
export const SettlementTier = Object.freeze({
    CAPITAL: 'CAPITAL',
    TOWN: 'TOWN',
    VILLAGE: 'VILLAGE',
    OUTPOST: 'OUTPOST'
});

export const SettlementConfig = Object.freeze({
    [SettlementTier.CAPITAL]: {
        minCellArea: 50000000,  // Minimum cell area in square units for capital
        buildingDensity: 0.8,
        populationMultiplier: 10.0,
        defenseStrength: 100,
        economicOutput: 50,
        style: 'Dense Cyberpunk Metropolis',
        roadPriority: 3  // Highest priority for highway connections
    },
    [SettlementTier.TOWN]: {
        minCellArea: 10000000,
        buildingDensity: 0.5,
        populationMultiplier: 3.0,
        defenseStrength: 50,
        economicOutput: 20,
        style: 'Small Town America with hover-cars and retro-diners',
        roadPriority: 2
    },
    [SettlementTier.VILLAGE]: {
        minCellArea: 0,  // Any remaining cells
        buildingDensity: 0.2,
        populationMultiplier: 1.0,
        defenseStrength: 20,
        economicOutput: 5,
        style: 'Cyberpunk Wild West - dusty neon saloons and scrap fences',
        roadPriority: 1
    },
    [SettlementTier.OUTPOST]: {
        minCellArea: 0,
        buildingDensity: 0.1,
        populationMultiplier: 0.5,
        defenseStrength: 10,
        economicOutput: 2,
        style: 'Remote checkpoint or resource extraction',
        roadPriority: 0
    }
});

// Corner quadrant positions for initial faction placement
// Used to bias Voronoi seed placement toward faction "home" corners
export const FactionHomeQuadrants = Object.freeze({
    [Faction.CHROMA_CORP]: { x: 1, z: 1 },    // Northeast
    [Faction.IRON_SYNOD]: { x: -1, z: 1 },    // Northwest
    [Faction.VERDANT_LINK]: { x: 1, z: -1 },  // Southeast
    [Faction.NULL_DRIFTERS]: { x: -1, z: -1 } // Southwest
});

export default {
    Faction,
    FactionColors,
    FactionThemes,
    SettlementTier,
    SettlementConfig,
    FactionHomeQuadrants
};
