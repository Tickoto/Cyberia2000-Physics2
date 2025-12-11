export const OBJECTS = {
    // Nature
    TREE_PINE: { type: 'TREE_CONE', scale: { min: 3.5, max: 6.0 }, color: 0x1a2e12, variance: 0.1 },
    TREE_OAK: { type: 'TREE_SPHERE', scale: { min: 3.0, max: 5.0 }, color: 0x425e17, variance: 0.1 },
    TREE_PALM: { type: 'TREE_PALM', scale: { min: 4.0, max: 7.0 }, color: 0x8b9c3e },
    TREE_DEAD: { type: 'TREE_CONE', scale: { min: 2.0, max: 3.5 }, color: 0x4a3c31 },
    CACTUS: { type: 'CACTUS', scale: { min: 1.5, max: 3.0 }, color: 0x5e8c31 },
    
    // Rocks
    ROCK_BOULDER: { type: 'ROCK', scale: { min: 0.8, max: 2.0 }, color: 0x666666 },
    ROCK_MOSSY: { type: 'ROCK', scale: { min: 1.0, max: 2.5 }, color: 0x4a5d43 },
    ROCK_SANDY: { type: 'ROCK', scale: { min: 1.0, max: 2.5 }, color: 0x8c7e6a },
    ROCK_SNOWY: { type: 'ROCK', scale: { min: 1.5, max: 4.0 }, color: 0xcccccc },
    
    // City Ruins
    RUIN_WALL: { type: 'WALL_BROKEN', scale: { min: 3.0, max: 6.0 }, color: 0x555555 },
    RUIN_BEAM: { type: 'BEAM_RUSTED', scale: { min: 2.0, max: 5.0 }, color: 0x443322 },
    RUBBLE_PILE: { type: 'RUBBLE', scale: { min: 1.0, max: 2.0 }, color: 0x333333 },
    
    // POI
    BUILDING_TOWER: { type: 'BOX', scale: { min: 4.0, max: 4.0 }, color: 0x222222 },
    BEACON_MAIN: { type: 'BEACON', scale: { min: 1.0, max: 1.0 }, color: 0x00ff00 }
};

export const BIOME_DEFINITIONS = {
    OCEAN: {
        id: 'OCEAN',
        color: 0x001133, // Deep Blue
        waterColor: 0x004488,
        objects: []
    },
    BEACH: {
        id: 'BEACH',
        color: 0xe6dbac, // Sand
        waterColor: 0x0066aa,
        objects: [{ id: 'TREE_PALM', chance: 0.005 }, { id: 'ROCK_SANDY', chance: 0.005 }]
    },
    GRASSLAND: {
        id: 'GRASSLAND',
        color: 0x5c8c2c, // Vibrant Green
        waterColor: 0x225577,
        objects: [{ id: 'TREE_OAK', chance: 0.002 }, { id: 'ROCK_BOULDER', chance: 0.001 }]
    },
    HILLS: {
        id: 'HILLS',
        color: 0x4a6b2f, // Darker Green/Brown
        waterColor: 0x225577,
        objects: [{ id: 'TREE_OAK', chance: 0.005 }, { id: 'ROCK_BOULDER', chance: 0.005 }]
    },
    PINE_FOREST: {
        id: 'PINE_FOREST',
        color: 0x2d3e1e, // Dark Forest Green
        waterColor: 0x113344,
        objects: [{ id: 'TREE_PINE', chance: 0.02 }, { id: 'ROCK_MOSSY', chance: 0.01 }]
    },
    DESERT: {
        id: 'DESERT',
        color: 0xd6c08d, // Desert Sand
        waterColor: 0x228866, // Oasis Teal
        objects: [{ id: 'CACTUS', chance: 0.005 }, { id: 'ROCK_SANDY', chance: 0.01 }]
    },
    RUINED_CITY: {
        id: 'RUINED_CITY',
        color: 0x3a3a3a, // Concrete Grey
        waterColor: 0x334422, // Polluted Brown/Green
        objects: [{ id: 'RUIN_WALL', chance: 0.01 }, { id: 'RUIN_BEAM', chance: 0.01 }, { id: 'RUBBLE_PILE', chance: 0.02 }, { id: 'TREE_DEAD', chance: 0.005 }]
    },
    MOUNTAIN: {
        id: 'MOUNTAIN',
        color: 0x666666, // Stone Grey
        waterColor: 0x225588,
        objects: [{ id: 'ROCK_BOULDER', chance: 0.01 }, { id: 'TREE_PINE', chance: 0.005 }]
    },
    SNOWY_MOUNTAIN: {
        id: 'SNOWY_MOUNTAIN',
        color: 0xffffff, // Snow
        waterColor: 0x88ccff, // Icy Blue
        objects: [{ id: 'ROCK_SNOWY', chance: 0.005 }]
    }
};