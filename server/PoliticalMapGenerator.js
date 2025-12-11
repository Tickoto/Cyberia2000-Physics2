/**
 * PoliticalMapGenerator.js - Voronoi-based faction territory generation
 *
 * Generates a Voronoi diagram across the world map to divide territory
 * between factions. Each cell becomes a potential settlement node.
 *
 * Pre-generates 512km x 512km (512,000 x 512,000 units) at server spawn
 * for immediate playability.
 */

import { createNoise2D } from 'simplex-noise';
import { Faction, FactionHomeQuadrants, SettlementTier, SettlementConfig } from './Factions.js';
import { worldConfig } from '../shared/config.js';

// Pseudo-random number generator for deterministic seeding
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
 * VoronoiCell represents a single territory cell in the political map
 */
export class VoronoiCell {
    constructor(id, seedPoint, faction) {
        this.id = id;
        this.seedPoint = seedPoint;           // { x, z } - the Voronoi seed
        this.faction = faction;
        this.vertices = [];                    // Polygon vertices defining cell boundary
        this.neighbors = new Set();            // IDs of neighboring cells
        this.area = 0;                         // Calculated area
        this.centroid = null;                  // Geometric center (settlement location)
        this.settlementTier = null;            // CAPITAL, TOWN, VILLAGE, OUTPOST
        this.isBorderCell = false;             // True if adjacent to different faction
        this.borderEdges = [];                 // Edges that are faction borders
        this.biomes = new Map();               // Biome distribution within cell
        this.dominantBiome = null;
    }

    /**
     * Calculate the area of the cell polygon using Shoelace formula
     */
    calculateArea() {
        if (this.vertices.length < 3) return 0;

        let area = 0;
        const n = this.vertices.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += this.vertices[i].x * this.vertices[j].z;
            area -= this.vertices[j].x * this.vertices[i].z;
        }
        this.area = Math.abs(area) / 2;
        return this.area;
    }

    /**
     * Calculate the centroid of the cell polygon
     */
    calculateCentroid() {
        if (this.vertices.length < 3) {
            this.centroid = { ...this.seedPoint };
            return this.centroid;
        }

        let cx = 0, cz = 0;
        let signedArea = 0;
        const n = this.vertices.length;

        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const cross = this.vertices[i].x * this.vertices[j].z -
                         this.vertices[j].x * this.vertices[i].z;
            signedArea += cross;
            cx += (this.vertices[i].x + this.vertices[j].x) * cross;
            cz += (this.vertices[i].z + this.vertices[j].z) * cross;
        }

        signedArea /= 2;
        if (Math.abs(signedArea) < 0.0001) {
            this.centroid = { ...this.seedPoint };
        } else {
            cx /= (6 * signedArea);
            cz /= (6 * signedArea);
            this.centroid = { x: cx, z: cz };
        }
        return this.centroid;
    }
}

/**
 * PoliticalMapGenerator - Creates faction territories using Voronoi diagrams
 */
export class PoliticalMapGenerator {
    constructor(seed = worldConfig.seed) {
        this.seed = seed;
        this.rng = seededRandom(seed + '_political');
        this.noiseInfluence = createNoise2D(seededRandom(seed + '_influence'));

        // World bounds for pre-generation (512km x 512km centered on origin)
        this.worldSize = 512000;  // 512km in game units (1 unit = 1 meter)
        this.halfWorld = this.worldSize / 2;

        // Cell density controls - balance between variety and performance
        // Average cell size ~15-25km across, giving roughly 400-700 cells
        this.minCellSpacing = 8000;   // Minimum 8km between seeds
        this.maxCellSpacing = 25000;  // Maximum 25km between seeds
        this.targetCellCount = 500;   // Approximate target

        // Generated data
        this.cells = new Map();        // id -> VoronoiCell
        this.seedPoints = [];          // All seed points
        this.delaunayTriangles = [];   // For computing Voronoi
        this.factionCapitals = new Map(); // faction -> cell id

        // Spatial lookup grid for fast queries
        this.gridCellSize = 10000;     // 10km grid cells
        this.spatialGrid = new Map();  // "gridX,gridZ" -> [cellIds]

        this.isGenerated = false;
    }

    /**
     * Generate the complete political map
     * Called once at server startup
     */
    generate(worldGenerator) {
        console.log('[PoliticalMap] Generating faction territories...');
        const startTime = Date.now();

        // Step 1: Generate seed points with faction bias
        this.generateSeedPoints();
        console.log(`[PoliticalMap] Generated ${this.seedPoints.length} seed points`);

        // Step 2: Compute Voronoi diagram (Fortune's algorithm approximation)
        this.computeVoronoiDiagram();
        console.log(`[PoliticalMap] Computed ${this.cells.size} Voronoi cells`);

        // Step 3: Assign factions to cells based on proximity to home quadrants
        this.assignFactions();

        // Step 4: Identify border cells and edges
        this.identifyBorders();

        // Step 5: Sample biomes from world generator
        if (worldGenerator) {
            this.sampleBiomes(worldGenerator);
        }

        // Step 6: Determine settlement tiers
        this.assignSettlementTiers();

        // Step 7: Build spatial lookup grid
        this.buildSpatialGrid();

        this.isGenerated = true;
        console.log(`[PoliticalMap] Generation complete in ${Date.now() - startTime}ms`);

        return this;
    }

    /**
     * Generate seed points with faction-biased distribution
     * Uses Poisson disk sampling for even distribution
     */
    generateSeedPoints() {
        this.seedPoints = [];

        // Generate points using relaxed Poisson disk sampling
        const candidates = [];
        const gridSize = this.minCellSpacing;
        const activeList = [];

        // Start with faction home points (one near each corner)
        const factions = Object.values(Faction);
        for (const faction of factions) {
            const quad = FactionHomeQuadrants[faction];
            const baseX = quad.x * this.halfWorld * 0.7;
            const baseZ = quad.z * this.halfWorld * 0.7;

            // Add some noise to prevent perfect symmetry
            const offsetX = (this.rng() - 0.5) * this.maxCellSpacing;
            const offsetZ = (this.rng() - 0.5) * this.maxCellSpacing;

            const point = {
                x: baseX + offsetX,
                z: baseZ + offsetZ,
                faction: faction  // Pre-assign faction to home points
            };
            this.seedPoints.push(point);
            activeList.push(point);
        }

        // Generate additional points using Poisson disk sampling
        const maxAttempts = 30;
        const k = 30; // Candidates per iteration

        while (activeList.length > 0 && this.seedPoints.length < this.targetCellCount * 1.5) {
            // Pick random active point
            const activeIdx = Math.floor(this.rng() * activeList.length);
            const activePoint = activeList[activeIdx];

            let foundValid = false;
            for (let attempt = 0; attempt < k; attempt++) {
                // Generate random point in annulus around active point
                const angle = this.rng() * Math.PI * 2;
                const dist = this.minCellSpacing + this.rng() * (this.maxCellSpacing - this.minCellSpacing);

                const newX = activePoint.x + Math.cos(angle) * dist;
                const newZ = activePoint.z + Math.sin(angle) * dist;

                // Check bounds
                if (newX < -this.halfWorld || newX > this.halfWorld ||
                    newZ < -this.halfWorld || newZ > this.halfWorld) {
                    continue;
                }

                // Check distance to all existing points (brute force for simplicity)
                let tooClose = false;
                for (const existing of this.seedPoints) {
                    const dx = existing.x - newX;
                    const dz = existing.z - newZ;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < this.minCellSpacing * this.minCellSpacing) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    const newPoint = { x: newX, z: newZ, faction: null };
                    this.seedPoints.push(newPoint);
                    activeList.push(newPoint);
                    foundValid = true;
                    break;
                }
            }

            if (!foundValid) {
                activeList.splice(activeIdx, 1);
            }
        }
    }

    /**
     * Compute Voronoi diagram using incremental construction
     * This is a simplified approach suitable for game use
     */
    computeVoronoiDiagram() {
        // For each seed point, create a cell
        for (let i = 0; i < this.seedPoints.length; i++) {
            const seed = this.seedPoints[i];
            const cell = new VoronoiCell(
                `cell_${i}`,
                { x: seed.x, z: seed.z },
                seed.faction
            );
            this.cells.set(cell.id, cell);
        }

        // Compute Delaunay triangulation (needed for Voronoi)
        this.delaunayTriangles = this.computeDelaunay();

        // Build Voronoi cells from Delaunay dual
        this.buildVoronoiFromDelaunay();

        // Calculate cell properties
        for (const cell of this.cells.values()) {
            cell.calculateArea();
            cell.calculateCentroid();
        }
    }

    /**
     * Compute Delaunay triangulation using Bowyer-Watson algorithm
     */
    computeDelaunay() {
        const points = this.seedPoints.map((p, i) => ({ x: p.x, z: p.z, idx: i }));
        const triangles = [];

        // Super-triangle that contains all points
        const superSize = this.worldSize * 3;
        const superTriangle = {
            p0: { x: 0, z: superSize, idx: -1 },
            p1: { x: -superSize, z: -superSize, idx: -2 },
            p2: { x: superSize, z: -superSize, idx: -3 }
        };
        triangles.push(superTriangle);

        // Insert points one by one
        for (const point of points) {
            const badTriangles = [];
            const polygon = [];

            // Find triangles whose circumcircle contains the point
            for (const tri of triangles) {
                if (this.pointInCircumcircle(point, tri)) {
                    badTriangles.push(tri);
                }
            }

            // Find boundary polygon of bad triangles
            for (const tri of badTriangles) {
                const edges = [
                    [tri.p0, tri.p1],
                    [tri.p1, tri.p2],
                    [tri.p2, tri.p0]
                ];

                for (const edge of edges) {
                    let shared = false;
                    for (const other of badTriangles) {
                        if (other === tri) continue;
                        if (this.triangleHasEdge(other, edge)) {
                            shared = true;
                            break;
                        }
                    }
                    if (!shared) {
                        polygon.push(edge);
                    }
                }
            }

            // Remove bad triangles
            for (const bad of badTriangles) {
                const idx = triangles.indexOf(bad);
                if (idx >= 0) triangles.splice(idx, 1);
            }

            // Create new triangles from polygon edges to point
            for (const edge of polygon) {
                triangles.push({
                    p0: edge[0],
                    p1: edge[1],
                    p2: point
                });
            }
        }

        // Remove triangles connected to super-triangle vertices
        return triangles.filter(tri =>
            tri.p0.idx >= 0 && tri.p1.idx >= 0 && tri.p2.idx >= 0
        );
    }

    /**
     * Check if a point is inside a triangle's circumcircle
     */
    pointInCircumcircle(point, triangle) {
        const ax = triangle.p0.x - point.x;
        const az = triangle.p0.z - point.z;
        const bx = triangle.p1.x - point.x;
        const bz = triangle.p1.z - point.z;
        const cx = triangle.p2.x - point.x;
        const cz = triangle.p2.z - point.z;

        const det = (ax * ax + az * az) * (bx * cz - cx * bz) -
                   (bx * bx + bz * bz) * (ax * cz - cx * az) +
                   (cx * cx + cz * cz) * (ax * bz - bx * az);

        // Check orientation
        const orient = (triangle.p1.x - triangle.p0.x) * (triangle.p2.z - triangle.p0.z) -
                      (triangle.p1.z - triangle.p0.z) * (triangle.p2.x - triangle.p0.x);

        return orient > 0 ? det > 0 : det < 0;
    }

    /**
     * Check if triangle contains a specific edge
     */
    triangleHasEdge(tri, edge) {
        const points = [tri.p0, tri.p1, tri.p2];
        let foundFirst = false, foundSecond = false;

        for (const p of points) {
            if (p.idx === edge[0].idx) foundFirst = true;
            if (p.idx === edge[1].idx) foundSecond = true;
        }
        return foundFirst && foundSecond;
    }

    /**
     * Build Voronoi cells from Delaunay triangulation
     */
    buildVoronoiFromDelaunay() {
        // For each seed point, find all triangles that include it
        const pointTriangles = new Map();

        for (let i = 0; i < this.seedPoints.length; i++) {
            pointTriangles.set(i, []);
        }

        for (const tri of this.delaunayTriangles) {
            if (tri.p0.idx >= 0) pointTriangles.get(tri.p0.idx).push(tri);
            if (tri.p1.idx >= 0) pointTriangles.get(tri.p1.idx).push(tri);
            if (tri.p2.idx >= 0) pointTriangles.get(tri.p2.idx).push(tri);
        }

        // Build neighbors from shared edges
        for (const tri of this.delaunayTriangles) {
            const indices = [tri.p0.idx, tri.p1.idx, tri.p2.idx].filter(i => i >= 0);
            for (let i = 0; i < indices.length; i++) {
                for (let j = i + 1; j < indices.length; j++) {
                    const cellA = this.cells.get(`cell_${indices[i]}`);
                    const cellB = this.cells.get(`cell_${indices[j]}`);
                    if (cellA && cellB) {
                        cellA.neighbors.add(cellB.id);
                        cellB.neighbors.add(cellA.id);
                    }
                }
            }
        }

        // Compute Voronoi vertices (circumcenters of Delaunay triangles)
        for (let i = 0; i < this.seedPoints.length; i++) {
            const cell = this.cells.get(`cell_${i}`);
            const triangles = pointTriangles.get(i);

            if (triangles.length === 0) continue;

            // Calculate circumcenters
            const vertices = [];
            for (const tri of triangles) {
                const cc = this.circumcenter(tri);
                if (cc) vertices.push(cc);
            }

            // Sort vertices by angle around seed point
            const seed = this.seedPoints[i];
            vertices.sort((a, b) => {
                const angleA = Math.atan2(a.z - seed.z, a.x - seed.x);
                const angleB = Math.atan2(b.z - seed.z, b.x - seed.x);
                return angleA - angleB;
            });

            // Clip to world bounds
            cell.vertices = this.clipPolygonToBounds(vertices);
        }
    }

    /**
     * Calculate circumcenter of a triangle
     */
    circumcenter(tri) {
        const ax = tri.p0.x, az = tri.p0.z;
        const bx = tri.p1.x, bz = tri.p1.z;
        const cx = tri.p2.x, cz = tri.p2.z;

        const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
        if (Math.abs(d) < 0.0001) return null;

        const ux = ((ax * ax + az * az) * (bz - cz) +
                   (bx * bx + bz * bz) * (cz - az) +
                   (cx * cx + cz * cz) * (az - bz)) / d;
        const uz = ((ax * ax + az * az) * (cx - bx) +
                   (bx * bx + bz * bz) * (ax - cx) +
                   (cx * cx + cz * cz) * (bx - ax)) / d;

        return { x: ux, z: uz };
    }

    /**
     * Clip a polygon to world bounds using Sutherland-Hodgman algorithm
     */
    clipPolygonToBounds(vertices) {
        if (vertices.length === 0) return vertices;

        const bounds = [
            { normal: { x: 1, z: 0 }, d: this.halfWorld },   // Right
            { normal: { x: -1, z: 0 }, d: this.halfWorld },  // Left
            { normal: { x: 0, z: 1 }, d: this.halfWorld },   // Top
            { normal: { x: 0, z: -1 }, d: this.halfWorld }   // Bottom
        ];

        let result = [...vertices];

        for (const bound of bounds) {
            if (result.length === 0) break;
            const input = result;
            result = [];

            for (let i = 0; i < input.length; i++) {
                const current = input[i];
                const next = input[(i + 1) % input.length];

                const currentInside = this.pointInsideBound(current, bound);
                const nextInside = this.pointInsideBound(next, bound);

                if (currentInside) {
                    result.push(current);
                    if (!nextInside) {
                        const intersect = this.lineIntersectBound(current, next, bound);
                        if (intersect) result.push(intersect);
                    }
                } else if (nextInside) {
                    const intersect = this.lineIntersectBound(current, next, bound);
                    if (intersect) result.push(intersect);
                }
            }
        }

        return result;
    }

    pointInsideBound(point, bound) {
        return point.x * bound.normal.x + point.z * bound.normal.z <= bound.d;
    }

    lineIntersectBound(p1, p2, bound) {
        const d1 = p1.x * bound.normal.x + p1.z * bound.normal.z - bound.d;
        const d2 = p2.x * bound.normal.x + p2.z * bound.normal.z - bound.d;

        if (Math.abs(d1 - d2) < 0.0001) return null;

        const t = d1 / (d1 - d2);
        return {
            x: p1.x + t * (p2.x - p1.x),
            z: p1.z + t * (p2.z - p1.z)
        };
    }

    /**
     * Assign factions to cells based on proximity to home quadrants
     */
    assignFactions() {
        const factions = Object.values(Faction);

        for (const cell of this.cells.values()) {
            // If pre-assigned (home cell), keep it
            if (cell.faction) continue;

            // Calculate influence from each faction based on distance to home quadrant
            let bestFaction = null;
            let bestScore = -Infinity;

            for (const faction of factions) {
                const quad = FactionHomeQuadrants[faction];
                const homeX = quad.x * this.halfWorld * 0.7;
                const homeZ = quad.z * this.halfWorld * 0.7;

                // Distance from cell center to faction home
                const dx = cell.seedPoint.x - homeX;
                const dz = cell.seedPoint.z - homeZ;
                const dist = Math.sqrt(dx * dx + dz * dz);

                // Influence decreases with distance, but add noise for variety
                const noiseVal = this.noiseInfluence(
                    cell.seedPoint.x * 0.00005,
                    cell.seedPoint.z * 0.00005
                );

                // Score: closer = higher, with noise variation
                const score = -dist + noiseVal * this.halfWorld * 0.3;

                if (score > bestScore) {
                    bestScore = score;
                    bestFaction = faction;
                }
            }

            cell.faction = bestFaction;
        }
    }

    /**
     * Identify border cells (adjacent to different faction)
     */
    identifyBorders() {
        for (const cell of this.cells.values()) {
            cell.isBorderCell = false;
            cell.borderEdges = [];

            for (const neighborId of cell.neighbors) {
                const neighbor = this.cells.get(neighborId);
                if (neighbor && neighbor.faction !== cell.faction) {
                    cell.isBorderCell = true;

                    // Find the shared edge
                    const sharedEdge = this.findSharedEdge(cell, neighbor);
                    if (sharedEdge) {
                        cell.borderEdges.push({
                            neighborId: neighborId,
                            neighborFaction: neighbor.faction,
                            edge: sharedEdge
                        });
                    }
                }
            }
        }
    }

    /**
     * Find the shared edge between two adjacent cells
     */
    findSharedEdge(cellA, cellB) {
        if (cellA.vertices.length < 2 || cellB.vertices.length < 2) return null;

        const tolerance = 100; // 100m tolerance for vertex matching

        // Find vertices that are shared (within tolerance)
        const sharedVertices = [];

        for (const vA of cellA.vertices) {
            for (const vB of cellB.vertices) {
                const dx = vA.x - vB.x;
                const dz = vA.z - vB.z;
                if (dx * dx + dz * dz < tolerance * tolerance) {
                    sharedVertices.push({ x: (vA.x + vB.x) / 2, z: (vA.z + vB.z) / 2 });
                    break;
                }
            }
        }

        if (sharedVertices.length >= 2) {
            return {
                start: sharedVertices[0],
                end: sharedVertices[sharedVertices.length - 1]
            };
        }

        return null;
    }

    /**
     * Sample biomes from world generator for each cell
     */
    sampleBiomes(worldGenerator) {
        const sampleCount = 25; // Sample points per cell

        for (const cell of this.cells.values()) {
            if (!cell.centroid) continue;

            const biomeCount = new Map();

            // Sample in a grid around centroid
            const sampleRadius = Math.sqrt(cell.area / Math.PI) * 0.5;

            for (let i = 0; i < sampleCount; i++) {
                const angle = (i / sampleCount) * Math.PI * 2;
                const dist = this.rng() * sampleRadius;
                const sampleX = cell.centroid.x + Math.cos(angle) * dist;
                const sampleZ = cell.centroid.z + Math.sin(angle) * dist;

                const terrain = worldGenerator.calculateTerrain(sampleX, sampleZ);
                const biomeId = terrain.biome.id;

                biomeCount.set(biomeId, (biomeCount.get(biomeId) || 0) + 1);
            }

            cell.biomes = biomeCount;

            // Find dominant biome
            let maxCount = 0;
            for (const [biome, count] of biomeCount) {
                if (count > maxCount) {
                    maxCount = count;
                    cell.dominantBiome = biome;
                }
            }
        }
    }

    /**
     * Assign settlement tiers based on cell properties
     */
    assignSettlementTiers() {
        // Group cells by faction
        const factionCells = new Map();
        for (const faction of Object.values(Faction)) {
            factionCells.set(faction, []);
        }

        for (const cell of this.cells.values()) {
            if (cell.faction) {
                factionCells.get(cell.faction).push(cell);
            }
        }

        // For each faction, assign tiers
        for (const [faction, cells] of factionCells) {
            // Sort by area (largest first)
            cells.sort((a, b) => b.area - a.area);

            if (cells.length === 0) continue;

            // Largest cell is capital
            cells[0].settlementTier = SettlementTier.CAPITAL;
            this.factionCapitals.set(faction, cells[0].id);

            // Assign towns and villages
            for (let i = 1; i < cells.length; i++) {
                const cell = cells[i];

                if (cell.isBorderCell) {
                    // Border cells are villages (frontier settlements)
                    cell.settlementTier = SettlementTier.VILLAGE;
                } else if (cell.area >= SettlementConfig[SettlementTier.TOWN].minCellArea) {
                    cell.settlementTier = SettlementTier.TOWN;
                } else {
                    // Small interior cells become outposts or skip
                    // Only some small cells get settlements
                    if (this.rng() < 0.6) {
                        cell.settlementTier = SettlementTier.VILLAGE;
                    } else {
                        cell.settlementTier = SettlementTier.OUTPOST;
                    }
                }
            }
        }
    }

    /**
     * Build spatial grid for fast lookups
     */
    buildSpatialGrid() {
        this.spatialGrid.clear();

        for (const cell of this.cells.values()) {
            if (!cell.centroid) continue;

            const gridX = Math.floor((cell.centroid.x + this.halfWorld) / this.gridCellSize);
            const gridZ = Math.floor((cell.centroid.z + this.halfWorld) / this.gridCellSize);
            const key = `${gridX},${gridZ}`;

            if (!this.spatialGrid.has(key)) {
                this.spatialGrid.set(key, []);
            }
            this.spatialGrid.get(key).push(cell.id);
        }
    }

    /**
     * Get the cell containing a world position
     * @param {number} x - World X coordinate
     * @param {number} z - World Z coordinate
     * @returns {VoronoiCell|null}
     */
    getCellAtPosition(x, z) {
        // Find nearest seed point (brute force for accuracy)
        let nearestCell = null;
        let nearestDistSq = Infinity;

        for (const cell of this.cells.values()) {
            const dx = cell.seedPoint.x - x;
            const dz = cell.seedPoint.z - z;
            const distSq = dx * dx + dz * dz;

            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestCell = cell;
            }
        }

        return nearestCell;
    }

    /**
     * Get faction at a world position
     */
    getFactionAtPosition(x, z) {
        const cell = this.getCellAtPosition(x, z);
        return cell ? cell.faction : null;
    }

    /**
     * Get all cells belonging to a faction
     */
    getCellsByFaction(faction) {
        const result = [];
        for (const cell of this.cells.values()) {
            if (cell.faction === faction) {
                result.push(cell);
            }
        }
        return result;
    }

    /**
     * Get border cells between two factions
     */
    getBorderCells(factionA, factionB) {
        const result = [];
        for (const cell of this.cells.values()) {
            if (cell.faction !== factionA) continue;

            for (const neighborId of cell.neighbors) {
                const neighbor = this.cells.get(neighborId);
                if (neighbor && neighbor.faction === factionB) {
                    result.push(cell);
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Get all settlements of a specific tier
     */
    getSettlementsByTier(tier) {
        const result = [];
        for (const cell of this.cells.values()) {
            if (cell.settlementTier === tier) {
                result.push(cell);
            }
        }
        return result;
    }

    /**
     * Serialize political map data for client
     */
    serialize() {
        const cellData = [];
        for (const cell of this.cells.values()) {
            cellData.push({
                id: cell.id,
                faction: cell.faction,
                centroid: cell.centroid,
                vertices: cell.vertices,
                tier: cell.settlementTier,
                isBorder: cell.isBorderCell,
                dominantBiome: cell.dominantBiome
            });
        }

        return {
            worldSize: this.worldSize,
            cells: cellData,
            capitals: Object.fromEntries(this.factionCapitals)
        };
    }
}

export default PoliticalMapGenerator;
