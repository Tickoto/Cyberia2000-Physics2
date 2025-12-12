/**
 * POIManager.js - Context-Aware and Faction-Based POI Spawning System
 *
 * Manages POI placement throughout the world:
 * - Context-aware spawning (along roads, biome-specific, elevation-based)
 * - Faction-based styling (original faction POIs persist even after territory changes)
 * - Integration with TerrainStitcher and FoundationGenerator
 * - Spatial indexing for efficient queries
 */

import {
  AllPOIs,
  NeutralPOIs,
  IronSynodPOIs,
  ChromaCorpPOIs,
  VerdantLinkPOIs,
  NullDriftersPOIs,
  SpawnContext,
  Biome,
  POIFaction,
  getPOIsByFaction,
  getPOIsByBiome,
  getFactionExclusivePOIs
} from './POIDefinitions.js';

import TerrainStitcher from './TerrainStitcher.js';
import { FoundationGenerator } from './FoundationGenerator.js';
import { createNoise2D } from 'simplex-noise';

class POIManager {
  constructor(worldGenerator, politicalMap, highwaySystem) {
    this.worldGenerator = worldGenerator;
    this.politicalMap = politicalMap;
    this.highwaySystem = highwaySystem;

    // Initialize subsystems
    this.terrainStitcher = new TerrainStitcher(worldGenerator);
    this.foundationGenerator = new FoundationGenerator();

    // Spatial indexing
    this.gridCellSize = 500; // 500 unit grid cells for spatial lookup
    this.spatialGrid = new Map(); // gridKey -> Set of POI instances

    // All placed POIs
    this.placedPOIs = new Map(); // poiInstanceId -> POI data
    this.nextPOIId = 1;

    // Noise for procedural placement
    this.placementNoise = createNoise2D(() => Math.random());
    this.variationNoise = createNoise2D(() => Math.random());

    // World bounds
    this.worldSize = 512000; // 512km
    this.halfWorld = this.worldSize / 2;

    // POI density settings per category
    this.densitySettings = {
      INFRASTRUCTURE: { targetCount: 800, minSpacing: 2000 },
      RESIDENTIAL: { targetCount: 2000, minSpacing: 500 },
      COMMERCIAL: { targetCount: 1500, minSpacing: 1000 },
      INDUSTRIAL: { targetCount: 600, minSpacing: 3000 },
      MILITARY: { targetCount: 400, minSpacing: 4000 },
      AGRICULTURAL: { targetCount: 1200, minSpacing: 1500 },
      SCIENTIFIC: { targetCount: 200, minSpacing: 5000 },
      RECREATIONAL: { targetCount: 300, minSpacing: 4000 },
      RELIGIOUS: { targetCount: 150, minSpacing: 6000 },
      UTILITY: { targetCount: 500, minSpacing: 3000 },
      NATURAL: { targetCount: 400, minSpacing: 2000 },
      RUINS: { targetCount: 500, minSpacing: 3000 }
    };
  }

  /**
   * Initialize POI generation for the entire world
   * Called after political map and highway system are generated
   */
  async generateWorldPOIs() {
    console.log('[POIManager] Starting world POI generation...');

    const startTime = Date.now();

    // Phase 1: Generate road-adjacent POIs
    await this.generateRoadPOIs();

    // Phase 2: Generate settlement-adjacent POIs
    await this.generateSettlementPOIs();

    // Phase 3: Generate wilderness POIs
    await this.generateWildernessPOIs();

    // Phase 4: Generate faction-specific POIs
    await this.generateFactionPOIs();

    // Phase 5: Generate special location POIs (peaks, coastal, etc.)
    await this.generateSpecialLocationPOIs();

    const duration = Date.now() - startTime;
    console.log(`[POIManager] Generated ${this.placedPOIs.size} POIs in ${duration}ms`);

    return {
      totalPOIs: this.placedPOIs.size,
      generationTime: duration
    };
  }

  /**
   * Generate POIs along roads (gas stations, diners, motels, etc.)
   */
  async generateRoadPOIs() {
    console.log('[POIManager] Generating road-adjacent POIs...');

    if (!this.highwaySystem || !this.highwaySystem.roads) {
      console.log('[POIManager] No highway system available, skipping road POIs');
      return;
    }

    const roadPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.ALONG_ROAD)
    );

    let roadPOICount = 0;

    for (const road of this.highwaySystem.roads.values()) {
      if (!road.segments || road.segments.length === 0) continue;

      // Calculate total road length
      const totalLength = road.segments.reduce((sum, seg) => sum + (seg.length || 0), 0);

      // Determine POI count based on road length and class
      let poiDensity = 0.0005; // POIs per unit length
      if (road.roadClass === 'INTERSTATE') poiDensity = 0.0008;
      else if (road.roadClass === 'REGIONAL') poiDensity = 0.0003;

      const targetPOICount = Math.floor(totalLength * poiDensity);

      // Place POIs along the road
      let accumulatedLength = 0;
      let placedOnRoad = 0;

      for (const segment of road.segments) {
        if (placedOnRoad >= targetPOICount) break;
        if (!segment.start || !segment.end) continue;

        const segmentLength = segment.length || Math.sqrt(
          Math.pow(segment.end.x - segment.start.x, 2) +
          Math.pow(segment.end.z - segment.start.z, 2)
        );

        // Check for POI placement along this segment
        const placementInterval = segmentLength / (targetPOICount / road.segments.length + 1);

        for (let dist = placementInterval; dist < segmentLength; dist += placementInterval) {
          if (placedOnRoad >= targetPOICount) break;

          // Interpolate position along segment
          const t = dist / segmentLength;
          const x = segment.start.x + (segment.end.x - segment.start.x) * t;
          const z = segment.start.z + (segment.end.z - segment.start.z) * t;

          // Offset from road
          const roadAngle = Math.atan2(
            segment.end.z - segment.start.z,
            segment.end.x - segment.start.x
          );
          const perpAngle = roadAngle + Math.PI / 2;
          const offset = 30 + Math.random() * 20; // 30-50 units from road center
          const side = Math.random() > 0.5 ? 1 : -1;

          const poiX = x + Math.cos(perpAngle) * offset * side;
          const poiZ = z + Math.sin(perpAngle) * offset * side;

          // Select appropriate POI based on context
          const selectedPOI = this.selectRoadPOI(roadPOIs, poiX, poiZ, road);

          if (selectedPOI) {
            const placed = this.tryPlacePOI(selectedPOI, { x: poiX, z: poiZ }, roadAngle);
            if (placed) {
              placedOnRoad++;
              roadPOICount++;
            }
          }
        }
      }
    }

    console.log(`[POIManager] Placed ${roadPOICount} road-adjacent POIs`);
  }

  /**
   * Select appropriate POI for road placement based on context
   */
  selectRoadPOI(candidates, x, z, road) {
    // Get biome at location
    const biome = this.worldGenerator.getBiome(x, z);
    const elevation = this.worldGenerator.calculateTerrain(x, z);

    // Filter by biome and elevation
    const valid = candidates.filter(poi => {
      if (!poi.biomes.includes(Biome.ANY) && !poi.biomes.includes(biome)) {
        return false;
      }
      if (elevation < poi.minElevation || elevation > poi.maxElevation) {
        return false;
      }
      return true;
    });

    if (valid.length === 0) return null;

    // Weight by rarity
    const weights = valid.map(poi => poi.rarity);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < valid.length; i++) {
      random -= weights[i];
      if (random <= 0) return valid[i];
    }

    return valid[0];
  }

  /**
   * Generate POIs near settlements
   */
  async generateSettlementPOIs() {
    console.log('[POIManager] Generating settlement-adjacent POIs...');

    if (!this.politicalMap || !this.politicalMap.voronoiCells) {
      console.log('[POIManager] No political map available, skipping settlement POIs');
      return;
    }

    const settlementPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.SETTLEMENT_OUTSKIRTS)
    );

    let settlementPOICount = 0;

    for (const cell of this.politicalMap.voronoiCells.values()) {
      if (!cell.centroid) continue;

      const faction = cell.faction || 'NEUTRAL';
      const tier = cell.settlementTier || 'OUTPOST';

      // Determine POI count based on settlement tier
      let poiCount = 2;
      if (tier === 'CAPITAL') poiCount = 12;
      else if (tier === 'TOWN') poiCount = 8;
      else if (tier === 'VILLAGE') poiCount = 4;

      // Place POIs around settlement
      for (let i = 0; i < poiCount; i++) {
        const angle = (i / poiCount) * Math.PI * 2 + Math.random() * 0.5;
        const distance = 200 + Math.random() * 800; // 200-1000 units from center

        const poiX = cell.centroid.x + Math.cos(angle) * distance;
        const poiZ = cell.centroid.z + Math.sin(angle) * distance;

        // Filter POIs by faction (prefer faction-specific)
        const factionPOIs = this.getFactionAppropiatePOIs(settlementPOIs, faction);
        const selectedPOI = this.selectContextualPOI(factionPOIs, poiX, poiZ);

        if (selectedPOI) {
          const placed = this.tryPlacePOI(selectedPOI, { x: poiX, z: poiZ }, angle);
          if (placed) settlementPOICount++;
        }
      }
    }

    console.log(`[POIManager] Placed ${settlementPOICount} settlement-adjacent POIs`);
  }

  /**
   * Generate POIs in wilderness areas
   */
  async generateWildernessPOIs() {
    console.log('[POIManager] Generating wilderness POIs...');

    const wildernessPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.WILDERNESS) ||
      poi.spawnContexts.includes(SpawnContext.FOREST_EDGE)
    );

    let wildernessCount = 0;
    const sampleSpacing = 2000; // Sample every 2000 units

    for (let x = -this.halfWorld; x < this.halfWorld; x += sampleSpacing) {
      for (let z = -this.halfWorld; z < this.halfWorld; z += sampleSpacing) {
        // Use noise to determine if this location should have a POI
        const noiseVal = this.placementNoise(x * 0.0001, z * 0.0001);

        if (noiseVal < 0.3) continue; // Only 35% of grid cells get POIs

        // Add randomness to position
        const offsetX = (Math.random() - 0.5) * sampleSpacing * 0.8;
        const offsetZ = (Math.random() - 0.5) * sampleSpacing * 0.8;
        const poiX = x + offsetX;
        const poiZ = z + offsetZ;

        // Check if too close to settlement
        const nearestSettlement = this.findNearestSettlement(poiX, poiZ);
        if (nearestSettlement && nearestSettlement.distance < 500) continue;

        // Select appropriate POI
        const selectedPOI = this.selectContextualPOI(wildernessPOIs, poiX, poiZ);

        if (selectedPOI) {
          const rotation = Math.random() * Math.PI * 2;
          const placed = this.tryPlacePOI(selectedPOI, { x: poiX, z: poiZ }, rotation);
          if (placed) wildernessCount++;
        }
      }
    }

    console.log(`[POIManager] Placed ${wildernessCount} wilderness POIs`);
  }

  /**
   * Generate faction-specific POIs in their territories
   */
  async generateFactionPOIs() {
    console.log('[POIManager] Generating faction-specific POIs...');

    if (!this.politicalMap || !this.politicalMap.voronoiCells) {
      console.log('[POIManager] No political map available, skipping faction POIs');
      return;
    }

    const factionPOILists = {
      [POIFaction.IRON_SYNOD]: Object.values(IronSynodPOIs),
      [POIFaction.CHROMA_CORP]: Object.values(ChromaCorpPOIs),
      [POIFaction.VERDANT_LINK]: Object.values(VerdantLinkPOIs),
      [POIFaction.NULL_DRIFTERS]: Object.values(NullDriftersPOIs)
    };

    let factionPOICount = 0;

    for (const [faction, pois] of Object.entries(factionPOILists)) {

      // Get all cells belonging to this faction
      const factionCells = Array.from(this.politicalMap.voronoiCells.values())
        .filter(cell => cell.faction === faction);

      // Target POI count based on territory size
      const targetCount = Math.floor(factionCells.length * 0.5); // 0.5 POIs per cell average

      for (let i = 0; i < targetCount; i++) {
        // Pick random cell
        const cell = factionCells[Math.floor(Math.random() * factionCells.length)];
        if (!cell || !cell.centroid) continue;

        // Random position within cell (approximate)
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (cell.area ? Math.sqrt(cell.area) / 4 : 2000);

        const poiX = cell.centroid.x + Math.cos(angle) * distance;
        const poiZ = cell.centroid.z + Math.sin(angle) * distance;

        // Select faction-specific POI
        const selectedPOI = this.selectContextualPOI(pois, poiX, poiZ);

        if (selectedPOI) {
          const rotation = Math.random() * Math.PI * 2;
          const placed = this.tryPlacePOI(selectedPOI, { x: poiX, z: poiZ }, rotation, faction);
          if (placed) factionPOICount++;
        }
      }
    }

    console.log(`[POIManager] Placed ${factionPOICount} faction-specific POIs`);
  }

  /**
   * Generate special location POIs (peaks, coastal, etc.)
   */
  async generateSpecialLocationPOIs() {
    console.log('[POIManager] Generating special location POIs...');

    let specialCount = 0;

    // Find high peaks for relay towers and observatories
    specialCount += await this.generatePeakPOIs();

    // Generate coastal POIs
    specialCount += await this.generateCoastalPOIs();

    // Generate flat terrain POIs (solar farms, etc.)
    specialCount += await this.generateFlatTerrainPOIs();

    console.log(`[POIManager] Placed ${specialCount} special location POIs`);
  }

  /**
   * Generate POIs on mountain peaks
   */
  async generatePeakPOIs() {
    const peakPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.HIGHEST_PEAK)
    );

    let count = 0;
    const sampleSpacing = 5000;

    for (let x = -this.halfWorld; x < this.halfWorld; x += sampleSpacing) {
      for (let z = -this.halfWorld; z < this.halfWorld; z += sampleSpacing) {
        // Find local maximum in this area
        const peak = this.findLocalPeak(x, z, sampleSpacing / 2);

        if (peak && peak.elevation > 80) {
          const selectedPOI = this.selectContextualPOI(peakPOIs, peak.x, peak.z);

          if (selectedPOI) {
            const placed = this.tryPlacePOI(selectedPOI, { x: peak.x, z: peak.z }, Math.random() * Math.PI * 2);
            if (placed) count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Find local elevation peak in an area
   */
  findLocalPeak(centerX, centerZ, radius) {
    let maxElevation = -Infinity;
    let peakX = centerX;
    let peakZ = centerZ;

    const step = radius / 5;

    for (let dx = -radius; dx <= radius; dx += step) {
      for (let dz = -radius; dz <= radius; dz += step) {
        const x = centerX + dx;
        const z = centerZ + dz;
        const elevation = this.worldGenerator.calculateTerrain(x, z);

        if (elevation > maxElevation) {
          maxElevation = elevation;
          peakX = x;
          peakZ = z;
        }
      }
    }

    return { x: peakX, z: peakZ, elevation: maxElevation };
  }

  /**
   * Generate coastal POIs
   */
  async generateCoastalPOIs() {
    const coastalPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.COASTAL) ||
      poi.spawnContexts.includes(SpawnContext.WATER_ADJACENT)
    );

    let count = 0;
    const sampleSpacing = 3000;

    for (let x = -this.halfWorld; x < this.halfWorld; x += sampleSpacing) {
      for (let z = -this.halfWorld; z < this.halfWorld; z += sampleSpacing) {
        // Check if this is a coastal area
        const elevation = this.worldGenerator.calculateTerrain(x, z);
        const biome = this.worldGenerator.getBiome(x, z);

        if (biome === 'BEACH' || (elevation > 0 && elevation < 10)) {
          // Verify water is nearby
          const hasWaterNearby = this.checkWaterNearby(x, z, 100);

          if (hasWaterNearby && Math.random() < 0.3) {
            const selectedPOI = this.selectContextualPOI(coastalPOIs, x, z);

            if (selectedPOI) {
              const placed = this.tryPlacePOI(selectedPOI, { x, z }, Math.random() * Math.PI * 2);
              if (placed) count++;
            }
          }
        }
      }
    }

    return count;
  }

  /**
   * Check if water is nearby a position
   */
  checkWaterNearby(x, z, radius) {
    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const sampleX = x + Math.cos(angle) * radius;
      const sampleZ = z + Math.sin(angle) * radius;
      const elevation = this.worldGenerator.calculateTerrain(sampleX, sampleZ);

      if (elevation < 0) return true;
    }
    return false;
  }

  /**
   * Generate flat terrain POIs
   */
  async generateFlatTerrainPOIs() {
    const flatPOIs = Object.values(AllPOIs).filter(poi =>
      poi.spawnContexts.includes(SpawnContext.FLAT_TERRAIN)
    );

    let count = 0;
    const sampleSpacing = 8000;

    for (let x = -this.halfWorld; x < this.halfWorld; x += sampleSpacing) {
      for (let z = -this.halfWorld; z < this.halfWorld; z += sampleSpacing) {
        // Check terrain flatness
        const flatness = this.measureFlatness(x, z, 100);

        if (flatness < 0.05 && Math.random() < 0.15) { // Very flat areas
          const selectedPOI = this.selectContextualPOI(flatPOIs, x, z);

          if (selectedPOI) {
            const placed = this.tryPlacePOI(selectedPOI, { x, z }, Math.random() * Math.PI * 2);
            if (placed) count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Measure terrain flatness (slope) at a position
   */
  measureFlatness(x, z, radius) {
    const centerHeight = this.worldGenerator.calculateTerrain(x, z);
    let maxDiff = 0;

    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const sampleX = x + Math.cos(angle) * radius;
      const sampleZ = z + Math.sin(angle) * radius;
      const sampleHeight = this.worldGenerator.calculateTerrain(sampleX, sampleZ);

      maxDiff = Math.max(maxDiff, Math.abs(sampleHeight - centerHeight));
    }

    return maxDiff / radius; // Slope ratio
  }

  /**
   * Select contextually appropriate POI based on location
   */
  selectContextualPOI(candidates, x, z) {
    if (candidates.length === 0) return null;

    const biome = this.worldGenerator.getBiome(x, z);
    const elevation = this.worldGenerator.calculateTerrain(x, z);

    // Filter by biome and elevation
    const valid = candidates.filter(poi => {
      if (!poi.biomes.includes(Biome.ANY) && !poi.biomes.includes(biome)) {
        return false;
      }
      if (elevation < poi.minElevation || elevation > poi.maxElevation) {
        return false;
      }
      return true;
    });

    if (valid.length === 0) return null;

    // Weight by rarity and context appropriateness
    const weights = valid.map(poi => {
      let weight = poi.rarity;

      // Bonus for matching dominant biome
      if (poi.biomes.includes(biome)) weight *= 1.5;

      return weight;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < valid.length; i++) {
      random -= weights[i];
      if (random <= 0) return valid[i];
    }

    return valid[0];
  }

  /**
   * Get faction-appropriate POIs (faction-specific + neutral)
   */
  getFactionAppropiatePOIs(candidates, faction) {
    return candidates.filter(poi => {
      // Neutral POIs are always available
      if (poi.factions.length === 0) return true;
      // Faction-specific POIs only for matching faction
      return poi.factions.includes(faction);
    });
  }

  /**
   * Attempt to place a POI at a position
   */
  tryPlacePOI(poi, position, rotation = 0, overrideFaction = null) {
    // Get terrain height at position
    const terrainHeight = this.worldGenerator.calculateTerrain(position.x, position.z);

    const fullPosition = {
      x: position.x,
      y: terrainHeight,
      z: position.z
    };

    // Get existing POIs for validation
    const existingPOIs = Array.from(this.placedPOIs.values());

    // Validate placement
    const validation = this.terrainStitcher.validatePlacement(poi, fullPosition, existingPOIs);

    if (!validation.valid) {
      return false;
    }

    // Apply terrain surgery
    const surgeryResult = this.terrainStitcher.applyTerrainSurgery(poi, fullPosition, rotation);

    if (!surgeryResult.success) {
      return false;
    }

    // Determine faction for this location
    const faction = overrideFaction || this.getFactionAtPosition(position.x, position.z);

    // Generate foundation if needed
    let foundationData = null;
    if (surgeryResult.requiresFoundation) {
      foundationData = this.foundationGenerator.generateFoundation(
        poi,
        surgeryResult.footprint,
        surgeryResult.foundationData,
        faction
      );
    }

    // Create POI instance
    const poiInstance = {
      id: this.nextPOIId++,
      poiType: poi.id,
      poi,
      position: fullPosition,
      rotation,
      footprint: surgeryResult.footprint,
      targetHeight: surgeryResult.targetHeight,
      originalFaction: faction, // Store original faction (persists even after territory changes)
      currentFaction: faction,
      foundation: foundationData ? this.foundationGenerator.serializeFoundation(foundationData) : null,
      affectedChunks: surgeryResult.affectedChunks,
      timestamp: Date.now()
    };

    // Store POI
    this.placedPOIs.set(poiInstance.id, poiInstance);

    // Update spatial index
    this.addToSpatialIndex(poiInstance);

    return true;
  }

  /**
   * Add POI to spatial index
   */
  addToSpatialIndex(poiInstance) {
    const gridX = Math.floor(poiInstance.position.x / this.gridCellSize);
    const gridZ = Math.floor(poiInstance.position.z / this.gridCellSize);
    const gridKey = `${gridX},${gridZ}`;

    if (!this.spatialGrid.has(gridKey)) {
      this.spatialGrid.set(gridKey, new Set());
    }

    this.spatialGrid.get(gridKey).add(poiInstance.id);
  }

  /**
   * Remove POI from spatial index
   */
  removeFromSpatialIndex(poiInstance) {
    const gridX = Math.floor(poiInstance.position.x / this.gridCellSize);
    const gridZ = Math.floor(poiInstance.position.z / this.gridCellSize);
    const gridKey = `${gridX},${gridZ}`;

    const cell = this.spatialGrid.get(gridKey);
    if (cell) {
      cell.delete(poiInstance.id);
    }
  }

  /**
   * Get faction at a world position
   */
  getFactionAtPosition(x, z) {
    if (!this.politicalMap) return 'NEUTRAL';

    const cell = this.politicalMap.getCellAtPosition(x, z);
    return cell ? cell.faction : 'NEUTRAL';
  }

  /**
   * Find nearest settlement to a position
   */
  findNearestSettlement(x, z) {
    if (!this.politicalMap || !this.politicalMap.voronoiCells) return null;

    let nearest = null;
    let minDist = Infinity;

    for (const cell of this.politicalMap.voronoiCells.values()) {
      if (!cell.centroid) continue;

      const dist = Math.sqrt(
        Math.pow(x - cell.centroid.x, 2) +
        Math.pow(z - cell.centroid.z, 2)
      );

      if (dist < minDist) {
        minDist = dist;
        nearest = cell;
      }
    }

    return nearest ? { cell: nearest, distance: minDist } : null;
  }

  /**
   * Get POIs within a radius of a position
   */
  getPOIsInRadius(x, z, radius) {
    const result = [];

    const minGridX = Math.floor((x - radius) / this.gridCellSize);
    const maxGridX = Math.floor((x + radius) / this.gridCellSize);
    const minGridZ = Math.floor((z - radius) / this.gridCellSize);
    const maxGridZ = Math.floor((z + radius) / this.gridCellSize);

    for (let gx = minGridX; gx <= maxGridX; gx++) {
      for (let gz = minGridZ; gz <= maxGridZ; gz++) {
        const gridKey = `${gx},${gz}`;
        const cell = this.spatialGrid.get(gridKey);

        if (cell) {
          for (const poiId of cell) {
            const poi = this.placedPOIs.get(poiId);
            if (!poi) continue;

            const dist = Math.sqrt(
              Math.pow(x - poi.position.x, 2) +
              Math.pow(z - poi.position.z, 2)
            );

            if (dist <= radius) {
              result.push({ poi, distance: dist });
            }
          }
        }
      }
    }

    return result.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get POIs for a specific chunk
   */
  getPOIsForChunk(chunkX, chunkZ, chunkSize = 32) {
    const worldX = chunkX * chunkSize;
    const worldZ = chunkZ * chunkSize;

    // Get POIs that might affect this chunk
    const searchRadius = Math.max(chunkSize * 2, 200); // Include nearby POIs
    const nearby = this.getPOIsInRadius(
      worldX + chunkSize / 2,
      worldZ + chunkSize / 2,
      searchRadius
    );

    // Filter to POIs that actually affect this chunk
    return nearby.filter(({ poi }) => {
      if (!poi.affectedChunks) return true;
      return poi.affectedChunks.includes(`${chunkX},${chunkZ}`);
    }).map(({ poi }) => poi);
  }

  /**
   * Get serializable POI data for client
   */
  serializePOI(poiInstance) {
    return {
      id: poiInstance.id,
      type: poiInstance.poiType,
      name: poiInstance.poi.name,
      category: poiInstance.poi.category,
      position: poiInstance.position,
      rotation: poiInstance.rotation,
      targetHeight: poiInstance.targetHeight,
      footprint: {
        width: poiInstance.footprint.width,
        depth: poiInstance.footprint.depth,
        flattenRadius: poiInstance.footprint.flattenRadius
      },
      originalFaction: poiInstance.originalFaction,
      currentFaction: poiInstance.currentFaction,
      meshData: poiInstance.poi.meshData,
      foundation: poiInstance.foundation,
      hasInterior: poiInstance.poi.hasInterior,
      lootTier: poiInstance.poi.lootTier
    };
  }

  /**
   * Get all POIs for client (serialized)
   */
  getAllPOIsForClient() {
    const result = [];
    for (const poi of this.placedPOIs.values()) {
      result.push(this.serializePOI(poi));
    }
    return result;
  }

  /**
   * Get terrain modification data for chunk processing
   */
  getTerrainModifications() {
    return this.terrainStitcher.getModificationData();
  }

  /**
   * Process chunk heightmap with POI modifications
   */
  processChunkHeightmap(chunkX, chunkZ, heightMap) {
    return this.terrainStitcher.processChunkHeightmap(chunkX, chunkZ, heightMap);
  }

  /**
   * Update POI faction ownership (when territory changes)
   */
  updatePOIFaction(poiId, newFaction) {
    const poi = this.placedPOIs.get(poiId);
    if (poi) {
      poi.currentFaction = newFaction;
      // Note: originalFaction is preserved to show who built it
    }
  }

  /**
   * Get a random roadside POI position for player spawning
   * Returns null if no roadside POIs exist
   */
  getRandomRoadsidePOI() {
    // Filter POIs that were placed along roads
    const roadsidePOIs = [];

    for (const poiInstance of this.placedPOIs.values()) {
      if (poiInstance.poi &&
          poiInstance.poi.spawnContexts &&
          poiInstance.poi.spawnContexts.includes(SpawnContext.ALONG_ROAD)) {
        roadsidePOIs.push(poiInstance);
      }
    }

    if (roadsidePOIs.length === 0) {
      console.log('[POIManager] No roadside POIs available for spawn');
      return null;
    }

    // Select a random roadside POI
    const selectedPOI = roadsidePOIs[Math.floor(Math.random() * roadsidePOIs.length)];

    return {
      x: selectedPOI.position.x,
      y: selectedPOI.position.y,
      z: selectedPOI.position.z,
      poiId: selectedPOI.id,
      poiType: selectedPOI.poiType,
      poiName: selectedPOI.poi.name
    };
  }

  /**
   * Clear all POIs (for world regeneration)
   */
  clearAllPOIs() {
    this.placedPOIs.clear();
    this.spatialGrid.clear();
    this.terrainStitcher.clearModifications();
    this.nextPOIId = 1;
  }

  /**
   * Get statistics about placed POIs
   */
  getStatistics() {
    const stats = {
      total: this.placedPOIs.size,
      byCategory: {},
      byFaction: {},
      byType: {},
      withFoundations: 0
    };

    for (const poi of this.placedPOIs.values()) {
      // By category
      const category = poi.poi.category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // By faction
      const faction = poi.originalFaction;
      stats.byFaction[faction] = (stats.byFaction[faction] || 0) + 1;

      // By type
      const type = poi.poiType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // With foundations
      if (poi.foundation) stats.withFoundations++;
    }

    return stats;
  }
}

export default POIManager;
