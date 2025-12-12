/**
 * GeopoliticalMacroLayer.js - Main integration module
 *
 * Coordinates the Political Map, Territory Manager, and Highway System
 * to create a coherent geopolitical layer for the game world.
 *
 * This is the primary interface for the rest of the game to interact
 * with faction territories, settlements, and road networks.
 */

import { PoliticalMapGenerator } from './PoliticalMapGenerator.js';
import { FactionTerritoryManager, TerritoryState, Settlement } from './FactionTerritoryManager.js';
import { GlobalHighwaySystem } from './GlobalHighwaySystem.js';
import { Faction, FactionColors, FactionThemes, SettlementTier, SettlementConfig } from './Factions.js';
import { worldConfig } from '../shared/config.js';
import POIManager from './POIManager.js';

/**
 * GeopoliticalMacroLayer - Main coordinator for all geopolitical systems
 */
export class GeopoliticalMacroLayer {
    constructor(worldGenerator, seed = worldConfig.seed) {
        this.worldGenerator = worldGenerator;
        this.seed = seed;

        // Sub-systems
        this.politicalMap = null;
        this.territoryManager = null;
        this.highwaySystem = null;
        this.poiManager = null;

        // State
        this.isInitialized = false;
        this.initializationTime = 0;

        // Event handlers
        this.eventHandlers = new Map();
    }

    /**
     * Initialize the complete geopolitical layer
     * This should be called once during server startup
     */
    async initialize() {
        console.log('='.repeat(60));
        console.log('[GeopoliticalMacroLayer] Initializing...');
        console.log('='.repeat(60));

        const startTime = Date.now();

        try {
            // Phase 1: Generate Political Map (Voronoi territories)
            console.log('\n[Phase 1] Generating Political Map...');
            this.politicalMap = new PoliticalMapGenerator(this.seed);
            this.politicalMap.generate(this.worldGenerator);

            // Phase 2: Initialize Territory Manager (settlements, ownership)
            console.log('\n[Phase 2] Initializing Territory Manager...');
            this.territoryManager = new FactionTerritoryManager(
                this.politicalMap,
                this.worldGenerator
            );

            // Phase 3: Generate Highway Network
            console.log('\n[Phase 3] Generating Highway Network...');
            this.highwaySystem = new GlobalHighwaySystem(
                this.politicalMap,
                this.territoryManager,
                this.worldGenerator,
                this.seed
            );
            this.highwaySystem.generate();

            // Phase 4: Initialize POI Manager and generate world POIs
            console.log('\n[Phase 4] Initializing POI Manager and generating POIs...');
            this.poiManager = new POIManager(
                this.worldGenerator,
                this.politicalMap,
                this.highwaySystem
            );
            await this.poiManager.generateWorldPOIs();

            // Setup event forwarding
            this.setupEventHandlers();

            this.isInitialized = true;
            this.initializationTime = Date.now() - startTime;

            // Log summary
            this.logSummary();

            return true;

        } catch (error) {
            console.error('[GeopoliticalMacroLayer] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Setup event handlers between sub-systems
     */
    setupEventHandlers() {
        // Forward territory capture events
        this.territoryManager.on('territoryCapture', (data) => {
            this.emitEvent('territoryCapture', data);

            // Log the capture
            console.log(`[Territory] ${data.newOwner} captured ${data.cellId} from ${data.oldOwner}`);
        });
    }

    /**
     * Log initialization summary
     */
    logSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('[GeopoliticalMacroLayer] Initialization Complete!');
        console.log('='.repeat(60));

        console.log(`\nTime: ${this.initializationTime}ms`);

        console.log('\n--- Political Map ---');
        console.log(`  World Size: ${this.politicalMap.worldSize / 1000}km x ${this.politicalMap.worldSize / 1000}km`);
        console.log(`  Total Cells: ${this.politicalMap.cells.size}`);

        console.log('\n--- Faction Distribution ---');
        const factionStats = this.territoryManager.serializeFactionStats();
        for (const faction of Object.values(Faction)) {
            const stats = factionStats[faction];
            if (stats) {
                console.log(`  ${faction}:`);
                console.log(`    Cells: ${stats.totalCells}`);
                console.log(`    Capitals: ${stats.capitals}, Towns: ${stats.towns}, Villages: ${stats.villages}`);
                console.log(`    Population: ${stats.totalPopulation.toLocaleString()}`);
            }
        }

        console.log('\n--- Settlements ---');
        const capitals = this.territoryManager.getSettlementsByTier(SettlementTier.CAPITAL);
        const towns = this.territoryManager.getSettlementsByTier(SettlementTier.TOWN);
        const villages = this.territoryManager.getSettlementsByTier(SettlementTier.VILLAGE);
        console.log(`  Capitals: ${capitals.length}`);
        console.log(`  Towns: ${towns.length}`);
        console.log(`  Villages: ${villages.length}`);
        console.log(`  Total: ${this.territoryManager.settlements.size}`);

        console.log('\n--- Highway System ---');
        const roadStats = this.highwaySystem.getStatistics();
        console.log(`  Roads: ${roadStats.totalRoads}`);
        console.log(`  Total Length: ${roadStats.totalLength}km`);
        console.log(`  Border Crossings: ${roadStats.borderCrossings}`);
        console.log(`  Tunnels: ${roadStats.tunnels} (${roadStats.tunnelLength}km)`);

        if (this.poiManager) {
            console.log('\n--- POI System ---');
            const poiStats = this.poiManager.getStatistics();
            console.log(`  Total POIs: ${poiStats.total}`);
            console.log(`  With Foundations: ${poiStats.withFoundations}`);
            console.log(`  By Category:`);
            for (const [category, count] of Object.entries(poiStats.byCategory)) {
                console.log(`    ${category}: ${count}`);
            }
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }

    /**
     * Update tick - called from main game loop
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (!this.isInitialized) return;

        // Spread faction influence (slow tick)
        this.territoryManager.spreadInfluence(dt);

        // Economic tick
        const production = this.territoryManager.tickEconomy(dt);

        return production;
    }

    /**
     * Get faction at world position
     */
    getFactionAt(x, z) {
        if (!this.isInitialized) return null;
        return this.politicalMap.getFactionAtPosition(x, z);
    }

    /**
     * Get territory state at world position
     */
    getTerritoryAt(x, z) {
        if (!this.isInitialized) return null;
        return this.territoryManager.getTerritoryAtPosition(x, z);
    }

    /**
     * Get nearest settlement to position
     */
    getNearestSettlement(x, z, maxDistance = Infinity) {
        if (!this.isInitialized) return null;
        return this.territoryManager.getNearestSettlement(x, z, maxDistance);
    }

    /**
     * Get nearest road to position
     */
    getNearestRoad(x, z, maxDistance = 5000) {
        if (!this.isInitialized) return null;
        return this.highwaySystem.getNearestRoad(x, z, maxDistance);
    }

    /**
     * Attempt to capture territory
     */
    captureTerritory(cellId, attackingFaction, strength) {
        if (!this.isInitialized) return { success: false };
        return this.territoryManager.attemptCapture(cellId, attackingFaction, strength);
    }

    /**
     * Get all settlements for a faction
     */
    getFactionSettlements(faction) {
        if (!this.isInitialized) return [];
        return this.territoryManager.getSettlementsByFaction(faction);
    }

    /**
     * Get faction capital
     */
    getFactionCapital(faction) {
        if (!this.isInitialized) return null;
        return this.territoryManager.getFactionCapital(faction);
    }

    /**
     * Get contested zones
     */
    getContestedZones() {
        if (!this.isInitialized) return [];
        return this.territoryManager.getContestedZones();
    }

    /**
     * Get border crossings
     */
    getBorderCrossings() {
        if (!this.isInitialized) return [];
        return Array.from(this.highwaySystem.borderCrossings.values());
    }

    /**
     * Register event handler
     */
    on(event, callback) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(callback);
    }

    /**
     * Emit event
     */
    emitEvent(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(data);
            }
        }
    }

    /**
     * Serialize all data for client sync
     */
    serialize() {
        if (!this.isInitialized) return null;

        return {
            politicalMap: this.politicalMap.serialize(),
            territories: this.territoryManager.serializeTerritories(),
            settlements: this.territoryManager.serializeSettlements(),
            factionStats: this.territoryManager.serializeFactionStats(),
            roads: this.highwaySystem.serializeRoads(),
            borderCrossings: this.highwaySystem.serializeBorderCrossings(),
            tunnels: this.highwaySystem.serializeTunnels()
        };
    }

    /**
     * Get simplified data for minimap/overview
     */
    serializeOverview() {
        if (!this.isInitialized) return null;

        // Simplified cell data for minimap
        const cells = [];
        for (const cell of this.politicalMap.cells.values()) {
            cells.push({
                id: cell.id,
                faction: cell.faction,
                centroid: cell.centroid,
                tier: cell.settlementTier,
                isBorder: cell.isBorderCell
            });
        }

        return {
            worldSize: this.politicalMap.worldSize,
            cells: cells,
            capitals: Object.fromEntries(this.politicalMap.factionCapitals),
            borderCrossings: this.highwaySystem.serializeBorderCrossings()
        };
    }

    /**
     * Get POI data for chunk generation
     * Called when generating a chunk to place geopolitical POIs
     */
    getPOIsForChunk(chunkX, chunkZ, chunkSize) {
        if (!this.isInitialized) return [];

        const pois = [];
        const startX = chunkX * chunkSize;
        const startZ = chunkZ * chunkSize;
        const endX = startX + chunkSize;
        const endZ = startZ + chunkSize;

        // Check if any settlement centroid is in this chunk
        for (const settlement of this.territoryManager.settlements.values()) {
            const pos = settlement.position;
            if (pos.x >= startX && pos.x < endX && pos.z >= startZ && pos.z < endZ) {
                pois.push({
                    type: 'SETTLEMENT',
                    tier: settlement.tier,
                    faction: settlement.faction,
                    style: settlement.getStyle(),
                    position: pos,
                    settlementId: settlement.id
                });
            }
        }

        // Check if any border crossing is in this chunk
        for (const crossing of this.highwaySystem.borderCrossings.values()) {
            const pos = crossing.position;
            if (pos.x >= startX && pos.x < endX && pos.z >= startZ && pos.z < endZ) {
                pois.push({
                    type: 'BORDER_CROSSING',
                    checkpointType: crossing.checkpointType,
                    factions: { from: crossing.fromFaction, to: crossing.toFaction },
                    position: pos,
                    crossingId: crossing.id
                });
            }
        }

        // Check if any road segment crosses this chunk
        for (const road of this.highwaySystem.roads.values()) {
            for (const segment of road.segments) {
                // Simple bounding box check
                const minX = Math.min(segment.start.x, segment.end.x);
                const maxX = Math.max(segment.start.x, segment.end.x);
                const minZ = Math.min(segment.start.z, segment.end.z);
                const maxZ = Math.max(segment.start.z, segment.end.z);

                if (maxX >= startX && minX < endX && maxZ >= startZ && minZ < endZ) {
                    pois.push({
                        type: 'ROAD_SEGMENT',
                        roadClass: road.roadClass,
                        segmentType: segment.type,
                        start: segment.start,
                        end: segment.end,
                        width: segment.width,
                        roadId: road.id,
                        segmentId: segment.id
                    });
                }
            }
        }

        // Add terrain/wilderness POIs from POIManager
        if (this.poiManager) {
            const terrainPOIs = this.poiManager.getPOIsForChunk(chunkX, chunkZ, chunkSize);
            for (const terrainPOI of terrainPOIs) {
                const serialized = this.poiManager.serializePOI(terrainPOI);
                pois.push({
                    ...serialized,
                    poiType: serialized.type,  // Preserve original POI type (GAS_STATION, etc.) for mesh generation
                    type: 'TERRAIN_POI'        // Override type for client-side identification
                });
            }
        }

        return pois;
    }

    /**
     * Get terrain height modifications for a chunk
     * Used by WorldGenerator to apply terrain surgery
     */
    getTerrainModifications(chunkX, chunkZ) {
        if (!this.isInitialized || !this.poiManager) {
            return null;
        }
        return this.poiManager.getTerrainModifications();
    }

    /**
     * Process chunk heightmap with POI terrain modifications
     */
    processChunkHeightmap(chunkX, chunkZ, heightMap) {
        if (!this.isInitialized || !this.poiManager) {
            return heightMap;
        }
        return this.poiManager.processChunkHeightmap(chunkX, chunkZ, heightMap);
    }

    /**
     * Get all POIs for initial client sync
     */
    getAllPOIs() {
        if (!this.isInitialized || !this.poiManager) {
            return [];
        }
        return this.poiManager.getAllPOIsForClient();
    }

    /**
     * Get a random roadside POI position for player spawning
     * Returns null if no roadside POIs exist
     */
    getRandomRoadsidePOI() {
        if (!this.isInitialized || !this.poiManager) {
            return null;
        }
        return this.poiManager.getRandomRoadsidePOI();
    }
}

// Re-export sub-modules for direct access if needed
export {
    Faction,
    FactionColors,
    FactionThemes,
    SettlementTier,
    SettlementConfig,
    PoliticalMapGenerator,
    FactionTerritoryManager,
    TerritoryState,
    Settlement,
    GlobalHighwaySystem,
    POIManager
};

export default GeopoliticalMacroLayer;
