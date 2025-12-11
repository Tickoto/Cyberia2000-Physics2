import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Advanced Vehicle Controller System
 * Supports three distinct vehicle types: JEEP, TANK, HELICOPTER
 * Each with unique physics profiles and handling characteristics.
 */

// ============================================================================
// VEHICLE CONFIGURATION
// ============================================================================

const VEHICLE_CONFIG = {
    JEEP: {
        // Chassis dimensions (half-extents)
        chassisWidth: 0.9,
        chassisHeight: 0.35,
        chassisLength: 1.8,
        chassisMass: 800,

        // Center of Mass offset (lower for stability)
        comOffset: { x: 0, y: -0.3, z: 0 },

        // Suspension parameters (Hooke's Law: F = -kx - bv)
        suspension: {
            restLength: 0.5,        // Natural length of spring
            springStiffness: 45000, // k - spring constant (N/m)
            damperStrength: 5500,   // b - damping coefficient (Ns/m)
            maxTravel: 0.35,        // Maximum compression distance
            wheelRadius: 0.35,
            mountHeight: -0.2      // Height of suspension mount below chassis center
        },

        // Wheel positions (relative to chassis center - Y is mount point)
        wheelPositions: [
            { x: -0.85, y: -0.2, z: 1.2 },   // Front Left
            { x: 0.85, y: -0.2, z: 1.2 },    // Front Right
            { x: -0.85, y: -0.2, z: -1.2 },  // Rear Left
            { x: 0.85, y: -0.2, z: -1.2 }    // Rear Right
        ],

        // Handling
        engineForce: 12000,
        maxSpeed: 28,
        steerAngle: 0.6,            // Max steering angle in radians
        steerSpeed: 4.0,            // How fast steering responds
        lateralGrip: 0.85,          // Grip multiplier (1.0 = perfect grip)

        // Damping
        linearDamping: 0.1,
        angularDamping: 0.8,

        seatCount: 4,
        seatOffsets: [
            { x: -0.5, y: 0.8, z: 0.5 },
            { x: 0.5, y: 0.8, z: 0.5 },
            { x: -0.5, y: 0.8, z: -0.5 },
            { x: 0.5, y: 0.8, z: -0.5 }
        ]
    },

    TANK: {
        // Chassis dimensions (half-extents, much larger and heavier)
        chassisWidth: 1.6,
        chassisHeight: 0.5,
        chassisLength: 3.2,
        chassisMass: 8000,  // 10x heavier than jeep

        // Center of Mass offset (very low for stability)
        comOffset: { x: 0, y: -0.4, z: 0 },

        // Suspension (stiffer for heavy weight)
        suspension: {
            restLength: 0.45,
            springStiffness: 180000,
            damperStrength: 22000,
            maxTravel: 0.25,
            wheelRadius: 0.4,
            mountHeight: -0.3      // Height of suspension mount below chassis center
        },

        // Track wheel positions (6 wheels per side simulated)
        wheelPositions: [
            { x: -1.4, y: -0.3, z: 2.0 },    // Front Left
            { x: 1.4, y: -0.3, z: 2.0 },     // Front Right
            { x: -1.4, y: -0.3, z: 0 },      // Mid Left
            { x: 1.4, y: -0.3, z: 0 },       // Mid Right
            { x: -1.4, y: -0.3, z: -2.0 },   // Rear Left
            { x: 1.4, y: -0.3, z: -2.0 }     // Rear Right
        ],

        // Handling (slow but powerful)
        engineForce: 80000,
        maxSpeed: 14,
        neutralTurnTorque: 120000,  // Torque for pivot turns
        lateralGrip: 0.95,          // Very high grip
        microSlipThreshold: 0.1,    // Allow slight slip during turns

        // Very high angular damping for "heavy" feel
        linearDamping: 0.2,
        angularDamping: 4.0,

        seatCount: 2,
        seatOffsets: [
            { x: 0, y: 1.2, z: 0.8 },
            { x: 0, y: 1.2, z: -0.8 }
        ]
    },

    HELICOPTER: {
        // Fuselage dimensions (half-extents)
        fuselageWidth: 1.0,
        fuselageHeight: 1.2,
        fuselageLength: 3.5,
        fuselageMass: 2000,

        // Landing skid configuration
        skids: {
            width: 1.4,           // Distance between skids
            length: 2.5,          // Length of each skid
            height: 0.08,         // Thickness of skid tube
            dropHeight: 1.2       // Distance below fuselage center
        },

        // Rotor system
        rotor: {
            maxRPM: 400,
            idleRPM: 0,           // Engine off = 0 RPM
            spoolUpRate: 50,      // RPM per second when holding throttle up
            spoolDownRate: 35,    // RPM per second when holding throttle down
            liftThreshold: 0.55,  // 55% RPM required for meaningful lift
            maxLiftForce: 35000,  // Force at max RPM
            rotorRadius: 5.0,
            controlMinRPM: 0.2    // 20% RPM for any control response
        },

        // Flight controls sensitivity
        controls: {
            pitchRate: 1.8,         // Radians per second at full input
            rollRate: 2.0,
            yawRate: 1.4,
            collectiveSensitivity: 0.5,
            groundedDamping: 0.1    // Reduced control response on ground
        },

        // Aerodynamic damping
        linearDamping: 0.3,
        angularDamping: 2.5,

        // Inertia scaling (makes it feel heavy in the air)
        inertiaMultiplier: 2.0,

        seatCount: 6,
        seatOffsets: [
            { x: -0.5, y: 0.8, z: 1.5 },   // Pilot
            { x: 0.5, y: 0.8, z: 1.5 },    // Co-pilot
            { x: -0.5, y: 0.8, z: 0 },
            { x: 0.5, y: 0.8, z: 0 },
            { x: -0.5, y: 0.8, z: -1.5 },
            { x: 0.5, y: 0.8, z: -1.5 }
        ]
    }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Rotates a vector by a quaternion
 */
function rotateVectorByQuat(v, q) {
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * v.x + qy * v.z - qz * v.y;
    const iy = qw * v.y + qz * v.x - qx * v.z;
    const iz = qw * v.z + qx * v.y - qy * v.x;
    const iw = -qx * v.x - qy * v.y - qz * v.z;

    return {
        x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
        y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
        z: iz * qw + iw * -qz + ix * -qy - iy * -qx
    };
}

/**
 * Dot product of two 3D vectors
 */
function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Vector subtraction
 */
function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Vector addition
 */
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Scale vector
 */
function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Vector magnitude
 */
function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Normalize vector
 */
function normalize(v) {
    const m = magnitude(v);
    return m > 0.0001 ? scale(v, 1 / m) : { x: 0, y: 0, z: 0 };
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
    return a + (b - a) * Math.min(1, Math.max(0, t));
}

// ============================================================================
// VEHICLE CLASS
// ============================================================================

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type;
        this.world = world;
        this.config = VEHICLE_CONFIG[type];

        if (!this.config) {
            throw new Error(`Unknown vehicle type: ${type}`);
        }

        this.bodies = [];
        this.colliders = [];

        this.health = 100;
        this.maxHealth = 100;

        // Seat management
        this.seats = Array(this.config.seatCount).fill(null);

        // Raycast suspension state (for ground vehicles)
        this.suspensionState = [];
        this.wheelRotations = [];
        this.currentSteerAngle = 0;

        // Helicopter state
        if (type === 'HELICOPTER') {
            this.currentRPM = 0;
            this.targetRPM = 0;  // Engine starts off
            this.collectiveInput = 0;
            this.isEngineRunning = false;
            this.isGrounded = true;
        }

        // Tank state
        if (type === 'TANK') {
            this.leftTrackSpeed = 0;
            this.rightTrackSpeed = 0;
        }

        this.createVehicle(position);
    }

    get chassisHandle() {
        return this.chassis ? this.chassis.handle : -1;
    }

    // ========================================================================
    // VEHICLE CREATION
    // ========================================================================

    createVehicle(position) {
        if (this.type === 'HELICOPTER') {
            this.createHelicopter(position);
        } else {
            this.createGroundVehicle(position);
        }
    }

    createGroundVehicle(position) {
        const cfg = this.config;

        // Create chassis rigid body
        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 2, position.z)
            .setLinearDamping(cfg.linearDamping)
            .setAngularDamping(cfg.angularDamping)
            .setAdditionalMass(cfg.chassisMass);

        this.chassis = this.world.createRigidBody(chassisDesc);

        // Set Center of Mass lower for stability
        // Note: Rapier doesn't have a direct setCenterOfMass, so we apply mass distribution
        // by using additionalMassProperties with a shifted center
        const inertia = cfg.chassisMass * (cfg.chassisWidth * cfg.chassisWidth + cfg.chassisLength * cfg.chassisLength) / 12;
        this.chassis.setAdditionalMassProperties(
            cfg.chassisMass,
            cfg.comOffset,
            { x: inertia, y: inertia * 0.5, z: inertia },
            { w: 1, x: 0, y: 0, z: 0 }
        );

        // Create chassis collider
        const chassisCollider = RAPIER.ColliderDesc.cuboid(
            cfg.chassisWidth,
            cfg.chassisHeight,
            cfg.chassisLength
        ).setFriction(0.3)
         .setRestitution(0.1);

        this.chassisCollider = this.world.createCollider(chassisCollider, this.chassis);
        this.bodies.push(this.chassis);
        this.colliders.push(this.chassisCollider);

        // Initialize suspension state for each wheel
        cfg.wheelPositions.forEach((wheelPos, index) => {
            this.suspensionState.push({
                position: wheelPos,
                compression: 0,
                previousCompression: 0,
                isGrounded: false,
                groundNormal: { x: 0, y: 1, z: 0 },
                groundPoint: { x: 0, y: 0, z: 0 }
            });
            this.wheelRotations.push(0);
        });
    }

    createHelicopter(position) {
        const cfg = this.config;
        const skids = cfg.skids;

        // Create fuselage - spawn lower since we have skids now
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + skids.dropHeight + 0.5, position.z)
            .setLinearDamping(cfg.linearDamping)
            .setAngularDamping(cfg.angularDamping)
            .setAdditionalMass(cfg.fuselageMass);

        this.chassis = this.world.createRigidBody(bodyDesc);

        // Set up inertia for helicopter feel
        const baseInertia = cfg.fuselageMass * 2;
        this.chassis.setAdditionalMassProperties(
            cfg.fuselageMass,
            { x: 0, y: 0, z: 0 },
            {
                x: baseInertia * cfg.inertiaMultiplier,
                y: baseInertia * 0.5 * cfg.inertiaMultiplier,
                z: baseInertia * cfg.inertiaMultiplier
            },
            { w: 1, x: 0, y: 0, z: 0 }
        );

        // Main fuselage collider
        const fuselageCollider = RAPIER.ColliderDesc.cuboid(
            cfg.fuselageWidth * 0.5,
            cfg.fuselageHeight * 0.4,
            cfg.fuselageLength * 0.35
        ).setFriction(0.5);

        const mainCollider = this.world.createCollider(fuselageCollider, this.chassis);
        this.colliders.push(mainCollider);

        // Tail boom collider
        const tailCollider = RAPIER.ColliderDesc.cuboid(0.15, 0.15, cfg.fuselageLength * 0.25)
            .setTranslation(0, 0.1, -cfg.fuselageLength * 0.45)
            .setFriction(0.3);

        const tailCol = this.world.createCollider(tailCollider, this.chassis);
        this.colliders.push(tailCol);

        // Landing skid colliders - two parallel tubes below the fuselage
        const skidHalfWidth = skids.width / 2;
        const skidHalfLength = skids.length / 2;

        // Left skid (cylinder approximated as capsule lying on side, or use box)
        const leftSkidCollider = RAPIER.ColliderDesc.cuboid(
            skids.height,           // Half-width (thin tube)
            skids.height,           // Half-height (thin tube)
            skidHalfLength          // Half-length
        ).setTranslation(-skidHalfWidth, -skids.dropHeight, 0)
         .setFriction(0.8)
         .setRestitution(0.1);

        const leftSkid = this.world.createCollider(leftSkidCollider, this.chassis);
        this.colliders.push(leftSkid);

        // Right skid
        const rightSkidCollider = RAPIER.ColliderDesc.cuboid(
            skids.height,
            skids.height,
            skidHalfLength
        ).setTranslation(skidHalfWidth, -skids.dropHeight, 0)
         .setFriction(0.8)
         .setRestitution(0.1);

        const rightSkid = this.world.createCollider(rightSkidCollider, this.chassis);
        this.colliders.push(rightSkid);

        // Cross-bars connecting skids (front and back)
        const crossBarCollider = RAPIER.ColliderDesc.cuboid(
            skidHalfWidth,
            skids.height * 0.5,
            skids.height
        ).setFriction(0.6);

        // Front crossbar
        const frontCross = this.world.createCollider(
            crossBarCollider.setTranslation(0, -skids.dropHeight + 0.1, skidHalfLength * 0.7),
            this.chassis
        );
        this.colliders.push(frontCross);

        // Back crossbar
        const backCross = this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(skidHalfWidth, skids.height * 0.5, skids.height)
                .setTranslation(0, -skids.dropHeight + 0.1, -skidHalfLength * 0.7)
                .setFriction(0.6),
            this.chassis
        );
        this.colliders.push(backCross);

        this.bodies.push(this.chassis);
    }

    // ========================================================================
    // PHYSICS UPDATE
    // ========================================================================

    update(dt) {
        if (this.type === 'HELICOPTER') {
            this.updateHelicopterPhysics(dt);
        } else {
            this.updateGroundVehiclePhysics(dt);
        }
    }

    updateGroundVehiclePhysics(dt) {
        if (!this.chassis) return;

        const cfg = this.config;
        const susp = cfg.suspension;
        const chassisPos = this.chassis.translation();
        const chassisRot = this.chassis.rotation();
        const chassisVel = this.chassis.linvel();

        // Get local directions
        const localUp = rotateVectorByQuat({ x: 0, y: 1, z: 0 }, chassisRot);
        const localForward = rotateVectorByQuat({ x: 0, y: 0, z: 1 }, chassisRot);
        const localRight = rotateVectorByQuat({ x: 1, y: 0, z: 0 }, chassisRot);

        // Process each suspension point
        let totalGroundedWheels = 0;

        this.suspensionState.forEach((wheel, index) => {
            // Calculate world position of suspension mount point
            const localPos = wheel.position;
            const worldMountPos = add(chassisPos, rotateVectorByQuat(localPos, chassisRot));

            // Raycast downward from slightly above the mount point (in world up direction)
            const rayStartOffset = 0.1; // Small offset above mount
            const rayOrigin = add(worldMountPos, scale(localUp, rayStartOffset));
            const rayDir = scale(localUp, -1); // Always cast in local down direction

            // Total ray length: offset + rest length + max travel + wheel radius + small buffer
            const maxRayLength = rayStartOffset + susp.restLength + susp.maxTravel + susp.wheelRadius + 0.2;

            const ray = new RAPIER.Ray(rayOrigin, rayDir);
            const hit = this.world.castRay(ray, maxRayLength, true, undefined, undefined, this.chassisCollider);

            if (hit) {
                const hitDistance = hit.timeOfImpact;

                // Calculate actual suspension length (distance from mount to wheel contact - wheel radius)
                // The hit distance includes our rayStartOffset, so subtract it
                const groundDistance = hitDistance - rayStartOffset;
                const suspensionLength = groundDistance - susp.wheelRadius;

                // Compression is how much the spring is compressed from rest length
                const compression = susp.restLength - suspensionLength;

                if (compression > -0.05 && compression <= susp.maxTravel + 0.1) {
                    // Wheel is in valid range (slight extension allowed for smooth transitions)
                    wheel.isGrounded = compression >= 0;

                    if (wheel.isGrounded) {
                        totalGroundedWheels++;
                        const hitPoint = add(rayOrigin, scale(rayDir, hitDistance));
                        wheel.groundPoint = hitPoint;

                        // Calculate compression velocity for damping
                        const compressionVelocity = (compression - wheel.previousCompression) / dt;

                        // Hooke's Law: F = k * x + b * v
                        // Spring force pushes up when compressed, damper resists velocity
                        const springForce = susp.springStiffness * Math.max(0, compression);
                        const damperForce = susp.damperStrength * compressionVelocity;

                        // Total force (spring always positive when compressed, damper can be negative)
                        const totalForce = Math.max(0, springForce + damperForce);

                        // Apply suspension force at the wheel contact point in world up direction
                        const forceVector = scale(localUp, totalForce);
                        this.chassis.applyImpulseAtPoint(
                            scale(forceVector, dt),
                            worldMountPos,
                            true
                        );

                        wheel.compression = compression;
                    } else {
                        wheel.compression = 0;
                    }

                    wheel.previousCompression = compression;
                } else {
                    wheel.isGrounded = false;
                    wheel.compression = 0;
                    wheel.previousCompression = wheel.previousCompression * 0.9; // Decay smoothly
                }
            } else {
                wheel.isGrounded = false;
                wheel.compression = 0;
                wheel.previousCompression = wheel.previousCompression * 0.9;
            }
        });

        // Apply lateral grip (anti-slip) for grounded wheels
        if (totalGroundedWheels > 0) {
            const lateralVelocity = dot(chassisVel, localRight);

            // Only apply significant grip force if there's lateral movement
            if (Math.abs(lateralVelocity) > 0.01) {
                const gripForce = -lateralVelocity * cfg.lateralGrip * this.chassis.mass();

                // Distribute force among grounded wheels
                this.suspensionState.forEach((wheel) => {
                    if (wheel.isGrounded) {
                        const worldPos = add(chassisPos, rotateVectorByQuat(wheel.position, chassisRot));
                        const forceVector = scale(localRight, (gripForce / totalGroundedWheels) * dt);
                        this.chassis.applyImpulseAtPoint(forceVector, worldPos, true);
                    }
                });
            }
        }

        // Apply rolling resistance when on ground
        if (totalGroundedWheels > 0) {
            const forwardVelocity = dot(chassisVel, localForward);
            const rollingResistance = -forwardVelocity * 0.02 * this.chassis.mass() * dt;
            this.chassis.applyImpulse(scale(localForward, rollingResistance), true);
        }
    }

    updateHelicopterPhysics(dt) {
        if (!this.chassis) return;

        const cfg = this.config;
        const rotor = cfg.rotor;
        const skids = cfg.skids;

        // Ground detection - raycast from center downward
        const chassisPos = this.chassis.translation();
        const chassisRot = this.chassis.rotation();
        const localUp = rotateVectorByQuat({ x: 0, y: 1, z: 0 }, chassisRot);

        const groundRay = new RAPIER.Ray(chassisPos, { x: 0, y: -1, z: 0 });
        const groundHit = this.world.castRay(groundRay, skids.dropHeight + 0.5, true);
        this.isGrounded = groundHit && groundHit.timeOfImpact < skids.dropHeight + 0.3;

        // RPM naturally decays when no throttle input (engine inertia simulation)
        // The actual throttle control happens in applyHelicopterInput
        if (!this.isEngineRunning && this.currentRPM > 0) {
            // Engine off - RPM decays from drag
            this.currentRPM = Math.max(0, this.currentRPM - rotor.spoolDownRate * 0.5 * dt);
        }

        // Smoothly approach target RPM
        const rpmDiff = this.targetRPM - this.currentRPM;
        if (Math.abs(rpmDiff) > 0.1) {
            const rate = rpmDiff > 0 ? rotor.spoolUpRate : rotor.spoolDownRate;
            this.currentRPM += Math.sign(rpmDiff) * Math.min(Math.abs(rpmDiff), rate * dt);
        }

        // Calculate lift based on RPM
        const rpmRatio = this.currentRPM / rotor.maxRPM;

        if (rpmRatio >= rotor.liftThreshold) {
            // Normalized lift (0 at threshold, 1 at max)
            const effectiveRatio = (rpmRatio - rotor.liftThreshold) / (1.0 - rotor.liftThreshold);
            const liftForce = effectiveRatio * effectiveRatio * rotor.maxLiftForce;

            // Apply lift relative to helicopter's up vector
            const totalLift = liftForce * (1.0 + this.collectiveInput * 0.5);

            this.chassis.applyImpulse(scale(localUp, totalLift * dt), true);
        }

        // Apply aerodynamic drag when moving
        const vel = this.chassis.linvel();
        const speed = magnitude(vel);
        if (speed > 0.1) {
            const dragCoeff = 0.05;
            const dragForce = scale(normalize(vel), -dragCoeff * speed * speed * dt);
            this.chassis.applyImpulse(dragForce, true);
        }

        // Apply rotational drag (air resistance to rotation)
        const angVel = this.chassis.angvel();
        const angSpeed = magnitude(angVel);
        if (angSpeed > 0.01) {
            const rotDrag = scale(angVel, -0.3 * dt);
            this.chassis.applyTorqueImpulse(rotDrag, true);
        }
    }

    // ========================================================================
    // INPUT HANDLING
    // ========================================================================

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        if (this.type === 'HELICOPTER') {
            this.applyHelicopterInput(input, dt);
        } else if (this.type === 'TANK') {
            this.applyTankInput(input, dt);
        } else {
            this.applyJeepInput(input, dt);
        }
    }

    applyJeepInput(input, dt) {
        const cfg = this.config;
        const chassisRot = this.chassis.rotation();
        const chassisVel = this.chassis.linvel();

        // Get local directions
        const localForward = rotateVectorByQuat({ x: 0, y: 0, z: 1 }, chassisRot);
        const localRight = rotateVectorByQuat({ x: 1, y: 0, z: 0 }, chassisRot);

        // Calculate forward speed
        const forwardSpeed = dot(chassisVel, localForward);

        // Forward/Backward input
        const forwardInput = -(input.y || 0); // Inverted because Z+ is forward
        const steerInput = input.x || 0;

        // Count grounded wheels for traction
        const groundedWheels = this.suspensionState.filter(w => w.isGrounded).length;
        if (groundedWheels === 0) return; // Can't drive when airborne

        const tractionMultiplier = groundedWheels / this.suspensionState.length;

        // Calculate engine force
        const targetSpeed = cfg.maxSpeed * forwardInput;
        const speedError = targetSpeed - forwardSpeed;
        const engineForce = Math.sign(speedError) * Math.min(Math.abs(speedError) * cfg.engineForce * 0.1, cfg.engineForce);

        // Apply engine force at rear wheels (RWD simulation)
        const rearWheels = this.suspensionState.slice(-2);
        rearWheels.forEach(wheel => {
            if (wheel.isGrounded) {
                const worldPos = add(
                    this.chassis.translation(),
                    rotateVectorByQuat(wheel.position, chassisRot)
                );
                const force = scale(localForward, engineForce * tractionMultiplier * dt * 0.5);
                this.chassis.applyImpulseAtPoint(force, worldPos, true);
            }
        });

        // Smooth steering interpolation
        const targetSteerAngle = steerInput * cfg.steerAngle;
        this.currentSteerAngle = lerp(this.currentSteerAngle, targetSteerAngle, cfg.steerSpeed * dt);

        // Apply steering torque (stronger at lower speeds for maneuverability)
        const speedFactor = Math.max(0.3, 1 - Math.abs(forwardSpeed) / cfg.maxSpeed);
        const steerTorque = this.currentSteerAngle * cfg.engineForce * 0.15 * speedFactor * tractionMultiplier;

        // Only steer when moving
        if (Math.abs(forwardSpeed) > 0.5) {
            this.chassis.applyTorqueImpulse({ x: 0, y: steerTorque * dt * Math.sign(forwardSpeed), z: 0 }, true);
        }

        // Update wheel rotations for visuals
        this.wheelRotations = this.wheelRotations.map(rot => {
            return rot + forwardSpeed * dt * 2; // Visual rotation
        });
    }

    applyTankInput(input, dt) {
        const cfg = this.config;
        const chassisRot = this.chassis.rotation();
        const chassisVel = this.chassis.linvel();

        // Get local directions
        const localForward = rotateVectorByQuat({ x: 0, y: 0, z: 1 }, chassisRot);
        const localRight = rotateVectorByQuat({ x: 1, y: 0, z: 0 }, chassisRot);

        const forwardSpeed = dot(chassisVel, localForward);

        const forwardInput = -(input.y || 0);
        const steerInput = input.x || 0;

        // Count grounded wheels
        const groundedWheels = this.suspensionState.filter(w => w.isGrounded).length;
        if (groundedWheels === 0) return;

        const tractionMultiplier = groundedWheels / this.suspensionState.length;

        // DIFFERENTIAL STEERING (Tank tracks)
        // When nearly stationary with steering input, perform neutral turn
        const isNearlyStationary = Math.abs(forwardSpeed) < 1.5;

        if (isNearlyStationary && Math.abs(steerInput) > 0.1 && Math.abs(forwardInput) < 0.2) {
            // Neutral Turn: apply opposing forces to tracks
            const turnTorque = steerInput * cfg.neutralTurnTorque * tractionMultiplier;
            this.chassis.applyTorqueImpulse({ x: 0, y: turnTorque * dt, z: 0 }, true);

            // Apply slight lateral friction to prevent sliding
            const lateralVel = dot(chassisVel, localRight);
            const frictionImpulse = scale(localRight, -lateralVel * this.chassis.mass() * 0.8 * dt);
            this.chassis.applyImpulse(frictionImpulse, true);
        } else {
            // Normal driving: differential track speeds
            const leftTrackPower = forwardInput + steerInput * 0.5;
            const rightTrackPower = forwardInput - steerInput * 0.5;

            // Calculate target speeds for each track
            const targetSpeed = cfg.maxSpeed * forwardInput;
            const speedError = targetSpeed - forwardSpeed;

            // Apply main drive force
            const driveForce = Math.sign(speedError) * Math.min(Math.abs(speedError) * cfg.engineForce * 0.05, cfg.engineForce);
            this.chassis.applyImpulse(scale(localForward, driveForce * tractionMultiplier * dt), true);

            // Apply differential steering through torque
            const trackDifference = leftTrackPower - rightTrackPower;
            const steerTorque = trackDifference * cfg.engineForce * 0.3 * tractionMultiplier;
            this.chassis.applyTorqueImpulse({ x: 0, y: steerTorque * dt, z: 0 }, true);
        }

        // High friction lateral damping (tanks don't slide sideways)
        const lateralVel = dot(chassisVel, localRight);
        if (Math.abs(lateralVel) > cfg.microSlipThreshold) {
            const frictionForce = -lateralVel * this.chassis.mass() * cfg.lateralGrip;
            this.chassis.applyImpulse(scale(localRight, frictionForce * dt), true);
        }

        // Update track animations (left/right track speeds)
        this.leftTrackSpeed = forwardSpeed + steerInput * 2;
        this.rightTrackSpeed = forwardSpeed - steerInput * 2;
    }

    applyHelicopterInput(input, dt) {
        const cfg = this.config;
        const rotor = cfg.rotor;
        const controls = cfg.controls;

        // Gradual throttle control
        // Space (throttleUp) = increase RPM while held
        // Shift (throttleDown) = decrease RPM while held
        if (input.throttleUp) {
            this.targetRPM = Math.min(rotor.maxRPM, this.targetRPM + rotor.spoolUpRate * dt);
            this.isEngineRunning = true;
        } else if (input.throttleDown) {
            this.targetRPM = Math.max(0, this.targetRPM - rotor.spoolDownRate * dt);
            // Engine is "off" when target is at 0
            if (this.targetRPM <= 0) {
                this.isEngineRunning = false;
            }
        }
        // When neither pressed, target RPM stays where it is (maintains throttle)

        // Collective (additional lift) from vertical input when flying
        this.collectiveInput = input.collective || 0;

        // Get control inputs - these are in helicopter-local space
        const pitchInput = input.pitch || 0;    // W/S
        const rollInput = input.roll || 0;      // A/D
        const yawInput = input.yaw || 0;        // Z/C

        // Calculate control effectiveness based on RPM
        const rpmRatio = this.currentRPM / rotor.maxRPM;

        // Controls work at any RPM, but effectiveness scales with rotor speed
        // Below controlMinRPM: very weak (rotor barely spinning)
        // Above controlMinRPM: scales up to full effectiveness at max RPM
        let controlEffectiveness = 0;
        if (rpmRatio >= rotor.controlMinRPM) {
            // Scale from controlMinRPM to 1.0
            controlEffectiveness = (rpmRatio - rotor.controlMinRPM) / (1.0 - rotor.controlMinRPM);
            controlEffectiveness = Math.min(1.0, controlEffectiveness);
        } else if (rpmRatio > 0) {
            // Below minimum, very weak response (rotor barely turning)
            controlEffectiveness = rpmRatio / rotor.controlMinRPM * 0.15;
        }

        // When grounded, reduce control response significantly
        // (can't pitch/roll much when sitting on skids)
        if (this.isGrounded) {
            controlEffectiveness *= controls.groundedDamping;
        }

        // Get local direction vectors
        const chassisRot = this.chassis.rotation();
        const localForward = rotateVectorByQuat({ x: 0, y: 0, z: 1 }, chassisRot);
        const localRight = rotateVectorByQuat({ x: 1, y: 0, z: 0 }, chassisRot);
        const localUp = rotateVectorByQuat({ x: 0, y: 1, z: 0 }, chassisRot);

        // Apply cyclic controls (pitch and roll) - physics-based torques
        const pitchTorque = pitchInput * controls.pitchRate * controlEffectiveness;
        const rollTorque = rollInput * controls.rollRate * controlEffectiveness;
        const yawTorque = yawInput * controls.yawRate * controlEffectiveness;

        // Convert to world-space torques applied in local axes
        const worldPitchTorque = scale(localRight, pitchTorque * this.chassis.mass() * dt);
        const worldRollTorque = scale(localForward, rollTorque * this.chassis.mass() * dt);
        const worldYawTorque = scale(localUp, yawTorque * this.chassis.mass() * dt);

        this.chassis.applyTorqueImpulse(add(add(worldPitchTorque, worldRollTorque), worldYawTorque), true);

        // Cyclic tilt affects movement direction (only when airborne and above lift threshold)
        if (!this.isGrounded && rpmRatio >= rotor.liftThreshold) {
            const effectiveLiftRatio = (rpmRatio - rotor.liftThreshold) / (1.0 - rotor.liftThreshold);
            const tiltThrust = rotor.maxLiftForce * 0.15 * effectiveLiftRatio;

            if (Math.abs(pitchInput) > 0.1) {
                const thrustDir = scale(localForward, -pitchInput * tiltThrust * dt);
                this.chassis.applyImpulse(thrustDir, true);
            }

            if (Math.abs(rollInput) > 0.1) {
                const thrustDir = scale(localRight, rollInput * tiltThrust * dt);
                this.chassis.applyImpulse(thrustDir, true);
            }
        }
    }

    // ========================================================================
    // SEAT MANAGEMENT
    // ========================================================================

    getSeatOffsets() {
        return this.config.seatOffsets;
    }

    getSeatWorldPosition(seatIndex) {
        const offsets = this.getSeatOffsets();
        const offset = offsets[seatIndex];
        if (!offset || !this.chassis) return null;

        const t = this.chassis.translation();
        const r = this.chassis.rotation();

        const rotatedOffset = rotateVectorByQuat(offset, r);

        return {
            x: t.x + rotatedOffset.x,
            y: t.y + rotatedOffset.y,
            z: t.z + rotatedOffset.z
        };
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        const v = this.chassis.linvel();

        const baseData = {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w,
            vx: v.x, vy: v.y, vz: v.z,
            health: this.health,
            maxHealth: this.maxHealth
        };

        // Add type-specific data
        if (this.type === 'HELICOPTER') {
            baseData.rpm = this.currentRPM;
            baseData.maxRpm = this.config.rotor.maxRPM;
            baseData.rpmRatio = this.currentRPM / this.config.rotor.maxRPM;
            baseData.targetRpm = this.targetRPM;
            baseData.isEngineRunning = this.isEngineRunning;
            baseData.isGrounded = this.isGrounded;
        }

        if (this.type === 'JEEP' || this.type === 'TANK') {
            baseData.wheelRotations = this.wheelRotations;
            baseData.suspensionCompression = this.suspensionState.map(s => s.compression);
            baseData.steerAngle = this.currentSteerAngle;
        }

        if (this.type === 'TANK') {
            baseData.leftTrackSpeed = this.leftTrackSpeed;
            baseData.rightTrackSpeed = this.rightTrackSpeed;
        }

        return baseData;
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    destroy() {
        this.colliders.forEach(c => {
            if (c) this.world.removeCollider(c, true);
        });

        this.bodies.forEach(b => {
            if (b) this.world.removeRigidBody(b);
        });

        this.bodies = [];
        this.colliders = [];
        this.chassis = null;
    }
}

// Export configuration for client-side use
export { VEHICLE_CONFIG };
