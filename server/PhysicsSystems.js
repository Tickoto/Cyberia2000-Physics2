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
        // Helper to translate Rapier's hit payload into the format expected by callers.
        const buildHitResult = (hit, rayUsed) => {
            const colliderHandle = hit.collider ?? hit.colliderHandle;
            if (colliderHandle === undefined || colliderHandle === null) return null;

            const collider = this.world.getCollider(colliderHandle);
            if (!collider) return null;

            const body = collider.parent();

            // Rapier returns the time-of-impact under the property name `toi`.
            // Preserve a consistent `distance` field for callers, but guard
            // against unexpected undefined values to avoid downstream errors.
            const toi = typeof hit.toi === 'number'
                ? hit.toi
                : (typeof hit.timeOfImpact === 'number' ? hit.timeOfImpact : null);

            if (toi === null) return null;

            return {
                colliderHandle,
                bodyHandle: body ? body.handle : null,
                distance: toi,
                point: rayUsed.pointAt(toi)
            };
        };

        const castRay = (ray, distance) => this.world.castRay(
            ray,
            distance,
            true,
            undefined,
            undefined,
            undefined,
            excludeColliderHandle || undefined
        );

        const ray = new RAPIER.Ray(origin, direction);
        let hit = castRay(ray, maxDistance);

        // If we struck the excluded collider (typically the player capsule),
        // offset the origin slightly forward and try again so interaction
        // works even when the camera starts inside the collider volume.
        const firstCollider = hit ? (hit.collider ?? hit.colliderHandle) : null;
        if (hit && excludeColliderHandle !== null && firstCollider === excludeColliderHandle) {
            const padding = 0.6;
            const trimmedOrigin = {
                x: origin.x + direction.x * padding,
                y: origin.y + direction.y * padding,
                z: origin.z + direction.z * padding
            };

            const trimmedRay = new RAPIER.Ray(trimmedOrigin, direction);
            hit = castRay(trimmedRay, Math.max(0, maxDistance - padding));
            return hit ? buildHitResult(hit, trimmedRay) : null;
        }

        return hit ? buildHitResult(hit, ray) : null;
    }
}

export default PhysicsSystems;
