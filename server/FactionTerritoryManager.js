/**
 * FactionTerritoryManager.js - Dynamic territory ownership and settlement management
 *
 * Manages the "War Graph" - dynamic ownership of territory cells.
 * Handles territory capture, influence spreading, and settlement state.
 */

import {
    Faction,
    FactionColors,
    FactionThemes,
    SettlementTier,
    SettlementConfig
} from './Factions.js';

/**
 * TerritoryState - Tracks the current state of a territory cell
 */
export class TerritoryState {
    constructor(cellId, initialFaction) {
        this.cellId = cellId;
        this.ownerFaction = initialFaction;      // Current controlling faction
        this.originalFaction = initialFaction;   // Original faction (for recapture bonuses)

        // Influence system - faction influence accumulates over time
        this.influence = new Map();
        for (const faction of Object.values(Faction)) {
            this.influence.set(faction, faction === initialFaction ? 100 : 0);
        }

        // Capture state
        this.isContested = false;               // True if multiple factions have significant influence
        this.captureProgress = 0;               // 0-100, progress toward capture
        this.capturingFaction = null;           // Faction currently attempting capture

        // Settlement state
        this.settlement = null;                  // Settlement object if exists
        this.defenseStrength = 0;               // Current defense level
        this.economicOutput = 0;                // Resource generation per tick

        // Events
        this.lastCaptureTime = 0;               // Timestamp of last capture
        this.captureCount = 0;                  // Times this territory has changed hands

        // War damage
        this.devastation = 0;                   // 0-100, reduces output when high
    }

    /**
     * Add influence from a faction
     * @param {string} faction - Faction adding influence
     * @param {number} amount - Amount of influence to add
     * @returns {boolean} True if ownership changed
     */
    addInfluence(faction, amount) {
        const current = this.influence.get(faction) || 0;
        this.influence.set(faction, Math.min(100, current + amount));

        // Decay other factions' influence
        for (const [f, inf] of this.influence) {
            if (f !== faction && inf > 0) {
                this.influence.set(f, Math.max(0, inf - amount * 0.5));
            }
        }

        return this.checkOwnershipChange();
    }

    /**
     * Check if ownership should change based on influence
     */
    checkOwnershipChange() {
        let maxInfluence = 0;
        let maxFaction = this.ownerFaction;

        for (const [faction, inf] of this.influence) {
            if (inf > maxInfluence) {
                maxInfluence = inf;
                maxFaction = faction;
            }
        }

        // Check if contested (second-highest > 30)
        const sorted = [...this.influence.entries()].sort((a, b) => b[1] - a[1]);
        this.isContested = sorted.length > 1 && sorted[1][1] > 30;

        // Ownership changes if another faction reaches 75+ and current owner drops below 50
        const currentOwnerInfluence = this.influence.get(this.ownerFaction) || 0;

        if (maxFaction !== this.ownerFaction &&
            maxInfluence >= 75 &&
            currentOwnerInfluence < 50) {

            const previousOwner = this.ownerFaction;
            this.ownerFaction = maxFaction;
            this.lastCaptureTime = Date.now();
            this.captureCount++;
            this.devastation = Math.min(100, this.devastation + 20);

            return true; // Ownership changed
        }

        return false;
    }

    /**
     * Natural influence decay toward equilibrium
     */
    decayInfluence(dt) {
        const decayRate = 0.1 * dt; // Per second

        for (const [faction, inf] of this.influence) {
            if (faction === this.ownerFaction) {
                // Owner's influence slowly restores
                if (inf < 100) {
                    this.influence.set(faction, Math.min(100, inf + decayRate * 2));
                }
            } else {
                // Non-owner influence slowly decays
                if (inf > 0) {
                    this.influence.set(faction, Math.max(0, inf - decayRate));
                }
            }
        }

        // Devastation slowly recovers
        if (this.devastation > 0) {
            this.devastation = Math.max(0, this.devastation - decayRate * 0.5);
        }
    }

    /**
     * Get effective economic output considering devastation
     */
    getEffectiveOutput() {
        const devastationMultiplier = 1 - (this.devastation / 100);
        return this.economicOutput * devastationMultiplier;
    }

    /**
     * Serialize for network/storage
     */
    serialize() {
        return {
            cellId: this.cellId,
            owner: this.ownerFaction,
            influence: Object.fromEntries(this.influence),
            isContested: this.isContested,
            devastation: this.devastation,
            captureCount: this.captureCount
        };
    }
}

/**
 * Settlement - Represents a settlement node within a territory
 */
export class Settlement {
    constructor(id, cellId, tier, faction, position) {
        this.id = id;
        this.cellId = cellId;
        this.tier = tier;
        this.faction = faction;
        this.position = position;               // { x, y, z } world position

        // Properties based on tier
        const config = SettlementConfig[tier];
        this.buildingDensity = config.buildingDensity;
        this.populationMultiplier = config.populationMultiplier;
        this.baseDefenseStrength = config.defenseStrength;
        this.baseEconomicOutput = config.economicOutput;
        this.style = config.style;
        this.roadPriority = config.roadPriority;

        // Dynamic state
        this.population = Math.floor(1000 * this.populationMultiplier);
        this.buildings = [];                    // Building instances
        this.garrison = [];                     // Defensive units
        this.connectedRoads = [];               // Road IDs connecting here
        this.tradeRoutes = [];                  // Active trade routes

        // Development
        this.developmentLevel = 1;              // 1-10, affects output
        this.specializations = [];              // Industry types
    }

    /**
     * Get the settlement's current defense strength
     */
    getDefenseStrength() {
        const garrisonBonus = this.garrison.length * 5;
        const devBonus = this.developmentLevel * 2;
        return this.baseDefenseStrength + garrisonBonus + devBonus;
    }

    /**
     * Get economic output per tick
     */
    getEconomicOutput() {
        const devMultiplier = 1 + (this.developmentLevel - 1) * 0.1;
        const popMultiplier = this.population / (1000 * this.populationMultiplier);
        return Math.floor(this.baseEconomicOutput * devMultiplier * popMultiplier);
    }

    /**
     * Get the faction-specific style for this settlement
     */
    getStyle() {
        const theme = FactionThemes[this.faction];
        if (!theme) return this.style;

        switch (this.tier) {
            case SettlementTier.CAPITAL:
                return theme.capitalStyle;
            case SettlementTier.TOWN:
                return theme.townStyle;
            case SettlementTier.VILLAGE:
            case SettlementTier.OUTPOST:
                return theme.villageStyle;
            default:
                return this.style;
        }
    }

    /**
     * Serialize for network
     */
    serialize() {
        return {
            id: this.id,
            cellId: this.cellId,
            tier: this.tier,
            faction: this.faction,
            position: this.position,
            style: this.getStyle(),
            population: this.population,
            defense: this.getDefenseStrength(),
            output: this.getEconomicOutput(),
            roadPriority: this.roadPriority
        };
    }
}

/**
 * FactionTerritoryManager - Central manager for all territory and settlements
 */
export class FactionTerritoryManager {
    constructor(politicalMapGenerator, worldGenerator) {
        this.politicalMap = politicalMapGenerator;
        this.worldGenerator = worldGenerator;

        // Territory states
        this.territories = new Map();          // cellId -> TerritoryState
        this.settlements = new Map();          // settlementId -> Settlement

        // Faction aggregates
        this.factionStats = new Map();         // faction -> { totalCells, totalPop, etc }

        // Event listeners
        this.eventListeners = new Map();

        // Initialize if political map is ready
        if (this.politicalMap && this.politicalMap.isGenerated) {
            this.initialize();
        }
    }

    /**
     * Initialize territories and settlements from political map
     */
    initialize() {
        console.log('[TerritoryManager] Initializing territories...');

        // Create TerritoryState for each cell
        for (const cell of this.politicalMap.cells.values()) {
            const state = new TerritoryState(cell.id, cell.faction);
            this.territories.set(cell.id, state);

            // Create settlement if cell has a tier
            if (cell.settlementTier && cell.centroid) {
                this.createSettlement(cell);
            }
        }

        // Calculate initial faction stats
        this.updateFactionStats();

        console.log(`[TerritoryManager] Created ${this.territories.size} territories and ${this.settlements.size} settlements`);
    }

    /**
     * Create a settlement for a cell
     */
    createSettlement(cell) {
        // Get terrain height at centroid
        let height = 10;
        if (this.worldGenerator) {
            height = this.worldGenerator.getGroundHeight(cell.centroid.x, cell.centroid.z);
        }

        const settlement = new Settlement(
            `settlement_${cell.id}`,
            cell.id,
            cell.settlementTier,
            cell.faction,
            { x: cell.centroid.x, y: height, z: cell.centroid.z }
        );

        this.settlements.set(settlement.id, settlement);

        // Link to territory state
        const state = this.territories.get(cell.id);
        if (state) {
            state.settlement = settlement;
            state.defenseStrength = settlement.getDefenseStrength();
            state.economicOutput = settlement.getEconomicOutput();
        }

        return settlement;
    }

    /**
     * Update faction statistics
     */
    updateFactionStats() {
        this.factionStats.clear();

        // Initialize stats for all factions
        for (const faction of Object.values(Faction)) {
            this.factionStats.set(faction, {
                totalCells: 0,
                totalPopulation: 0,
                totalEconomy: 0,
                totalDefense: 0,
                capitals: 0,
                towns: 0,
                villages: 0,
                contestedCells: 0
            });
        }

        // Aggregate from territories
        for (const state of this.territories.values()) {
            const stats = this.factionStats.get(state.ownerFaction);
            if (!stats) continue;

            stats.totalCells++;
            stats.totalEconomy += state.getEffectiveOutput();
            stats.totalDefense += state.defenseStrength;

            if (state.isContested) {
                stats.contestedCells++;
            }

            if (state.settlement) {
                stats.totalPopulation += state.settlement.population;

                switch (state.settlement.tier) {
                    case SettlementTier.CAPITAL:
                        stats.capitals++;
                        break;
                    case SettlementTier.TOWN:
                        stats.towns++;
                        break;
                    case SettlementTier.VILLAGE:
                    case SettlementTier.OUTPOST:
                        stats.villages++;
                        break;
                }
            }
        }
    }

    /**
     * Process territory capture attempt
     * @param {string} cellId - Target cell
     * @param {string} attackingFaction - Faction attempting capture
     * @param {number} strength - Military strength applied
     * @returns {object} Result of capture attempt
     */
    attemptCapture(cellId, attackingFaction, strength) {
        const state = this.territories.get(cellId);
        if (!state) return { success: false, reason: 'Invalid cell' };

        if (state.ownerFaction === attackingFaction) {
            return { success: false, reason: 'Already owned' };
        }

        // Calculate effective attack strength vs defense
        const defense = state.defenseStrength;
        const effectiveStrength = Math.max(0, strength - defense * 0.5);

        // Add influence based on effective strength
        const influenceGain = effectiveStrength * 0.1;
        const ownershipChanged = state.addInfluence(attackingFaction, influenceGain);

        // Increase devastation from combat
        state.devastation = Math.min(100, state.devastation + strength * 0.05);

        if (ownershipChanged) {
            // Update settlement ownership
            if (state.settlement) {
                const oldFaction = state.settlement.faction;
                state.settlement.faction = attackingFaction;

                this.emitEvent('territoryCapture', {
                    cellId,
                    oldOwner: oldFaction,
                    newOwner: attackingFaction,
                    settlement: state.settlement.serialize()
                });
            }

            this.updateFactionStats();
            return { success: true, captured: true };
        }

        return {
            success: true,
            captured: false,
            influence: state.influence.get(attackingFaction)
        };
    }

    /**
     * Spread influence from adjacent cells
     * Called periodically to simulate natural faction pressure
     */
    spreadInfluence(dt) {
        const spreadRate = 0.5 * dt; // Per second

        for (const state of this.territories.values()) {
            const cell = this.politicalMap.cells.get(state.cellId);
            if (!cell) continue;

            // Gather neighbor influence
            const neighborInfluence = new Map();

            for (const neighborId of cell.neighbors) {
                const neighborState = this.territories.get(neighborId);
                if (!neighborState) continue;

                const faction = neighborState.ownerFaction;
                const current = neighborInfluence.get(faction) || 0;
                neighborInfluence.set(faction, current + 1);
            }

            // Apply spread from neighbors
            for (const [faction, count] of neighborInfluence) {
                if (faction !== state.ownerFaction) {
                    const spreadAmount = spreadRate * count * 0.5;
                    state.addInfluence(faction, spreadAmount);
                }
            }

            // Natural decay
            state.decayInfluence(dt);
        }
    }

    /**
     * Tick economic production
     */
    tickEconomy(dt) {
        const production = new Map();

        for (const faction of Object.values(Faction)) {
            production.set(faction, 0);
        }

        for (const state of this.territories.values()) {
            if (!state.settlement) continue;

            const output = state.getEffectiveOutput() * dt;
            const current = production.get(state.ownerFaction) || 0;
            production.set(state.ownerFaction, current + output);
        }

        return production;
    }

    /**
     * Get territory state at world position
     */
    getTerritoryAtPosition(x, z) {
        const cell = this.politicalMap.getCellAtPosition(x, z);
        if (!cell) return null;

        return this.territories.get(cell.id);
    }

    /**
     * Get nearest settlement to position
     */
    getNearestSettlement(x, z, maxDistance = Infinity) {
        let nearest = null;
        let nearestDist = maxDistance;

        for (const settlement of this.settlements.values()) {
            const dx = settlement.position.x - x;
            const dz = settlement.position.z - z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = settlement;
            }
        }

        return nearest;
    }

    /**
     * Get all settlements belonging to a faction
     */
    getSettlementsByFaction(faction) {
        const result = [];
        for (const settlement of this.settlements.values()) {
            if (settlement.faction === faction) {
                result.push(settlement);
            }
        }
        return result;
    }

    /**
     * Get settlements by tier
     */
    getSettlementsByTier(tier) {
        const result = [];
        for (const settlement of this.settlements.values()) {
            if (settlement.tier === tier) {
                result.push(settlement);
            }
        }
        return result;
    }

    /**
     * Get faction capital settlement
     */
    getFactionCapital(faction) {
        const capitalId = this.politicalMap.factionCapitals.get(faction);
        if (!capitalId) return null;

        const state = this.territories.get(capitalId);
        return state ? state.settlement : null;
    }

    /**
     * Register event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Emit event to listeners
     */
    emitEvent(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                callback(data);
            }
        }
    }

    /**
     * Serialize all territory data for client
     */
    serializeTerritories() {
        const data = [];
        for (const state of this.territories.values()) {
            data.push(state.serialize());
        }
        return data;
    }

    /**
     * Serialize all settlements for client
     */
    serializeSettlements() {
        const data = [];
        for (const settlement of this.settlements.values()) {
            data.push(settlement.serialize());
        }
        return data;
    }

    /**
     * Serialize faction statistics
     */
    serializeFactionStats() {
        return Object.fromEntries(this.factionStats);
    }

    /**
     * Get contested border zones for highlighting
     */
    getContestedZones() {
        const zones = [];
        for (const state of this.territories.values()) {
            if (state.isContested) {
                const cell = this.politicalMap.cells.get(state.cellId);
                if (cell) {
                    zones.push({
                        cellId: state.cellId,
                        centroid: cell.centroid,
                        currentOwner: state.ownerFaction,
                        influence: Object.fromEntries(state.influence)
                    });
                }
            }
        }
        return zones;
    }
}

export default FactionTerritoryManager;
