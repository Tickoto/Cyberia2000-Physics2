/**
 * POIDefinitions.js - Comprehensive Point of Interest Definitions
 *
 * Defines all POI types with their footprints, spawn contexts, faction associations,
 * and mesh generation parameters for the TerrainStitcher and POIManager systems.
 */

// POI Categories
export const POICategory = {
  INFRASTRUCTURE: 'INFRASTRUCTURE',
  RESIDENTIAL: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  MILITARY: 'MILITARY',
  AGRICULTURAL: 'AGRICULTURAL',
  SCIENTIFIC: 'SCIENTIFIC',
  RECREATIONAL: 'RECREATIONAL',
  RELIGIOUS: 'RELIGIOUS',
  UTILITY: 'UTILITY',
  NATURAL: 'NATURAL',
  RUINS: 'RUINS'
};

// Spawn Context Types
export const SpawnContext = {
  ALONG_ROAD: 'ALONG_ROAD',
  ROAD_INTERSECTION: 'ROAD_INTERSECTION',
  FLAT_TERRAIN: 'FLAT_TERRAIN',
  STEEP_TERRAIN: 'STEEP_TERRAIN',
  HIGHEST_PEAK: 'HIGHEST_PEAK',
  WATER_ADJACENT: 'WATER_ADJACENT',
  FOREST_EDGE: 'FOREST_EDGE',
  SETTLEMENT_OUTSKIRTS: 'SETTLEMENT_OUTSKIRTS',
  WILDERNESS: 'WILDERNESS',
  VALLEY: 'VALLEY',
  HILLSIDE: 'HILLSIDE',
  COASTAL: 'COASTAL',
  RIVER_ADJACENT: 'RIVER_ADJACENT'
};

// Biome requirements
export const Biome = {
  OCEAN: 'OCEAN',
  BEACH: 'BEACH',
  GRASSLAND: 'GRASSLAND',
  HILLS: 'HILLS',
  PINE_FOREST: 'PINE_FOREST',
  DESERT: 'DESERT',
  RUINED_CITY: 'RUINED_CITY',
  MOUNTAIN: 'MOUNTAIN',
  SNOWY_MOUNTAIN: 'SNOWY_MOUNTAIN',
  ANY: 'ANY'
};

// Faction identifiers (for POI purposes)
export const POIFaction = {
  CHROMA_CORP: 'CHROMA_CORP',
  IRON_SYNOD: 'IRON_SYNOD',
  VERDANT_LINK: 'VERDANT_LINK',
  NULL_DRIFTERS: 'NULL_DRIFTERS',
  NEUTRAL: 'NEUTRAL'
};

/**
 * POI Definition Structure:
 * {
 *   id: string,                    // Unique identifier
 *   name: string,                  // Display name
 *   category: POICategory,         // Classification
 *   footprint: { width, depth },   // Building footprint in units
 *   height: number,                // Building height
 *   flattenRadius: number,         // Radius to flatten terrain
 *   rampRadius: number,            // Radius for terrain blending ramp
 *   requiresFoundation: boolean,   // Whether to generate foundation skirt
 *   maxSlopeForFlat: number,       // Max slope before foundation needed (0-1)
 *   spawnContexts: SpawnContext[], // Valid spawn locations
 *   biomes: Biome[],               // Valid biomes
 *   factions: Faction[],           // Associated factions (empty = neutral)
 *   minElevation: number,          // Minimum spawn elevation
 *   maxElevation: number,          // Maximum spawn elevation
 *   rarity: number,                // Spawn rarity (0-1, lower = rarer)
 *   minDistanceFromSettlement: number,
 *   maxDistanceFromSettlement: number,
 *   minDistanceFromSame: number,   // Min distance from same POI type
 *   roadProximity: number,         // Max distance from road (if road context)
 *   lootTier: number,              // 1-5, affects loot quality
 *   hasInterior: boolean,          // Whether player can enter
 *   meshData: object               // Mesh generation parameters
 * }
 */

// ============================================================================
// NEUTRAL / GENERIC POIs (Available in any faction territory)
// ============================================================================

export const NeutralPOIs = {
  // Road-side POIs
  GAS_STATION: {
    id: 'GAS_STATION',
    name: 'Gas Station',
    category: POICategory.COMMERCIAL,
    footprint: { width: 30, depth: 25 },
    height: 6,
    flattenRadius: 40,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT, Biome.PINE_FOREST],
    factions: [],
    minElevation: 0,
    maxElevation: 80,
    rarity: 0.3,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 5000,
    minDistanceFromSame: 2000,
    roadProximity: 50,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'GAS_STATION',
      canopyHeight: 5,
      pumpCount: 4,
      hasConvenienceStore: true,
      hasGarage: true
    }
  },

  SMALL_DINER: {
    id: 'SMALL_DINER',
    name: 'Roadside Diner',
    category: POICategory.COMMERCIAL,
    footprint: { width: 20, depth: 15 },
    height: 5,
    flattenRadius: 30,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [],
    minElevation: 0,
    maxElevation: 60,
    rarity: 0.35,
    minDistanceFromSettlement: 300,
    maxDistanceFromSettlement: 4000,
    minDistanceFromSame: 1500,
    roadProximity: 40,
    lootTier: 1,
    hasInterior: true,
    meshData: {
      type: 'DINER',
      hasNeonSign: true,
      hasParking: true,
      boothCount: 6
    }
  },

  TRUCK_STOP: {
    id: 'TRUCK_STOP',
    name: 'Truck Stop',
    category: POICategory.COMMERCIAL,
    footprint: { width: 60, depth: 45 },
    height: 8,
    flattenRadius: 80,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.ALONG_ROAD, SpawnContext.ROAD_INTERSECTION],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [],
    minElevation: 0,
    maxElevation: 50,
    rarity: 0.15,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 5000,
    roadProximity: 100,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'TRUCK_STOP',
      hasFuelIsland: true,
      hasRestaurant: true,
      hasMotel: true,
      parkingSpaces: 20
    }
  },

  MOTEL: {
    id: 'MOTEL',
    name: 'Roadside Motel',
    category: POICategory.COMMERCIAL,
    footprint: { width: 50, depth: 20 },
    height: 7,
    flattenRadius: 60,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [],
    minElevation: 0,
    maxElevation: 60,
    rarity: 0.25,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 6000,
    minDistanceFromSame: 3000,
    roadProximity: 60,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'MOTEL',
      roomCount: 12,
      floors: 2,
      hasPool: false,
      hasOffice: true
    }
  },

  // Energy Infrastructure
  SOLAR_FARM: {
    id: 'SOLAR_FARM',
    name: 'Solar Farm',
    category: POICategory.UTILITY,
    footprint: { width: 100, depth: 80 },
    height: 4,
    flattenRadius: 120,
    rampRadius: 30,
    requiresFoundation: false,
    maxSlopeForFlat: 0.05,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.DESERT, Biome.GRASSLAND],
    factions: [],
    minElevation: 5,
    maxElevation: 40,
    rarity: 0.1,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 8000,
    roadProximity: 500,
    lootTier: 3,
    hasInterior: false,
    meshData: {
      type: 'SOLAR_FARM',
      panelRows: 10,
      panelColumns: 15,
      hasControlBuilding: true,
      hasFencing: true
    }
  },

  GEOTHERMAL_PLANT: {
    id: 'GEOTHERMAL_PLANT',
    name: 'Geothermal Plant',
    category: POICategory.UTILITY,
    footprint: { width: 60, depth: 50 },
    height: 25,
    flattenRadius: 80,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.3,
    spawnContexts: [SpawnContext.STEEP_TERRAIN, SpawnContext.HILLSIDE],
    biomes: [Biome.MOUNTAIN, Biome.HILLS],
    factions: [],
    minElevation: 40,
    maxElevation: 100,
    rarity: 0.05,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 15000,
    roadProximity: 1000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'GEOTHERMAL_PLANT',
      hasCoolingTowers: true,
      towerCount: 3,
      hasPipes: true,
      hasSteamVents: true
    }
  },

  WIND_FARM: {
    id: 'WIND_FARM',
    name: 'Wind Farm',
    category: POICategory.UTILITY,
    footprint: { width: 150, depth: 150 },
    height: 80,
    flattenRadius: 40,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.COASTAL],
    factions: [],
    minElevation: 20,
    maxElevation: 80,
    rarity: 0.08,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 10000,
    roadProximity: 800,
    lootTier: 3,
    hasInterior: false,
    meshData: {
      type: 'WIND_FARM',
      turbineCount: 5,
      turbineSpacing: 60,
      hasSubstation: true
    }
  },

  NEON_RELAY_TOWER: {
    id: 'NEON_RELAY_TOWER',
    name: 'Neon Relay Tower',
    category: POICategory.UTILITY,
    footprint: { width: 15, depth: 15 },
    height: 60,
    flattenRadius: 25,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.4,
    spawnContexts: [SpawnContext.HIGHEST_PEAK],
    biomes: [Biome.MOUNTAIN, Biome.SNOWY_MOUNTAIN],
    factions: [],
    minElevation: 80,
    maxElevation: 200,
    rarity: 0.03,
    minDistanceFromSettlement: 3000,
    maxDistanceFromSettlement: 50000,
    minDistanceFromSame: 20000,
    roadProximity: 5000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'RELAY_TOWER',
      hasNeonLights: true,
      lightColor: 0x00ffff,
      antennaCount: 4,
      hasEquipmentShed: true
    }
  },

  RADIO_TOWER: {
    id: 'RADIO_TOWER',
    name: 'Radio Tower',
    category: POICategory.UTILITY,
    footprint: { width: 20, depth: 20 },
    height: 45,
    flattenRadius: 30,
    rampRadius: 12,
    requiresFoundation: true,
    maxSlopeForFlat: 0.25,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.HIGHEST_PEAK],
    biomes: [Biome.HILLS, Biome.MOUNTAIN, Biome.GRASSLAND],
    factions: [],
    minElevation: 30,
    maxElevation: 120,
    rarity: 0.12,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 8000,
    roadProximity: 1500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'RADIO_TOWER',
      hasGuyWires: true,
      hasTransmitterBuilding: true
    }
  },

  // Residential - Generic
  LOG_CABIN: {
    id: 'LOG_CABIN',
    name: 'Log Cabin',
    category: POICategory.RESIDENTIAL,
    footprint: { width: 12, depth: 10 },
    height: 5,
    flattenRadius: 18,
    rampRadius: 8,
    requiresFoundation: true,
    maxSlopeForFlat: 0.25,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.WILDERNESS],
    biomes: [Biome.PINE_FOREST, Biome.HILLS, Biome.MOUNTAIN],
    factions: [],
    minElevation: 20,
    maxElevation: 90,
    rarity: 0.4,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 500,
    roadProximity: 2000,
    lootTier: 1,
    hasInterior: true,
    meshData: {
      type: 'LOG_CABIN',
      hasChimney: true,
      hasPorch: true,
      logStyle: 'HORIZONTAL'
    }
  },

  HUNTING_LODGE: {
    id: 'HUNTING_LODGE',
    name: 'Hunting Lodge',
    category: POICategory.RESIDENTIAL,
    footprint: { width: 25, depth: 20 },
    height: 8,
    flattenRadius: 35,
    rampRadius: 12,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.WILDERNESS],
    biomes: [Biome.PINE_FOREST, Biome.HILLS],
    factions: [],
    minElevation: 15,
    maxElevation: 70,
    rarity: 0.15,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 5000,
    roadProximity: 3000,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'HUNTING_LODGE',
      hasFireplace: true,
      hasTrophyRoom: true,
      hasGarage: true
    }
  },

  RANGER_STATION: {
    id: 'RANGER_STATION',
    name: 'Ranger Station',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 18, depth: 15 },
    height: 6,
    flattenRadius: 30,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.ALONG_ROAD],
    biomes: [Biome.PINE_FOREST, Biome.HILLS, Biome.MOUNTAIN],
    factions: [],
    minElevation: 10,
    maxElevation: 80,
    rarity: 0.2,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 6000,
    roadProximity: 200,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'RANGER_STATION',
      hasLookoutTower: true,
      hasGarage: true,
      hasFlagpole: true
    }
  },

  // Agricultural
  SMALL_FARM: {
    id: 'SMALL_FARM',
    name: 'Small Farm',
    category: POICategory.AGRICULTURAL,
    footprint: { width: 40, depth: 35 },
    height: 8,
    flattenRadius: 60,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.GRASSLAND, Biome.HILLS],
    factions: [],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.35,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 1000,
    roadProximity: 400,
    lootTier: 1,
    hasInterior: true,
    meshData: {
      type: 'FARM',
      hasBarn: true,
      hasSilo: false,
      hasWindmill: true,
      fieldSize: 'SMALL'
    }
  },

  WINERY: {
    id: 'WINERY',
    name: 'Winery',
    category: POICategory.AGRICULTURAL,
    footprint: { width: 50, depth: 40 },
    height: 10,
    flattenRadius: 70,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.HILLSIDE],
    biomes: [Biome.HILLS, Biome.GRASSLAND],
    factions: [],
    minElevation: 15,
    maxElevation: 60,
    rarity: 0.1,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 8000,
    roadProximity: 500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'WINERY',
      hasVineyard: true,
      hasCellar: true,
      hasTastingRoom: true,
      vineyardRows: 8
    }
  },

  GREENHOUSE_COMPLEX: {
    id: 'GREENHOUSE_COMPLEX',
    name: 'Greenhouse Complex',
    category: POICategory.AGRICULTURAL,
    footprint: { width: 45, depth: 30 },
    height: 6,
    flattenRadius: 55,
    rampRadius: 15,
    requiresFoundation: false,
    maxSlopeForFlat: 0.08,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [],
    minElevation: 5,
    maxElevation: 45,
    rarity: 0.12,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 4000,
    roadProximity: 600,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'GREENHOUSE',
      greenhouseCount: 4,
      hasIrrigationSystem: true,
      hasStorageBuilding: true
    }
  },

  // Coastal/Beach
  BEACHSIDE_HOTEL: {
    id: 'BEACHSIDE_HOTEL',
    name: 'Beachside Hotel',
    category: POICategory.COMMERCIAL,
    footprint: { width: 45, depth: 30 },
    height: 15,
    flattenRadius: 60,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.COASTAL, SpawnContext.WATER_ADJACENT],
    biomes: [Biome.BEACH],
    factions: [],
    minElevation: 1,
    maxElevation: 15,
    rarity: 0.08,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 5000,
    roadProximity: 300,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'HOTEL',
      floors: 4,
      hasPool: true,
      hasBalconies: true,
      style: 'COASTAL'
    }
  },

  BEACH_SHACK: {
    id: 'BEACH_SHACK',
    name: 'Beach Shack',
    category: POICategory.COMMERCIAL,
    footprint: { width: 10, depth: 8 },
    height: 4,
    flattenRadius: 15,
    rampRadius: 6,
    requiresFoundation: false,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.COASTAL],
    biomes: [Biome.BEACH],
    factions: [],
    minElevation: 0,
    maxElevation: 8,
    rarity: 0.3,
    minDistanceFromSettlement: 300,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 800,
    roadProximity: 500,
    lootTier: 1,
    hasInterior: true,
    meshData: {
      type: 'SHACK',
      hasSurfboards: true,
      hasUmbrella: true,
      material: 'BAMBOO'
    }
  },

  LIGHTHOUSE: {
    id: 'LIGHTHOUSE',
    name: 'Lighthouse',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 12, depth: 12 },
    height: 30,
    flattenRadius: 20,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.3,
    spawnContexts: [SpawnContext.COASTAL],
    biomes: [Biome.BEACH],
    factions: [],
    minElevation: 2,
    maxElevation: 25,
    rarity: 0.05,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 10000,
    roadProximity: 800,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'LIGHTHOUSE',
      hasLightBeacon: true,
      hasKeepersCottage: true,
      stripePattern: true
    }
  },

  MARINA: {
    id: 'MARINA',
    name: 'Marina',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 60, depth: 40 },
    height: 6,
    flattenRadius: 70,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.08,
    spawnContexts: [SpawnContext.WATER_ADJACENT, SpawnContext.COASTAL],
    biomes: [Biome.BEACH],
    factions: [],
    minElevation: 0,
    maxElevation: 10,
    rarity: 0.06,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 8000,
    roadProximity: 400,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'MARINA',
      dockCount: 8,
      hasBoatHouse: true,
      hasOffice: true,
      hasFuelDock: true
    }
  },

  // Scientific
  WEATHER_STATION: {
    id: 'WEATHER_STATION',
    name: 'Weather Station',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 15, depth: 15 },
    height: 12,
    flattenRadius: 25,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.HIGHEST_PEAK, SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.MOUNTAIN, Biome.GRASSLAND, Biome.DESERT],
    factions: [],
    minElevation: 10,
    maxElevation: 150,
    rarity: 0.15,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 10000,
    roadProximity: 2000,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'WEATHER_STATION',
      hasRadome: true,
      hasAnemometer: true,
      hasSatelliteDish: true
    }
  },

  OBSERVATORY: {
    id: 'OBSERVATORY',
    name: 'Observatory',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 25, depth: 25 },
    height: 20,
    flattenRadius: 40,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.HIGHEST_PEAK],
    biomes: [Biome.MOUNTAIN, Biome.SNOWY_MOUNTAIN],
    factions: [],
    minElevation: 60,
    maxElevation: 180,
    rarity: 0.03,
    minDistanceFromSettlement: 5000,
    maxDistanceFromSettlement: 30000,
    minDistanceFromSame: 25000,
    roadProximity: 3000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'OBSERVATORY',
      hasDome: true,
      domeRadius: 10,
      hasVisitorCenter: true
    }
  },

  // Military/Bunkers
  BUNKER: {
    id: 'BUNKER',
    name: 'Military Bunker',
    category: POICategory.MILITARY,
    footprint: { width: 20, depth: 15 },
    height: 4,
    flattenRadius: 30,
    rampRadius: 12,
    requiresFoundation: true,
    maxSlopeForFlat: 0.3,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.WILDERNESS],
    biomes: [Biome.HILLS, Biome.MOUNTAIN, Biome.PINE_FOREST],
    factions: [],
    minElevation: 20,
    maxElevation: 100,
    rarity: 0.1,
    minDistanceFromSettlement: 3000,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 8000,
    roadProximity: 2000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'BUNKER',
      isPartiallyBuried: true,
      hasBlastDoor: true,
      hasVentShafts: true,
      camoPattern: true
    }
  },

  WATCHTOWER: {
    id: 'WATCHTOWER',
    name: 'Watchtower',
    category: POICategory.MILITARY,
    footprint: { width: 8, depth: 8 },
    height: 15,
    flattenRadius: 15,
    rampRadius: 8,
    requiresFoundation: true,
    maxSlopeForFlat: 0.25,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.WILDERNESS],
    biomes: [Biome.ANY],
    factions: [],
    minElevation: 15,
    maxElevation: 100,
    rarity: 0.2,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 3000,
    roadProximity: 1500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'WATCHTOWER',
      hasSearchlight: true,
      hasLadder: true,
      hasPlatform: true
    }
  },

  // Ruins/Abandoned
  ABANDONED_FACTORY: {
    id: 'ABANDONED_FACTORY',
    name: 'Abandoned Factory',
    category: POICategory.RUINS,
    footprint: { width: 60, depth: 45 },
    height: 15,
    flattenRadius: 80,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.12,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.RUINED_CITY, Biome.GRASSLAND],
    factions: [],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.08,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 5000,
    roadProximity: 500,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'FACTORY',
      isRuined: true,
      hasChimney: true,
      hasCranes: true,
      decayLevel: 0.7
    }
  },

  CRASHED_AIRCRAFT: {
    id: 'CRASHED_AIRCRAFT',
    name: 'Crashed Aircraft',
    category: POICategory.RUINS,
    footprint: { width: 35, depth: 12 },
    height: 8,
    flattenRadius: 20,
    rampRadius: 15,
    requiresFoundation: false,
    maxSlopeForFlat: 0.4,
    spawnContexts: [SpawnContext.WILDERNESS, SpawnContext.HILLSIDE],
    biomes: [Biome.ANY],
    factions: [],
    minElevation: 10,
    maxElevation: 120,
    rarity: 0.04,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 30000,
    minDistanceFromSame: 15000,
    roadProximity: 5000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'CRASHED_AIRCRAFT',
      aircraftType: 'CARGO',
      hasDebrisField: true,
      impactCrater: true
    }
  },

  OLD_MINE: {
    id: 'OLD_MINE',
    name: 'Abandoned Mine',
    category: POICategory.RUINS,
    footprint: { width: 30, depth: 25 },
    height: 10,
    flattenRadius: 45,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.35,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.STEEP_TERRAIN],
    biomes: [Biome.MOUNTAIN, Biome.HILLS],
    factions: [],
    minElevation: 30,
    maxElevation: 100,
    rarity: 0.08,
    minDistanceFromSettlement: 2500,
    maxDistanceFromSettlement: 18000,
    minDistanceFromSame: 10000,
    roadProximity: 2000,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'MINE',
      hasMinecart: true,
      hasTracks: true,
      hasHeadframe: true,
      shaftDepth: 'DEEP'
    }
  },

  // Desert Specific
  DESERT_OUTPOST: {
    id: 'DESERT_OUTPOST',
    name: 'Desert Outpost',
    category: POICategory.RESIDENTIAL,
    footprint: { width: 18, depth: 15 },
    height: 5,
    flattenRadius: 25,
    rampRadius: 10,
    requiresFoundation: false,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.WILDERNESS],
    biomes: [Biome.DESERT],
    factions: [],
    minElevation: 5,
    maxElevation: 40,
    rarity: 0.25,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 3000,
    roadProximity: 1500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'OUTPOST',
      hasWaterTank: true,
      hasSolarPanels: true,
      style: 'ADOBE'
    }
  },

  OASIS_CAMP: {
    id: 'OASIS_CAMP',
    name: 'Oasis Camp',
    category: POICategory.RESIDENTIAL,
    footprint: { width: 25, depth: 25 },
    height: 4,
    flattenRadius: 35,
    rampRadius: 12,
    requiresFoundation: false,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.WATER_ADJACENT],
    biomes: [Biome.DESERT],
    factions: [],
    minElevation: 5,
    maxElevation: 30,
    rarity: 0.06,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 8000,
    roadProximity: 2000,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'CAMP',
      hasTents: true,
      tentCount: 4,
      hasPalmTrees: true,
      hasWell: true
    }
  }
};

// ============================================================================
// IRON SYNOD FACTION POIs (Industrial, Rusty, Military-Industrial)
// ============================================================================

export const IronSynodPOIs = {
  IRON_FORGE: {
    id: 'IRON_FORGE',
    name: 'Iron Synod Forge',
    category: POICategory.INDUSTRIAL,
    footprint: { width: 50, depth: 40 },
    height: 18,
    flattenRadius: 70,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [Faction.IRON_SYNOD],
    minElevation: 10,
    maxElevation: 70,
    rarity: 0.12,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 4000,
    roadProximity: 400,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'FORGE',
      hasSmokestacks: true,
      smokestackCount: 3,
      hasMoltenMetal: true,
      rustLevel: 0.6,
      style: 'IRON_SYNOD'
    }
  },

  SCRAP_YARD: {
    id: 'SCRAP_YARD',
    name: 'Iron Synod Scrap Yard',
    category: POICategory.INDUSTRIAL,
    footprint: { width: 70, depth: 55 },
    height: 12,
    flattenRadius: 90,
    rampRadius: 30,
    requiresFoundation: false,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.DESERT, Biome.HILLS],
    factions: [Faction.IRON_SYNOD],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.15,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 5000,
    roadProximity: 500,
    lootTier: 2,
    hasInterior: false,
    meshData: {
      type: 'SCRAP_YARD',
      hasScrapPiles: true,
      pileCount: 8,
      hasCrusher: true,
      hasCrane: true,
      rustLevel: 0.8
    }
  },

  IRON_BUNKER: {
    id: 'IRON_BUNKER',
    name: 'Iron Synod War Bunker',
    category: POICategory.MILITARY,
    footprint: { width: 35, depth: 25 },
    height: 6,
    flattenRadius: 50,
    rampRadius: 18,
    requiresFoundation: true,
    maxSlopeForFlat: 0.25,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.WILDERNESS],
    biomes: [Biome.HILLS, Biome.MOUNTAIN, Biome.GRASSLAND],
    factions: [Faction.IRON_SYNOD],
    minElevation: 15,
    maxElevation: 90,
    rarity: 0.1,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 6000,
    roadProximity: 1500,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'BUNKER',
      hasArmorPlating: true,
      hasTurretMount: true,
      hasAmmoStorage: true,
      rustLevel: 0.5,
      style: 'IRON_SYNOD'
    }
  },

  MECH_HANGAR: {
    id: 'MECH_HANGAR',
    name: 'Iron Synod Mech Hangar',
    category: POICategory.MILITARY,
    footprint: { width: 60, depth: 45 },
    height: 25,
    flattenRadius: 80,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.DESERT, Biome.HILLS],
    factions: [Faction.IRON_SYNOD],
    minElevation: 10,
    maxElevation: 60,
    rarity: 0.05,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 10000,
    roadProximity: 800,
    lootTier: 5,
    hasInterior: true,
    meshData: {
      type: 'HANGAR',
      hasHangarDoors: true,
      hasCatwalk: true,
      hasRepairBay: true,
      rustLevel: 0.4,
      style: 'IRON_SYNOD'
    }
  },

  IRON_REFINERY: {
    id: 'IRON_REFINERY',
    name: 'Iron Synod Refinery',
    category: POICategory.INDUSTRIAL,
    footprint: { width: 80, depth: 60 },
    height: 35,
    flattenRadius: 100,
    rampRadius: 35,
    requiresFoundation: true,
    maxSlopeForFlat: 0.08,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.IRON_SYNOD],
    minElevation: 5,
    maxElevation: 45,
    rarity: 0.04,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 12000,
    roadProximity: 600,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'REFINERY',
      hasDistillationTowers: true,
      towerCount: 4,
      hasPipework: true,
      hasStorageTanks: true,
      rustLevel: 0.7,
      style: 'IRON_SYNOD'
    }
  },

  STEAM_GENERATOR: {
    id: 'STEAM_GENERATOR',
    name: 'Iron Synod Steam Plant',
    category: POICategory.UTILITY,
    footprint: { width: 45, depth: 35 },
    height: 22,
    flattenRadius: 60,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.12,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.IRON_SYNOD],
    minElevation: 10,
    maxElevation: 55,
    rarity: 0.08,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 7000,
    roadProximity: 500,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'POWER_PLANT',
      hasBoilers: true,
      hasSteamPipes: true,
      hasCoalPile: true,
      rustLevel: 0.6,
      style: 'IRON_SYNOD'
    }
  },

  IRON_BARRACKS: {
    id: 'IRON_BARRACKS',
    name: 'Iron Synod Barracks',
    category: POICategory.MILITARY,
    footprint: { width: 40, depth: 25 },
    height: 8,
    flattenRadius: 55,
    rampRadius: 18,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.SETTLEMENT_OUTSKIRTS, SpawnContext.WILDERNESS],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [Faction.IRON_SYNOD],
    minElevation: 10,
    maxElevation: 70,
    rarity: 0.18,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 3000,
    roadProximity: 600,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'BARRACKS',
      hasBunks: true,
      hasMessHall: true,
      hasArmory: true,
      rustLevel: 0.4,
      style: 'IRON_SYNOD'
    }
  },

  RAIL_DEPOT: {
    id: 'RAIL_DEPOT',
    name: 'Iron Synod Rail Depot',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 80, depth: 30 },
    height: 12,
    flattenRadius: 100,
    rampRadius: 30,
    requiresFoundation: true,
    maxSlopeForFlat: 0.05,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.IRON_SYNOD],
    minElevation: 5,
    maxElevation: 40,
    rarity: 0.06,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 10000,
    roadProximity: 400,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'RAIL_DEPOT',
      hasTrainPlatform: true,
      hasFreightYard: true,
      hasWaterTower: true,
      rustLevel: 0.5,
      style: 'IRON_SYNOD'
    }
  }
};

// ============================================================================
// CHROMA CORP FACTION POIs (Clean, Glowing, High-Tech Corporate)
// ============================================================================

export const ChromaCorpPOIs = {
  NEON_TOWER: {
    id: 'NEON_TOWER',
    name: 'Chroma Corp Neon Tower',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 25, depth: 25 },
    height: 45,
    flattenRadius: 40,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.SETTLEMENT_OUTSKIRTS, SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.HILLS, Biome.DESERT],
    factions: [Faction.CHROMA_CORP],
    minElevation: 10,
    maxElevation: 80,
    rarity: 0.15,
    minDistanceFromSettlement: 300,
    maxDistanceFromSettlement: 6000,
    minDistanceFromSame: 2500,
    roadProximity: 300,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'TOWER',
      hasNeonStrips: true,
      neonColor: 0xff00ff,
      hasHolographicSign: true,
      glowIntensity: 0.8,
      style: 'CHROMA_CORP'
    }
  },

  DATA_CENTER: {
    id: 'DATA_CENTER',
    name: 'Chroma Corp Data Center',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 50, depth: 40 },
    height: 12,
    flattenRadius: 70,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.08,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.CHROMA_CORP],
    minElevation: 10,
    maxElevation: 50,
    rarity: 0.06,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 10000,
    roadProximity: 600,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'DATA_CENTER',
      hasCoolingUnits: true,
      hasServerRacks: true,
      hasSecurityFence: true,
      glowIntensity: 0.5,
      style: 'CHROMA_CORP'
    }
  },

  HOLO_BILLBOARD: {
    id: 'HOLO_BILLBOARD',
    name: 'Chroma Corp Holographic Billboard',
    category: POICategory.COMMERCIAL,
    footprint: { width: 15, depth: 8 },
    height: 20,
    flattenRadius: 20,
    rampRadius: 8,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.ALONG_ROAD],
    biomes: [Biome.ANY],
    factions: [Faction.CHROMA_CORP],
    minElevation: 5,
    maxElevation: 60,
    rarity: 0.25,
    minDistanceFromSettlement: 200,
    maxDistanceFromSettlement: 5000,
    minDistanceFromSame: 800,
    roadProximity: 50,
    lootTier: 1,
    hasInterior: false,
    meshData: {
      type: 'BILLBOARD',
      hasHologram: true,
      hologramColor: 0x00ffff,
      hasAnimatedAds: true,
      glowIntensity: 1.0,
      style: 'CHROMA_CORP'
    }
  },

  CHROMA_LAB: {
    id: 'CHROMA_LAB',
    name: 'Chroma Corp Research Lab',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 45, depth: 35 },
    height: 15,
    flattenRadius: 60,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.CHROMA_CORP],
    minElevation: 10,
    maxElevation: 55,
    rarity: 0.08,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 8000,
    roadProximity: 500,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'LAB',
      hasCleanRoom: true,
      hasGlassPanels: true,
      hasBiohazardSection: true,
      glowIntensity: 0.6,
      style: 'CHROMA_CORP'
    }
  },

  CHROMA_CLINIC: {
    id: 'CHROMA_CLINIC',
    name: 'Chroma Corp Med-Clinic',
    category: POICategory.COMMERCIAL,
    footprint: { width: 30, depth: 25 },
    height: 10,
    flattenRadius: 45,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.12,
    spawnContexts: [SpawnContext.ALONG_ROAD, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.CHROMA_CORP],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.12,
    minDistanceFromSettlement: 500,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 4000,
    roadProximity: 300,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'CLINIC',
      hasMedPods: true,
      hasReceptionDesk: true,
      hasNeonCross: true,
      glowIntensity: 0.7,
      style: 'CHROMA_CORP'
    }
  },

  PLASMA_STATION: {
    id: 'PLASMA_STATION',
    name: 'Chroma Corp Plasma Station',
    category: POICategory.UTILITY,
    footprint: { width: 35, depth: 30 },
    height: 18,
    flattenRadius: 50,
    rampRadius: 18,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.CHROMA_CORP],
    minElevation: 10,
    maxElevation: 60,
    rarity: 0.07,
    minDistanceFromSettlement: 1200,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 8000,
    roadProximity: 500,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'POWER_PLANT',
      hasPlasmaCore: true,
      hasEnergyConduits: true,
      hasForceField: true,
      glowIntensity: 0.9,
      plasmaColor: 0x00ffff,
      style: 'CHROMA_CORP'
    }
  },

  LUXURY_RESORT: {
    id: 'LUXURY_RESORT',
    name: 'Chroma Corp Resort',
    category: POICategory.RECREATIONAL,
    footprint: { width: 70, depth: 50 },
    height: 20,
    flattenRadius: 90,
    rampRadius: 30,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.COASTAL, SpawnContext.WATER_ADJACENT],
    biomes: [Biome.BEACH, Biome.GRASSLAND],
    factions: [Faction.CHROMA_CORP],
    minElevation: 2,
    maxElevation: 30,
    rarity: 0.04,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 12000,
    roadProximity: 600,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'RESORT',
      hasInfinityPool: true,
      hasHelipad: true,
      hasNeonAccents: true,
      glowIntensity: 0.6,
      style: 'CHROMA_CORP'
    }
  },

  DRONE_HUB: {
    id: 'DRONE_HUB',
    name: 'Chroma Corp Drone Hub',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 40, depth: 40 },
    height: 25,
    flattenRadius: 55,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.SETTLEMENT_OUTSKIRTS],
    biomes: [Biome.GRASSLAND, Biome.DESERT],
    factions: [Faction.CHROMA_CORP],
    minElevation: 10,
    maxElevation: 50,
    rarity: 0.06,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 8000,
    roadProximity: 400,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'DRONE_HUB',
      hasLandingPads: true,
      padCount: 6,
      hasChargingStations: true,
      hasControlTower: true,
      glowIntensity: 0.7,
      style: 'CHROMA_CORP'
    }
  }
};

// ============================================================================
// VERDANT LINK FACTION POIs (Eco-Tech, Organic, Nature-Integrated)
// ============================================================================

export const VerdantLinkPOIs = {
  BIO_DOME: {
    id: 'BIO_DOME',
    name: 'Verdant Link Bio-Dome',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 40, depth: 40 },
    height: 25,
    flattenRadius: 55,
    rampRadius: 20,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.FOREST_EDGE],
    biomes: [Biome.GRASSLAND, Biome.PINE_FOREST],
    factions: [Faction.VERDANT_LINK],
    minElevation: 10,
    maxElevation: 60,
    rarity: 0.08,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 8000,
    roadProximity: 800,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'BIO_DOME',
      hasGlassDome: true,
      hasVineOvergrowth: true,
      hasWaterFeature: true,
      organicStyle: true,
      style: 'VERDANT_LINK'
    }
  },

  HYDRO_FARM: {
    id: 'HYDRO_FARM',
    name: 'Verdant Link Hydroponic Farm',
    category: POICategory.AGRICULTURAL,
    footprint: { width: 55, depth: 40 },
    height: 10,
    flattenRadius: 70,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.WATER_ADJACENT],
    biomes: [Biome.GRASSLAND, Biome.PINE_FOREST],
    factions: [Faction.VERDANT_LINK],
    minElevation: 5,
    maxElevation: 45,
    rarity: 0.12,
    minDistanceFromSettlement: 600,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 5000,
    roadProximity: 500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'HYDRO_FARM',
      hasGrowingTowers: true,
      towerCount: 8,
      hasWaterRecycling: true,
      hasGreenRoof: true,
      style: 'VERDANT_LINK'
    }
  },

  TREE_SANCTUARY: {
    id: 'TREE_SANCTUARY',
    name: 'Verdant Link Tree Sanctuary',
    category: POICategory.RELIGIOUS,
    footprint: { width: 35, depth: 35 },
    height: 30,
    flattenRadius: 50,
    rampRadius: 18,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.WILDERNESS],
    biomes: [Biome.PINE_FOREST, Biome.GRASSLAND],
    factions: [Faction.VERDANT_LINK],
    minElevation: 15,
    maxElevation: 70,
    rarity: 0.06,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 10000,
    roadProximity: 1500,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'SANCTUARY',
      hasCentralTree: true,
      treeHeight: 25,
      hasWalkways: true,
      hasMeditationPlatforms: true,
      style: 'VERDANT_LINK'
    }
  },

  SEED_VAULT: {
    id: 'SEED_VAULT',
    name: 'Verdant Link Seed Vault',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 30, depth: 25 },
    height: 8,
    flattenRadius: 45,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.WILDERNESS],
    biomes: [Biome.HILLS, Biome.PINE_FOREST, Biome.MOUNTAIN],
    factions: [Faction.VERDANT_LINK],
    minElevation: 25,
    maxElevation: 80,
    rarity: 0.05,
    minDistanceFromSettlement: 2500,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 15000,
    roadProximity: 2000,
    lootTier: 5,
    hasInterior: true,
    meshData: {
      type: 'VAULT',
      isPartiallyBuried: true,
      hasGreenRoof: true,
      hasCryoChambers: true,
      style: 'VERDANT_LINK'
    }
  },

  MOSS_GENERATOR: {
    id: 'MOSS_GENERATOR',
    name: 'Verdant Link Bio-Generator',
    category: POICategory.UTILITY,
    footprint: { width: 35, depth: 30 },
    height: 15,
    flattenRadius: 50,
    rampRadius: 18,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.FOREST_EDGE],
    biomes: [Biome.GRASSLAND, Biome.PINE_FOREST],
    factions: [Faction.VERDANT_LINK],
    minElevation: 10,
    maxElevation: 55,
    rarity: 0.1,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 10000,
    minDistanceFromSame: 6000,
    roadProximity: 600,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'BIO_GENERATOR',
      hasBioReactors: true,
      reactorCount: 4,
      hasMossCovering: true,
      hasCompostIntake: true,
      style: 'VERDANT_LINK'
    }
  },

  WILDLIFE_STATION: {
    id: 'WILDLIFE_STATION',
    name: 'Verdant Link Wildlife Station',
    category: POICategory.SCIENTIFIC,
    footprint: { width: 28, depth: 22 },
    height: 8,
    flattenRadius: 40,
    rampRadius: 14,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.WILDERNESS],
    biomes: [Biome.PINE_FOREST, Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.VERDANT_LINK],
    minElevation: 10,
    maxElevation: 65,
    rarity: 0.15,
    minDistanceFromSettlement: 1200,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 4000,
    roadProximity: 1000,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'WILDLIFE_STATION',
      hasObservationDeck: true,
      hasAnimalEnclosures: true,
      hasVetClinic: true,
      style: 'VERDANT_LINK'
    }
  },

  VERTICAL_GARDEN: {
    id: 'VERTICAL_GARDEN',
    name: 'Verdant Link Vertical Garden',
    category: POICategory.AGRICULTURAL,
    footprint: { width: 20, depth: 20 },
    height: 35,
    flattenRadius: 30,
    rampRadius: 12,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.SETTLEMENT_OUTSKIRTS, SpawnContext.ALONG_ROAD],
    biomes: [Biome.GRASSLAND, Biome.PINE_FOREST],
    factions: [Faction.VERDANT_LINK],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.12,
    minDistanceFromSettlement: 400,
    maxDistanceFromSettlement: 8000,
    minDistanceFromSame: 3000,
    roadProximity: 400,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'VERTICAL_GARDEN',
      hasGrowingWalls: true,
      wallCount: 4,
      hasIrrigationSystem: true,
      hasRooftopGarden: true,
      style: 'VERDANT_LINK'
    }
  },

  MYCELIUM_NETWORK: {
    id: 'MYCELIUM_NETWORK',
    name: 'Verdant Link Mycelium Hub',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 25, depth: 25 },
    height: 6,
    flattenRadius: 40,
    rampRadius: 15,
    requiresFoundation: false,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.FOREST_EDGE, SpawnContext.WILDERNESS],
    biomes: [Biome.PINE_FOREST, Biome.GRASSLAND],
    factions: [Faction.VERDANT_LINK],
    minElevation: 10,
    maxElevation: 55,
    rarity: 0.08,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 6000,
    roadProximity: 1200,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'MYCELIUM_HUB',
      hasMushroomClusters: true,
      hasBioluminescence: true,
      hasUndergroundNetwork: true,
      glowColor: 0x88ff88,
      style: 'VERDANT_LINK'
    }
  }
};

// ============================================================================
// NULL DRIFTERS FACTION POIs (Anarchist, Nomadic, Makeshift)
// ============================================================================

export const NullDriftersPOIs = {
  SCAV_CAMP: {
    id: 'SCAV_CAMP',
    name: 'Null Drifters Scav Camp',
    category: POICategory.RESIDENTIAL,
    footprint: { width: 35, depth: 30 },
    height: 6,
    flattenRadius: 45,
    rampRadius: 15,
    requiresFoundation: false,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.WILDERNESS, SpawnContext.FOREST_EDGE],
    biomes: [Biome.DESERT, Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 5,
    maxElevation: 60,
    rarity: 0.2,
    minDistanceFromSettlement: 800,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 2000,
    roadProximity: 1500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'CAMP',
      hasTents: true,
      tentCount: 5,
      hasFirePit: true,
      hasScrapWalls: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  RAIDER_OUTPOST: {
    id: 'RAIDER_OUTPOST',
    name: 'Null Drifters Raider Outpost',
    category: POICategory.MILITARY,
    footprint: { width: 30, depth: 25 },
    height: 10,
    flattenRadius: 45,
    rampRadius: 15,
    requiresFoundation: true,
    maxSlopeForFlat: 0.25,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.ALONG_ROAD],
    biomes: [Biome.DESERT, Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 15,
    maxElevation: 75,
    rarity: 0.15,
    minDistanceFromSettlement: 1200,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 4000,
    roadProximity: 500,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'OUTPOST',
      hasWatchtower: true,
      hasSpikeBarricades: true,
      hasGraffitiWalls: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  JUNK_FORTRESS: {
    id: 'JUNK_FORTRESS',
    name: 'Null Drifters Junk Fortress',
    category: POICategory.MILITARY,
    footprint: { width: 50, depth: 45 },
    height: 15,
    flattenRadius: 70,
    rampRadius: 25,
    requiresFoundation: true,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.FLAT_TERRAIN, SpawnContext.WILDERNESS],
    biomes: [Biome.DESERT, Biome.GRASSLAND],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 5,
    maxElevation: 50,
    rarity: 0.06,
    minDistanceFromSettlement: 2000,
    maxDistanceFromSettlement: 18000,
    minDistanceFromSame: 12000,
    roadProximity: 1000,
    lootTier: 4,
    hasInterior: true,
    meshData: {
      type: 'FORTRESS',
      hasJunkWalls: true,
      wallHeight: 8,
      hasTurrets: true,
      hasVehicleGraveyard: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  RADIO_PIRATE: {
    id: 'RADIO_PIRATE',
    name: 'Null Drifters Pirate Radio',
    category: POICategory.INFRASTRUCTURE,
    footprint: { width: 18, depth: 15 },
    height: 25,
    flattenRadius: 25,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.3,
    spawnContexts: [SpawnContext.HILLSIDE, SpawnContext.HIGHEST_PEAK],
    biomes: [Biome.HILLS, Biome.MOUNTAIN, Biome.DESERT],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 30,
    maxElevation: 100,
    rarity: 0.1,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 8000,
    roadProximity: 2000,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'RADIO_STATION',
      hasMakeshiftAntenna: true,
      hasGraffitiArt: true,
      hasSolarPanels: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  UNDERGROUND_MARKET: {
    id: 'UNDERGROUND_MARKET',
    name: 'Null Drifters Black Market',
    category: POICategory.COMMERCIAL,
    footprint: { width: 40, depth: 35 },
    height: 5,
    flattenRadius: 55,
    rampRadius: 18,
    requiresFoundation: false,
    maxSlopeForFlat: 0.15,
    spawnContexts: [SpawnContext.WILDERNESS, SpawnContext.ALONG_ROAD],
    biomes: [Biome.DESERT, Biome.GRASSLAND, Biome.RUINED_CITY],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 5,
    maxElevation: 45,
    rarity: 0.08,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 15000,
    minDistanceFromSame: 10000,
    roadProximity: 800,
    lootTier: 3,
    hasInterior: true,
    meshData: {
      type: 'MARKET',
      hasStalls: true,
      stallCount: 12,
      hasTarpCovers: true,
      hasNeonSigns: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  VEHICLE_GRAVEYARD: {
    id: 'VEHICLE_GRAVEYARD',
    name: 'Null Drifters Vehicle Boneyard',
    category: POICategory.INDUSTRIAL,
    footprint: { width: 80, depth: 60 },
    height: 8,
    flattenRadius: 100,
    rampRadius: 30,
    requiresFoundation: false,
    maxSlopeForFlat: 0.1,
    spawnContexts: [SpawnContext.FLAT_TERRAIN],
    biomes: [Biome.DESERT, Biome.GRASSLAND],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 5,
    maxElevation: 40,
    rarity: 0.07,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 18000,
    minDistanceFromSame: 12000,
    roadProximity: 600,
    lootTier: 3,
    hasInterior: false,
    meshData: {
      type: 'BONEYARD',
      hasWreckedVehicles: true,
      vehicleCount: 15,
      hasWorkshop: true,
      hasCrusher: true,
      style: 'NULL_DRIFTERS'
    }
  },

  NOMAD_SHRINE: {
    id: 'NOMAD_SHRINE',
    name: 'Null Drifters Wanderer Shrine',
    category: POICategory.RELIGIOUS,
    footprint: { width: 15, depth: 15 },
    height: 12,
    flattenRadius: 22,
    rampRadius: 10,
    requiresFoundation: true,
    maxSlopeForFlat: 0.3,
    spawnContexts: [SpawnContext.WILDERNESS, SpawnContext.HILLSIDE],
    biomes: [Biome.DESERT, Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 10,
    maxElevation: 70,
    rarity: 0.12,
    minDistanceFromSettlement: 1500,
    maxDistanceFromSettlement: 20000,
    minDistanceFromSame: 5000,
    roadProximity: 2500,
    lootTier: 2,
    hasInterior: false,
    meshData: {
      type: 'SHRINE',
      hasTotemPole: true,
      hasOfferings: true,
      hasSkullDecor: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  },

  DISTILLERY: {
    id: 'DISTILLERY',
    name: 'Null Drifters Moonshine Still',
    category: POICategory.INDUSTRIAL,
    footprint: { width: 22, depth: 18 },
    height: 8,
    flattenRadius: 32,
    rampRadius: 12,
    requiresFoundation: true,
    maxSlopeForFlat: 0.2,
    spawnContexts: [SpawnContext.WILDERNESS, SpawnContext.FOREST_EDGE],
    biomes: [Biome.PINE_FOREST, Biome.GRASSLAND, Biome.HILLS],
    factions: [Faction.NULL_DRIFTERS],
    minElevation: 10,
    maxElevation: 55,
    rarity: 0.14,
    minDistanceFromSettlement: 1000,
    maxDistanceFromSettlement: 12000,
    minDistanceFromSame: 5000,
    roadProximity: 1500,
    lootTier: 2,
    hasInterior: true,
    meshData: {
      type: 'DISTILLERY',
      hasStills: true,
      stillCount: 3,
      hasBarrels: true,
      hasFirePit: true,
      makeshiftStyle: true,
      style: 'NULL_DRIFTERS'
    }
  }
};

// ============================================================================
// EXPORTS AND AGGREGATION
// ============================================================================

// Combine all POIs into a single lookup
export const AllPOIs = {
  ...NeutralPOIs,
  ...IronSynodPOIs,
  ...ChromaCorpPOIs,
  ...VerdantLinkPOIs,
  ...NullDriftersPOIs
};

// Get POIs by faction
export function getPOIsByFaction(faction) {
  return Object.values(AllPOIs).filter(poi =>
    poi.factions.length === 0 || poi.factions.includes(faction)
  );
}

// Get POIs by biome
export function getPOIsByBiome(biome) {
  return Object.values(AllPOIs).filter(poi =>
    poi.biomes.includes(Biome.ANY) || poi.biomes.includes(biome)
  );
}

// Get POIs by spawn context
export function getPOIsByContext(context) {
  return Object.values(AllPOIs).filter(poi =>
    poi.spawnContexts.includes(context)
  );
}

// Get POIs by category
export function getPOIsByCategory(category) {
  return Object.values(AllPOIs).filter(poi =>
    poi.category === category
  );
}

// Get faction-specific POIs only (not neutral)
export function getFactionExclusivePOIs(faction) {
  const factionMaps = {
    [POIFaction.IRON_SYNOD]: IronSynodPOIs,
    [POIFaction.CHROMA_CORP]: ChromaCorpPOIs,
    [POIFaction.VERDANT_LINK]: VerdantLinkPOIs,
    [POIFaction.NULL_DRIFTERS]: NullDriftersPOIs
  };
  return Object.values(factionMaps[faction] || {});
}
