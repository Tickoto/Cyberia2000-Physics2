import AIUnit from './AIUnit.js';

class WarDirector {
    constructor(world, worldData, physicsSystems, generator) {
        this.world = world;
        this.worldData = worldData; // Access to POIs for bases/resources
        this.physicsSystems = physicsSystems;
        this.generator = generator;
        
        this.factions = {
            RED: { resources: 100, units: [], base: null },
            BLUE: { resources: 100, units: [], base: null },
            GREEN: { resources: 100, units: [], base: null },
            PURPLE: { resources: 100, units: [], base: null }
        };
        
        this.allUnits = new Map(); // Global registry id -> AIUnit
        
        this.initFactions();
    }

    initFactions() {
        // Assign Bases from World POIs
        const pois = (this.worldData && this.worldData.pois) ? this.worldData.pois : [];
        const keys = Object.keys(this.factions);
        
        // Try to find MILITARY_BASE POIs first, otherwise any POI
        const bases = pois.filter(p => p.type === 'MILITARY_BASE');
        const backups = pois.filter(p => p.type !== 'MILITARY_BASE');
        const availableBases = [...bases, ...backups];

        keys.forEach((key, index) => {
            if (index < availableBases.length) {
                this.factions[key].base = availableBases[index];
                console.log(`Faction ${key} established base at ${availableBases[index].id}`);
                
                // Spawn initial defense
                this.spawnUnit(key, 'SOLDIER', availableBases[index]);
                this.spawnUnit(key, 'SOLDIER', availableBases[index]);
                this.spawnUnit(key, 'TRUCK', availableBases[index]);
            } else {
                // Fallback base for infinite world if no POI found
                // Place them around origin if no POIs
                const angle = (index / keys.length) * Math.PI * 2;
                const radius = 50;
                
                // Calculate position
                const bx = Math.cos(angle) * radius;
                const bz = Math.sin(angle) * radius;
                
                // Get terrain height if generator available
                let by = 5;
                if (this.generator) {
                    by = this.generator.getGroundHeight(bx, bz);
                }

                const fb = {
                    id: `base_${key}`,
                    x: bx,
                    y: bz, // 2D map Y is World Z
                    z: by, // Height
                    type: 'MILITARY_BASE'
                };
                this.factions[key].base = fb;
                console.log(`Faction ${key} established fallback base at ${fb.x}, ${fb.y}`);
                
                this.spawnUnit(key, 'SOLDIER', fb);
                this.spawnUnit(key, 'SOLDIER', fb);
            }
        });
    }

    spawnUnit(teamId, type, location) {
        const id = `${teamId}_${type}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        
        // Random offset 2D
        const rx = (Math.random()*10 - 5);
        const rz = (Math.random()*10 - 5);
        
        const finalX = location.x + rx;
        const finalZ = location.y + rz; // location.y is Z in POI struct usually? Wait.
        // In initFactions fallback: x=bx, y=bz. So y is Z.
        // In POI (WorldGenerator): x, y, z=height. So y is Z.
        // Consistency: location.x = X, location.y = Z.
        
        // Get precise ground height
        let finalY = location.z + 5; // Default fallback
        if (this.generator) {
            finalY = this.generator.getGroundHeight(finalX, finalZ) + 2.0;
        }

        const spawnPos = {
            x: finalX,
            y: finalY,
            z: finalZ
        };

        const unit = new AIUnit(id, type, teamId, this.world, spawnPos, this.physicsSystems);
        this.allUnits.set(id, unit);
        this.factions[teamId].units.push(unit);
        return unit;
    }

    // Called every ~1-5 seconds
    tickSlow(dt) {
        const pois = (this.worldData && this.worldData.pois) ? this.worldData.pois : [];
        const resourceNodes = pois.filter(p => p.type === 'RESOURCE_NODE');

        Object.keys(this.factions).forEach(teamId => {
            const faction = this.factions[teamId];
            if (!faction.base) return;

            // 1. Economic Logic (Trucks)
            const trucks = faction.units.filter(u => u.type === 'TRUCK');
            trucks.forEach(truck => {
                if (truck.state === 'IDLE') {
                    // Find nearest resource node
                    // Simplified: just pick random for now
                    if (resourceNodes.length > 0) {
                        const target = resourceNodes[Math.floor(Math.random() * resourceNodes.length)];
                        // Convert POI coords to Physics Coords
                        const dest = { x: target.x, y: target.z, z: target.y };
                        
                        truck.target = dest; // Custom property for truck logic
                        truck.state = 'HARVEST'; // Tag state
                        truck.moveTo(dest);
                    }
                } else if (truck.state === 'HARVEST') {
                    // Check if reached destination (simple dist check handled in update, but we need to check logic here)
                    const pos = truck.rigidBody.translation();
                    const dist = truck.distance(pos, truck.target);
                    if (dist < 10) {
                        // "Harvesting" (Instant for now)
                        truck.state = 'RETURN';
                        const basePos = { x: faction.base.x, y: faction.base.z, z: faction.base.y };
                        truck.moveTo(basePos);
                    }
                } else if (truck.state === 'RETURN') {
                    const pos = truck.rigidBody.translation();
                    const basePos = { x: faction.base.x, y: faction.base.z, z: faction.base.y };
                    const dist = truck.distance(pos, basePos);
                    if (dist < 10) {
                        // Delivered
                        faction.resources += 50;
                        console.log(`${teamId} delivered resources. Total: ${faction.resources}`);
                        truck.state = 'IDLE';
                    }
                }
            });

            // 2. Production Logic
            if (faction.resources >= 200) {
                // Buy Tank
                this.spawnUnit(teamId, 'TANK', faction.base);
                faction.resources -= 200;
                console.log(`${teamId} bought a TANK`);
            } else if (faction.resources >= 50) {
                // Buy Soldier if low
                const soldiers = faction.units.filter(u => u.type === 'SOLDIER');
                if (soldiers.length < 5) {
                    this.spawnUnit(teamId, 'SOLDIER', faction.base);
                    faction.resources -= 50;
                }
            }
        });
    }

    // Called every frame/physics tick
    updateUnits(dt) {
        const allUnitsArray = Array.from(this.allUnits.values());
        
        // Prepare simplified enemy list for perception
        const unitData = allUnitsArray.map(u => ({
            id: u.id,
            teamId: u.teamId,
            position: u.rigidBody.translation()
        }));

        this.allUnits.forEach(unit => {
            unit.update(dt, this.worldData, unitData);
        });
    }
}

export default WarDirector;
