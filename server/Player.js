import RAPIER from '@dimforge/rapier3d-compat';
import NetworkManager from '../shared/NetworkManager.js';

export default class Player {
    constructor(socket, world, position = { x: 0, y: 10, z: 0 }, physicsSystems, physicsHandleMap) {
        this.socket = socket;
        this.id = socket.id;
        this.world = world;
        this.physicsSystems = physicsSystems;
        this.physicsHandleMap = physicsHandleMap;
        
        // Persistence Data
        this.data = {
            position: position,
            faction: 'NEUTRAL',
            health: 100,
            inventory: Array(20).fill(null) // 20 Slots
        };

        // Physics Initialization
        this.initPhysics(position);
    }

    initPhysics(pos) {
        // Kinematic Body for precise character control
        const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(pos.x, pos.y, pos.z);
        this.rigidBody = this.world.createRigidBody(bodyDesc);

        // Capsule Collider
        // Total Height: 2.0m (0.5 segment half-height * 2 + 0.5 radius * 2)
        // Offset y=1.0 puts the bottom of the capsule at the body origin (0,0,0)
        const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.5)
            .setTranslation(0, 1.0, 0); 
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        // Rapier Character Controller
        // offset, autostep height, autostep min width, snap to ground, character mass
        this.characterController = this.world.createCharacterController(0.01);
        this.characterController.enableAutostep(0.5, 0.2, true); // Increased step height
        this.characterController.enableSnapToGround(0.5);
        
        this.verticalVelocity = 0;
    }

    update(dt, input) {
        // Input: { x, y, viewDir: {x, y, z}, jump: bool, interact: bool }
        if (!input) return;

        // Physics Constants
        const speed = 10;
        const gravity = -40.0; 
        const jumpStrength = 25.0;
        
        // Ground Check
        const isGrounded = this.characterController.computedGrounded();
        
        if (input.jump && isGrounded) {
            this.verticalVelocity = jumpStrength;
        } else if (isGrounded && this.verticalVelocity <= 0) {
            this.verticalVelocity = -2.0; // Keep grounded
        } else {
            // Apply Gravity
            this.verticalVelocity += gravity * dt;
        }
        
        let movement = { 
            x: (input.x || 0) * speed * dt, 
            y: this.verticalVelocity * dt, 
            z: (input.y || 0) * speed * dt 
        };
        
        this.characterController.computeColliderMovement(
            this.collider,
            movement
        );

        // Apply movement to body
        const correctedMovement = this.characterController.computedMovement();
        const currentPos = this.rigidBody.translation();
        const newPos = {
            x: currentPos.x + correctedMovement.x,
            y: currentPos.y + correctedMovement.y,
            z: currentPos.z + correctedMovement.z
        };

        this.rigidBody.setNextKinematicTranslation(newPos);
        
        // Update persistent data
        this.data.position = newPos;

        // Interaction
        if (input.interact) {
            // Pass the player's collider handle so the raycast ignores the player capsule
            this.handleInteraction(input.viewDir, this.collider.handle);
        }
    }

    /**
     * Creates a JSON-friendly clone of the provided payload, stripping out any
     * circular references or unsupported values before emitting over socket.io.
     * If serialization fails, the payload is dropped and a warning is logged
     * to avoid parser recursion errors.
     */
    sanitizePayloadForSocket(payload, contextLabel) {
        const seen = new WeakSet();
        const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }

            if (typeof value === 'bigint') return value.toString();
            if (typeof value === 'function' || typeof value === 'symbol') return undefined;

            return value;
        };

        try {
            return JSON.parse(JSON.stringify(payload, replacer));
        } catch (err) {
            console.warn(`[Interact] Failed to sanitize payload for ${contextLabel}`, err);
            return null;
        }
    }

    handleInteraction(viewDir = { x: 0, y: 0, z: -1 }, excludeColliderHandle = null) {
        const origin = this.rigidBody.translation();
        // Start at the player's head position and follow the camera's angle.
        const eyePos = {
            x: origin.x,
            y: origin.y + 1.6,
            z: origin.z
        };

        const length = Math.hypot(viewDir.x || 0, viewDir.y || 0, viewDir.z || 0) || 1;
        const dir = {
            x: (viewDir.x || 0) / length,
            y: (viewDir.y || 0) / length,
            z: (viewDir.z || 0) / length
        };

        const maxReachMeters = 2.0; // Approximate arm's reach

        const hit = this.physicsSystems.raycastInteract(eyePos, dir, maxReachMeters, excludeColliderHandle);

        // Collect debug information for client + server visibility
        const debugPayload = {
            origin: { ...eyePos },
            direction: { ...dir },
            maxReach: maxReachMeters,
            hit: null
        };

        if (hit) {
            const entity = this.physicsHandleMap ? this.physicsHandleMap.get(hit.bodyHandle) : null;

            const distance = typeof hit.distance === 'number' ? hit.distance : null;

            debugPayload.hit = {
                bodyHandle: hit.bodyHandle,
                colliderHandle: hit.colliderHandle,
                distance: distance,
                point: hit.point ? { ...hit.point } : null,
                mappedEntity: entity ? entity.type : null,
                mappedId: entity && entity.instance ? entity.instance.id : null
            };

            const distanceLabel = distance !== null ? `${distance.toFixed(3)}m` : 'unknown distance';
            console.log(`[Interact] ${this.id} hit body ${hit.bodyHandle} at ${distanceLabel}`, debugPayload.hit);

            if (entity && entity.type === 'VEHICLE') {
                const v = entity.instance;
                const seats = v.seats.map((s, i) => ({
                    id: i,
                    name: i === 0 ? 'Driver' : `Passenger ${i}`,
                    occupied: s !== null
                }));

                const interactMenuPayload = {
                    type: 'VEHICLE',
                    vehicleType: v.type,
                    health: v.health,
                    maxHealth: v.maxHealth,
                    seats: seats,
                    targetId: v.id
                };

                const sanitizedMenu = this.sanitizePayloadForSocket(interactMenuPayload, 'INTERACT_MENU');
                if (sanitizedMenu) {
                    this.socket.emit(NetworkManager.Packet.INTERACT_MENU, sanitizedMenu);
                }
            } else {
                console.log(`[Interact] ${this.id} hit unmapped entity type`, debugPayload.hit);
            }
        } else {
            console.log(`[Interact] ${this.id} raycast missed`, debugPayload);
        }

        // Always let the client know what the server raycast observed for debugging
        const sanitizedDebug = this.sanitizePayloadForSocket(debugPayload, 'INTERACT_DEBUG');
        if (sanitizedDebug) {
            this.socket.emit(NetworkManager.Packet.INTERACT_DEBUG, sanitizedDebug);
        }
    }

    // --- Inventory System ---

    addItem(itemId, count = 1, metadata = {}) {
        // Stackable check could go here
        // Find first empty slot
        const emptyIndex = this.data.inventory.findIndex(slot => slot === null);
        
        if (emptyIndex !== -1) {
            this.data.inventory[emptyIndex] = { itemId, count, metadata };
            return true;
        }
        return false; // Inventory full
    }

    removeItem(slotIndex, count = 1) {
        if (this.data.inventory[slotIndex]) {
            this.data.inventory[slotIndex].count -= count;
            if (this.data.inventory[slotIndex].count <= 0) {
                this.data.inventory[slotIndex] = null;
            }
            return true;
        }
        return false;
    }

    useItem(slotIndex) {
        const item = this.data.inventory[slotIndex];
        if (item) {
            console.log(`Used item: ${item.itemId}`);
            // Item effect logic here
            // e.g., if (item.itemId === 'potion') this.data.health += 20;
            return true;
        }
        return false;
    }

    toJSON() {
        return this.data;
    }
}
