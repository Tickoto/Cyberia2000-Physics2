/**
 * GlobalHighwaySystem.js - Strategic road network connecting settlements
 *
 * Creates a highway network using A* pathfinding that:
 * - Connects settlements with roads based on priority
 * - Curves around high-cost terrain (mountains, water)
 * - Detects border crossings for checkpoint POI generation
 * - Creates tunnels through mountains when cost-effective
 */

import { createNoise2D } from 'simplex-noise';
import { Faction, SettlementTier, SettlementConfig } from './Factions.js';
import { worldConfig } from '../shared/config.js';

// Pseudo-random seeding (same as other modules)
function seededRandom(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h >>> 0) / 4294967296;
    };
}

/**
 * RoadSegment - A single segment of road between two points
 */
export class RoadSegment {
    constructor(id, start, end, type = 'HIGHWAY') {
        this.id = id;
        this.start = start;                     // { x, y, z }
        this.end = end;                         // { x, y, z }
        this.type = type;                       // HIGHWAY, TUNNEL, BRIDGE
        this.length = this.calculateLength();

        // Road properties
        this.width = type === 'HIGHWAY' ? 20 : 15;  // meters
        this.lanes = type === 'HIGHWAY' ? 4 : 2;
        this.speedLimit = type === 'TUNNEL' ? 80 : 120; // km/h

        // Metadata
        this.crossesBorder = false;
        this.borderFactions = null;             // { from, to } if crosses border
        this.terrainType = 'NORMAL';            // NORMAL, ELEVATED, TUNNEL, BRIDGE
    }

    calculateLength() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const dz = this.end.z - this.start.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Get a point along the segment at parameter t (0-1)
     */
    getPointAt(t) {
        return {
            x: this.start.x + (this.end.x - this.start.x) * t,
            y: this.start.y + (this.end.y - this.start.y) * t,
            z: this.start.z + (this.end.z - this.start.z) * t
        };
    }

    serialize() {
        return {
            id: this.id,
            start: this.start,
            end: this.end,
            type: this.type,
            length: this.length,
            width: this.width,
            crossesBorder: this.crossesBorder,
            borderFactions: this.borderFactions
        };
    }
}

/**
 * Road - Complete road connecting two settlements via multiple segments
 */
export class Road {
    constructor(id, startSettlement, endSettlement) {
        this.id = id;
        this.startSettlementId = startSettlement.id;
        this.endSettlementId = endSettlement.id;
        this.startFaction = startSettlement.faction;
        this.endFaction = endSettlement.faction;

        this.segments = [];                     // Array of RoadSegments
        this.waypoints = [];                    // Simplified path for nav
        this.totalLength = 0;

        // Border crossings along this road
        this.borderCrossings = [];              // { position, fromFaction, toFaction }

        // Road class based on settlement tiers
        this.roadClass = this.calculateRoadClass(startSettlement, endSettlement);
    }

    calculateRoadClass(start, end) {
        const minPriority = Math.min(
            SettlementConfig[start.tier].roadPriority,
            SettlementConfig[end.tier].roadPriority
        );

        if (minPriority >= 3) return 'INTERSTATE';     // Capital connections
        if (minPriority >= 2) return 'HIGHWAY';        // Town connections
        return 'REGIONAL';                              // Village roads
    }

    addSegment(segment) {
        this.segments.push(segment);
        this.totalLength += segment.length;
    }

    /**
     * Check if this road crosses a faction border
     */
    crossesBorder() {
        return this.startFaction !== this.endFaction;
    }

    serialize() {
        return {
            id: this.id,
            startSettlement: this.startSettlementId,
            endSettlement: this.endSettlementId,
            roadClass: this.roadClass,
            totalLength: this.totalLength,
            crossesBorder: this.crossesBorder(),
            borderCrossings: this.borderCrossings,
            segments: this.segments.map(s => s.serialize())
        };
    }
}

/**
 * BorderCrossing - A checkpoint location where a road crosses faction borders
 */
export class BorderCrossing {
    constructor(id, position, roadId, fromFaction, toFaction) {
        this.id = id;
        this.position = position;               // { x, y, z }
        this.roadId = roadId;
        this.fromFaction = fromFaction;
        this.toFaction = toFaction;

        // Checkpoint properties
        this.checkpointType = 'STANDARD';       // STANDARD, FORTIFIED, ABANDONED
        this.isOpen = true;                     // Can traffic pass?
        this.tollRate = 10;                     // Cost to cross

        // POI generation flag
        this.poiGenerated = false;
    }

    serialize() {
        return {
            id: this.id,
            position: this.position,
            roadId: this.roadId,
            fromFaction: this.fromFaction,
            toFaction: this.toFaction,
            checkpointType: this.checkpointType,
            isOpen: this.isOpen
        };
    }
}

/**
 * Tunnel - Underground passage through terrain
 */
export class Tunnel {
    constructor(id, entrance, exit, length) {
        this.id = id;
        this.entrance = entrance;               // { x, y, z }
        this.exit = exit;                       // { x, y, z }
        this.length = length;

        // Tunnel properties
        this.depth = 0;                         // Max depth below surface
        this.ventilationShafts = [];            // Intermediate access points
        this.lightingLevel = 0.7;               // 0-1
    }

    serialize() {
        return {
            id: this.id,
            entrance: this.entrance,
            exit: this.exit,
            length: this.length,
            depth: this.depth
        };
    }
}

/**
 * GlobalHighwaySystem - Main road network manager
 */
export class GlobalHighwaySystem {
    constructor(politicalMap, territoryManager, worldGenerator, seed = worldConfig.seed) {
        this.politicalMap = politicalMap;
        this.territoryManager = territoryManager;
        this.worldGenerator = worldGenerator;

        this.seed = seed;
        this.rng = seededRandom(seed + '_highways');
        this.noiseVariation = createNoise2D(seededRandom(seed + '_roadvar'));

        // Road network data
        this.roads = new Map();                 // roadId -> Road
        this.segments = new Map();              // segmentId -> RoadSegment
        this.borderCrossings = new Map();       // crossingId -> BorderCrossing
        this.tunnels = new Map();               // tunnelId -> Tunnel

        // Graph representation for navigation
        this.settlementGraph = new Map();       // settlementId -> Set<settlementId>
        this.roadGraph = new Map();             // settlementId -> Map<settlementId, roadId>

        // Pathfinding grid for A* (coarse resolution)
        this.pathfindingGridSize = 500;         // 500m cells
        this.costGrid = null;                   // 2D array of terrain costs

        // Statistics
        this.totalRoadLength = 0;
        this.isGenerated = false;
    }

    /**
     * Generate the complete highway network
     */
    generate() {
        console.log('[HighwaySystem] Generating road network...');
        const startTime = Date.now();

        // Step 1: Build terrain cost grid
        this.buildCostGrid();

        // Step 2: Determine which settlements to connect
        const connections = this.planConnections();
        console.log(`[HighwaySystem] Planned ${connections.length} road connections`);

        // Step 3: Generate roads using A* pathfinding
        for (const conn of connections) {
            this.generateRoad(conn.start, conn.end);
        }

        // Step 4: Detect and create border crossings
        this.detectBorderCrossings();

        // Step 5: Identify tunnel opportunities
        this.identifyTunnels();

        this.isGenerated = true;
        console.log(`[HighwaySystem] Generated ${this.roads.size} roads with ${this.borderCrossings.size} border crossings in ${Date.now() - startTime}ms`);

        return this;
    }

    /**
     * Build terrain cost grid for pathfinding
     */
    buildCostGrid() {
        const worldSize = this.politicalMap.worldSize;
        const gridSize = Math.ceil(worldSize / this.pathfindingGridSize);

        this.costGrid = [];
        const halfWorld = worldSize / 2;

        for (let gz = 0; gz < gridSize; gz++) {
            this.costGrid[gz] = [];
            for (let gx = 0; gx < gridSize; gx++) {
                // Convert grid to world coordinates
                const worldX = (gx * this.pathfindingGridSize) - halfWorld + this.pathfindingGridSize / 2;
                const worldZ = (gz * this.pathfindingGridSize) - halfWorld + this.pathfindingGridSize / 2;

                // Sample terrain
                const terrain = this.worldGenerator.calculateTerrain(worldX, worldZ);
                const cost = this.calculateTerrainCost(terrain);

                this.costGrid[gz][gx] = {
                    cost: cost,
                    worldX: worldX,
                    worldZ: worldZ,
                    height: terrain.height,
                    biome: terrain.biome.id,
                    isWater: terrain.isWater
                };
            }
        }
    }

    /**
     * Calculate movement cost for terrain
     */
    calculateTerrainCost(terrain) {
        // Base cost
        let cost = 1.0;

        // Water is impassable (or very expensive)
        if (terrain.isWater) {
            return 1000;
        }

        // Height-based cost (steeper = more expensive)
        const heightCost = Math.abs(terrain.height) * 0.1;
        cost += heightCost;

        // Mountain penalty
        if (terrain.height > 30) {
            cost += (terrain.height - 30) * 0.5;
        }

        // Very steep mountains are nearly impassable
        if (terrain.height > 60) {
            cost += (terrain.height - 60) * 2;
        }

        // Biome modifiers
        const biomeId = terrain.biome.id;
        switch (biomeId) {
            case 'OCEAN':
                cost = 1000;
                break;
            case 'MOUNTAIN':
            case 'SNOWY_MOUNTAIN':
                cost *= 3;
                break;
            case 'PINE_FOREST':
                cost *= 1.5;
                break;
            case 'DESERT':
                cost *= 1.2;
                break;
            case 'RUINED_CITY':
                cost *= 0.8; // Easier to build on flat ruins
                break;
            case 'GRASSLAND':
            case 'BEACH':
                cost *= 0.9;
                break;
        }

        return cost;
    }

    /**
     * Plan which settlements should be connected
     */
    planConnections() {
        const connections = [];
        const settlements = Array.from(this.territoryManager.settlements.values());

        // Sort by tier priority (capitals first)
        settlements.sort((a, b) => {
            const prioA = SettlementConfig[a.tier].roadPriority;
            const prioB = SettlementConfig[b.tier].roadPriority;
            return prioB - prioA;
        });

        // Track what's connected
        const connected = new Set();

        // Strategy 1: Connect all capitals to each other
        const capitals = settlements.filter(s => s.tier === SettlementTier.CAPITAL);
        for (let i = 0; i < capitals.length; i++) {
            for (let j = i + 1; j < capitals.length; j++) {
                connections.push({ start: capitals[i], end: capitals[j], priority: 10 });
                connected.add(capitals[i].id);
                connected.add(capitals[j].id);
            }
        }

        // Strategy 2: Connect each town to nearest capital of same faction
        const towns = settlements.filter(s => s.tier === SettlementTier.TOWN);
        for (const town of towns) {
            const factionCapital = this.territoryManager.getFactionCapital(town.faction);
            if (factionCapital) {
                connections.push({ start: town, end: factionCapital, priority: 8 });
                connected.add(town.id);
            }

            // Also connect to nearest town
            const nearestTown = this.findNearestSettlement(town, towns.filter(t => t.id !== town.id));
            if (nearestTown && this.distance(town.position, nearestTown.position) < 50000) {
                connections.push({ start: town, end: nearestTown, priority: 6 });
            }
        }

        // Strategy 3: Connect villages to nearest town or larger settlement
        const villages = settlements.filter(s =>
            s.tier === SettlementTier.VILLAGE || s.tier === SettlementTier.OUTPOST
        );

        for (const village of villages) {
            // Find nearest higher-tier settlement
            const higherTier = settlements.filter(s =>
                s.id !== village.id &&
                (s.tier === SettlementTier.CAPITAL ||
                 s.tier === SettlementTier.TOWN)
            );

            const nearest = this.findNearestSettlement(village, higherTier);
            if (nearest && this.distance(village.position, nearest.position) < 30000) {
                connections.push({ start: village, end: nearest, priority: 4 });
            }

            // Connect to nearest same-faction village (local roads)
            const sameFactioNVillages = villages.filter(v =>
                v.id !== village.id && v.faction === village.faction
            );
            const nearestVillage = this.findNearestSettlement(village, sameFactioNVillages);
            if (nearestVillage && this.distance(village.position, nearestVillage.position) < 20000) {
                connections.push({ start: village, end: nearestVillage, priority: 2 });
            }
        }

        // Strategy 4: Cross-faction connections (fewer, mainly between border settlements)
        // Connect some villages across faction borders
        for (const village of villages) {
            const cell = this.politicalMap.cells.get(village.cellId);
            if (!cell || !cell.isBorderCell) continue;

            // Find nearest settlement of different faction
            const foreignSettlements = settlements.filter(s =>
                s.faction !== village.faction &&
                this.distance(village.position, s.position) < 25000
            );

            const nearestForeign = this.findNearestSettlement(village, foreignSettlements);
            if (nearestForeign) {
                connections.push({ start: village, end: nearestForeign, priority: 3 });
            }
        }

        // Remove duplicates and sort by priority
        const uniqueConnections = this.deduplicateConnections(connections);
        uniqueConnections.sort((a, b) => b.priority - a.priority);

        return uniqueConnections;
    }

    /**
     * Remove duplicate connections
     */
    deduplicateConnections(connections) {
        const seen = new Set();
        const result = [];

        for (const conn of connections) {
            const key1 = `${conn.start.id}-${conn.end.id}`;
            const key2 = `${conn.end.id}-${conn.start.id}`;

            if (!seen.has(key1) && !seen.has(key2)) {
                seen.add(key1);
                result.push(conn);
            }
        }

        return result;
    }

    /**
     * Find nearest settlement from a list
     */
    findNearestSettlement(from, candidates) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const candidate of candidates) {
            const dist = this.distance(from.position, candidate.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = candidate;
            }
        }

        return nearest;
    }

    /**
     * Calculate distance between two positions
     */
    distance(a, b) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Generate a road between two settlements using A* pathfinding
     */
    generateRoad(startSettlement, endSettlement) {
        const roadId = `road_${startSettlement.id}_${endSettlement.id}`;

        // Check if road already exists
        if (this.roads.has(roadId)) return this.roads.get(roadId);

        const road = new Road(roadId, startSettlement, endSettlement);

        // A* pathfinding
        const path = this.findPath(startSettlement.position, endSettlement.position);

        if (path.length < 2) {
            console.warn(`[HighwaySystem] Could not find path from ${startSettlement.id} to ${endSettlement.id}`);
            return null;
        }

        // Smooth the path
        const smoothedPath = this.smoothPath(path);

        // Create segments from path
        for (let i = 0; i < smoothedPath.length - 1; i++) {
            const segmentId = `${roadId}_seg_${i}`;
            const segment = new RoadSegment(
                segmentId,
                smoothedPath[i],
                smoothedPath[i + 1]
            );

            road.addSegment(segment);
            this.segments.set(segmentId, segment);
        }

        // Store road
        this.roads.set(roadId, road);
        this.totalRoadLength += road.totalLength;

        // Update graph
        if (!this.settlementGraph.has(startSettlement.id)) {
            this.settlementGraph.set(startSettlement.id, new Set());
        }
        if (!this.settlementGraph.has(endSettlement.id)) {
            this.settlementGraph.set(endSettlement.id, new Set());
        }
        this.settlementGraph.get(startSettlement.id).add(endSettlement.id);
        this.settlementGraph.get(endSettlement.id).add(startSettlement.id);

        if (!this.roadGraph.has(startSettlement.id)) {
            this.roadGraph.set(startSettlement.id, new Map());
        }
        if (!this.roadGraph.has(endSettlement.id)) {
            this.roadGraph.set(endSettlement.id, new Map());
        }
        this.roadGraph.get(startSettlement.id).set(endSettlement.id, roadId);
        this.roadGraph.get(endSettlement.id).set(startSettlement.id, roadId);

        // Link to settlements
        startSettlement.connectedRoads.push(roadId);
        endSettlement.connectedRoads.push(roadId);

        return road;
    }

    /**
     * A* pathfinding on the cost grid
     */
    findPath(start, end) {
        const halfWorld = this.politicalMap.worldSize / 2;

        // Convert world coords to grid coords
        const startGrid = this.worldToGrid(start.x, start.z);
        const endGrid = this.worldToGrid(end.x, end.z);

        // A* implementation
        const openSet = new Map();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${startGrid.gx},${startGrid.gz}`;
        const endKey = `${endGrid.gx},${endGrid.gz}`;

        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(startGrid, endGrid));
        openSet.set(startKey, startGrid);

        while (openSet.size > 0) {
            // Find lowest fScore in openSet
            let current = null;
            let currentKey = null;
            let lowestF = Infinity;

            for (const [key, node] of openSet) {
                const f = fScore.get(key) || Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    current = node;
                    currentKey = key;
                }
            }

            if (!current) break;

            // Check if reached goal
            if (currentKey === endKey) {
                return this.reconstructPath(cameFrom, current, start, end);
            }

            openSet.delete(currentKey);
            closedSet.add(currentKey);

            // Check neighbors (8-directional)
            const neighbors = this.getNeighbors(current);

            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.gx},${neighbor.gz}`;

                if (closedSet.has(neighborKey)) continue;

                // Get cost
                const gridCell = this.costGrid[neighbor.gz]?.[neighbor.gx];
                if (!gridCell) continue;

                const moveCost = gridCell.cost;
                const tentativeG = (gScore.get(currentKey) || Infinity) + moveCost;

                if (!openSet.has(neighborKey)) {
                    openSet.set(neighborKey, neighbor);
                } else if (tentativeG >= (gScore.get(neighborKey) || Infinity)) {
                    continue;
                }

                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeG);
                fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, endGrid));
            }
        }

        // No path found, return straight line
        console.warn('[HighwaySystem] A* failed, using straight path');
        return [start, end];
    }

    /**
     * Convert world coordinates to grid coordinates
     */
    worldToGrid(x, z) {
        const halfWorld = this.politicalMap.worldSize / 2;
        return {
            gx: Math.floor((x + halfWorld) / this.pathfindingGridSize),
            gz: Math.floor((z + halfWorld) / this.pathfindingGridSize)
        };
    }

    /**
     * Convert grid coordinates to world coordinates
     */
    gridToWorld(gx, gz) {
        const halfWorld = this.politicalMap.worldSize / 2;
        return {
            x: (gx * this.pathfindingGridSize) - halfWorld + this.pathfindingGridSize / 2,
            z: (gz * this.pathfindingGridSize) - halfWorld + this.pathfindingGridSize / 2
        };
    }

    /**
     * Get neighboring grid cells
     */
    getNeighbors(cell) {
        const neighbors = [];
        const gridSize = Math.ceil(this.politicalMap.worldSize / this.pathfindingGridSize);

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dz === 0) continue;

                const nx = cell.gx + dx;
                const nz = cell.gz + dz;

                if (nx >= 0 && nx < gridSize && nz >= 0 && nz < gridSize) {
                    neighbors.push({ gx: nx, gz: nz });
                }
            }
        }

        return neighbors;
    }

    /**
     * A* heuristic (Euclidean distance)
     */
    heuristic(a, b) {
        const dx = b.gx - a.gx;
        const dz = b.gz - a.gz;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Reconstruct path from A* result
     */
    reconstructPath(cameFrom, current, start, end) {
        const path = [];
        let currentKey = `${current.gx},${current.gz}`;

        while (cameFrom.has(currentKey)) {
            const gridCell = this.costGrid[current.gz]?.[current.gx];
            if (gridCell) {
                path.unshift({
                    x: gridCell.worldX,
                    y: gridCell.height,
                    z: gridCell.worldZ
                });
            }

            current = cameFrom.get(currentKey);
            currentKey = `${current.gx},${current.gz}`;
        }

        // Add start and end points
        path.unshift(start);
        path.push(end);

        return path;
    }

    /**
     * Smooth path using Catmull-Rom splines and add variation
     */
    smoothPath(path) {
        if (path.length < 3) return path;

        const smoothed = [];
        const samplesPerSegment = 5;

        for (let i = 0; i < path.length - 1; i++) {
            const p0 = path[Math.max(0, i - 1)];
            const p1 = path[i];
            const p2 = path[Math.min(path.length - 1, i + 1)];
            const p3 = path[Math.min(path.length - 1, i + 2)];

            for (let j = 0; j < samplesPerSegment; j++) {
                const t = j / samplesPerSegment;

                // Catmull-Rom interpolation
                const point = this.catmullRom(p0, p1, p2, p3, t);

                // Add slight variation using noise
                const variation = this.noiseVariation(point.x * 0.0001, point.z * 0.0001);
                point.x += variation * 50;
                point.z += variation * 50;

                // Update height for the adjusted position
                if (this.worldGenerator) {
                    point.y = this.worldGenerator.getGroundHeight(point.x, point.z);
                }

                smoothed.push(point);
            }
        }

        // Add final point
        smoothed.push(path[path.length - 1]);

        return smoothed;
    }

    /**
     * Catmull-Rom spline interpolation
     */
    catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        const x = 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );

        const z = 0.5 * (
            (2 * p1.z) +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
        );

        const y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );

        return { x, y, z };
    }

    /**
     * Detect border crossings in all roads
     */
    detectBorderCrossings() {
        for (const road of this.roads.values()) {
            if (!road.crossesBorder()) continue;

            // Check each segment for border crossing
            for (const segment of road.segments) {
                const crossings = this.detectSegmentBorderCrossings(segment, road);
                for (const crossing of crossings) {
                    this.borderCrossings.set(crossing.id, crossing);
                    road.borderCrossings.push(crossing.serialize());
                    segment.crossesBorder = true;
                    segment.borderFactions = {
                        from: crossing.fromFaction,
                        to: crossing.toFaction
                    };
                }
            }
        }
    }

    /**
     * Detect if a segment crosses a faction border
     */
    detectSegmentBorderCrossings(segment, road) {
        const crossings = [];
        const samples = 10;

        let prevFaction = null;
        let prevPoint = null;

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const point = segment.getPointAt(t);

            const cell = this.politicalMap.getCellAtPosition(point.x, point.z);
            const faction = cell ? cell.faction : null;

            if (prevFaction !== null && faction !== null && prevFaction !== faction) {
                // Border crossing detected
                const crossingPoint = {
                    x: (prevPoint.x + point.x) / 2,
                    y: (prevPoint.y + point.y) / 2,
                    z: (prevPoint.z + point.z) / 2
                };

                const crossing = new BorderCrossing(
                    `crossing_${road.id}_${this.borderCrossings.size}`,
                    crossingPoint,
                    road.id,
                    prevFaction,
                    faction
                );

                crossings.push(crossing);
            }

            prevFaction = faction;
            prevPoint = point;
        }

        return crossings;
    }

    /**
     * Identify opportunities for tunnels through mountains
     */
    identifyTunnels() {
        for (const road of this.roads.values()) {
            let consecutiveHigh = [];

            for (const segment of road.segments) {
                // Check if segment goes through high terrain
                const midpoint = segment.getPointAt(0.5);
                const terrain = this.worldGenerator.calculateTerrain(midpoint.x, midpoint.z);

                if (terrain.height > 40) {
                    consecutiveHigh.push(segment);
                } else {
                    // Check if we should create a tunnel
                    if (consecutiveHigh.length >= 3) {
                        this.createTunnel(consecutiveHigh, road);
                    }
                    consecutiveHigh = [];
                }
            }

            // Check remaining segments
            if (consecutiveHigh.length >= 3) {
                this.createTunnel(consecutiveHigh, road);
            }
        }
    }

    /**
     * Create a tunnel through consecutive high segments
     */
    createTunnel(segments, road) {
        // Random chance for tunnel vs winding mountain road
        if (this.rng() > 0.4) return; // 40% chance of tunnel

        const first = segments[0];
        const last = segments[segments.length - 1];

        const tunnelId = `tunnel_${road.id}_${this.tunnels.size}`;
        const tunnel = new Tunnel(
            tunnelId,
            first.start,
            last.end,
            this.distance(first.start, last.end)
        );

        // Calculate max depth
        let maxHeight = 0;
        for (const seg of segments) {
            const mid = seg.getPointAt(0.5);
            const terrain = this.worldGenerator.calculateTerrain(mid.x, mid.z);
            maxHeight = Math.max(maxHeight, terrain.height);
        }
        tunnel.depth = maxHeight - first.start.y;

        // Mark segments as tunnel
        for (const seg of segments) {
            seg.type = 'TUNNEL';
            seg.terrainType = 'TUNNEL';
        }

        this.tunnels.set(tunnelId, tunnel);

        console.log(`[HighwaySystem] Created tunnel: ${tunnelId}, length: ${Math.round(tunnel.length)}m, depth: ${Math.round(tunnel.depth)}m`);
    }

    /**
     * Get roads connected to a settlement
     */
    getRoadsForSettlement(settlementId) {
        const roadIds = this.settlementGraph.get(settlementId);
        if (!roadIds) return [];

        const roads = [];
        for (const otherId of roadIds) {
            const roadId = this.roadGraph.get(settlementId)?.get(otherId);
            if (roadId) {
                roads.push(this.roads.get(roadId));
            }
        }
        return roads.filter(r => r != null);
    }

    /**
     * Get nearest road to a position
     */
    getNearestRoad(x, z, maxDistance = 5000) {
        let nearest = null;
        let nearestDist = maxDistance;

        for (const road of this.roads.values()) {
            for (const segment of road.segments) {
                // Check distance to segment
                const dist = this.pointToSegmentDistance(
                    { x, z },
                    { x: segment.start.x, z: segment.start.z },
                    { x: segment.end.x, z: segment.end.z }
                );

                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = { road, segment, distance: dist };
                }
            }
        }

        return nearest;
    }

    /**
     * Calculate distance from point to line segment
     */
    pointToSegmentDistance(p, a, b) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSq = dx * dx + dz * dz;

        if (lengthSq === 0) {
            return Math.sqrt((p.x - a.x) ** 2 + (p.z - a.z) ** 2);
        }

        let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const nearestX = a.x + t * dx;
        const nearestZ = a.z + t * dz;

        return Math.sqrt((p.x - nearestX) ** 2 + (p.z - nearestZ) ** 2);
    }

    /**
     * Serialize all roads for client
     */
    serializeRoads() {
        const data = [];
        for (const road of this.roads.values()) {
            data.push(road.serialize());
        }
        return data;
    }

    /**
     * Serialize border crossings
     */
    serializeBorderCrossings() {
        const data = [];
        for (const crossing of this.borderCrossings.values()) {
            data.push(crossing.serialize());
        }
        return data;
    }

    /**
     * Serialize tunnels
     */
    serializeTunnels() {
        const data = [];
        for (const tunnel of this.tunnels.values()) {
            data.push(tunnel.serialize());
        }
        return data;
    }

    /**
     * Get statistics about the highway system
     */
    getStatistics() {
        let totalTunnelLength = 0;
        for (const tunnel of this.tunnels.values()) {
            totalTunnelLength += tunnel.length;
        }

        return {
            totalRoads: this.roads.size,
            totalLength: Math.round(this.totalRoadLength / 1000), // km
            borderCrossings: this.borderCrossings.size,
            tunnels: this.tunnels.size,
            tunnelLength: Math.round(totalTunnelLength / 1000) // km
        };
    }
}

export default GlobalHighwaySystem;
