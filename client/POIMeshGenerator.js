/**
 * POIMeshGenerator.js - Client-side POI Mesh Generation
 *
 * Generates procedural meshes for all POI types including:
 * - Buildings (gas stations, diners, motels, etc.)
 * - Industrial structures (refineries, forges, solar farms)
 * - Faction-specific architecture
 * - Foundations for terrain-stitched POIs
 */

import * as THREE from 'three';

// Faction color schemes
const FactionColors = {
  IRON_SYNOD: {
    primary: 0x4a3528,
    secondary: 0x8b4513,
    accent: 0xff4500,
    rust: 0x8b3d2b,
    metal: 0x5c5c5c
  },
  CHROMA_CORP: {
    primary: 0x1a1a2e,
    secondary: 0x16213e,
    accent: 0x00ffff,
    glow: 0xff00ff,
    metal: 0xc0c0c0
  },
  VERDANT_LINK: {
    primary: 0x2d4a2d,
    secondary: 0x1e3d1e,
    accent: 0x88ff88,
    organic: 0x3d5c3d,
    moss: 0x4a5d43
  },
  NULL_DRIFTERS: {
    primary: 0x4a4a4a,
    secondary: 0x3d3d3d,
    accent: 0xffaa00,
    scrap: 0x6b6b6b,
    rust: 0x8b4513
  },
  NEUTRAL: {
    primary: 0x808080,
    secondary: 0x606060,
    accent: 0xffffff,
    concrete: 0x999999,
    metal: 0x888888
  }
};

class POIMeshGenerator {
  constructor() {
    // Cache materials for reuse
    this.materials = new Map();
    this.initMaterials();
  }

  initMaterials() {
    // Common materials
    this.materials.set('concrete', new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.9,
      metalness: 0.0
    }));

    this.materials.set('metal', new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.6
    }));

    this.materials.set('rust', new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.2
    }));

    this.materials.set('glass', new THREE.MeshStandardMaterial({
      color: 0x87ceeb,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.5
    }));

    this.materials.set('wood', new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
      metalness: 0.0
    }));

    this.materials.set('neon_cyan', new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.9
    }));

    this.materials.set('neon_magenta', new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.9
    }));

    this.materials.set('solar_panel', new THREE.MeshStandardMaterial({
      color: 0x1a237e,
      roughness: 0.2,
      metalness: 0.8
    }));
  }

  /**
   * Generate mesh for a POI based on its type and data
   */
  generatePOIMesh(poiData) {
    const group = new THREE.Group();

    // Get faction colors
    const factionColors = FactionColors[poiData.originalFaction] || FactionColors.NEUTRAL;

    // Generate building mesh based on type
    const buildingMesh = this.generateBuildingMesh(poiData, factionColors);
    if (buildingMesh) {
      group.add(buildingMesh);
    }

    // Generate foundation if present
    if (poiData.foundation) {
      const foundationMesh = this.generateFoundationMesh(poiData.foundation, factionColors);
      if (foundationMesh) {
        group.add(foundationMesh);
      }
    }

    // Position the group
    group.position.set(
      poiData.position.x,
      poiData.targetHeight || poiData.position.y,
      poiData.position.z
    );

    // Apply rotation
    if (poiData.rotation) {
      group.rotation.y = poiData.rotation;
    }

    // Store POI data for interaction
    group.userData = {
      poiId: poiData.id,
      poiType: poiData.poiType || poiData.type,  // Use actual POI type (GAS_STATION, etc.)
      name: poiData.name,
      hasInterior: poiData.hasInterior,
      lootTier: poiData.lootTier
    };

    return group;
  }

  /**
   * Generate building mesh based on POI type
   */
  generateBuildingMesh(poiData, factionColors) {
    const meshData = poiData.meshData || {};
    // Use poiType (the actual POI type like GAS_STATION) for mesh generation
    // Falls back to meshData.type, then type for backwards compatibility
    const type = meshData.type || poiData.poiType || poiData.type;

    switch (type) {
      case 'GAS_STATION':
        return this.generateGasStation(poiData, factionColors);
      case 'DINER':
        return this.generateDiner(poiData, factionColors);
      case 'TRUCK_STOP':
        return this.generateTruckStop(poiData, factionColors);
      case 'MOTEL':
        return this.generateMotel(poiData, factionColors);
      case 'SOLAR_FARM':
        return this.generateSolarFarm(poiData, factionColors);
      case 'GEOTHERMAL_PLANT':
        return this.generateGeothermalPlant(poiData, factionColors);
      case 'WIND_FARM':
        return this.generateWindFarm(poiData, factionColors);
      case 'RELAY_TOWER':
        return this.generateRelayTower(poiData, factionColors);
      case 'LOG_CABIN':
        return this.generateLogCabin(poiData, factionColors);
      case 'FARM':
        return this.generateFarm(poiData, factionColors);
      case 'WINERY':
        return this.generateWinery(poiData, factionColors);
      case 'BUNKER':
        return this.generateBunker(poiData, factionColors);
      case 'WATCHTOWER':
        return this.generateWatchtower(poiData, factionColors);
      case 'LIGHTHOUSE':
        return this.generateLighthouse(poiData, factionColors);
      case 'HOTEL':
        return this.generateHotel(poiData, factionColors);
      // Faction specific
      case 'FORGE':
        return this.generateIronForge(poiData, factionColors);
      case 'SCRAP_YARD':
        return this.generateScrapYard(poiData, factionColors);
      case 'REFINERY':
        return this.generateRefinery(poiData, factionColors);
      case 'TOWER':
        return this.generateNeonTower(poiData, factionColors);
      case 'DATA_CENTER':
        return this.generateDataCenter(poiData, factionColors);
      case 'LAB':
        return this.generateLab(poiData, factionColors);
      case 'BIO_DOME':
        return this.generateBioDome(poiData, factionColors);
      case 'HYDRO_FARM':
        return this.generateHydroFarm(poiData, factionColors);
      case 'CAMP':
        return this.generateCamp(poiData, factionColors);
      case 'OUTPOST':
        return this.generateOutpost(poiData, factionColors);
      default:
        return this.generateGenericBuilding(poiData, factionColors);
    }
  }

  // ============================================================================
  // NEUTRAL POI GENERATORS
  // ============================================================================

  generateGasStation(poiData, colors) {
    const group = new THREE.Group();
    const footprint = poiData.footprint || { width: 30, depth: 25 };

    // Main building (convenience store)
    const storeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const store = new THREE.Mesh(
      new THREE.BoxGeometry(12, 4, 8),
      storeMat
    );
    store.position.set(5, 2, 0);
    store.castShadow = true;
    store.receiveShadow = true;
    group.add(store);

    // Store windows
    const windowMat = this.materials.get('glass');
    const window1 = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2),
      windowMat
    );
    window1.position.set(5, 2.5, 4.01);
    group.add(window1);

    // Canopy structure
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const canopyTop = new THREE.Mesh(
      new THREE.BoxGeometry(15, 0.3, 12),
      canopyMat
    );
    canopyTop.position.set(-5, 5, 0);
    canopyTop.castShadow = true;
    group.add(canopyTop);

    // Canopy support pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const pillarPositions = [
      [-12, 0, -5], [-12, 0, 5], [2, 0, -5], [2, 0, 5]
    ];
    pillarPositions.forEach(pos => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 5),
        pillarMat
      );
      pillar.position.set(pos[0], 2.5, pos[2]);
      group.add(pillar);
    });

    // Fuel pumps
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    for (let i = 0; i < 4; i++) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 2, 0.6),
        pumpMat
      );
      pump.position.set(-5 + (i % 2) * 4 - 2, 1, Math.floor(i / 2) * 4 - 2);
      group.add(pump);
    }

    // Sign pole
    const signPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 8),
      pillarMat
    );
    signPole.position.set(-15, 4, 0);
    group.add(signPole);

    // Sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2, 0.3),
      canopyMat
    );
    sign.position.set(-15, 7, 0);
    group.add(sign);

    return group;
  }

  generateDiner(poiData, colors) {
    const group = new THREE.Group();

    // Main building (classic diner shape)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd4af37 });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(18, 4, 10),
      bodyMat
    );
    body.position.set(0, 2, 0);
    body.castShadow = true;
    group.add(body);

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.5, 12),
      roofMat
    );
    roof.position.set(0, 4.25, 0);
    group.add(roof);

    // Windows (strip)
    const windowMat = this.materials.get('glass');
    const windowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(14, 1.5, 0.1),
      windowMat
    );
    windowStrip.position.set(0, 2.5, 5.05);
    group.add(windowStrip);

    // Neon sign
    if (poiData.meshData?.hasNeonSign) {
      const neonMat = new THREE.MeshBasicMaterial({ color: 0xff0066 });
      const neonSign = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1, 0.2),
        neonMat
      );
      neonSign.position.set(0, 5, 5);
      group.add(neonSign);
    }

    // Entry door
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2, 3, 0.2),
      doorMat
    );
    door.position.set(0, 1.5, 5.1);
    group.add(door);

    return group;
  }

  generateMotel(poiData, colors) {
    const group = new THREE.Group();
    const roomCount = poiData.meshData?.roomCount || 12;
    const floors = poiData.meshData?.floors || 2;

    // Main building (long strip)
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xdeb887 });
    const roomWidth = 4;
    const totalWidth = (roomCount / floors) * roomWidth;

    for (let floor = 0; floor < floors; floor++) {
      for (let room = 0; room < roomCount / floors; room++) {
        // Room unit
        const roomMesh = new THREE.Mesh(
          new THREE.BoxGeometry(roomWidth - 0.2, 3.5, 6),
          buildingMat
        );
        roomMesh.position.set(
          room * roomWidth - totalWidth / 2 + roomWidth / 2,
          floor * 4 + 1.75,
          0
        );
        roomMesh.castShadow = true;
        group.add(roomMesh);

        // Door
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 2, 0.1),
          doorMat
        );
        door.position.set(
          room * roomWidth - totalWidth / 2 + roomWidth / 2 - 0.8,
          floor * 4 + 1,
          3.05
        );
        group.add(door);

        // Window
        const windowMat = this.materials.get('glass');
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1, 0.1),
          windowMat
        );
        window.position.set(
          room * roomWidth - totalWidth / 2 + roomWidth / 2 + 0.8,
          floor * 4 + 2,
          3.05
        );
        group.add(window);
      }
    }

    // Walkway/balcony for second floor
    if (floors > 1) {
      const walkwayMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
      const walkway = new THREE.Mesh(
        new THREE.BoxGeometry(totalWidth + 2, 0.2, 1.5),
        walkwayMat
      );
      walkway.position.set(0, 4, 3.5);
      group.add(walkway);

      // Railing
      const railMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(totalWidth + 2, 1, 0.1),
        railMat
      );
      rail.position.set(0, 4.5, 4.2);
      group.add(rail);
    }

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(totalWidth + 2, 0.5, 8),
      roofMat
    );
    roof.position.set(0, floors * 4 + 0.25, 0);
    group.add(roof);

    // Office
    const office = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 6),
      buildingMat
    );
    office.position.set(-totalWidth / 2 - 4, 2, 0);
    office.castShadow = true;
    group.add(office);

    return group;
  }

  generateSolarFarm(poiData, colors) {
    const group = new THREE.Group();
    const rows = poiData.meshData?.panelRows || 10;
    const cols = poiData.meshData?.panelColumns || 15;

    const panelMat = this.materials.get('solar_panel');
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x666666 });

    // Solar panels in grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const panelGroup = new THREE.Group();

        // Panel surface
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(4, 0.1, 2.5),
          panelMat
        );
        panel.rotation.x = -Math.PI / 6; // Tilt toward sun
        panelGroup.add(panel);

        // Support post
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 2),
          frameMat
        );
        post.position.y = -1;
        panelGroup.add(post);

        panelGroup.position.set(
          col * 6 - (cols * 6) / 2 + 3,
          2,
          row * 4 - (rows * 4) / 2 + 2
        );
        group.add(panelGroup);
      }
    }

    // Control building
    if (poiData.meshData?.hasControlBuilding) {
      const buildingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(8, 4, 6),
        buildingMat
      );
      building.position.set((cols * 6) / 2 + 8, 2, 0);
      building.castShadow = true;
      group.add(building);
    }

    // Perimeter fence
    if (poiData.meshData?.hasFencing) {
      const fenceMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        wireframe: true
      });
      const fenceWidth = cols * 6 + 20;
      const fenceDepth = rows * 4 + 10;

      // Front fence
      const fenceFront = new THREE.Mesh(
        new THREE.PlaneGeometry(fenceWidth, 3),
        fenceMat
      );
      fenceFront.position.set(0, 1.5, fenceDepth / 2);
      group.add(fenceFront);

      // Back fence
      const fenceBack = new THREE.Mesh(
        new THREE.PlaneGeometry(fenceWidth, 3),
        fenceMat
      );
      fenceBack.position.set(0, 1.5, -fenceDepth / 2);
      fenceBack.rotation.y = Math.PI;
      group.add(fenceBack);
    }

    return group;
  }

  generateRelayTower(poiData, colors) {
    const group = new THREE.Group();
    const height = poiData.height || 60;

    // Tower structure (lattice approximation)
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });

    // Main tower segments
    for (let i = 0; i < 6; i++) {
      const segmentHeight = height / 6;
      const bottomWidth = 4 - (i * 0.5);
      const topWidth = 3.5 - (i * 0.5);

      // Four corner beams
      for (let corner = 0; corner < 4; corner++) {
        const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.2, segmentHeight),
          towerMat
        );
        beam.position.set(
          Math.cos(angle) * (bottomWidth + topWidth) / 4,
          i * segmentHeight + segmentHeight / 2,
          Math.sin(angle) * (bottomWidth + topWidth) / 4
        );
        group.add(beam);
      }

      // Cross braces
      const braceMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
      for (let side = 0; side < 4; side++) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.1, bottomWidth * 1.4),
          braceMat
        );
        brace.position.set(0, i * segmentHeight + segmentHeight / 2, 0);
        brace.rotation.y = (side / 4) * Math.PI * 2;
        brace.rotation.x = Math.PI / 4 * (side % 2 === 0 ? 1 : -1);
        group.add(brace);
      }
    }

    // Antenna array at top
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let i = 0; i < 4; i++) {
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.1, 8),
        antennaMat
      );
      antenna.position.set(
        Math.cos((i / 4) * Math.PI * 2) * 1.5,
        height + 4,
        Math.sin((i / 4) * Math.PI * 2) * 1.5
      );
      group.add(antenna);
    }

    // Neon lights
    if (poiData.meshData?.hasNeonLights) {
      const lightColor = poiData.meshData.lightColor || 0x00ffff;
      const neonMat = new THREE.MeshBasicMaterial({ color: lightColor });

      // Light rings at intervals
      for (let i = 1; i <= 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(2 - i * 0.3, 0.1, 8, 16),
          neonMat
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = i * (height / 3);
        group.add(ring);
      }

      // Top beacon
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      beacon.position.y = height + 8;
      group.add(beacon);
    }

    // Equipment shed
    if (poiData.meshData?.hasEquipmentShed) {
      const shedMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
      const shed = new THREE.Mesh(
        new THREE.BoxGeometry(4, 3, 4),
        shedMat
      );
      shed.position.set(6, 1.5, 0);
      shed.castShadow = true;
      group.add(shed);
    }

    return group;
  }

  generateLogCabin(poiData, colors) {
    const group = new THREE.Group();

    const logMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });

    // Log walls (stacked horizontal logs)
    const width = 10;
    const depth = 8;
    const wallHeight = 4;

    // Create log texture effect with multiple cylinders
    for (let layer = 0; layer < 8; layer++) {
      // Front and back walls
      for (let side of [-1, 1]) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, width),
          logMat
        );
        log.rotation.z = Math.PI / 2;
        log.position.set(0, layer * 0.5 + 0.25, side * depth / 2);
        group.add(log);
      }

      // Left and right walls
      for (let side of [-1, 1]) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, depth),
          logMat
        );
        log.rotation.x = Math.PI / 2;
        log.position.set(side * width / 2, layer * 0.5 + 0.25, 0);
        group.add(log);
      }
    }

    // Simplified roof (A-frame)
    const roofGeo = new THREE.ConeGeometry(Math.sqrt(width * width + depth * depth) / 2 + 1, 3, 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = wallHeight + 1.5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Door
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3d2817 });
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.2),
      doorMat
    );
    door.position.set(0, 1.1, depth / 2 + 0.1);
    group.add(door);

    // Windows
    const windowMat = this.materials.get('glass');
    for (let side of [-1, 1]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.8, 0.2),
        windowMat
      );
      window.position.set(side * 3, 2.5, depth / 2 + 0.1);
      group.add(window);
    }

    // Chimney
    if (poiData.meshData?.hasChimney) {
      const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(1, 3, 1),
        chimneyMat
      );
      chimney.position.set(3, wallHeight + 2, 0);
      group.add(chimney);
    }

    // Porch
    if (poiData.meshData?.hasPorch) {
      const porchMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
      const porch = new THREE.Mesh(
        new THREE.BoxGeometry(width + 2, 0.2, 2),
        porchMat
      );
      porch.position.set(0, 0.1, depth / 2 + 1);
      group.add(porch);
    }

    return group;
  }

  generateBunker(poiData, colors) {
    const group = new THREE.Group();

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555 });

    // Main bunker body (partially buried effect)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(18, 4, 12),
      concreteMat
    );
    body.position.set(0, 1, 0);
    body.castShadow = true;
    group.add(body);

    // Sloped entrance ramp area
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.5, 6),
      concreteMat
    );
    ramp.position.set(0, 0.25, 8);
    ramp.rotation.x = -0.2;
    group.add(ramp);

    // Blast door
    if (poiData.meshData?.hasBlastDoor) {
      const blastDoor = new THREE.Mesh(
        new THREE.BoxGeometry(3, 3, 0.5),
        metalMat
      );
      blastDoor.position.set(0, 1.5, 6.25);
      group.add(blastDoor);

      // Door frame
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(4, 4, 0.3),
        frameMat
      );
      frame.position.set(0, 1.5, 6.1);
      group.add(frame);
    }

    // Ventilation shafts
    if (poiData.meshData?.hasVentShafts) {
      for (let i = 0; i < 3; i++) {
        const vent = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 2),
          metalMat
        );
        vent.position.set(-6 + i * 6, 4, -3);
        group.add(vent);

        // Vent cap
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(0.6, 0.5, 8),
          metalMat
        );
        cap.position.set(-6 + i * 6, 5.25, -3);
        group.add(cap);
      }
    }

    // Camo netting (if military)
    if (poiData.meshData?.camoPattern) {
      const camoMat = new THREE.MeshStandardMaterial({
        color: 0x4a5d23,
        transparent: true,
        opacity: 0.7
      });
      const netting = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 14),
        camoMat
      );
      netting.rotation.x = -Math.PI / 2;
      netting.position.y = 3.5;
      group.add(netting);
    }

    return group;
  }

  generateWatchtower(poiData, colors) {
    const group = new THREE.Group();

    const woodMat = this.materials.get('wood');
    const metalMat = this.materials.get('metal');

    // Four support legs
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 12),
        woodMat
      );
      leg.position.set(
        Math.cos(angle) * 2.5,
        6,
        Math.sin(angle) * 2.5
      );
      group.add(leg);
    }

    // Cross bracing
    for (let level = 0; level < 3; level++) {
      for (let side = 0; side < 4; side++) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.1, 5),
          woodMat
        );
        brace.position.y = level * 4 + 2;
        brace.rotation.y = (side / 4) * Math.PI * 2;
        brace.rotation.z = Math.PI / 4;
        group.add(brace);
      }
    }

    // Platform
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.3, 6),
      woodMat
    );
    platform.position.y = 10;
    group.add(platform);

    // Railing
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    for (let side = 0; side < 4; side++) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1.2, 0.1),
        railMat
      );
      rail.position.y = 10.75;
      rail.rotation.y = (side / 4) * Math.PI * 2;
      rail.position.x = Math.sin((side / 4) * Math.PI * 2) * 3;
      rail.position.z = Math.cos((side / 4) * Math.PI * 2) * 3;
      group.add(rail);
    }

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 2, 4),
      roofMat
    );
    roof.position.y = 13;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Searchlight
    if (poiData.meshData?.hasSearchlight) {
      const light = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 0.8),
        metalMat
      );
      light.rotation.x = Math.PI / 4;
      light.position.set(2.5, 11, 0);
      group.add(light);
    }

    // Ladder
    if (poiData.meshData?.hasLadder) {
      const ladderMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const ladder = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 10, 0.1),
        ladderMat
      );
      ladder.position.set(3.5, 5, 0);
      group.add(ladder);

      // Rungs
      for (let i = 0; i < 10; i++) {
        const rung = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.1, 0.3),
          ladderMat
        );
        rung.position.set(3.5, i + 0.5, 0);
        group.add(rung);
      }
    }

    return group;
  }

  // ============================================================================
  // FACTION-SPECIFIC POI GENERATORS
  // ============================================================================

  generateIronForge(poiData, colors) {
    const group = new THREE.Group();

    const rustMat = new THREE.MeshStandardMaterial({ color: colors.rust || 0x8b4513 });
    const metalMat = new THREE.MeshStandardMaterial({ color: colors.metal || 0x5c5c5c });

    // Main foundry building
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(40, 15, 30),
      rustMat
    );
    building.position.set(0, 7.5, 0);
    building.castShadow = true;
    group.add(building);

    // Smokestacks
    const smokestackCount = poiData.meshData?.smokestackCount || 3;
    for (let i = 0; i < smokestackCount; i++) {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 2, 20),
        metalMat
      );
      stack.position.set(-15 + i * 15, 22, -5);
      group.add(stack);

      // Smoke (particle placeholder - simple cone)
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0.5
      });
      const smoke = new THREE.Mesh(
        new THREE.ConeGeometry(2, 4, 8),
        smokeMat
      );
      smoke.position.set(-15 + i * 15, 34, -5);
      smoke.rotation.x = Math.PI;
      group.add(smoke);
    }

    // Molten metal channels (glowing)
    if (poiData.meshData?.hasMoltenMetal) {
      const moltenMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
      const channel = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.5, 15),
        moltenMat
      );
      channel.position.set(10, 0.3, 0);
      group.add(channel);
    }

    // Exterior pipes and machinery
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    for (let i = 0; i < 5; i++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 12),
        pipeMat
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(18, 5 + i * 2, -10);
      group.add(pipe);
    }

    return group;
  }

  generateNeonTower(poiData, colors) {
    const group = new THREE.Group();
    const height = poiData.height || 45;

    const buildingMat = new THREE.MeshStandardMaterial({
      color: colors.primary || 0x1a1a2e
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x87ceeb,
      transparent: true,
      opacity: 0.3
    });
    const neonColor = poiData.meshData?.neonColor || 0xff00ff;
    const neonMat = new THREE.MeshBasicMaterial({ color: neonColor });

    // Main tower body
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(15, height, 15),
      buildingMat
    );
    tower.position.y = height / 2;
    tower.castShadow = true;
    group.add(tower);

    // Glass panels
    for (let floor = 0; floor < height / 5; floor++) {
      for (let side = 0; side < 4; side++) {
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(12, 4),
          glassMat
        );
        const angle = (side / 4) * Math.PI * 2;
        glass.position.set(
          Math.sin(angle) * 7.6,
          floor * 5 + 2.5,
          Math.cos(angle) * 7.6
        );
        glass.rotation.y = angle;
        group.add(glass);
      }
    }

    // Neon strips along edges
    if (poiData.meshData?.hasNeonStrips) {
      for (let edge = 0; edge < 4; edge++) {
        const angle = (edge / 4) * Math.PI * 2 + Math.PI / 4;
        const neonStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, height, 0.3),
          neonMat
        );
        neonStrip.position.set(
          Math.sin(angle) * 10.6,
          height / 2,
          Math.cos(angle) * 10.6
        );
        group.add(neonStrip);
      }
    }

    // Holographic sign
    if (poiData.meshData?.hasHolographicSign) {
      const holoMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.7
      });
      const holo = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 5),
        holoMat
      );
      holo.position.set(0, height + 5, 8);
      group.add(holo);
    }

    // Rooftop antenna array
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let i = 0; i < 3; i++) {
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 8),
        antennaMat
      );
      antenna.position.set(-5 + i * 5, height + 4, 0);
      group.add(antenna);
    }

    return group;
  }

  generateBioDome(poiData, colors) {
    const group = new THREE.Group();
    const domeRadius = 18;

    // Main dome (glass)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ff88,
      transparent: true,
      opacity: 0.4
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(domeRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      glassMat
    );
    dome.position.y = 0;
    group.add(dome);

    // Dome frame
    const frameMat = new THREE.MeshStandardMaterial({ color: colors.organic || 0x3d5c3d });
    for (let i = 0; i < 8; i++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(domeRadius, 0.3, 8, 32, Math.PI),
        frameMat
      );
      rib.rotation.y = (i / 8) * Math.PI * 2;
      rib.rotation.x = Math.PI / 2;
      group.add(rib);
    }

    // Interior vegetation (simplified)
    const vegMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    for (let i = 0; i < 10; i++) {
      const tree = new THREE.Mesh(
        new THREE.ConeGeometry(2, 6, 8),
        vegMat
      );
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 12;
      tree.position.set(
        Math.cos(angle) * dist,
        3,
        Math.sin(angle) * dist
      );
      group.add(tree);
    }

    // Water feature
    if (poiData.meshData?.hasWaterFeature) {
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.6
      });
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(5, 32),
        waterMat
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.1;
      group.add(water);
    }

    // Entrance structure
    const entranceMat = new THREE.MeshStandardMaterial({ color: colors.organic || 0x3d5c3d });
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 8),
      entranceMat
    );
    entrance.position.set(0, 2, domeRadius + 2);
    entrance.castShadow = true;
    group.add(entrance);

    return group;
  }

  generateCamp(poiData, colors) {
    const group = new THREE.Group();
    const tentCount = poiData.meshData?.tentCount || 5;

    const tentMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });

    // Tents
    for (let i = 0; i < tentCount; i++) {
      const tentGroup = new THREE.Group();

      // Tent body (cone shape)
      const tent = new THREE.Mesh(
        new THREE.ConeGeometry(3, 3, 6),
        tentMat
      );
      tent.position.y = 1.5;
      tentGroup.add(tent);

      // Support pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 4),
        poleMat
      );
      pole.position.y = 2;
      tentGroup.add(pole);

      // Position tents in rough circle
      const angle = (i / tentCount) * Math.PI * 2;
      const dist = 8 + Math.random() * 4;
      tentGroup.position.set(
        Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist
      );
      tentGroup.rotation.y = Math.random() * Math.PI * 2;

      group.add(tentGroup);
    }

    // Central fire pit
    if (poiData.meshData?.hasFirePit) {
      const pitMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const pit = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 0.3),
        pitMat
      );
      pit.position.y = 0.15;
      group.add(pit);

      // Fire (simple orange cone)
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
      const fire = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 1.5, 8),
        fireMat
      );
      fire.position.y = 1;
      group.add(fire);
    }

    // Scrap walls (for NULL_DRIFTERS style)
    if (poiData.meshData?.hasScrapWalls) {
      const scrapMat = new THREE.MeshStandardMaterial({ color: colors.scrap || 0x6b6b6b });
      for (let i = 0; i < 6; i++) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(4 + Math.random() * 2, 2 + Math.random(), 0.3),
          scrapMat
        );
        const angle = (i / 6) * Math.PI * 2;
        wall.position.set(
          Math.cos(angle) * 15,
          1,
          Math.sin(angle) * 15
        );
        wall.rotation.y = angle + Math.PI / 2;
        group.add(wall);
      }
    }

    return group;
  }

  // ============================================================================
  // GENERIC FALLBACK GENERATORS
  // ============================================================================

  generateGenericBuilding(poiData, colors) {
    const group = new THREE.Group();

    const width = poiData.footprint?.width || 20;
    const depth = poiData.footprint?.depth || 15;
    const height = poiData.height || 8;

    const buildingMat = new THREE.MeshStandardMaterial({
      color: colors.primary || 0x808080
    });

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      buildingMat
    );
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({
      color: colors.secondary || 0x606060
    });
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1, 0.5, depth + 1),
      roofMat
    );
    roof.position.y = height + 0.25;
    group.add(roof);

    // Simple windows
    const windowMat = this.materials.get('glass');
    const windowCount = Math.floor(width / 4);
    for (let i = 0; i < windowCount; i++) {
      const window = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        windowMat
      );
      window.position.set(
        -width / 2 + (i + 1) * (width / (windowCount + 1)),
        height * 0.6,
        depth / 2 + 0.05
      );
      group.add(window);
    }

    return group;
  }

  // Stub generators for other types (simplified)
  generateTruckStop(poiData, colors) {
    return this.generateGasStation(poiData, colors); // Similar structure
  }

  generateGeothermalPlant(poiData, colors) {
    const group = new THREE.Group();
    // Simplified geothermal plant
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(40, 15, 35), buildingMat);
    building.position.y = 7.5;
    group.add(building);

    // Cooling towers
    for (let i = 0; i < 3; i++) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 6, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      );
      tower.position.set(-20 + i * 20, 10, -25);
      group.add(tower);
    }

    return group;
  }

  generateWindFarm(poiData, colors) {
    const group = new THREE.Group();
    const turbineCount = poiData.meshData?.turbineCount || 5;

    for (let i = 0; i < turbineCount; i++) {
      const turbineGroup = new THREE.Group();

      // Tower
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 2, 60),
        towerMat
      );
      tower.position.y = 30;
      turbineGroup.add(tower);

      // Nacelle
      const nacelle = new THREE.Mesh(
        new THREE.BoxGeometry(4, 3, 8),
        towerMat
      );
      nacelle.position.y = 60;
      turbineGroup.add(nacelle);

      // Blades
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 25, 2),
          towerMat
        );
        blade.position.y = 60;
        blade.position.z = 4;
        blade.rotation.z = (b / 3) * Math.PI * 2;
        turbineGroup.add(blade);
      }

      turbineGroup.position.set(
        (i % 3) * 60 - 60,
        0,
        Math.floor(i / 3) * 60
      );
      group.add(turbineGroup);
    }

    return group;
  }

  generateFarm(poiData, colors) {
    const group = new THREE.Group();

    // Farmhouse
    const houseMat = new THREE.MeshStandardMaterial({ color: 0xdeb887 });
    const house = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 10), houseMat);
    house.position.set(0, 3, 0);
    group.add(house);

    // Barn
    if (poiData.meshData?.hasBarn) {
      const barnMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
      const barn = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 12), barnMat);
      barn.position.set(20, 4, 0);
      group.add(barn);
    }

    // Windmill
    if (poiData.meshData?.hasWindmill) {
      const windmillGroup = new THREE.Group();
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      );
      tower.position.y = 6;
      windmillGroup.add(tower);

      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 6, 1),
          new THREE.MeshStandardMaterial({ color: 0xcccccc })
        );
        blade.position.y = 12;
        blade.rotation.z = (i / 4) * Math.PI * 2;
        windmillGroup.add(blade);
      }

      windmillGroup.position.set(-15, 0, 10);
      group.add(windmillGroup);
    }

    return group;
  }

  generateWinery(poiData, colors) {
    const group = new THREE.Group();

    // Main building
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xdaa520 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(35, 10, 25), buildingMat);
    building.position.set(0, 5, 0);
    group.add(building);

    // Vineyard rows
    if (poiData.meshData?.hasVineyard) {
      const vineMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
      const rows = poiData.meshData.vineyardRows || 8;
      for (let i = 0; i < rows; i++) {
        const row = new THREE.Mesh(
          new THREE.BoxGeometry(2, 1.5, 40),
          vineMat
        );
        row.position.set(-25 + i * 6, 0.75, 35);
        group.add(row);
      }
    }

    return group;
  }

  generateLighthouse(poiData, colors) {
    const group = new THREE.Group();

    // Tower
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 3, 25, 16),
      towerMat
    );
    tower.position.y = 12.5;
    group.add(tower);

    // Stripes
    if (poiData.meshData?.stripePattern) {
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      for (let i = 0; i < 5; i++) {
        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(2.05 - i * 0.08, 2.55 - i * 0.1, 2.5, 16),
          stripeMat
        );
        stripe.position.y = 2.5 + i * 5;
        group.add(stripe);
      }
    }

    // Light housing
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2, 4, 16),
      housingMat
    );
    housing.position.y = 27;
    group.add(housing);

    // Light beacon
    if (poiData.meshData?.hasLightBeacon) {
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        beaconMat
      );
      beacon.position.y = 27;
      group.add(beacon);
    }

    return group;
  }

  generateHotel(poiData, colors) {
    const group = new THREE.Group();
    const floors = poiData.meshData?.floors || 4;

    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(40, floors * 4, 25),
      buildingMat
    );
    building.position.y = floors * 2;
    group.add(building);

    // Windows
    const windowMat = this.materials.get('glass');
    for (let f = 0; f < floors; f++) {
      for (let w = 0; w < 8; w++) {
        const window = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          windowMat
        );
        window.position.set(-16 + w * 4.5, f * 4 + 2, 12.6);
        group.add(window);
      }
    }

    // Pool
    if (poiData.meshData?.hasPool) {
      const poolMat = new THREE.MeshStandardMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.7
      });
      const pool = new THREE.Mesh(
        new THREE.BoxGeometry(15, 0.5, 10),
        poolMat
      );
      pool.position.set(0, 0.25, 20);
      group.add(pool);
    }

    return group;
  }

  generateScrapYard(poiData, colors) {
    return this.generateGenericBuilding(poiData, colors);
  }

  generateRefinery(poiData, colors) {
    return this.generateIronForge(poiData, colors);
  }

  generateDataCenter(poiData, colors) {
    return this.generateGenericBuilding(poiData, colors);
  }

  generateLab(poiData, colors) {
    return this.generateGenericBuilding(poiData, colors);
  }

  generateHydroFarm(poiData, colors) {
    return this.generateFarm(poiData, colors);
  }

  generateOutpost(poiData, colors) {
    return this.generateCamp(poiData, colors);
  }

  // ============================================================================
  // FOUNDATION MESH GENERATOR
  // ============================================================================

  generateFoundationMesh(foundationData, factionColors) {
    if (!foundationData || !foundationData.vertices) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();

    // Set attributes from foundation data
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(foundationData.vertices, 3)
    );

    if (foundationData.normals) {
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(foundationData.normals, 3)
      );
    }

    if (foundationData.uvs) {
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(foundationData.uvs, 2)
      );
    }

    if (foundationData.indices) {
      geometry.setIndex(new THREE.BufferAttribute(
        new Uint16Array(foundationData.indices), 1
      ));
    }

    // If no normals provided, compute them
    if (!foundationData.normals) {
      geometry.computeVertexNormals();
    }

    // Create material based on foundation material type
    const matData = foundationData.material || {};
    const material = new THREE.MeshStandardMaterial({
      color: matData.color || 0x808080,
      roughness: matData.roughness || 0.9,
      metalness: matData.metalness || 0.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }
}

export default POIMeshGenerator;
