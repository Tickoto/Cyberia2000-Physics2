import RAPIER from '@dimforge/rapier3d-compat';

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type; // JEEP, TANK, HELICOPTER
        this.world = world;
        
        this.bodies = []; // Track bodies to destroy later
        this.joints = [];
        this.wheels = []; // { body, joint, axis }

        this.rotorRpm = 0;
        this.maxRotorRpm = 1.0;
        
        this.health = 100;
        this.maxHealth = 100;
        this.seats = [];

        const seatCount = type === 'JEEP' ? 4 : (type === 'TANK' ? 2 : 6);
        for(let i=0; i<seatCount; i++) this.seats.push(null); // null = empty, string = playerId

        this.createVehicle(position);
    }

    get chassisHandle() {
        return this.chassis ? this.chassis.handle : -1;
    }

    createVehicle(position) {
        if (this.type === 'HELICOPTER') {
            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(position.x, position.y + 5, position.z)
                .setLinearDamping(0.6)
                .setAngularDamping(1.4);

            this.chassis = this.world.createRigidBody(bodyDesc);
            const mainBody = RAPIER.ColliderDesc.cuboid(1.5, 1.0, 3.0).setDensity(0.75);
            const bellyWeight = RAPIER.ColliderDesc.cuboid(1.0, 0.2, 2.5)
                .setTranslation(0, -0.8, 0)
                .setDensity(2.0);
            const tail = RAPIER.ColliderDesc.cuboid(0.4, 0.4, 3.0)
                .setTranslation(0, 0.1, -3.5)
                .setDensity(0.5);

            [mainBody, bellyWeight, tail].forEach((collider) => this.world.createCollider(collider, this.chassis));
            this.bodies.push(this.chassis);
            return;
        }

        // Land Vehicles (Jeep, Tank)
        const isTank = this.type === 'TANK';
        const width = isTank ? 1.5 : 1.0;
        const length = isTank ? 3.0 : 2.0;
        const mass = isTank ? 2000 : 500;

        // 1. Chassis
        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 1, position.z)
            .setAdditionalMass(mass);
        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.5, length)
            .setTranslation(0, -0.2, 0)
            .setDensity(1.2);
        const ballast = RAPIER.ColliderDesc.cylinder(0.2, 0.5)
            .setTranslation(0, -0.8, 0)
            .setRotation({ w: 1, x: 0, y: 0, z: 0 })
            .setDensity(3.0);
        this.world.createCollider(chassisColl, chassis);
        this.world.createCollider(ballast, chassis);
        this.bodies.push(chassis);
        this.chassis = chassis;

        // 2. Wheels
        const wheelRadius = isTank ? 0.6 : 0.4;
        const wheelWidth = isTank ? 0.4 : 0.2;
        const xOff = width + wheelWidth/2 + 0.1;
        const yOff = -0.3;
        const zOff = length - 0.5;

        // Front Left, Front Right, Rear Left, Rear Right
        const wheelPositions = [
            { x: -xOff, y: yOff, z: zOff },
            { x: xOff, y: yOff, z: zOff },
            { x: -xOff, y: yOff, z: -zOff },
            { x: xOff, y: yOff, z: -zOff }
        ];

        wheelPositions.forEach((pos, index) => {
            // Wheel Body
            const wheelDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(position.x + pos.x, position.y + pos.y + 1, position.z + pos.z);
            const wheelBody = this.world.createRigidBody(wheelDesc);
            
            // Rotate Cylinder to align with X axis
            const wheelColl = RAPIER.ColliderDesc.cylinder(wheelWidth/2, wheelRadius)
                .setRotation({ w: 0.707, x: 0, y: 0, z: 0.707 }) // 90 deg around Z approx
                .setFriction(isTank ? 3.0 : 2.0); 
            
            this.world.createCollider(wheelColl, wheelBody);
            this.bodies.push(wheelBody);

            // Joint
            const jointParams = RAPIER.JointData.revolute(
                pos, 
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 } // Rotate around X axis
            );
            
            const joint = this.world.createImpulseJoint(jointParams, chassis, wheelBody, true);
            this.wheels.push({ body: wheelBody, joint, index });
            this.joints.push(joint);
        });
    }

    getSeatOffsets() {
        if (this.type === 'JEEP') {
            return [
                { x: -0.6, y: 1.0, z: 0.8 }, // Driver
                { x: 0.6, y: 1.0, z: 0.8 },
                { x: -0.6, y: 1.0, z: -0.8 },
                { x: 0.6, y: 1.0, z: -0.8 },
            ];
        }

        if (this.type === 'TANK') {
            return [
                { x: 0, y: 1.2, z: 0.5 },
                { x: 0, y: 1.2, z: -0.5 },
            ];
        }

        // HELICOPTER default (6 seats)
        return [
            { x: -0.6, y: 1.2, z: 1.2 },
            { x: 0.6, y: 1.2, z: 1.2 },
            { x: -0.6, y: 1.2, z: 0 },
            { x: 0.6, y: 1.2, z: 0 },
            { x: -0.6, y: 1.2, z: -1.2 },
            { x: 0.6, y: 1.2, z: -1.2 },
        ];
    }

    getSeatWorldPosition(seatIndex) {
        const offsets = this.getSeatOffsets();
        const offset = offsets[seatIndex];
        if (!offset || !this.chassis) return null;

        const t = this.chassis.translation();
        const r = this.chassis.rotation();

        // Rotate offset by chassis orientation
        const qx = r.x, qy = r.y, qz = r.z, qw = r.w;
        const ox = offset.x, oy = offset.y, oz = offset.z;

        const ix =  qw * ox + qy * oz - qz * oy;
        const iy =  qw * oy + qz * ox - qx * oz;
        const iz =  qw * oz + qx * oy - qy * ox;
        const iw = -qx * ox - qy * oy - qz * oz;

        const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx;

        return {
            x: t.x + rx,
            y: t.y + ry,
            z: t.z + rz,
        };
    }

    update(dt) {
        // Simple autonomous movement or just idle physics for now
        // If controlled by player, we'd need input injection.
        // For now, let's just stabilize them if helicopter
        
        if (this.type === 'HELICOPTER') {
            // Hover logic (Anti-gravity)
            // Just apply simple upward force to counteract gravity roughly
            // Mass is computed by Rapier + additional mass? No explicit mass set for heli, assumed from collider density
            // Default density 1.0. Volume 1.5*1*3 * 8 = 36. Mass ~36. Gravity 9.81. Force ~350
            
            // const f = 350.0;
            // this.chassis.applyImpulse({ x: 0, y: f * dt, z: 0 }, true);
        }
    }

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        const rot = this.chassis.rotation();
        const rotateVector = (v) => {
            const qx = rot.x, qy = rot.y, qz = rot.z, qw = rot.w;
            const ix =  qw * v.x + qy * v.z - qz * v.y;
            const iy =  qw * v.y + qz * v.x - qx * v.z;
            const iz =  qw * v.z + qx * v.y - qy * v.x;
            const iw = -qx * v.x - qy * v.y - qz * v.z;

            return {
                x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
                y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
                z: iz * qw + iw * -qz + ix * -qy - iy * -qx
            };
        };

        if (this.type === 'HELICOPTER') {
            const throttle = (input.throttleUp ? 1 : 0) - (input.throttleDown ? 1 : 0);
            const yawInput = (input.yawRight ? 1 : 0) - (input.yawLeft ? 1 : 0);
            const pitchInput = -(input.y || 0);
            const rollInput = input.x || 0;

            this.rotorRpm = Math.min(this.maxRotorRpm, Math.max(0, this.rotorRpm + throttle * 0.9 * dt));

            const mass = this.chassis.mass();
            const liftForce = mass * 9.81 * (0.8 + this.rotorRpm * 0.8);
            this.chassis.applyImpulse({ x: 0, y: liftForce * dt, z: 0 }, true);

            const forward = rotateVector({ x: 0, y: 0, z: -1 });
            const right = rotateVector({ x: 1, y: 0, z: 0 });

            const forwardThrust = pitchInput * this.rotorRpm * mass * 20 * dt;
            const rightThrust = rollInput * this.rotorRpm * mass * 20 * dt;

            this.chassis.applyImpulse({
                x: forward.x * forwardThrust + right.x * rightThrust,
                y: forward.y * forwardThrust + right.y * rightThrust,
                z: forward.z * forwardThrust + right.z * rightThrust
            }, true);

            const torqueScale = mass * 0.6 * dt;
            this.chassis.applyTorqueImpulse({
                x: rollInput * torqueScale,
                y: yawInput * torqueScale * 2.0,
                z: pitchInput * torqueScale
            }, true);

            // Simple stabilization to keep the helicopter from tumbling while still allowing flips
            this.chassis.applyTorqueImpulse({
                x: -rot.x * 0.4,
                y: -rot.y * 0.1,
                z: -rot.z * 0.4
            }, true);

            this.chassis.setLinearDamping(0.35);
            this.chassis.setAngularDamping(1.1);
            return;
        }

        // Vehicle-specific tuning
        const engineForce = this.type === 'TANK' ? 11000 : 7500;
        const maxSpeed = this.type === 'TANK' ? 18 : 26;
        const steerTorque = this.type === 'TANK' ? 2200 : 1600;
        const lateralStiffness = this.type === 'TANK' ? 0.35 : 0.5;

        const forwardInput = input.y || 0;
        const steerInput = input.x || 0;

        const forward = rotateVector({ x: 0, y: 0, z: -1 });
        const right = rotateVector({ x: 1, y: 0, z: 0 });

        const velocity = this.chassis.linvel();
        const forwardSpeed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
        const rightSpeed = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;

        const mass = this.chassis.mass();
        const targetSpeed = maxSpeed * forwardInput;
        const speedError = targetSpeed - forwardSpeed;
        const accelImpulse = Math.max(-engineForce, Math.min(engineForce, speedError * mass)) * dt;

        // Apply acceleration/braking along the chassis forward vector
        const throttleImpulse = {
            x: forward.x * accelImpulse,
            y: forward.y * accelImpulse,
            z: forward.z * accelImpulse
        };
        this.chassis.applyImpulse(throttleImpulse, true);

        // Stabilize sideways slip to keep the vehicle planted
        const lateralImpulseMag = -rightSpeed * mass * lateralStiffness;
        const lateralImpulse = {
            x: right.x * lateralImpulseMag * dt,
            y: right.y * lateralImpulseMag * dt,
            z: right.z * lateralImpulseMag * dt
        };
        this.chassis.applyImpulse(lateralImpulse, true);

        // Steering via torque instead of hard rotation snapping
        const angularVel = this.chassis.angvel();
        const spinAssist = this.type === 'TANK' ? 2.5 : 1.0;
        const targetYawRate = steerInput * steerTorque * spinAssist;
        const yawRateError = targetYawRate - angularVel.y;
        const steerImpulse = { x: 0, y: yawRateError * dt, z: 0 };
        this.chassis.applyTorqueImpulse(steerImpulse, true);

        // Mild damping keeps the vehicle controllable and prevents runaway speeds
        this.chassis.setLinearDamping(0.16);
        this.chassis.setAngularDamping(0.55);

        // Keep the chassis mostly upright without removing the possibility of flipping
        this.chassis.applyTorqueImpulse({
            x: -rot.x * 0.35,
            y: 0,
            z: -rot.z * 0.35
        }, true);
    }

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        return {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w
        };
    }
}
