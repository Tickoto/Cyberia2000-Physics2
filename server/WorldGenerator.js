import { createNoise2D } from 'simplex-noise';
import { OBJECTS, BIOME_DEFINITIONS } from './Objects.js';
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

class WorldGenerator {
    constructor(seed = worldConfig.seed, chunkSize = worldConfig.chunkSize, seaLevel = worldConfig.seaLevel) {
        this.seed = seed;
        this.chunkSize = chunkSize;
        this.seaLevel = seaLevel;
        this.scale = 1;

        // Noise Layers
        this.noiseElevation = createNoise2D(seededRandom(seed + '_elev'));
        this.noiseRoughness = createNoise2D(seededRandom(seed + '_rough'));
        this.noiseMoisture = createNoise2D(seededRandom(seed + '_moist'));
        this.noiseTemp = createNoise2D(seededRandom(seed + '_temp'));
        this.noiseRiver = createNoise2D(seededRandom(seed + '_river'));
    }

    fbm(x, y, noiseFn, octaves = 4, persistence = 0.5, lacunarity = 2) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0; 
        for(let i=0;i<octaves;i++) {
            total += noiseFn(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    }

    // Helper: Linear Interpolation
    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // Helper: Smoothstep
    smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // Determine Biome based on environmental factors
    getBiomeData(t, m, h) {
        // h is the "Continental" elevation value (-1 to 1)
        
        // 1. Water / Coast
        if (h < 0.0) return BIOME_DEFINITIONS.OCEAN;
        if (h < 0.08) return BIOME_DEFINITIONS.BEACH;

        // 2. Mountains (High Elevation)
        if (h > 0.75) {
            if (t < -0.2) return BIOME_DEFINITIONS.SNOWY_MOUNTAIN;
            return BIOME_DEFINITIONS.MOUNTAIN;
        }

        // 3. Inland (Lowlands & Highlands)
        // Check for "Ruined City" (Rare distinct pocket using noise hash or specific T/M combo)
        // Let's say polluted areas: Very High Temp, Moderate Moisture?
        // Or just use a separate noise channel for "Civilization"
        // For simplicity, let's map it to a specific T/M slice
        if (t > 0.6 && m > 0.4) return BIOME_DEFINITIONS.RUINED_CITY;

        // Desert (Hot & Dry)
        if (t > 0.4 && m < -0.1) return BIOME_DEFINITIONS.DESERT;

        // 4. Distinction between Hills and Flatlands based on Elevation 'h'
        // Highlands (Hills)
        if (h > 0.4) {
            if (t < -0.2) return BIOME_DEFINITIONS.PINE_FOREST; // Cold Hills
            return BIOME_DEFINITIONS.HILLS; // Grassy Hills
        }

        // Lowlands (Flats)
        if (t < -0.3) return BIOME_DEFINITIONS.PINE_FOREST;
        return BIOME_DEFINITIONS.GRASSLAND;
    }

    // Calculate terrain height at global coordinate
    calculateTerrain(x, y) {
        // Larger Scale for Bigger Biomes
        const scale = 0.0006; 
        
        // 1. Base Elevation (Continental)
        let elev = this.fbm(x * scale, y * scale, this.noiseElevation, 4, 0.5, 2.0);
        
        // Environmental Noise
        const envScale = 0.0006;
        const t = this.fbm(x * envScale, y * envScale, this.noiseTemp, 2);
        const m = this.fbm(x * envScale, y * envScale, this.noiseMoisture, 2);

        // Biome Data
        const biome = this.getBiomeData(t, m, elev);

        // 2. Continuous Height Calculation
        // Define height potentials for different zones
        
        // Ocean: < 0
        const hOcean = elev * 40; 
        
        // Lowlands: 0 to 0.4 (Very gentle)
        const hLowland = elev * 8 + 1; 
        
        // Highlands: 0.4 to 0.75 (Rolling)
        const hHighland = elev * 35 - 8;
        
        // Mountains: > 0.75 (Steep)
        const hMountain = Math.pow(elev, 2) * 120 - 20;

        // Blend Zones using Smoothstep
        // Transition Ocean -> Lowland (-0.05 to 0.05)
        const tCoast = this.smoothstep(-0.05, 0.05, elev);
        let finalH = this.lerp(hOcean, hLowland, tCoast);

        // Transition Lowland -> Highland (0.3 to 0.5)
        const tHill = this.smoothstep(0.3, 0.5, elev);
        finalH = this.lerp(finalH, hHighland, tHill);

        // Transition Highland -> Mountain (0.7 to 0.85)
        const tMount = this.smoothstep(0.7, 0.85, elev);
        finalH = this.lerp(finalH, hMountain, tMount);

        // 3. Detail / Roughness
        // Base roughness noise
        const detailNoise = this.fbm(x * 0.005, y * 0.005, this.noiseRoughness, 3);
        
        // Roughness Magnitude Blending
        const rLow = 1.0;
        const rHigh = 12.0;
        const rMount = 35.0;
        
        let roughness = this.lerp(rLow, rHigh, tHill);
        roughness = this.lerp(roughness, rMount, tMount);
        
        // Apply roughness
        // Ridged noise for mountains
        if (tMount > 0) {
             const ridge = 1.0 - Math.abs(detailNoise);
             finalH += Math.pow(ridge, 3) * roughness * tMount;
             // Keep some normal noise for lower areas
             finalH += detailNoise * roughness * (1 - tMount);
        } else {
             finalH += detailNoise * roughness;
        }

        // 4. Biome Specific Modifiers (Applied on top)
        if (biome.id === 'DESERT') {
            // Dunes
            const duneH = Math.sin(x * 0.03) * Math.cos(y * 0.03 + x * 0.01) * 4;
            finalH += Math.abs(duneH);
        } else if (biome.id === 'RUINED_CITY') {
            // Terracing
            finalH = Math.floor(finalH / 2.5) * 2.5; 
        }

        // 5. Rivers (Smoothed)
        const riverScale = 0.0006;
        const riverRaw = Math.abs(this.noiseRiver(x * riverScale, y * riverScale));
        let isWater = false;
        
        const riverWidth = 0.03;
        if (riverRaw < riverWidth) {
            const factor = riverRaw / riverWidth; 
            const smoothFactor = factor * factor * (3 - 2 * factor);
            
            // Carve down to water level (-2)
            // But smoothly blend the carving amount based on terrain height?
            // Rivers in mountains cut deeper valleys.
            const digDepth = 15 + (finalH * 0.5); 
            finalH -= (1 - smoothFactor) * digDepth;
        }

        // Global Water Level
        if (finalH < this.seaLevel) {
            isWater = true;
        }

        return { height: finalH, isWater: isWater, rawElev: elev, biome: biome };
    }

    // Public helper
    getGroundHeight(x, z) {
        return this.calculateTerrain(x, z).height;
    }

    generateChunk(chunkX, chunkZ) {
        const size = this.chunkSize;
        const data = {
            id: `${chunkX},${chunkZ}`,
            x: chunkX,
            z: chunkZ,
            size: size,
            heightMap: [],
            biomeMap: [], // ID Strings
            objects: [] 
        };

        const startX = chunkX * size;
        const startZ = chunkZ * size;

        // Generate Terrain (size + 1 for stitching)
        for (let z = 0; z <= size; z++) {
            for (let x = 0; x <= size; x++) {
                const wx = startX + x;
                const wz = startZ + z;
                
                const terrain = this.calculateTerrain(wx, wz);
                let biomeId = terrain.biome.id;
                
                // Override biome if deep water (Visuals only)
                if (terrain.isWater && biomeId !== 'OCEAN') {
                    // Keep river bed as riverbed or ocean?
                    // Let's call it ocean for blue map color
                    // biomeId = 'OCEAN'; 
                }

                data.biomeMap.push(biomeId);
                data.heightMap.push(terrain.height);

                // Object Placement
                if (x < size && z < size && !terrain.isWater) {
                    const spawnHash = Math.abs(Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453);
                    const spawnChance = spawnHash - Math.floor(spawnHash);
                    
                    this.spawnBiomeObjects(terrain.biome, wx, terrain.height, wz, spawnChance, data.objects);
                }
            }
        }

        // Dynamic POI Generation
        const poiHash = Math.abs(Math.sin(chunkX * 45.123 + chunkZ * 91.532) * 12345.678);
        if ((poiHash - Math.floor(poiHash)) > 0.95) {
            this.generatePOI(chunkX, chunkZ, data);
        }

        return data;
    }

    spawnBiomeObjects(biomeDef, x, y, z, rngVal, objectList) {
        if (!biomeDef.objects) return;

        for (const entry of biomeDef.objects) {
            // Normalize rng for this object type? 
            // Simplified: if rngVal is within a small window
            // Since we iterate, this treats rngVal as a single dice roll for the tile
            
            // Check if rngVal < chance? No, that would spawn everything on low rng tiles.
            // Use a hash of x,y + objID
            const objHash = Math.abs(Math.sin(x * 3.1 + z * 8.7 + entry.id.length) * 555.55);
            const roll = objHash - Math.floor(objHash);

            if (roll < entry.chance) {
                const objDef = OBJECTS[entry.id];
                if (objDef) {
                    const scale = objDef.scale.min + (objDef.scale.max - objDef.scale.min) * Math.random();
                    objectList.push({
                        type: entry.id, // Store key, client looks up props
                        x: x, y: y, z: z,
                        rot: Math.random() * Math.PI * 2,
                        scale: scale
                    });
                    return; // Spawn one object per tile max
                }
            }
        }
    }

    generatePOI(chunkX, chunkZ, data) {
        const cx = chunkX * this.chunkSize + this.chunkSize / 2;
        const cz = chunkZ * this.chunkSize + this.chunkSize / 2;
        
        const stride = this.chunkSize + 1;
        const centerIdx = Math.floor(this.chunkSize/2) * stride + Math.floor(this.chunkSize/2);
        const cy = data.heightMap[centerIdx] || 10;
        const safeY = isNaN(cy) ? 10 : cy;

        // Use OBJECTS definitions
        const towerDef = OBJECTS.BUILDING_TOWER;
        const beaconDef = OBJECTS.BEACON_MAIN;

        data.objects.push(
            { type: 'BUILDING_TOWER', x: cx + 8, y: safeY, z: cz + 8, rot: 0, scale: 1 },
            { type: 'BUILDING_TOWER', x: cx - 8, y: safeY, z: cz + 8, rot: 0, scale: 1 },
            { type: 'BUILDING_TOWER', x: cx + 8, y: safeY, z: cz - 8, rot: 0, scale: 1 },
            { type: 'BUILDING_TOWER', x: cx - 8, y: safeY, z: cz - 8, rot: 0, scale: 1 },
            { type: 'BEACON_MAIN', x: cx, y: safeY, z: cz, rot: 0, scale: 1 }
        );
        
        const pad = 12;
        const localCX = this.chunkSize / 2;
        const localCZ = this.chunkSize / 2;
        
        for(let dz = -pad; dz <= pad; dz++) {
            for(let dx = -pad; dx <= pad; dx++) {
                const lx = Math.floor(localCX + dx);
                const lz = Math.floor(localCZ + dz);
                if (lx >= 0 && lx <= this.chunkSize && lz >= 0 && lz <= this.chunkSize) {
                    const idx = lz * stride + lx;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist < pad) {
                        data.heightMap[idx] = safeY;
                    }
                }
            }
        }
    }
}

export default WorldGenerator;