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
        // Chassis dimensions
        chassisWidth: 1.0,
        chassisHeight: 0.4,
        chassisLength: 2.0,
        chassisMass: 800,

        // Center of Mass offset (lower for stability)
        comOffset: { x: 0, y: -1.0, z: 0 },

        // Suspension parameters (Hooke's Law: F = -kx - bv)
        suspension: {
            restLength: 0.6,        // Natural length of spring
            springStiffness: 35000, // k - spring constant (N/m)
            damperStrength: 4500,   // b - damping coefficient (Ns/m)
            maxTravel: 0.4,         // Maximum compression distance
            wheelRadius: 0.35
        },

        // Wheel positions (relative to chassis center)
        wheelPositions: [
            { x: -0.85, y: 0, z: 1.2 },   // Front Left
            { x: 0.85, y: 0, z: 1.2 },    // Front Right
            { x: -0.85, y: 0, z: -1.2 },  // Rear Left
            { x: 0.85, y: 0, z: -1.2 }    // Rear Right
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
        // Chassis dimensions (much larger and heavier)
        chassisWidth: 1.8,
        chassisHeight: 0.6,
        chassisLength: 3.5,
        chassisMass: 8000,  // 10x heavier than jeep

        // Center of Mass offset (very low for stability)
        comOffset: { x: 0, y: -1.2, z: 0 },

        // Suspension (stiffer for heavy weight)
        suspension: {
            restLength: 0.5,
            springStiffness: 120000,
            damperStrength: 15000,
            maxTravel: 0.3,
            wheelRadius: 0.5
        },

        // Track wheel positions (6 wheels per side simulated)
        wheelPositions: [
            { x: -1.4, y: 0, z: 2.0 },    // Front Left
            { x: 1.4, y: 0, z: 2.0 },     // Front Right
            { x: -1.4, y: 0, z: 0 },      // Mid Left
            { x: 1.4, y: 0, z: 0 },       // Mid Right
            { x: -1.4, y: 0, z: -2.0 },   // Rear Left
            { x: 1.4, y: 0, z: -2.0 }     // Rear Right
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
        // Fuselage dimensions
        fuselageWidth: 1.2,
        fuselageHeight: 1.5,
        fuselageLength: 4.0,
        fuselageMass: 2000,

        // Rotor system
        rotor: {
            maxRPM: 400,
            idleRPM: 50,
            spoolUpRate: 40,        // RPM per second when throttle up
            spoolDownRate: 60,      // RPM per second when throttle down
            liftThreshold: 0.6,     // 60% RPM required for lift
            maxLiftForce: 35000,    // Force at max RPM
            rotorRadius: 5.0
        },

        // Flight controls sensitivity
        controls: {
            pitchRate: 1.5,         // Radians per second at full input
            rollRate: 1.8,
            yawRate: 1.2,
            collectiveSensitivity: 0.5
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
            this.targetRPM = this.config.rotor.idleRPM;
            this.collectiveInput = 0;
            this.isEngineRunning = false;
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

        // Create fuselage
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 5, position.z)
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
            cfg.fuselageWidth,
            cfg.fuselageHeight * 0.5,
            cfg.fuselageLength * 0.4
        ).setFriction(0.5);

        this.world.createCollider(fuselageCollider, this.chassis);

        // Tail boom collider
        const tailCollider = RAPIER.ColliderDesc.cuboid(0.2, 0.2, cfg.fuselageLength * 0.3)
            .setTranslation(0, 0, -cfg.fuselageLength * 0.5);

        this.world.createCollider(tailCollider, this.chassis);

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
            // Calculate world position of suspension point
            const localPos = wheel.position;
            const worldPos = add(chassisPos, rotateVectorByQuat(localPos, chassisRot));

            // Raycast downward from suspension mount
            const rayOrigin = { x: worldPos.x, y: worldPos.y + 0.5, z: worldPos.z };
            const rayDir = scale(localUp, -1);
            const maxRayLength = cfg.suspension.restLength + cfg.suspension.maxTravel + cfg.suspension.wheelRadius + 0.5;

            const ray = new RAPIER.Ray(rayOrigin, rayDir);
            const hit = this.world.castRay(ray, maxRayLength, true, undefined, undefined, this.chassisCollider);

            if (hit) {
                const hitDistance = hit.timeOfImpact;
                const hitPoint = add(rayOrigin, scale(rayDir, hitDistance));

                // Calculate suspension compression
                const suspensionLength = hitDistance - cfg.suspension.wheelRadius - 0.5;
                const compression = cfg.suspension.restLength - suspensionLength;

                if (compression > 0 && compression < cfg.suspension.maxTravel + 0.1) {
                    wheel.isGrounded = true;
                    wheel.groundPoint = hitPoint;
                    totalGroundedWheels++;

                    // Get ground normal
                    const hitCollider = this.world.getCollider(hit.collider);
                    if (hitCollider) {
                        // Approximate normal from raycast
                        wheel.groundNormal = { x: 0, y: 1, z: 0 };
                    }

                    // Calculate compression velocity
                    const compressionVelocity = (compression - wheel.previousCompression) / dt;
                    wheel.previousCompression = compression;

                    // Hooke's Law: F = -k * x - b * v
                    // Spring force pushes up, damper resists velocity
                    const springForce = cfg.suspension.springStiffness * compression;
                    const damperForce = cfg.suspension.damperStrength * compressionVelocity;
                    const totalForce = springForce + damperForce;

                    // Apply suspension force at wheel position
                    const forceVector = scale(localUp, Math.max(0, totalForce));
                    this.chassis.applyImpulseAtPoint(
                        scale(forceVector, dt),
                        worldPos,
                        true
                    );

                    wheel.compression = compression;
                } else {
                    wheel.isGrounded = false;
                    wheel.compression = 0;
                    wheel.previousCompression = 0;
                }
            } else {
                wheel.isGrounded = false;
                wheel.compression = 0;
                wheel.previousCompression = 0;
            }
        });

        // Apply lateral grip (anti-slip) for grounded wheels
        if (totalGroundedWheels > 0) {
            const lateralVelocity = dot(chassisVel, localRight);
            const gripForce = -lateralVelocity * cfg.lateralGrip * this.chassis.mass() / totalGroundedWheels;

            // Apply grip force at each grounded wheel
            this.suspensionState.forEach((wheel, index) => {
                if (wheel.isGrounded) {
                    const worldPos = add(chassisPos, rotateVectorByQuat(wheel.position, chassisRot));
                    const forceVector = scale(localRight, gripForce * dt);
                    this.chassis.applyImpulseAtPoint(forceVector, worldPos, true);
                }
            });
        }
    }

    updateHelicopterPhysics(dt) {
        if (!this.chassis) return;

        const cfg = this.config;
        const rotor = cfg.rotor;

        // Update RPM based on target (simulates engine inertia)
        if (this.currentRPM < this.targetRPM) {
            this.currentRPM = Math.min(this.currentRPM + rotor.spoolUpRate * dt, this.targetRPM);
        } else if (this.currentRPM > this.targetRPM) {
            this.currentRPM = Math.max(this.currentRPM - rotor.spoolDownRate * dt, this.targetRPM);
        }

        // Calculate lift based on RPM
        const rpmRatio = this.currentRPM / rotor.maxRPM;

        if (rpmRatio >= rotor.liftThreshold) {
            // Normalized lift (0 at threshold, 1 at max)
            const effectiveRatio = (rpmRatio - rotor.liftThreshold) / (1.0 - rotor.liftThreshold);
            const liftForce = effectiveRatio * effectiveRatio * rotor.maxLiftForce;

            // Apply lift relative to helicopter's up vector
            const chassisRot = this.chassis.rotation();
            const localUp = rotateVectorByQuat({ x: 0, y: 1, z: 0 }, chassisRot);

            // Base lift counters gravity when at hover
            const gravityCompensation = this.chassis.mass() * 9.81;
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

        // Engine controls
        // Space = throttle up, Shift = throttle down
        if (input.throttleUp) {
            this.targetRPM = rotor.maxRPM;
            this.isEngineRunning = true;
        } else if (input.throttleDown) {
            this.targetRPM = rotor.idleRPM;
        }

        // Collective (additional lift) from vertical input when flying
        this.collectiveInput = input.collective || 0;

        // Only apply flight controls if RPM is sufficient
        const rpmRatio = this.currentRPM / rotor.maxRPM;
        if (rpmRatio < rotor.liftThreshold) return;

        const controlEffectiveness = (rpmRatio - rotor.liftThreshold) / (1.0 - rotor.liftThreshold);

        // W/S = Pitch
        const pitchInput = input.pitch || 0;
        // A/D = Roll
        const rollInput = input.roll || 0;
        // Z/C = Yaw (Anti-torque)
        const yawInput = input.yaw || 0;

        const chassisRot = this.chassis.rotation();
        const localForward = rotateVectorByQuat({ x: 0, y: 0, z: 1 }, chassisRot);
        const localRight = rotateVectorByQuat({ x: 1, y: 0, z: 0 }, chassisRot);
        const localUp = rotateVectorByQuat({ x: 0, y: 1, z: 0 }, chassisRot);

        // Apply cyclic controls (pitch and roll)
        const pitchTorque = pitchInput * controls.pitchRate * controlEffectiveness;
        const rollTorque = rollInput * controls.rollRate * controlEffectiveness;
        const yawTorque = yawInput * controls.yawRate * controlEffectiveness;

        // Convert to world-space torques
        const worldPitchTorque = scale(localRight, pitchTorque * this.chassis.mass() * dt);
        const worldRollTorque = scale(localForward, rollTorque * this.chassis.mass() * dt);
        const worldYawTorque = scale(localUp, yawTorque * this.chassis.mass() * dt);

        this.chassis.applyTorqueImpulse(add(add(worldPitchTorque, worldRollTorque), worldYawTorque), true);

        // Cyclic tilt affects movement direction
        // Tilting forward/back creates forward/back thrust
        const tiltThrust = cfg.rotor.maxLiftForce * 0.15 * controlEffectiveness;

        if (Math.abs(pitchInput) > 0.1) {
            const thrustDir = scale(localForward, -pitchInput * tiltThrust * dt);
            this.chassis.applyImpulse(thrustDir, true);
        }

        if (Math.abs(rollInput) > 0.1) {
            const thrustDir = scale(localRight, rollInput * tiltThrust * dt);
            this.chassis.applyImpulse(thrustDir, true);
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
            baseData.isEngineRunning = this.isEngineRunning;
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
