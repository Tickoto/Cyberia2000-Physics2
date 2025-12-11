import RAPIER from '@dimforge/rapier3d-compat';

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type; // JEEP, TANK, HELICOPTER
        this.world = world;
        
        this.bodies = []; // Track bodies to destroy later
        this.joints = [];
        this.wheels = []; // Visual/physics wheel anchors

        // Helicopter rotor state
        this.maxRPM = 2400;
        this.idleRPM = 600;
        this.currentRPM = 0;
        this.targetRPM = this.idleRPM;
        this.rotorControl = { pitch: 0, roll: 0, yaw: 0 };

        this.suspensionConfig = {
            restLength: 1.2,
            stiffness: 18000,
            damping: 3200,
            wheelRadius: 0.45
        };

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
                .setAngularDamping(1.2)
                .setAdditionalMassProperties(1500, undefined, undefined, undefined);

            this.chassis = this.world.createRigidBody(bodyDesc);
            const collider = RAPIER.ColliderDesc.cuboid(1.5, 1.0, 3.0)
                .setFriction(0.2)
                .setRestitution(0.05);
            this.world.createCollider(collider, this.chassis);
            this.bodies.push(this.chassis);
            this.currentRPM = this.idleRPM;
            return;
        }

        // Land Vehicles (Jeep, Tank)
        const isTank = this.type === 'TANK';
        const width = isTank ? 1.6 : 1.0;
        const length = isTank ? 3.2 : 2.1;
        const mass = isTank ? 5000 : 500;

        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 1, position.z)
            .setAdditionalMassProperties(mass, { x: 0, y: -1.0, z: 0 }, undefined, undefined)
            .setLinearDamping(isTank ? 0.3 : 0.12)
            .setAngularDamping(isTank ? 2.5 : 0.45);

        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.6, length)
            .setFriction(isTank ? 4.5 : 2.2);
        this.world.createCollider(chassisColl, chassis);
        this.bodies.push(chassis);
        this.chassis = chassis;

        const wheelXOff = width + 0.35;
        const wheelZOff = length - 0.5;
        this.wheels = [
            { x: -wheelXOff, y: -0.5, z: wheelZOff },
            { x: wheelXOff, y: -0.5, z: wheelZOff },
            { x: -wheelXOff, y: -0.5, z: -wheelZOff },
            { x: wheelXOff, y: -0.5, z: -wheelZOff }
        ];
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
        if (!this.chassis) return;

        if (this.type === 'HELICOPTER') {
            this.updateRotor(dt);
            return;
        }

        this.applySuspensionForces(dt);
    }

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        const forwardInput = input.y || 0;
        const steerInput = input.x || 0;

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
        const up = rotateVector({ x: 0, y: 1, z: 0 });

        if (this.type === 'HELICOPTER') {
            const desiredRPM = input.jump ? this.maxRPM : (input.rpmDown ? this.idleRPM * 0.5 : this.idleRPM);
            this.targetRPM = desiredRPM;
            this.rotorControl = {
                pitch: input.pitch || 0,
                roll: input.roll || 0,
                yaw: input.yaw || 0,
                strafe: input.x || 0,
                advance: input.y || 0
            };
            return;
        }

        const isTank = this.type === 'TANK';
        const engineForce = isTank ? 16000 : 9000;
        const maxSpeed = isTank ? 14 : 28;
        const steerTorque = isTank ? 2800 : 1700;
        const lateralStiffness = isTank ? 0.5 : 0.7;

        const velocity = this.chassis.linvel();
        const forwardSpeed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
        const rightSpeed = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;

        const mass = this.chassis.mass();
        const targetSpeed = maxSpeed * forwardInput;
        const speedError = targetSpeed - forwardSpeed;
        const accelImpulse = Math.max(-engineForce, Math.min(engineForce, speedError * mass)) * dt;

        const throttleImpulse = {
            x: forward.x * accelImpulse,
            y: forward.y * accelImpulse,
            z: forward.z * accelImpulse
        };
        this.chassis.applyImpulse(throttleImpulse, true);

        const lateralImpulseMag = -rightSpeed * mass * lateralStiffness * dt;
        const lateralImpulse = {
            x: right.x * lateralImpulseMag,
            y: right.y * lateralImpulseMag,
            z: right.z * lateralImpulseMag
        };
        this.chassis.applyImpulse(lateralImpulse, true);

        const angularVel = this.chassis.angvel();
        const targetYawRate = steerInput * (steerTorque / (isTank ? 1.5 : 1));
        const yawRateError = targetYawRate - angularVel.y;
        const steerImpulse = { x: 0, y: yawRateError * dt, z: 0 };
        this.chassis.applyTorqueImpulse(steerImpulse, true);

        if (isTank && Math.abs(forwardSpeed) < 1 && Math.abs(steerInput) > 0.1) {
            const trackForce = steerInput * engineForce * 0.6 * dt;
            const leftPoint = this.getWorldOffset({ x: -1.2, y: -0.4, z: 0 }, forward, right, up);
            const rightPoint = this.getWorldOffset({ x: 1.2, y: -0.4, z: 0 }, forward, right, up);
            const forwardImpulse = { x: forward.x * trackForce, y: forward.y * trackForce, z: forward.z * trackForce };
            const reverseImpulse = { x: -forwardImpulse.x, y: -forwardImpulse.y, z: -forwardImpulse.z };
            this.applyImpulseAtPoint(forwardImpulse, leftPoint);
            this.applyImpulseAtPoint(reverseImpulse, rightPoint);
        }

        this.chassis.setLinearDamping(isTank ? 0.35 : 0.14);
        this.chassis.setAngularDamping(isTank ? 2.6 : 0.5);
    }

    getWorldOffset(offset, forward, right, up) {
        const t = this.chassis.translation();
        return {
            x: t.x + right.x * offset.x + up.x * offset.y + forward.x * offset.z,
            y: t.y + right.y * offset.x + up.y * offset.y + forward.y * offset.z,
            z: t.z + right.z * offset.x + up.z * offset.y + forward.z * offset.z
        };
    }

    applyImpulseAtPoint(impulse, point) {
        const t = this.chassis.translation();
        const rel = { x: point.x - t.x, y: point.y - t.y, z: point.z - t.z };
        const torque = {
            x: rel.y * impulse.z - rel.z * impulse.y,
            y: rel.z * impulse.x - rel.x * impulse.z,
            z: rel.x * impulse.y - rel.y * impulse.x
        };
        this.chassis.applyImpulse(impulse, true);
        this.chassis.applyTorqueImpulse(torque, true);
    }

    applySuspensionForces(dt) {
        if (!this.chassis || !this.wheels.length) return;

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

        const up = rotateVector({ x: 0, y: 1, z: 0 });
        const right = rotateVector({ x: 1, y: 0, z: 0 });
        const forward = rotateVector({ x: 0, y: 0, z: -1 });
        const t = this.chassis.translation();
        const velocity = this.chassis.linvel();

        this.wheels.forEach((offset) => {
            const worldPoint = this.getWorldOffset(offset, forward, right, up);
            const start = {
                x: worldPoint.x + up.x * 0.2,
                y: worldPoint.y + up.y * 0.2,
                z: worldPoint.z + up.z * 0.2
            };
            const ray = new RAPIER.Ray(start, { x: -up.x, y: -up.y, z: -up.z });
            const maxLength = this.suspensionConfig.restLength + this.suspensionConfig.wheelRadius;
            const hit = this.world.castRay(ray, maxLength, true);

            if (!hit) return;
            const collider = this.world.getCollider(hit.collider || hit.colliderHandle);
            if (collider && collider.parent() && collider.parent().handle === this.chassis.handle) return;

            const distance = hit.toi;
            const compression = Math.max(0, this.suspensionConfig.restLength - distance);
            if (compression <= 0) return;

            const velAlong = velocity.x * up.x + velocity.y * up.y + velocity.z * up.z;
            const springForce = this.suspensionConfig.stiffness * compression;
            const damperForce = this.suspensionConfig.damping * velAlong;
            const forceMag = (springForce - damperForce) * dt;

            const impulse = { x: up.x * forceMag, y: up.y * forceMag, z: up.z * forceMag };
            const contactPoint = ray.pointAt(distance);
            this.applyImpulseAtPoint(impulse, contactPoint);
        });
    }

    updateRotor(dt) {
        const lerpFactor = 1 - Math.exp(-dt * 2.5);
        this.currentRPM = this.currentRPM + (this.targetRPM - this.currentRPM) * lerpFactor;

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

        const up = rotateVector({ x: 0, y: 1, z: 0 });
        const forward = rotateVector({ x: 0, y: 0, z: -1 });
        const right = rotateVector({ x: 1, y: 0, z: 0 });

        const rpmRatio = this.currentRPM / this.maxRPM;
        if (rpmRatio > 0.6) {
            const liftCurve = Math.max(0, (rpmRatio - 0.6) / 0.4);
            const mass = this.chassis.mass();
            const liftForce = 9.81 * mass * (0.9 + liftCurve * 1.2);
            const liftImpulse = { x: up.x * liftForce * dt, y: up.y * liftForce * dt, z: up.z * liftForce * dt };
            this.chassis.applyImpulse(liftImpulse, true);
        }

        const controlTorque = {
            x: right.x * this.rotorControl.pitch * 800 * dt + forward.x * -this.rotorControl.roll * 800 * dt,
            y: up.y * this.rotorControl.yaw * 600 * dt,
            z: right.z * this.rotorControl.pitch * 800 * dt + forward.z * -this.rotorControl.roll * 800 * dt
        };
        this.chassis.applyTorqueImpulse(controlTorque, true);

        const translationalForce = {
            x: (forward.x * (this.rotorControl.advance || 0) + right.x * (this.rotorControl.strafe || 0)) * 2200 * rpmRatio * dt,
            y: (forward.y * (this.rotorControl.advance || 0) + right.y * (this.rotorControl.strafe || 0)) * 2200 * rpmRatio * dt,
            z: (forward.z * (this.rotorControl.advance || 0) + right.z * (this.rotorControl.strafe || 0)) * 2200 * rpmRatio * dt,
        };
        this.chassis.applyImpulse(translationalForce, true);

        const vel = this.chassis.linvel();
        const dampingImpulse = {
            x: -vel.x * 0.15 * dt,
            y: -vel.y * 0.08 * dt,
            z: -vel.z * 0.15 * dt
        };
        this.chassis.applyImpulse(dampingImpulse, true);
    }

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        const payload = {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w
        };
        if (this.type === 'HELICOPTER') {
            payload.rpm = this.currentRPM;
            payload.maxRPM = this.maxRPM;
        }
        return payload;
    }
}
