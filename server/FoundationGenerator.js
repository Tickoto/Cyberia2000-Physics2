/**
 * FoundationGenerator.js - Procedural Foundation Mesh Generation
 *
 * Generates foundation "skirt" meshes that extend from building floors into terrain
 * to hide gaps when terrain cannot be perfectly flattened due to steep slopes.
 *
 * Foundation types:
 * - MINIMAL: Simple rectangular base, thin profile
 * - STANDARD: Chamfered edges, moderate depth
 * - HEAVY: Buttressed corners, deep foundation
 * - MASSIVE: Full basement structure with supports
 */

// Foundation material styles
export const FoundationMaterial = {
  CONCRETE: {
    id: 'CONCRETE',
    color: 0x808080,
    roughness: 0.9,
    metalness: 0.0,
    textureScale: 2.0
  },
  RUSTY_STEEL: {
    id: 'RUSTY_STEEL',
    color: 0x8B4513,
    roughness: 0.7,
    metalness: 0.4,
    textureScale: 1.0
  },
  CLEAN_METAL: {
    id: 'CLEAN_METAL',
    color: 0xC0C0C0,
    roughness: 0.3,
    metalness: 0.8,
    textureScale: 1.0
  },
  ORGANIC: {
    id: 'ORGANIC',
    color: 0x3D5C3D,
    roughness: 0.8,
    metalness: 0.0,
    textureScale: 3.0
  },
  SCRAP: {
    id: 'SCRAP',
    color: 0x696969,
    roughness: 0.95,
    metalness: 0.2,
    textureScale: 0.5
  },
  STONE: {
    id: 'STONE',
    color: 0x6B6B6B,
    roughness: 0.95,
    metalness: 0.0,
    textureScale: 4.0
  }
};

// Faction to material mapping
export const FactionMaterials = {
  IRON_SYNOD: FoundationMaterial.RUSTY_STEEL,
  CHROMA_CORP: FoundationMaterial.CLEAN_METAL,
  VERDANT_LINK: FoundationMaterial.ORGANIC,
  NULL_DRIFTERS: FoundationMaterial.SCRAP,
  NEUTRAL: FoundationMaterial.CONCRETE
};

export class FoundationGenerator {
  constructor() {
    // Geometry generation settings
    this.segmentsPerUnit = 0.5; // Vertices per unit of perimeter
    this.minSegments = 8;
    this.maxSegments = 64;
  }

  /**
   * Generate foundation mesh data for a POI
   * @param {Object} poi - POI definition
   * @param {Object} footprint - Calculated footprint from TerrainStitcher
   * @param {Object} foundationData - Foundation requirements from TerrainStitcher
   * @param {string} faction - Faction owning the territory (for material selection)
   * @returns {Object} Foundation mesh data for client-side rendering
   */
  generateFoundation(poi, footprint, foundationData, faction = 'NEUTRAL') {
    if (!foundationData) {
      return null;
    }

    const material = this.selectMaterial(poi, faction);
    const style = foundationData.foundationStyle;

    // Generate appropriate foundation based on style
    switch (style) {
      case 'MINIMAL':
        return this.generateMinimalFoundation(footprint, foundationData, material);
      case 'STANDARD':
        return this.generateStandardFoundation(footprint, foundationData, material);
      case 'HEAVY':
        return this.generateHeavyFoundation(footprint, foundationData, material);
      case 'MASSIVE':
        return this.generateMassiveFoundation(footprint, foundationData, material);
      default:
        return this.generateMinimalFoundation(footprint, foundationData, material);
    }
  }

  /**
   * Select appropriate material based on POI and faction
   */
  selectMaterial(poi, faction) {
    // Check if POI has specific material override
    if (poi.meshData?.foundationMaterial) {
      return FoundationMaterial[poi.meshData.foundationMaterial] || FoundationMaterial.CONCRETE;
    }

    // Check POI style for faction hint
    const poiStyle = poi.meshData?.style;
    if (poiStyle && FactionMaterials[poiStyle]) {
      return FactionMaterials[poiStyle];
    }

    // Use faction material
    return FactionMaterials[faction] || FoundationMaterial.CONCRETE;
  }

  /**
   * Generate minimal foundation - simple extruded perimeter
   */
  generateMinimalFoundation(footprint, foundationData, material) {
    const { perimeterSamples, floorHeight, extensionRadius } = foundationData;

    // Generate perimeter vertices
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const numSamples = perimeterSamples.length;

    // Create top and bottom rings
    for (let i = 0; i < numSamples; i++) {
      const sample = perimeterSamples[i];
      const nextSample = perimeterSamples[(i + 1) % numSamples];

      // Extend outward slightly for visual overlap with building
      const extendX = Math.cos(sample.angle) * extensionRadius;
      const extendZ = Math.sin(sample.angle) * extensionRadius;

      // Top vertex (at floor level)
      vertices.push(
        sample.x + extendX,
        floorHeight,
        sample.z + extendZ
      );

      // Bottom vertex (at terrain level, slightly below)
      vertices.push(
        sample.x + extendX,
        sample.terrainHeight - 0.2,
        sample.z + extendZ
      );

      // Calculate outward normal
      const normalX = Math.cos(sample.angle);
      const normalZ = Math.sin(sample.angle);

      normals.push(normalX, 0, normalZ); // Top
      normals.push(normalX, 0, normalZ); // Bottom

      // UVs based on perimeter distance
      const u = i / numSamples;
      const topV = 1;
      const bottomV = 0;

      uvs.push(u, topV);
      uvs.push(u, bottomV);

      // Create quad faces
      const topCurrent = i * 2;
      const bottomCurrent = i * 2 + 1;
      const topNext = ((i + 1) % numSamples) * 2;
      const bottomNext = ((i + 1) % numSamples) * 2 + 1;

      // Two triangles per quad
      indices.push(topCurrent, bottomCurrent, topNext);
      indices.push(topNext, bottomCurrent, bottomNext);
    }

    // Add bottom cap
    const bottomCapStart = vertices.length / 3;
    const centerX = footprint.center.x;
    const centerZ = footprint.center.z;

    // Center vertex of bottom cap
    const avgTerrainHeight = foundationData.perimeterSamples.reduce(
      (a, b) => a + b.terrainHeight, 0
    ) / numSamples;

    vertices.push(centerX, avgTerrainHeight - 0.3, centerZ);
    normals.push(0, -1, 0);
    uvs.push(0.5, 0.5);

    // Connect bottom perimeter to center
    for (let i = 0; i < numSamples; i++) {
      const bottomCurrent = i * 2 + 1;
      const bottomNext = ((i + 1) % numSamples) * 2 + 1;

      indices.push(bottomCapStart, bottomNext, bottomCurrent);
    }

    return {
      type: 'FOUNDATION_MINIMAL',
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material,
      boundingBox: this.calculateBoundingBox(vertices)
    };
  }

  /**
   * Generate standard foundation with chamfered edges
   */
  generateStandardFoundation(footprint, foundationData, material) {
    const { perimeterSamples, floorHeight, extensionRadius, batterAngle } = foundationData;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const numSamples = perimeterSamples.length;
    const batterRadians = (batterAngle || 10) * Math.PI / 180;
    const batterInset = Math.tan(batterRadians);

    // Three rings: top (floor), chamfer, bottom
    for (let i = 0; i < numSamples; i++) {
      const sample = perimeterSamples[i];
      const depth = sample.depth + 0.3; // Extra depth for embedding

      // Outward direction
      const outX = Math.cos(sample.angle);
      const outZ = Math.sin(sample.angle);

      // Top vertex (at floor, extended outward)
      const topExt = extensionRadius;
      vertices.push(
        sample.x + outX * topExt,
        floorHeight,
        sample.z + outZ * topExt
      );

      // Chamfer vertex (halfway down, slightly inset)
      const chamferDepth = depth * 0.3;
      const chamferExt = extensionRadius - chamferDepth * batterInset;
      vertices.push(
        sample.x + outX * chamferExt,
        floorHeight - chamferDepth,
        sample.z + outZ * chamferExt
      );

      // Bottom vertex (at terrain, more inset)
      const bottomExt = extensionRadius - depth * batterInset;
      vertices.push(
        sample.x + outX * bottomExt,
        sample.terrainHeight - 0.2,
        sample.z + outZ * bottomExt
      );

      // Normals (pointing outward with slight up/down tilt)
      const chamferNormalY = Math.sin(batterRadians);
      const chamferNormalH = Math.cos(batterRadians);

      normals.push(outX, 0.1, outZ);  // Top - slight up tilt
      normals.push(outX * chamferNormalH, chamferNormalY, outZ * chamferNormalH); // Chamfer
      normals.push(outX * chamferNormalH, -chamferNormalY, outZ * chamferNormalH); // Bottom

      // UVs
      const u = i / numSamples;
      uvs.push(u, 1.0);
      uvs.push(u, 0.7);
      uvs.push(u, 0.0);

      // Create faces (two quads per segment)
      const ring = 3;
      const curr = i * ring;
      const next = ((i + 1) % numSamples) * ring;

      // Top to chamfer quad
      indices.push(curr, curr + 1, next);
      indices.push(next, curr + 1, next + 1);

      // Chamfer to bottom quad
      indices.push(curr + 1, curr + 2, next + 1);
      indices.push(next + 1, curr + 2, next + 2);
    }

    // Bottom cap (simple triangulation)
    const bottomCapStart = vertices.length / 3;
    vertices.push(footprint.center.x, foundationData.avgDepth > 0 ?
      floorHeight - foundationData.avgDepth - 0.3 :
      floorHeight - 1.0, footprint.center.z);
    normals.push(0, -1, 0);
    uvs.push(0.5, 0.5);

    for (let i = 0; i < numSamples; i++) {
      const bottomCurrent = i * 3 + 2;
      const bottomNext = ((i + 1) % numSamples) * 3 + 2;
      indices.push(bottomCapStart, bottomNext, bottomCurrent);
    }

    return {
      type: 'FOUNDATION_STANDARD',
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material,
      boundingBox: this.calculateBoundingBox(vertices)
    };
  }

  /**
   * Generate heavy foundation with buttresses at corners
   */
  generateHeavyFoundation(footprint, foundationData, material) {
    const { perimeterSamples, floorHeight, extensionRadius, batterAngle, maxDepth } = foundationData;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const numSamples = perimeterSamples.length;
    const batterRadians = (batterAngle || 12) * Math.PI / 180;

    // First, generate the main foundation wall (similar to standard)
    const ringCount = 4; // Top, upper-mid, lower-mid, bottom

    for (let i = 0; i < numSamples; i++) {
      const sample = perimeterSamples[i];
      const depth = sample.depth + 0.5;

      const outX = Math.cos(sample.angle);
      const outZ = Math.sin(sample.angle);

      for (let r = 0; r < ringCount; r++) {
        const t = r / (ringCount - 1);
        const currentDepth = depth * t;
        const inset = currentDepth * Math.tan(batterRadians);
        const ext = extensionRadius - inset;

        vertices.push(
          sample.x + outX * ext,
          floorHeight - currentDepth,
          sample.z + outZ * ext
        );

        // Normal with batter angle
        const normalY = r > 0 && r < ringCount - 1 ? Math.sin(batterRadians) : 0;
        const normalH = Math.cos(batterRadians);
        normals.push(outX * normalH, normalY, outZ * normalH);

        uvs.push(i / numSamples, 1 - t);
      }

      // Create faces between rings
      for (let r = 0; r < ringCount - 1; r++) {
        const curr = i * ringCount + r;
        const next = ((i + 1) % numSamples) * ringCount + r;

        indices.push(curr, curr + 1, next);
        indices.push(next, curr + 1, next + 1);
      }
    }

    // Add buttresses at corners (every 90 degrees for rectangular)
    const buttressCount = 4;
    const buttressWidth = 2.0;
    const buttressDepth = maxDepth * 0.8;
    const buttressExtension = extensionRadius + 1.5;

    for (let b = 0; b < buttressCount; b++) {
      const angle = footprint.rotation + (b * Math.PI / 2) + Math.PI / 4;
      const buttressIndex = Math.floor((angle / (Math.PI * 2)) * numSamples) % numSamples;
      const baseSample = perimeterSamples[buttressIndex];

      if (!baseSample) continue;

      const buttressStart = vertices.length / 3;

      // Buttress is a tapered box
      const bx = baseSample.x;
      const bz = baseSample.z;
      const outX = Math.cos(baseSample.angle);
      const outZ = Math.sin(baseSample.angle);
      const perpX = -outZ;
      const perpZ = outX;

      // Top face (4 vertices)
      const topY = floorHeight;
      vertices.push(
        bx + outX * extensionRadius - perpX * buttressWidth / 2, topY, bz + outZ * extensionRadius - perpZ * buttressWidth / 2,
        bx + outX * extensionRadius + perpX * buttressWidth / 2, topY, bz + outZ * extensionRadius + perpZ * buttressWidth / 2,
        bx + outX * buttressExtension + perpX * buttressWidth / 2, topY, bz + outZ * buttressExtension + perpZ * buttressWidth / 2,
        bx + outX * buttressExtension - perpX * buttressWidth / 2, topY, bz + outZ * buttressExtension - perpZ * buttressWidth / 2
      );

      // Bottom face (4 vertices, tapered inward)
      const bottomY = baseSample.terrainHeight - 0.3;
      const taperFactor = 0.6;
      vertices.push(
        bx + outX * extensionRadius * taperFactor - perpX * buttressWidth * taperFactor / 2, bottomY,
        bz + outZ * extensionRadius * taperFactor - perpZ * buttressWidth * taperFactor / 2,
        bx + outX * extensionRadius * taperFactor + perpX * buttressWidth * taperFactor / 2, bottomY,
        bz + outZ * extensionRadius * taperFactor + perpZ * buttressWidth * taperFactor / 2,
        bx + outX * buttressExtension + perpX * buttressWidth * taperFactor / 2, bottomY,
        bz + outZ * buttressExtension + perpZ * buttressWidth * taperFactor / 2,
        bx + outX * buttressExtension - perpX * buttressWidth * taperFactor / 2, bottomY,
        bz + outZ * buttressExtension - perpZ * buttressWidth * taperFactor / 2
      );

      // Normals (approximate)
      for (let n = 0; n < 4; n++) normals.push(0, 1, 0); // Top
      for (let n = 0; n < 4; n++) normals.push(0, -1, 0); // Bottom

      // UVs
      for (let n = 0; n < 8; n++) uvs.push(0.5, 0.5);

      // Faces
      // Top
      indices.push(buttressStart, buttressStart + 1, buttressStart + 2);
      indices.push(buttressStart, buttressStart + 2, buttressStart + 3);

      // Sides (connect top to bottom)
      const bt = buttressStart;
      const bb = buttressStart + 4;

      // Front
      indices.push(bt + 2, bt + 3, bb + 2);
      indices.push(bb + 2, bt + 3, bb + 3);

      // Left
      indices.push(bt + 3, bt, bb + 3);
      indices.push(bb + 3, bt, bb);

      // Right
      indices.push(bt + 1, bt + 2, bb + 1);
      indices.push(bb + 1, bt + 2, bb + 2);

      // Back (connects to main wall)
      indices.push(bt, bt + 1, bb);
      indices.push(bb, bt + 1, bb + 1);
    }

    return {
      type: 'FOUNDATION_HEAVY',
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material,
      boundingBox: this.calculateBoundingBox(vertices),
      hasButtresses: true,
      buttressCount
    };
  }

  /**
   * Generate massive foundation with full basement structure
   */
  generateMassiveFoundation(footprint, foundationData, material) {
    const { perimeterSamples, floorHeight, extensionRadius, maxDepth } = foundationData;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const numSamples = perimeterSamples.length;

    // Main wall thickness
    const wallThickness = 1.5;

    // Generate outer wall
    for (let i = 0; i < numSamples; i++) {
      const sample = perimeterSamples[i];
      const depth = Math.max(sample.depth + 1.0, maxDepth * 0.8);

      const outX = Math.cos(sample.angle);
      const outZ = Math.sin(sample.angle);

      // Outer top
      vertices.push(
        sample.x + outX * (extensionRadius + wallThickness),
        floorHeight + 0.5, // Slightly above floor for parapet effect
        sample.z + outZ * (extensionRadius + wallThickness)
      );

      // Outer bottom
      vertices.push(
        sample.x + outX * (extensionRadius + wallThickness * 0.5),
        sample.terrainHeight - depth,
        sample.z + outZ * (extensionRadius + wallThickness * 0.5)
      );

      // Inner top
      vertices.push(
        sample.x + outX * extensionRadius,
        floorHeight,
        sample.z + outZ * extensionRadius
      );

      // Inner bottom
      vertices.push(
        sample.x + outX * extensionRadius,
        sample.terrainHeight - depth + 0.5,
        sample.z + outZ * extensionRadius
      );

      // Normals
      normals.push(outX, 0.2, outZ);  // Outer top
      normals.push(outX, -0.2, outZ); // Outer bottom
      normals.push(-outX, 0, -outZ);  // Inner top
      normals.push(-outX, 0, -outZ);  // Inner bottom

      // UVs
      const u = i / numSamples;
      uvs.push(u, 1.0);
      uvs.push(u, 0.0);
      uvs.push(u, 1.0);
      uvs.push(u, 0.0);

      // Create faces
      const ring = 4;
      const curr = i * ring;
      const next = ((i + 1) % numSamples) * ring;

      // Outer wall
      indices.push(curr, curr + 1, next);
      indices.push(next, curr + 1, next + 1);

      // Inner wall
      indices.push(curr + 2, next + 2, curr + 3);
      indices.push(next + 2, next + 3, curr + 3);

      // Top cap (parapet)
      indices.push(curr, next, curr + 2);
      indices.push(next, next + 2, curr + 2);

      // Bottom cap
      indices.push(curr + 1, curr + 3, next + 1);
      indices.push(next + 1, curr + 3, next + 3);
    }

    // Add support columns inside
    const columnCount = 4;
    const columnRadius = 0.8;
    const columnSegments = 8;

    for (let c = 0; c < columnCount; c++) {
      const angle = footprint.rotation + (c * Math.PI / 2) + Math.PI / 4;
      const distance = Math.min(footprint.width, footprint.depth) * 0.25;

      const colX = footprint.center.x + Math.cos(angle) * distance;
      const colZ = footprint.center.z + Math.sin(angle) * distance;
      const terrainHeight = perimeterSamples[0].terrainHeight; // Approximate
      const colTop = floorHeight;
      const colBottom = terrainHeight - maxDepth * 0.5;

      const colStart = vertices.length / 3;

      // Generate column cylinder
      for (let s = 0; s <= columnSegments; s++) {
        const segAngle = (s / columnSegments) * Math.PI * 2;
        const nx = Math.cos(segAngle);
        const nz = Math.sin(segAngle);

        // Top vertex
        vertices.push(colX + nx * columnRadius, colTop, colZ + nz * columnRadius);
        normals.push(nx, 0, nz);
        uvs.push(s / columnSegments, 1);

        // Bottom vertex
        vertices.push(colX + nx * columnRadius, colBottom, colZ + nz * columnRadius);
        normals.push(nx, 0, nz);
        uvs.push(s / columnSegments, 0);

        if (s < columnSegments) {
          const curr = colStart + s * 2;
          const next = colStart + (s + 1) * 2;

          indices.push(curr, curr + 1, next);
          indices.push(next, curr + 1, next + 1);
        }
      }
    }

    return {
      type: 'FOUNDATION_MASSIVE',
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material,
      boundingBox: this.calculateBoundingBox(vertices),
      hasBasement: true,
      hasColumns: true,
      columnCount
    };
  }

  /**
   * Calculate bounding box from vertices array
   */
  calculateBoundingBox(vertices) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  /**
   * Generate retaining wall mesh for extreme slopes
   * Used when the slope is so steep that a normal foundation won't work
   */
  generateRetainingWall(footprint, foundationData, material, direction = 'DOWNHILL') {
    const { perimeterSamples, floorHeight, maxDepth } = foundationData;

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Find the downhill side
    let maxDepthSample = perimeterSamples[0];
    for (const sample of perimeterSamples) {
      if (sample.depth > maxDepthSample.depth) {
        maxDepthSample = sample;
      }
    }

    // Generate stepped retaining wall on the deep side
    const wallLength = footprint.width * 1.2;
    const wallHeight = maxDepth + 2;
    const stepCount = Math.ceil(wallHeight / 1.5);
    const stepHeight = wallHeight / stepCount;
    const stepDepth = 0.5;

    const wallAngle = maxDepthSample.angle + Math.PI; // Face outward
    const perpAngle = wallAngle + Math.PI / 2;

    const wallCenterX = maxDepthSample.x + Math.cos(wallAngle) * 2;
    const wallCenterZ = maxDepthSample.z + Math.sin(wallAngle) * 2;

    for (let step = 0; step <= stepCount; step++) {
      const y = floorHeight - step * stepHeight;
      const inset = step * stepDepth;

      // Left point
      vertices.push(
        wallCenterX + Math.cos(perpAngle) * wallLength / 2 - Math.cos(wallAngle) * inset,
        y,
        wallCenterZ + Math.sin(perpAngle) * wallLength / 2 - Math.sin(wallAngle) * inset
      );

      // Right point
      vertices.push(
        wallCenterX - Math.cos(perpAngle) * wallLength / 2 - Math.cos(wallAngle) * inset,
        y,
        wallCenterZ - Math.sin(perpAngle) * wallLength / 2 - Math.sin(wallAngle) * inset
      );

      normals.push(Math.cos(wallAngle), 0, Math.sin(wallAngle));
      normals.push(Math.cos(wallAngle), 0, Math.sin(wallAngle));

      uvs.push(0, 1 - step / stepCount);
      uvs.push(1, 1 - step / stepCount);

      if (step > 0) {
        const curr = step * 2;
        const prev = (step - 1) * 2;

        indices.push(prev, curr, prev + 1);
        indices.push(prev + 1, curr, curr + 1);
      }
    }

    return {
      type: 'RETAINING_WALL',
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material,
      boundingBox: this.calculateBoundingBox(vertices),
      stepCount,
      wallAngle
    };
  }

  /**
   * Create serializable foundation data for transmission to client
   */
  serializeFoundation(foundationMesh) {
    if (!foundationMesh) return null;

    return {
      type: foundationMesh.type,
      vertices: Array.from(foundationMesh.vertices),
      normals: Array.from(foundationMesh.normals),
      uvs: Array.from(foundationMesh.uvs),
      indices: Array.from(foundationMesh.indices),
      material: foundationMesh.material,
      boundingBox: foundationMesh.boundingBox,
      metadata: {
        hasButtresses: foundationMesh.hasButtresses,
        buttressCount: foundationMesh.buttressCount,
        hasBasement: foundationMesh.hasBasement,
        hasColumns: foundationMesh.hasColumns,
        columnCount: foundationMesh.columnCount,
        stepCount: foundationMesh.stepCount
      }
    };
  }
}

export default FoundationGenerator;
