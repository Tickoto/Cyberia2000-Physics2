/**
 * TerrainStitcher.js - Cut-and-Fill Terrain Surgery System
 *
 * Handles terrain modification for POI placement:
 * - Calculates building footprints
 * - Flattens terrain inside footprints to average height
 * - Generates smooth ramp falloff radius for terrain blending
 * - Determines when foundation skirts are needed
 */

import { createNoise2D } from 'simplex-noise';

class TerrainStitcher {
  constructor(worldGenerator) {
    this.worldGenerator = worldGenerator;
    this.chunkSize = 32;
    this.verticesPerChunk = 33; // 33x33 for stitching

    // Track terrain modifications per chunk
    this.modifiedChunks = new Map(); // chunkId -> { modifications: [], heightOverrides: Map }

    // Noise for natural-looking terrain blending
    this.blendNoise = createNoise2D(() => Math.random());
  }

  /**
   * Calculate the world-space footprint corners for a POI
   * @param {Object} poi - The POI definition
   * @param {Object} position - {x, y, z} world position
   * @param {number} rotation - Rotation in radians
   * @returns {Object} Footprint data with corners and bounds
   */
  calculateFootprint(poi, position, rotation = 0) {
    const halfWidth = poi.footprint.width / 2;
    const halfDepth = poi.footprint.depth / 2;

    // Local corners (before rotation)
    const localCorners = [
      { x: -halfWidth, z: -halfDepth },
      { x: halfWidth, z: -halfDepth },
      { x: halfWidth, z: halfDepth },
      { x: -halfWidth, z: halfDepth }
    ];

    // Apply rotation and translate to world space
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const worldCorners = localCorners.map(corner => ({
      x: position.x + corner.x * cos - corner.z * sin,
      z: position.z + corner.x * sin + corner.z * cos
    }));

    // Calculate axis-aligned bounding box
    const minX = Math.min(...worldCorners.map(c => c.x));
    const maxX = Math.max(...worldCorners.map(c => c.x));
    const minZ = Math.min(...worldCorners.map(c => c.z));
    const maxZ = Math.max(...worldCorners.map(c => c.z));

    return {
      corners: worldCorners,
      bounds: { minX, maxX, minZ, maxZ },
      center: position,
      rotation,
      width: poi.footprint.width,
      depth: poi.footprint.depth,
      flattenRadius: poi.flattenRadius,
      rampRadius: poi.rampRadius
    };
  }

  /**
   * Check if a point is inside a rotated rectangle
   * @param {number} px - Point X
   * @param {number} pz - Point Z
   * @param {Object} footprint - Footprint data from calculateFootprint
   * @returns {boolean} True if point is inside footprint
   */
  isPointInFootprint(px, pz, footprint) {
    // Transform point to local space
    const dx = px - footprint.center.x;
    const dz = pz - footprint.center.z;

    const cos = Math.cos(-footprint.rotation);
    const sin = Math.sin(-footprint.rotation);

    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const halfWidth = footprint.width / 2;
    const halfDepth = footprint.depth / 2;

    return Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfDepth;
  }

  /**
   * Calculate distance from a point to the footprint edge
   * @param {number} px - Point X
   * @param {number} pz - Point Z
   * @param {Object} footprint - Footprint data
   * @returns {number} Distance to edge (negative if inside)
   */
  distanceToFootprintEdge(px, pz, footprint) {
    // Transform point to local space
    const dx = px - footprint.center.x;
    const dz = pz - footprint.center.z;

    const cos = Math.cos(-footprint.rotation);
    const sin = Math.sin(-footprint.rotation);

    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const halfWidth = footprint.width / 2;
    const halfDepth = footprint.depth / 2;

    // Distance to each edge
    const distToLeft = localX + halfWidth;
    const distToRight = halfWidth - localX;
    const distToBack = localZ + halfDepth;
    const distToFront = halfDepth - localZ;

    // If inside, return negative of minimum distance to edge
    if (distToLeft >= 0 && distToRight >= 0 && distToBack >= 0 && distToFront >= 0) {
      return -Math.min(distToLeft, distToRight, distToBack, distToFront);
    }

    // If outside, calculate distance to nearest edge/corner
    const clampedX = Math.max(-halfWidth, Math.min(halfWidth, localX));
    const clampedZ = Math.max(-halfDepth, Math.min(halfDepth, localZ));

    return Math.sqrt(
      Math.pow(localX - clampedX, 2) +
      Math.pow(localZ - clampedZ, 2)
    );
  }

  /**
   * Sample heights within a footprint area to calculate average
   * @param {Object} footprint - Footprint data
   * @param {number} sampleDensity - Samples per unit
   * @returns {Object} { averageHeight, minHeight, maxHeight, slope }
   */
  sampleFootprintHeights(footprint, sampleDensity = 0.5) {
    const samples = [];
    const { minX, maxX, minZ, maxZ } = footprint.bounds;

    // Sample grid across footprint
    for (let x = minX; x <= maxX; x += 1 / sampleDensity) {
      for (let z = minZ; z <= maxZ; z += 1 / sampleDensity) {
        if (this.isPointInFootprint(x, z, footprint)) {
          const height = this.worldGenerator.calculateTerrain(x, z);
          samples.push({ x, z, height });
        }
      }
    }

    if (samples.length === 0) {
      // Fallback to center height
      const centerHeight = this.worldGenerator.calculateTerrain(
        footprint.center.x,
        footprint.center.z
      );
      return {
        averageHeight: centerHeight,
        minHeight: centerHeight,
        maxHeight: centerHeight,
        slope: 0
      };
    }

    const heights = samples.map(s => s.height);
    const averageHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);

    // Calculate approximate slope using corner samples
    const cornerHeights = footprint.corners.map(c =>
      this.worldGenerator.calculateTerrain(c.x, c.z)
    );

    // Max height difference divided by footprint diagonal
    const diagonal = Math.sqrt(
      Math.pow(footprint.width, 2) + Math.pow(footprint.depth, 2)
    );
    const slope = (Math.max(...cornerHeights) - Math.min(...cornerHeights)) / diagonal;

    return { averageHeight, minHeight, maxHeight, slope };
  }

  /**
   * Smoothstep interpolation function
   * @param {number} edge0 - Lower edge
   * @param {number} edge1 - Upper edge
   * @param {number} x - Value to interpolate
   * @returns {number} Smoothed value between 0 and 1
   */
  smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Enhanced smoothstep for more natural blending
   * @param {number} edge0 - Lower edge
   * @param {number} edge1 - Upper edge
   * @param {number} x - Value to interpolate
   * @returns {number} Smoothed value between 0 and 1
   */
  smootherstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Apply cut-and-fill terrain surgery for a POI
   * @param {Object} poi - POI definition
   * @param {Object} position - World position {x, y, z}
   * @param {number} rotation - Rotation in radians
   * @returns {Object} Modification result with foundation requirements
   */
  applyTerrainSurgery(poi, position, rotation = 0) {
    const footprint = this.calculateFootprint(poi, position, rotation);
    const heightData = this.sampleFootprintHeights(footprint);

    // Determine target height (average or specified)
    let targetHeight = heightData.averageHeight;

    // Adjust target height to be slightly above minimum to reduce digging
    // but not so high that we're building on air
    const heightBias = 0.3; // Favor cutting over filling
    targetHeight = heightData.minHeight +
      (heightData.averageHeight - heightData.minHeight) * (1 - heightBias);

    // Calculate affected chunks
    const affectedChunks = this.getAffectedChunks(footprint);

    // Store modification data
    const modification = {
      poiId: poi.id,
      footprint,
      targetHeight,
      originalHeightData: heightData,
      timestamp: Date.now()
    };

    // Apply modifications to each affected chunk
    for (const chunkKey of affectedChunks) {
      this.applyChunkModification(chunkKey, modification);
    }

    // Determine if foundation is needed
    const requiresFoundation = this.calculateFoundationRequirement(
      poi,
      heightData,
      targetHeight
    );

    return {
      success: true,
      footprint,
      targetHeight,
      originalHeights: heightData,
      requiresFoundation,
      foundationData: requiresFoundation ? this.calculateFoundationData(
        poi,
        footprint,
        targetHeight,
        heightData
      ) : null,
      affectedChunks: Array.from(affectedChunks)
    };
  }

  /**
   * Get all chunks affected by a footprint (including ramp radius)
   * @param {Object} footprint - Footprint data
   * @returns {Set} Set of chunk keys
   */
  getAffectedChunks(footprint) {
    const chunks = new Set();
    const totalRadius = footprint.flattenRadius + footprint.rampRadius;

    const minChunkX = Math.floor((footprint.bounds.minX - totalRadius) / this.chunkSize);
    const maxChunkX = Math.floor((footprint.bounds.maxX + totalRadius) / this.chunkSize);
    const minChunkZ = Math.floor((footprint.bounds.minZ - totalRadius) / this.chunkSize);
    const maxChunkZ = Math.floor((footprint.bounds.maxZ + totalRadius) / this.chunkSize);

    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
        chunks.add(`${cx},${cz}`);
      }
    }

    return chunks;
  }

  /**
   * Apply a terrain modification to a specific chunk
   * @param {string} chunkKey - Chunk identifier
   * @param {Object} modification - Modification data
   */
  applyChunkModification(chunkKey, modification) {
    if (!this.modifiedChunks.has(chunkKey)) {
      this.modifiedChunks.set(chunkKey, {
        modifications: [],
        heightOverrides: new Map()
      });
    }

    const chunkData = this.modifiedChunks.get(chunkKey);
    chunkData.modifications.push(modification);
  }

  /**
   * Get the modified height for a world position
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @param {number} originalHeight - Original terrain height
   * @returns {number} Modified height
   */
  getModifiedHeight(worldX, worldZ, originalHeight) {
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    const chunkKey = `${chunkX},${chunkZ}`;

    const chunkData = this.modifiedChunks.get(chunkKey);
    if (!chunkData || chunkData.modifications.length === 0) {
      return originalHeight;
    }

    let modifiedHeight = originalHeight;

    // Apply all modifications (later ones take precedence in overlap)
    for (const mod of chunkData.modifications) {
      const blendedHeight = this.calculateBlendedHeight(
        worldX,
        worldZ,
        originalHeight,
        mod
      );

      if (blendedHeight !== null) {
        modifiedHeight = blendedHeight;
      }
    }

    return modifiedHeight;
  }

  /**
   * Calculate blended height for a point affected by a modification
   * @param {number} worldX - World X
   * @param {number} worldZ - World Z
   * @param {number} originalHeight - Original height
   * @param {Object} modification - Modification data
   * @returns {number|null} Blended height or null if not affected
   */
  calculateBlendedHeight(worldX, worldZ, originalHeight, modification) {
    const { footprint, targetHeight } = modification;

    // Calculate distance to footprint edge
    const distToEdge = this.distanceToFootprintEdge(worldX, worldZ, footprint);

    // Inside the flatten radius (negative distance means inside footprint)
    if (distToEdge <= 0) {
      // Fully flattened inside the actual footprint
      return targetHeight;
    }

    // Check if within flatten radius but outside footprint
    const flattenZone = footprint.flattenRadius - footprint.width / 2;
    if (distToEdge <= flattenZone) {
      // Still mostly flat, with slight blend
      const t = distToEdge / flattenZone;
      const blendFactor = this.smoothstep(0, 1, t);
      return targetHeight * (1 - blendFactor * 0.1) + originalHeight * (blendFactor * 0.1);
    }

    // Within ramp zone - blend between target and original
    const rampStart = flattenZone;
    const rampEnd = flattenZone + footprint.rampRadius;

    if (distToEdge <= rampEnd) {
      // Add slight noise for natural appearance
      const noiseValue = this.blendNoise(worldX * 0.1, worldZ * 0.1) * 0.5 + 0.5;
      const noiseOffset = (noiseValue - 0.5) * 0.5; // +-0.25 units variation

      // Calculate blend factor with noise
      const t = (distToEdge - rampStart) / footprint.rampRadius;
      const baseFactor = this.smootherstep(0, 1, t);
      const noisyFactor = Math.max(0, Math.min(1, baseFactor + noiseOffset * 0.1));

      return targetHeight * (1 - noisyFactor) + originalHeight * noisyFactor;
    }

    // Outside affected area
    return null;
  }

  /**
   * Calculate if a foundation skirt is required
   * @param {Object} poi - POI definition
   * @param {Object} heightData - Height sampling data
   * @param {number} targetHeight - Target flatten height
   * @returns {boolean} True if foundation needed
   */
  calculateFoundationRequirement(poi, heightData, targetHeight) {
    if (!poi.requiresFoundation) {
      return false;
    }

    // Foundation needed if slope exceeds threshold
    if (heightData.slope > poi.maxSlopeForFlat) {
      return true;
    }

    // Foundation needed if height difference is significant
    const maxGap = Math.abs(targetHeight - heightData.minHeight);
    if (maxGap > 2.0) { // More than 2 units gap
      return true;
    }

    return false;
  }

  /**
   * Calculate foundation data for geo-stitching
   * @param {Object} poi - POI definition
   * @param {Object} footprint - Footprint data
   * @param {number} targetHeight - Target height
   * @param {Object} heightData - Original height data
   * @returns {Object} Foundation generation parameters
   */
  calculateFoundationData(poi, footprint, targetHeight, heightData) {
    // Sample perimeter heights for foundation depth calculation
    const perimeterSamples = [];
    const numSamples = 32;

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const angle = t * Math.PI * 2;

      // Sample at footprint edge
      const sampleX = footprint.center.x +
        Math.cos(angle + footprint.rotation) * footprint.width * 0.5;
      const sampleZ = footprint.center.z +
        Math.sin(angle + footprint.rotation) * footprint.depth * 0.5;

      const terrainHeight = this.worldGenerator.calculateTerrain(sampleX, sampleZ);
      const depth = Math.max(0, targetHeight - terrainHeight);

      perimeterSamples.push({
        x: sampleX,
        z: sampleZ,
        terrainHeight,
        depth,
        angle: angle + footprint.rotation
      });
    }

    // Calculate foundation properties
    const maxDepth = Math.max(...perimeterSamples.map(s => s.depth));
    const avgDepth = perimeterSamples.reduce((a, b) => a + b.depth, 0) / perimeterSamples.length;

    // Determine foundation style based on depth
    let foundationStyle = 'MINIMAL';
    if (avgDepth > 1.0) foundationStyle = 'STANDARD';
    if (avgDepth > 3.0) foundationStyle = 'HEAVY';
    if (avgDepth > 6.0) foundationStyle = 'MASSIVE';

    return {
      floorHeight: targetHeight,
      maxDepth,
      avgDepth,
      perimeterSamples,
      foundationStyle,
      // Extend foundation slightly beyond footprint for visual stability
      extensionRadius: Math.min(2.0, avgDepth * 0.3),
      // Batter angle (inward slope) for aesthetic
      batterAngle: Math.min(15, avgDepth * 2), // degrees
      // Material should match faction/POI style
      material: poi.meshData?.style || 'CONCRETE'
    };
  }

  /**
   * Process a chunk's heightmap with all modifications
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkZ - Chunk Z coordinate
   * @param {Float32Array} heightMap - Original heightmap (will be modified)
   * @returns {Float32Array} Modified heightmap
   */
  processChunkHeightmap(chunkX, chunkZ, heightMap) {
    const chunkKey = `${chunkX},${chunkZ}`;
    const chunkData = this.modifiedChunks.get(chunkKey);

    if (!chunkData || chunkData.modifications.length === 0) {
      return heightMap;
    }

    const worldOffsetX = chunkX * this.chunkSize;
    const worldOffsetZ = chunkZ * this.chunkSize;

    // Process each vertex in the heightmap
    for (let i = 0; i < this.verticesPerChunk; i++) {
      for (let j = 0; j < this.verticesPerChunk; j++) {
        const index = i * this.verticesPerChunk + j;
        const worldX = worldOffsetX + j;
        const worldZ = worldOffsetZ + i;

        const originalHeight = heightMap[index];
        const modifiedHeight = this.getModifiedHeight(worldX, worldZ, originalHeight);

        heightMap[index] = modifiedHeight;
      }
    }

    return heightMap;
  }

  /**
   * Check if a position is valid for POI placement
   * @param {Object} poi - POI definition
   * @param {Object} position - Proposed position
   * @param {Array} existingPOIs - List of already placed POIs
   * @returns {Object} { valid: boolean, reason: string }
   */
  validatePlacement(poi, position, existingPOIs = []) {
    // Check terrain height constraints
    const terrainHeight = this.worldGenerator.calculateTerrain(position.x, position.z);

    if (terrainHeight < poi.minElevation) {
      return { valid: false, reason: 'Below minimum elevation' };
    }

    if (terrainHeight > poi.maxElevation) {
      return { valid: false, reason: 'Above maximum elevation' };
    }

    // Check for overlaps with existing POIs
    const proposedFootprint = this.calculateFootprint(poi, position);

    for (const existing of existingPOIs) {
      const existingFootprint = existing.footprint || this.calculateFootprint(
        existing.poi,
        existing.position,
        existing.rotation
      );

      // Check bounding box overlap first (fast)
      if (this.boundingBoxOverlap(proposedFootprint.bounds, existingFootprint.bounds)) {
        // More precise overlap check
        const minSeparation = (proposedFootprint.flattenRadius + existingFootprint.flattenRadius) * 0.5;
        const distance = Math.sqrt(
          Math.pow(position.x - existing.position.x, 2) +
          Math.pow(position.z - existing.position.z, 2)
        );

        if (distance < minSeparation) {
          return { valid: false, reason: 'Overlaps with existing POI' };
        }
      }
    }

    // Check same-type distance constraint
    const samePOIs = existingPOIs.filter(e => e.poi.id === poi.id);
    for (const same of samePOIs) {
      const distance = Math.sqrt(
        Math.pow(position.x - same.position.x, 2) +
        Math.pow(position.z - same.position.z, 2)
      );

      if (distance < poi.minDistanceFromSame) {
        return { valid: false, reason: 'Too close to same POI type' };
      }
    }

    return { valid: true, reason: null };
  }

  /**
   * Check if two bounding boxes overlap
   */
  boundingBoxOverlap(a, b) {
    return !(
      a.maxX < b.minX ||
      a.minX > b.maxX ||
      a.maxZ < b.minZ ||
      a.minZ > b.maxZ
    );
  }

  /**
   * Clear all modifications (for world regeneration)
   */
  clearModifications() {
    this.modifiedChunks.clear();
  }

  /**
   * Get modification info for serialization
   * @returns {Object} Serializable modification data
   */
  getModificationData() {
    const data = {};
    for (const [key, value] of this.modifiedChunks) {
      data[key] = {
        modifications: value.modifications.map(mod => ({
          poiId: mod.poiId,
          footprint: {
            center: mod.footprint.center,
            rotation: mod.footprint.rotation,
            width: mod.footprint.width,
            depth: mod.footprint.depth,
            flattenRadius: mod.footprint.flattenRadius,
            rampRadius: mod.footprint.rampRadius
          },
          targetHeight: mod.targetHeight
        }))
      };
    }
    return data;
  }

  /**
   * Load modification data from serialized format
   * @param {Object} data - Serialized modification data
   */
  loadModificationData(data) {
    this.clearModifications();
    for (const [key, value] of Object.entries(data)) {
      this.modifiedChunks.set(key, {
        modifications: value.modifications.map(mod => ({
          ...mod,
          footprint: {
            ...mod.footprint,
            corners: this.calculateCornersFromFootprint(mod.footprint),
            bounds: this.calculateBoundsFromFootprint(mod.footprint)
          }
        })),
        heightOverrides: new Map()
      });
    }
  }

  /**
   * Helper to recalculate corners from footprint data
   */
  calculateCornersFromFootprint(footprint) {
    const halfWidth = footprint.width / 2;
    const halfDepth = footprint.depth / 2;
    const cos = Math.cos(footprint.rotation);
    const sin = Math.sin(footprint.rotation);

    const localCorners = [
      { x: -halfWidth, z: -halfDepth },
      { x: halfWidth, z: -halfDepth },
      { x: halfWidth, z: halfDepth },
      { x: -halfWidth, z: halfDepth }
    ];

    return localCorners.map(corner => ({
      x: footprint.center.x + corner.x * cos - corner.z * sin,
      z: footprint.center.z + corner.x * sin + corner.z * cos
    }));
  }

  /**
   * Helper to recalculate bounds from footprint data
   */
  calculateBoundsFromFootprint(footprint) {
    const corners = this.calculateCornersFromFootprint(footprint);
    return {
      minX: Math.min(...corners.map(c => c.x)),
      maxX: Math.max(...corners.map(c => c.x)),
      minZ: Math.min(...corners.map(c => c.z)),
      maxZ: Math.max(...corners.map(c => c.z))
    };
  }
}

export default TerrainStitcher;
