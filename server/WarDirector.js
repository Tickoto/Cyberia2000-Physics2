import AIUnit from './AIUnit.js';
import { Faction } from './Factions.js';

class WarDirector {
    constructor(world, worldData, physicsSystems, generator) {
        this.world = world;
        this.worldData = worldData; // Access to POIs for bases/resources
        this.physicsSystems = physicsSystems;
        this.generator = generator;

        // Use new faction enums from Geopolitical Macro-Layer
        this.factions = {
            [Faction.CHROMA_CORP]: { resources: 100, units: [], base: null },
            [Faction.IRON_SYNOD]: { resources: 100, units: [], base: null },
            [Faction.VERDANT_LINK]: { resources: 100, units: [], base: null },
            [Faction.NULL_DRIFTERS]: { resources: 100, units: [], base: null }
        };

        this.allUnits = new Map(); // Global registry id -> AIUnit

        this.initFactions();
    }

    initFactions() {
        // Assign Bases from World POIs - prioritize faction-specific settlements
        const pois = (this.worldData && this.worldData.pois) ? this.worldData.pois : [];
        const keys = Object.keys(this.factions);

        // For each faction, find their capital or best settlement
        keys.forEach((factionKey, index) => {
            // First try to find this faction's capital (MILITARY_BASE type)
            let factionBase = pois.find(p =>
                p.faction === factionKey && p.type === 'MILITARY_BASE'
            );

            // If no capital, find any settlement belonging to this faction
            if (!factionBase) {
                factionBase = pois.find(p => p.faction === factionKey);
            }

            // If still no base, use fallback position based on quadrant
            if (!factionBase) {
                const quadrants = {
                    [Faction.CHROMA_CORP]: { x: 1, z: 1 },     // NE
                    [Faction.IRON_SYNOD]: { x: -1, z: 1 },    // NW
                    [Faction.VERDANT_LINK]: { x: 1, z: -1 },  // SE
                    [Faction.NULL_DRIFTERS]: { x: -1, z: -1 } // SW
                };

                const quad = quadrants[factionKey] || { x: 0, z: 0 };
                const radius = 50;

                const bx = quad.x * radius;
                const bz = quad.z * radius;

                let by = 5;
                if (this.generator) {
                    by = this.generator.getGroundHeight(bx, bz);
                }

                factionBase = {
                    id: `base_${factionKey}`,
                    x: bx,
                    y: bz,
                    z: by,
                    type: 'MILITARY_BASE',
                    faction: factionKey
                };
                console.log(`[WarDirector] ${factionKey} established fallback base at ${bx.toFixed(0)}, ${bz.toFixed(0)}`);
            } else {
                console.log(`[WarDirector] ${factionKey} established base at settlement ${factionBase.id}`);
            }

            this.factions[factionKey].base = factionBase;

            // Spawn initial defense
            this.spawnUnit(factionKey, 'SOLDIER', factionBase);
            this.spawnUnit(factionKey, 'SOLDIER', factionBase);
            this.spawnUnit(factionKey, 'TRUCK', factionBase);
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
