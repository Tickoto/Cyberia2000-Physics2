import RAPIER from '@dimforge/rapier3d-compat';

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type; // JEEP, TANK, HELICOPTER
        this.world = world;
        
        this.bodies = []; // Track bodies to destroy later
        this.joints = [];
        this.wheels = []; // Visual/physics wheel slots
        this.wheelOffsets = [];
        this.wheelStates = [];

        this.trackAnimOffset = 0;

        this.heliState = {
            currentRPM: 0,
            targetRPM: 0,
            maxRPM: 2200,
            idleRPM: 150,
            liftThreshold: 0.6
        };

        this.suspension = null;
        
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
        const width = isTank ? 1.5 : 1.0;
        const length = isTank ? 3.0 : 2.0;
        const mass = isTank ? 2000 : 500;

        // 1. Chassis
        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 1, position.z)
            .setAdditionalMassProperties(mass, { x: 0, y: -1.0, z: 0 });
        chassisDesc.setLinearDamping(isTank ? 0.25 : 0.08);
        chassisDesc.setAngularDamping(isTank ? 2.5 : 0.6);
        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.5, length)
            .setFriction(isTank ? 3.5 : 1.8);
        this.world.createCollider(chassisColl, chassis);
        this.bodies.push(chassis);
        this.chassis = chassis;

        // 2. Wheels (Raycast suspension contact points)
        const wheelRadius = isTank ? 0.6 : 0.45;
        const wheelWidth = isTank ? 0.4 : 0.25;
        const xOff = width + wheelWidth / 2 + 0.1;
        const yOff = -0.3;
        const zOff = length - 0.5;

        // Front Left, Front Right, Rear Left, Rear Right
        this.wheelOffsets = [
            { x: -xOff, y: yOff, z: zOff },
            { x: xOff, y: yOff, z: zOff },
            { x: -xOff, y: yOff, z: -zOff },
            { x: xOff, y: yOff, z: -zOff }
        ];

        this.wheelStates = this.wheelOffsets.map(() => ({ contact: null, compression: 0 }));
        this.suspension = {
            restLength: isTank ? 0.55 : 0.75,
            stiffness: isTank ? 22000 : 12000,
            damping: isTank ? 2600 : 1800,
            wheelRadius,
            lateralStiffness: isTank ? 0.5 : 0.35
        };
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
        const rotated = this.rotateVector(offset, r);

        return {
            x: t.x + rotated.x,
            y: t.y + rotated.y,
            z: t.z + rotated.z,
        };
    }

    update(dt) {
        if (this.type === 'HELICOPTER') {
            this.updateHelicopter(dt);
        } else {
            this.applyRaycastSuspension(dt);
        }
    }

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        if (this.type === 'HELICOPTER') {
            this.applyHelicopterInput(input, dt);
            return;
        }

        const isTank = this.type === 'TANK';

        // Vehicle-specific tuning
        const engineForce = isTank ? 14000 : 8500;
        const maxSpeed = isTank ? 14 : 28;
        const steerTorque = isTank ? 3200 : 1800;
        const lateralStiffness = this.suspension?.lateralStiffness || (isTank ? 0.5 : 0.35);

        const forwardInput = input.y || 0;
        const steerInput = input.x || 0;

        const rot = this.chassis.rotation();
        const forward = this.rotateVector({ x: 0, y: 0, z: -1 }, rot);
        const right = this.rotateVector({ x: 1, y: 0, z: 0 }, rot);

        const velocity = this.chassis.linvel();
        const forwardSpeed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
        const rightSpeed = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;

        const mass = this.chassis.mass();
        const targetSpeed = maxSpeed * forwardInput;
        const speedError = targetSpeed - forwardSpeed;
        const accelImpulse = Math.max(-engineForce, Math.min(engineForce, speedError * mass)) * dt;

        // Apply acceleration/braking along the chassis forward vector (local space)
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

        // Neutral turn for tanks when nearly stopped
        const speedMagnitude = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
        if (isTank && speedMagnitude < 0.5 && Math.abs(steerInput) > 0.1 && this.wheelOffsets.length >= 2) {
            const turnForce = steerInput * engineForce * 0.6 * dt;
            const leftPoint = this.getWheelWorldPosition(0);
            const rightPoint = this.getWheelWorldPosition(1);
            if (leftPoint && rightPoint && this.chassis.applyImpulseAtPoint) {
                const forwardImpulse = { x: forward.x * turnForce, y: forward.y * turnForce, z: forward.z * turnForce };
                const backwardImpulse = { x: -forward.x * turnForce, y: -forward.y * turnForce, z: -forward.z * turnForce };
                this.chassis.applyImpulseAtPoint(forwardImpulse, leftPoint, true);
                this.chassis.applyImpulseAtPoint(backwardImpulse, rightPoint, true);
            }
        }
    }

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        const wheels = this.wheelStates.map((w, idx) => {
            const contact = w.contact || this.getWheelWorldPosition(idx) || { x: t.x, y: t.y, z: t.z };
            return { x: Number(contact.x.toFixed(3)), y: Number(contact.y.toFixed(3)), z: Number(contact.z.toFixed(3)) };
        });
        return {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w,
            rpm: this.heliState.currentRPM,
            maxRPM: this.heliState.maxRPM,
            wheels,
            trackOffset: this.trackAnimOffset
        };
    }

    rotateVector(v, rotation = null) {
        const r = rotation || this.chassis.rotation();
        const qx = r.x, qy = r.y, qz = r.z, qw = r.w;
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

    getWheelWorldPosition(index) {
        if (!this.chassis || !this.wheelOffsets[index]) return null;
        const offset = this.wheelOffsets[index];
        const rotated = this.rotateVector(offset);
        const t = this.chassis.translation();
        return { x: t.x + rotated.x, y: t.y + rotated.y, z: t.z + rotated.z };
    }

    getVelocityAtPoint(worldPoint) {
        const lin = this.chassis.linvel();
        const ang = this.chassis.angvel();
        const com = this.chassis.translation();
        const rel = { x: worldPoint.x - com.x, y: worldPoint.y - com.y, z: worldPoint.z - com.z };
        const cross = {
            x: ang.y * rel.z - ang.z * rel.y,
            y: ang.z * rel.x - ang.x * rel.z,
            z: ang.x * rel.y - ang.y * rel.x
        };
        return {
            x: lin.x + cross.x,
            y: lin.y + cross.y,
            z: lin.z + cross.z
        };
    }

    applyRaycastSuspension(dt) {
        if (!this.chassis || !this.suspension) return;

        const downDir = this.rotateVector({ x: 0, y: -1, z: 0 });
        const rayLength = this.suspension.restLength + this.suspension.wheelRadius;

        this.wheelOffsets.forEach((offset, idx) => {
            const origin = this.getWheelWorldPosition(idx);
            if (!origin) return;

            const ray = new RAPIER.Ray(origin, downDir);
            const hit = this.world.castRay(ray, rayLength, true, undefined, undefined, undefined, this.chassis);

            let contactPoint = null;
            let compression = 0;
            if (hit) {
                const hitPoint = ray.pointAt(hit.toi);
                contactPoint = { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };
                const distance = hit.toi * rayLength;
                compression = Math.max(0, this.suspension.restLength - (distance - this.suspension.wheelRadius));

                const velAtPoint = this.getVelocityAtPoint(origin);
                const velAlong = velAtPoint.x * downDir.x + velAtPoint.y * downDir.y + velAtPoint.z * downDir.z;
                const springForce = compression * this.suspension.stiffness;
                const damperForce = velAlong * this.suspension.damping;
                const forceMag = Math.max(0, springForce - damperForce);
                const applicationPoint = contactPoint || origin;
                const impulse = {
                    x: -downDir.x * forceMag * dt,
                    y: -downDir.y * forceMag * dt,
                    z: -downDir.z * forceMag * dt
                };

                if (this.chassis.applyImpulseAtPoint) {
                    this.chassis.applyImpulseAtPoint(impulse, applicationPoint, true);
                } else {
                    this.chassis.applyImpulse(impulse, true);
                }
            } else {
                contactPoint = { x: origin.x, y: origin.y - this.suspension.restLength, z: origin.z };
            }

            this.wheelStates[idx] = { contact: contactPoint, compression };
        });

        // Small body-roll inducement for jeeps to feel agile
        if (this.type === 'JEEP') {
            const angularVel = this.chassis.angvel();
            this.chassis.applyTorqueImpulse({ x: -angularVel.x * 0.25 * dt, y: 0, z: -angularVel.z * 0.25 * dt }, true);
        }

        // Track animation offset for visual purposes
        const speed = this.chassis.linvel();
        const forward = this.rotateVector({ x: 0, y: 0, z: -1 });
        const forwardSpeed = speed.x * forward.x + speed.y * forward.y + speed.z * forward.z;
        this.trackAnimOffset += forwardSpeed * dt;
    }

    applyHelicopterInput(input, dt) {
        const rpmUp = input.jump || input.heliRpmUp;
        const rpmDown = input.heliRpmDown || false;
        this.heliState.targetRPM = rpmUp ? this.heliState.maxRPM : (rpmDown ? this.heliState.idleRPM : this.heliState.targetRPM);

        const pitchInput = input.heliPitch || 0;
        const rollInput = input.heliRoll || 0;
        const yawInput = input.heliYaw || 0;

        const rpmRatio = Math.max(0, Math.min(1, this.heliState.currentRPM / this.heliState.maxRPM));
        const authority = rpmRatio > this.heliState.liftThreshold ? rpmRatio : rpmRatio * 0.25;

        const rot = this.chassis.rotation();
        const forward = this.rotateVector({ x: 0, y: 0, z: -1 }, rot);
        const right = this.rotateVector({ x: 1, y: 0, z: 0 }, rot);
        const up = this.rotateVector({ x: 0, y: 1, z: 0 }, rot);

        const torqueScale = 2400 * authority * dt;

        const pitchTorque = { x: right.x * torqueScale * pitchInput, y: right.y * torqueScale * pitchInput, z: right.z * torqueScale * pitchInput };
        const rollTorque = { x: forward.x * torqueScale * -rollInput, y: forward.y * torqueScale * -rollInput, z: forward.z * torqueScale * -rollInput };
        const yawTorque = { x: up.x * torqueScale * yawInput * 0.6, y: up.y * torqueScale * yawInput * 0.6, z: up.z * torqueScale * yawInput * 0.6 };

        this.chassis.applyTorqueImpulse(pitchTorque, true);
        this.chassis.applyTorqueImpulse(rollTorque, true);
        this.chassis.applyTorqueImpulse(yawTorque, true);

        // Forward drift based on tilt so it actually moves when pitching
        const liftPower = 4200 * rpmRatio;
        const liftImpulse = { x: up.x * liftPower * dt, y: up.y * liftPower * dt, z: up.z * liftPower * dt };

        if (rpmRatio > this.heliState.liftThreshold) {
            this.chassis.applyImpulse(liftImpulse, true);
        }

        // Add slight thrust in the forward direction proportional to pitch to make directional flight responsive
        const forwardThrust = pitchInput * liftPower * 0.25;
        const lateralThrust = rollInput * liftPower * 0.2;
        const forwardImpulse = { x: forward.x * forwardThrust * dt, y: forward.y * forwardThrust * dt, z: forward.z * forwardThrust * dt };
        const lateralImpulse = { x: right.x * lateralThrust * dt, y: right.y * lateralThrust * dt, z: right.z * lateralThrust * dt };
        this.chassis.applyImpulse(forwardImpulse, true);
        this.chassis.applyImpulse(lateralImpulse, true);

        // Aerodynamic damping to keep motion manageable
        const lin = this.chassis.linvel();
        this.chassis.applyImpulse({ x: -lin.x * 0.1 * dt, y: -lin.y * 0.05 * dt, z: -lin.z * 0.1 * dt }, true);
        const ang = this.chassis.angvel();
        this.chassis.applyTorqueImpulse({ x: -ang.x * 0.25 * dt, y: -ang.y * 0.35 * dt, z: -ang.z * 0.25 * dt }, true);
    }

    updateHelicopter(dt) {
        // Spool
        const inertia = 1.5; // slower response
        this.heliState.currentRPM = this.heliState.currentRPM + (this.heliState.targetRPM - this.heliState.currentRPM) * Math.min(1, dt * inertia);

        const rpmRatio = this.heliState.currentRPM / this.heliState.maxRPM;
        if (rpmRatio < this.heliState.liftThreshold) return;

        const rot = this.chassis.rotation();
        const up = this.rotateVector({ x: 0, y: 1, z: 0 }, rot);
        const liftPower = 3800 * (rpmRatio - this.heliState.liftThreshold);
        const liftImpulse = { x: up.x * liftPower * dt, y: up.y * liftPower * dt, z: up.z * liftPower * dt };
        this.chassis.applyImpulse(liftImpulse, true);
    }
}
