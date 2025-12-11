import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsSystems {
    constructor(world) {
        this.world = world;
    }

    /**
     * Applies buoyancy and drag to a rigid body if it is below water level.
     * @param {RAPIER.RigidBody} rigidBody 
     * @param {number} waterLevel 
     */
    applyBuoyancy(rigidBody, waterLevel = 0) {
        const position = rigidBody.translation();
        
        if (position.y < waterLevel) {
            // Depth factor (deeper = more force)
            const depth = waterLevel - position.y;
            const buoyancyForce = 20.0 * depth; // Tunable buoyancy constant
            
            // Apply Upward Force
            rigidBody.applyImpulse({ x: 0, y: buoyancyForce * 0.016, z: 0 }, true);
            
            // Apply Drag (linear damping approximation)
            const vel = rigidBody.linvel();
            const dragFactor = 0.05;
            rigidBody.applyImpulse({
                x: -vel.x * dragFactor,
                y: -vel.y * dragFactor,
                z: -vel.z * dragFactor
            }, true);
        }
    }

    /**
     * Spawns a simple ragdoll at the given position.
     * @param {Object} position {x, y, z}
     */
    spawnRagdoll(position) {
        // Simplified Ragdoll: Head, Torso, Limbs connected by joints
        const group = RAPIER.InteractionGroups.new(0x0002, 0xFFFF); // Collision Group
        
        // Torso
        const torsoBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z);
        const torso = this.world.createRigidBody(torsoBodyDesc);
        const torsoCollDesc = RAPIER.ColliderDesc.cuboid(0.3, 0.4, 0.2);
        this.world.createCollider(torsoCollDesc, torso);

        // Head
        const headBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 0.6, position.z);
        const head = this.world.createRigidBody(headBodyDesc);
        const headCollDesc = RAPIER.ColliderDesc.ball(0.2);
        this.world.createCollider(headCollDesc, head);

        // Neck Joint
        const neckParams = RAPIER.JointData.spherical(
            { x: 0, y: 0.4, z: 0 }, // Anchor 1 (Torso local)
            { x: 0, y: -0.2, z: 0 } // Anchor 2 (Head local)
        );
        this.world.createImpulseJoint(neckParams, torso, head, true);

        // Returns array of bodies to manage lifecycle
        return [torso, head];
    }

    /**
     * Raycasts from a position in a direction to find interactable objects.
     * @param {Object} origin {x, y, z}
     * @param {Object} direction {x, y, z} (Normalized)
     * @param {number} maxDistance 
     * @returns {Object|null} Hit result or null
     */
    raycastInteract(origin, direction, maxDistance = 5.0, excludeColliderHandle = null) {
        const ray = new RAPIER.Ray(origin, direction);
        // Exclude the provided collider (usually the player's own) so the ray can hit
        // nearby objects instead of immediately intersecting the player capsule.
        const hit = this.world.castRay(
            ray,
            maxDistance,
            true,
            undefined,
            undefined,
            undefined,
            excludeColliderHandle || undefined
        );

        if (hit) {
            // Retrieve collider and parent body
            const collider = this.world.getCollider(hit.colliderHandle);
            const body = collider.parent();
            
            // Check for userData tag (simulated via looking up in a global map or property if wrapper exists)
            // Since Rapier JS raw objects don't store arbitrary JS objects easily on 'userData' without a wrapper,
            // we assume the Entity class managing this body handles the lookup via body.handle.
            
            return {
                colliderHandle: hit.colliderHandle,
                bodyHandle: body ? body.handle : null,
                distance: hit.timeOfImpact,
                point: ray.pointAt(hit.timeOfImpact)
            };
        }
        return null;
    }
}

export default PhysicsSystems;
