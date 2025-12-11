import RAPIER from '@dimforge/rapier3d-compat';

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type; // JEEP, TANK, HELICOPTER
        this.world = world;
        
        this.bodies = []; // Track bodies to destroy later
        this.joints = [];
        this.wheels = []; // { body, joint, axis }
        
        this.health = 100;
        this.maxHealth = 100;
        this.seats = [];

        // Physics state
        this.suspension = [];
        this.suspensionState = [];
        this.trackOffset = 0;
        this.lastDriverInput = { x: 0, y: 0 };

        // Helicopter rotor state
        this.currentRPM = 0;
        this.targetRPM = 0;
        this.maxRPM = 1200;
        this.rpmSpoolRate = 1.5; // Lerp speed
        this.rpmLiftThreshold = 0.6;

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
                .setLinearDamping(0.5)
                .setAngularDamping(1.0);

            this.chassis = this.world.createRigidBody(bodyDesc);
            const collider = RAPIER.ColliderDesc.cuboid(1.5, 1.0, 3.0);
        this.world.createCollider(collider, this.chassis);
        this.bodies.push(this.chassis);
        return;
    }

        // Land Vehicles (Jeep, Tank)
        const isTank = this.type === 'TANK';
        const width = isTank ? 1.6 : 1.1;
        const length = isTank ? 3.2 : 2.2;
        const mass = isTank ? 5000 : 500;

        // 1. Chassis
        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 1, position.z)
            .setAdditionalMass(mass);
        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.5, length);
        this.world.createCollider(chassisColl, chassis);
        this.bodies.push(chassis);
        this.chassis = chassis;

        // Lower center of mass for stability while keeping physics-driven roll
        this.chassis.setAdditionalMassProperties(mass, { x: 0, y: -1.0, z: 0 });

        if (isTank) {
            const skirtCollider = RAPIER.ColliderDesc.cuboid(width + 0.1, 0.3, length)
                .setTranslation({ x: 0, y: -0.4, z: 0 })
                .setFriction(4.0);
            this.world.createCollider(skirtCollider, chassis);
            this.chassis.setAngularDamping(5.0);
            this.chassis.setLinearDamping(0.2);
        } else {
            const wheelBase = width + 0.4;
            const forwardOffset = length - 0.3;
            this.suspension = [
                { x: -wheelBase, y: -0.2, z: forwardOffset },
                { x: wheelBase, y: -0.2, z: forwardOffset },
                { x: -wheelBase, y: -0.2, z: -forwardOffset },
                { x: wheelBase, y: -0.2, z: -forwardOffset },
            ];
            this.suspensionState = new Array(this.suspension.length).fill(null);
            this.chassis.setAngularDamping(0.8);
            this.chassis.setLinearDamping(0.12);
        }
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
            this.updateRotor(dt);
        }

        if (this.type === 'JEEP') {
            this.applyRaycastSuspension(dt);
        }

        if (this.type === 'TANK') {
            // Keep track animation in sync with speed
            const speed = this.vectorLength(this.chassis.linvel());
            this.trackOffset += speed * dt * 2.0;
        }
    }

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        this.lastDriverInput = { x: input?.drive?.x || 0, y: input?.drive?.y || 0 };

        // Vehicle-specific tuning
        if (this.type === 'HELICOPTER') {
            this.applyHelicopterInput(input, dt);
            return;
        }

        const engineForce = this.type === 'TANK' ? 18000 : 9000;
        const maxSpeed = this.type === 'TANK' ? 14 : 26;
        const steerTorque = this.type === 'TANK' ? 2800 : 1600;
        const lateralStiffness = this.type === 'TANK' ? 0.55 : 0.6;

        const forwardInput = this.lastDriverInput.y || 0;
        const steerInput = this.lastDriverInput.x || 0;

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
        const targetYawRate = steerInput * steerTorque;
        const yawRateError = targetYawRate - angularVel.y;
        const steerImpulse = { x: 0, y: yawRateError * dt, z: 0 };
        this.chassis.applyTorqueImpulse(steerImpulse, true);

        // Differential steering at low speed for the tank
        if (this.type === 'TANK' && Math.abs(forwardSpeed) < 0.5 && Math.abs(rightSpeed) < 0.5 && Math.abs(steerInput) > 0.01) {
            const trackSpacing = 1.6;
            const trackForce = steerInput * engineForce * 0.5 * dt;
            const leftPoint = { x: -trackSpacing, y: 0, z: 0 };
            const rightPoint = { x: trackSpacing, y: 0, z: 0 };
            const forwardDir = this.normalize(forward);
            const leftImpulse = { x: forwardDir.x * trackForce, y: forwardDir.y * trackForce, z: forwardDir.z * trackForce };
            const rightImpulse = { x: -forwardDir.x * trackForce, y: -forwardDir.y * trackForce, z: -forwardDir.z * trackForce };
            const worldLeft = this.localToWorld(leftPoint);
            const worldRight = this.localToWorld(rightPoint);
            this.chassis.applyImpulseAtPoint(leftImpulse, worldLeft, true);
            this.chassis.applyImpulseAtPoint(rightImpulse, worldRight, true);
        }
    }

    applyRaycastSuspension(dt) {
        if (!this.suspension?.length) return;

        const rot = this.chassis.rotation();
        const up = this.rotateVector({ x: 0, y: 1, z: 0 }, rot);
        const downDir = { x: -up.x, y: -up.y, z: -up.z };
        const basePos = this.chassis.translation();
        const angVel = this.chassis.angvel();
        const linVel = this.chassis.linvel();

        const springK = 18000;
        const damperB = 1200;
        const restLength = 1.1;

        this.suspension.forEach((localOffset, i) => {
            const origin = this.localToWorld(localOffset);

            const ray = new RAPIER.Ray(origin, downDir);
            const hit = this.world.castRay(ray, restLength + 0.5, true);

            let applied = null;
            if (hit && hit.toi !== undefined && hit.colliderHandle !== this.chassisHandle) {
                const dist = hit.toi;
                const compression = Math.max(0, restLength - dist);
                const point = ray.pointAt(dist);
                const contactPoint = { x: point.x, y: point.y, z: point.z };

                // Velocity at contact point
                const r = {
                    x: contactPoint.x - basePos.x,
                    y: contactPoint.y - basePos.y,
                    z: contactPoint.z - basePos.z,
                };

                const relVel = {
                    x: linVel.x + angVel.y * r.z - angVel.z * r.y,
                    y: linVel.y + angVel.z * r.x - angVel.x * r.z,
                    z: linVel.z + angVel.x * r.y - angVel.y * r.x,
                };

                const velAlongSpring = relVel.x * downDir.x + relVel.y * downDir.y + relVel.z * downDir.z;

                const springForce = springK * compression;
                const damperForce = damperB * velAlongSpring;
                const totalForce = Math.max(0, springForce - damperForce);
                const impulseMag = totalForce * dt;
                const impulse = {
                    x: up.x * impulseMag,
                    y: up.y * impulseMag,
                    z: up.z * impulseMag,
                };

                this.chassis.applyImpulseAtPoint(impulse, contactPoint, true);
                applied = { contactPoint, compression };
            }

            this.suspensionState[i] = applied;
        });
    }

    applyHelicopterInput(input, dt) {
        const rpmUp = input.rpmUp ? 1 : 0;
        const rpmDown = input.rpmDown ? 1 : 0;
        this.targetRPM = rpmUp ? this.maxRPM : (rpmDown ? this.maxRPM * 0.2 : this.targetRPM);

        // Smooth spool
        const lerp = (a, b, t) => a + (b - a) * t;
        this.currentRPM = lerp(this.currentRPM, this.targetRPM, this.rpmSpoolRate * dt);

        const rpmRatio = this.currentRPM / this.maxRPM;
        if (rpmRatio > this.rpmLiftThreshold) {
            const excess = rpmRatio - this.rpmLiftThreshold;
            const liftForce = excess * 18000 * dt;
            const up = this.rotateVector({ x: 0, y: 1, z: 0 }, this.chassis.rotation());
            this.chassis.applyImpulse({ x: up.x * liftForce, y: up.y * liftForce, z: up.z * liftForce }, true);
        }

        const pitchInput = input.pitch || 0;
        const rollInput = input.roll || 0;
        const yawInput = input.yaw || 0;

        // Apply torques around local axes
        const torqueScale = 450;
        const right = this.rotateVector({ x: 1, y: 0, z: 0 }, this.chassis.rotation());
        const forward = this.rotateVector({ x: 0, y: 0, z: -1 }, this.chassis.rotation());

        const pitchTorque = { x: right.x * pitchInput * torqueScale * dt, y: right.y * pitchInput * torqueScale * dt, z: right.z * pitchInput * torqueScale * dt };
        const rollTorque = { x: forward.x * -rollInput * torqueScale * dt, y: forward.y * -rollInput * torqueScale * dt, z: forward.z * -rollInput * torqueScale * dt };
        const yawTorque = { x: 0, y: yawInput * torqueScale * dt, z: 0 };

        this.chassis.applyTorqueImpulse(pitchTorque, true);
        this.chassis.applyTorqueImpulse(rollTorque, true);
        this.chassis.applyTorqueImpulse(yawTorque, true);
    }

    updateRotor(dt) {
        // Gradually bleed RPM towards idle when not actively spooling
        if (this.targetRPM === 0) {
            this.targetRPM = this.maxRPM * 0.2;
        }
        const lerp = (a, b, t) => a + (b - a) * t;
        this.currentRPM = lerp(this.currentRPM, this.targetRPM, this.rpmSpoolRate * dt);
    }

    rotateVector(v, rot = this.chassis.rotation()) {
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
    }

    localToWorld(v) {
        const rotated = this.rotateVector(v);
        const base = this.chassis.translation();
        return { x: base.x + rotated.x, y: base.y + rotated.y, z: base.z + rotated.z };
    }

    vectorLength(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }

    normalize(v) {
        const len = this.vectorLength(v) || 1;
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        return {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w,
            wheels: this.suspensionState?.map((s, idx) => {
                if (!s) return null;
                return {
                    contact: s.contactPoint,
                    compression: s.compression,
                    index: idx
                };
            }) || [],
            rpm: this.currentRPM,
            maxRpm: this.maxRPM,
            trackOffset: this.trackOffset
        };
    }
}
