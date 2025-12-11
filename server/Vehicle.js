import RAPIER from '@dimforge/rapier3d-compat';

const VEHICLE_PROFILES = {
    JEEP: {
        mass: 750,
        width: 1.0,
        length: 2.2,
        centerOfMassOffset: -0.8,
        suspension: { restLength: 0.9, spring: 22000, damper: 4200, radius: 0.45 },
        engineForce: 9500,
        maxSpeed: 28,
        steerTorque: 2600,
        lateralStiffness: 0.55,
        microSlipImpulse: 1200,
        linearDamping: 0.18,
        angularDamping: 0.6,
        friction: 3.0
    },
    TANK: {
        mass: 7500,
        width: 1.6,
        length: 3.5,
        centerOfMassOffset: -1.0,
        suspension: { restLength: 0.7, spring: 42000, damper: 7500, radius: 0.55 },
        engineForce: 14000,
        maxSpeed: 16,
        steerTorque: 3200,
        lateralStiffness: 0.25,
        microSlipImpulse: 800,
        linearDamping: 0.35,
        angularDamping: 1.8,
        friction: 4.5,
        neutralTurnTorque: 5200,
        neutralSpeedThreshold: 1.5
    },
    HELICOPTER: {
        bodySize: { x: 1.5, y: 1.0, z: 3.0 },
        maxRPM: 2200,
        idleRPM: 300,
        spoolRate: 0.9,
        liftForce: 8200,
        cyclicForce: 2600,
        pitchTorque: 950,
        rollTorque: 950,
        yawTorque: 720,
        linearDamping: 0.05,
        angularDamping: 1.1
    }
};

export default class Vehicle {
    constructor(id, type, world, position = { x: 0, y: 2, z: 0 }) {
        this.id = id;
        this.type = type; // JEEP, TANK, HELICOPTER
        this.world = world;

        this.bodies = []; // Track bodies to destroy later
        this.chassisCollider = null;

        this.health = 100;
        this.maxHealth = 100;
        this.seats = [];

        const seatCount = type === 'JEEP' ? 4 : (type === 'TANK' ? 2 : 6);
        for (let i = 0; i < seatCount; i++) this.seats.push(null); // null = empty, string = playerId

        this.profile = VEHICLE_PROFILES[type];
        this.wheelConfigs = [];
        this.wheelStates = [];
        this.trackOffset = 0;

        this.rotorRPM = 0;
        this.targetRPM = 0;

        this.createVehicle(position);
    }

    get chassisHandle() {
        return this.chassis ? this.chassis.handle : -1;
    }

    createVehicle(position) {
        if (this.type === 'HELICOPTER') {
            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(position.x, position.y + 5, position.z)
                .setLinearDamping(this.profile.linearDamping)
                .setAngularDamping(this.profile.angularDamping);

            this.chassis = this.world.createRigidBody(bodyDesc);
            const { x, y, z } = this.profile.bodySize;
            const collider = RAPIER.ColliderDesc.cuboid(x, y, z)
                .setTranslation(0, 0, 0);
            this.chassisCollider = this.world.createCollider(collider, this.chassis);
            this.bodies.push(this.chassis);

            this.maxRPM = this.profile.maxRPM;
            this.targetRPM = this.profile.idleRPM;
            return;
        }

        const isTank = this.type === 'TANK';
        const width = this.profile.width;
        const length = this.profile.length;

        const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y + 1, position.z)
            .setAdditionalMass(this.profile.mass)
            .setLinearDamping(this.profile.linearDamping)
            .setAngularDamping(this.profile.angularDamping);
        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.5, length)
            .setTranslation(0, this.profile.centerOfMassOffset, 0)
            .setFriction(this.profile.friction);
        this.chassisCollider = this.world.createCollider(chassisColl, chassis);
        this.bodies.push(chassis);
        this.chassis = chassis;

        const wheelRadius = this.profile.suspension.radius;
        const wheelRest = this.profile.suspension.restLength;
        const xOff = width + wheelRadius + 0.1;
        const zOff = length - 0.6;

        const baseWheels = [
            { x: -xOff, y: 0, z: zOff },
            { x: xOff, y: 0, z: zOff },
            { x: -xOff, y: 0, z: -zOff },
            { x: xOff, y: 0, z: -zOff }
        ];

        if (isTank) {
            // Additional middle wheels per side for better track sampling
            baseWheels.push({ x: -xOff, y: 0, z: 0 });
            baseWheels.push({ x: xOff, y: 0, z: 0 });
        }

        this.wheelConfigs = baseWheels.map((pos) => ({
            position: pos,
            restLength: wheelRest,
            spring: this.profile.suspension.spring,
            damper: this.profile.suspension.damper,
            radius: wheelRadius
        }));
        this.wheelStates = this.wheelConfigs.map(() => ({
            compression: 0,
            grounded: false,
            contactPoint: null,
            worldPosition: null
        }));
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

        const ix = qw * ox + qy * oz - qz * oy;
        const iy = qw * oy + qz * ox - qx * oz;
        const iz = qw * oz + qx * oy - qy * ox;
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

    rotateVector(v) {
        const rot = this.chassis.rotation();
        const qx = rot.x, qy = rot.y, qz = rot.z, qw = rot.w;
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

    getBasis() {
        return {
            forward: this.rotateVector({ x: 0, y: 0, z: -1 }),
            right: this.rotateVector({ x: 1, y: 0, z: 0 }),
            up: this.rotateVector({ x: 0, y: 1, z: 0 })
        };
    }

    localToWorld(vec) {
        const t = this.chassis.translation();
        const rotated = this.rotateVector(vec);
        return { x: t.x + rotated.x, y: t.y + rotated.y, z: t.z + rotated.z };
    }

    getVelocityAtPoint(point) {
        const linvel = this.chassis.linvel();
        const angvel = this.chassis.angvel();
        const origin = this.chassis.translation();

        const r = {
            x: point.x - origin.x,
            y: point.y - origin.y,
            z: point.z - origin.z
        };

        return {
            x: linvel.x + angvel.y * r.z - angvel.z * r.y,
            y: linvel.y + angvel.z * r.x - angvel.x * r.z,
            z: linvel.z + angvel.x * r.y - angvel.y * r.x
        };
    }

    applyForceAtPoint(force, point, dt) {
        const impulse = { x: force.x * dt, y: force.y * dt, z: force.z * dt };
        this.chassis.applyImpulse(impulse, true);

        const origin = this.chassis.translation();
        const r = {
            x: point.x - origin.x,
            y: point.y - origin.y,
            z: point.z - origin.z
        };
        const torque = {
            x: r.y * force.z - r.z * force.y,
            y: r.z * force.x - r.x * force.z,
            z: r.x * force.y - r.y * force.x
        };
        const torqueImpulse = { x: torque.x * dt, y: torque.y * dt, z: torque.z * dt };
        this.chassis.applyTorqueImpulse(torqueImpulse, true);
    }

    applySuspensionForces(dt) {
        if (this.type === 'HELICOPTER' || !this.chassis) return;

        const { up } = this.getBasis();
        const down = { x: -up.x, y: -up.y, z: -up.z };

        this.wheelConfigs.forEach((wheel, index) => {
            const origin = this.localToWorld(wheel.position);
            const ray = new RAPIER.Ray(origin, down);
            const maxDistance = wheel.restLength + wheel.radius + 0.2;
            const hit = this.world.castRay(ray, maxDistance, true);

            let grounded = false;
            let compressionRatio = 0;
            let contactPoint = null;
            let wheelCenter = this.localToWorld({ ...wheel.position, y: wheel.position.y - wheel.restLength });

            if (hit && hit.colliderHandle !== this.chassisCollider?.handle) {
                const distance = hit.toi - wheel.radius;
                const compression = Math.max(0, wheel.restLength - distance);
                const vel = this.getVelocityAtPoint(origin);
                const relVel = vel.x * down.x + vel.y * down.y + vel.z * down.z;

                const springForce = wheel.spring * compression;
                const damperForce = wheel.damper * relVel;
                const totalForce = springForce + damperForce;

                const force = { x: up.x * totalForce, y: up.y * totalForce, z: up.z * totalForce };
                const hitPoint = {
                    x: origin.x + down.x * hit.toi,
                    y: origin.y + down.y * hit.toi,
                    z: origin.z + down.z * hit.toi,
                };
                this.applyForceAtPoint(force, hitPoint, dt);

                grounded = true;
                compressionRatio = Math.min(1, compression / wheel.restLength);
                contactPoint = hitPoint;
                wheelCenter = {
                    x: origin.x + down.x * Math.max(hit.toi - wheel.radius, wheel.restLength),
                    y: origin.y + down.y * Math.max(hit.toi - wheel.radius, wheel.restLength),
                    z: origin.z + down.z * Math.max(hit.toi - wheel.radius, wheel.restLength)
                };
            }

            this.wheelStates[index] = {
                compression: compressionRatio,
                grounded,
                contactPoint,
                worldPosition: wheelCenter
            };
        });
    }

    applyGroundInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;
        this.applySuspensionForces(dt);

        const { forward, right } = this.getBasis();
        const forwardInput = input.y || 0;
        const steerInput = input.x || 0;
        const mass = this.chassis.mass();
        const velocity = this.chassis.linvel();
        const forwardSpeed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
        const rightSpeed = velocity.x * right.x + velocity.y * right.y + velocity.z * right.z;

        const groundedWheels = this.wheelStates.filter(w => w.grounded).length || this.wheelStates.length;
        const driveForce = this.profile.engineForce * forwardInput;
        const perWheel = driveForce / groundedWheels;

        this.wheelStates.forEach((wheel) => {
            const applicationPoint = wheel.contactPoint || wheel.worldPosition || this.chassis.translation();
            const force = {
                x: forward.x * perWheel,
                y: forward.y * perWheel,
                z: forward.z * perWheel
            };
            this.applyForceAtPoint(force, applicationPoint, dt);
        });

        const speedError = (this.profile.maxSpeed * forwardInput) - forwardSpeed;
        const accelImpulse = Math.max(-this.profile.engineForce, Math.min(this.profile.engineForce, speedError * mass)) * dt;
        const throttleImpulse = {
            x: forward.x * accelImpulse,
            y: forward.y * accelImpulse,
            z: forward.z * accelImpulse
        };
        this.chassis.applyImpulse(throttleImpulse, true);

        const lateralImpulseMag = -rightSpeed * mass * this.profile.lateralStiffness;
        const limited = Math.max(-this.profile.microSlipImpulse, Math.min(this.profile.microSlipImpulse, lateralImpulseMag));
        const lateralImpulse = {
            x: right.x * limited * dt,
            y: right.y * limited * dt,
            z: right.z * limited * dt
        };
        this.chassis.applyImpulse(lateralImpulse, true);

        if (this.type === 'TANK') {
            if (Math.abs(forwardSpeed) < this.profile.neutralSpeedThreshold && Math.abs(steerInput) > 0.05) {
                const torque = steerInput * this.profile.neutralTurnTorque * dt;
                this.chassis.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
            } else {
                const steerTorque = steerInput * this.profile.steerTorque * dt;
                this.chassis.applyTorqueImpulse({ x: 0, y: steerTorque, z: 0 }, true);
            }
        } else {
            const steerTorque = steerInput * this.profile.steerTorque * dt;
            this.chassis.applyTorqueImpulse({ x: 0, y: steerTorque, z: 0 }, true);
        }

        this.trackOffset += forwardSpeed * dt;
    }

    applyHelicopterInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        const engineUp = input.engineUp || input.jump;
        const engineDown = input.engineDown || input.sprint;

        if (engineUp) this.targetRPM = this.profile.maxRPM;
        else if (engineDown) this.targetRPM = this.profile.idleRPM;

        this.updateRotor(dt);

        const { forward, right, up } = this.getBasis();
        const rpmRatio = this.rotorRPM / this.profile.maxRPM;

        if (rpmRatio > 0.6) {
            const lift = this.profile.liftForce * rpmRatio * rpmRatio;
            const liftForce = { x: up.x * lift, y: up.y * lift, z: up.z * lift };
            this.applyForceAtPoint(liftForce, this.chassis.translation(), dt);

            const pitch = input.pitch || 0;
            const roll = input.roll || 0;
            const yaw = input.yaw || 0;

            const cyclic = this.profile.cyclicForce * rpmRatio;
            const forwardForce = { x: forward.x * cyclic * pitch, y: forward.y * cyclic * pitch, z: forward.z * cyclic * pitch };
            const strafeForce = { x: right.x * cyclic * -roll, y: right.y * cyclic * -roll, z: right.z * cyclic * -roll };
            this.applyForceAtPoint(forwardForce, this.chassis.translation(), dt);
            this.applyForceAtPoint(strafeForce, this.chassis.translation(), dt);

            const pitchTorque = this.profile.pitchTorque * pitch * dt;
            const rollTorque = this.profile.rollTorque * roll * dt;
            const yawTorque = this.profile.yawTorque * yaw * dt;

            this.chassis.applyTorqueImpulse({ x: right.x * pitchTorque, y: right.y * pitchTorque, z: right.z * pitchTorque }, true);
            this.chassis.applyTorqueImpulse({ x: forward.x * rollTorque, y: forward.y * rollTorque, z: forward.z * rollTorque }, true);
            this.chassis.applyTorqueImpulse({ x: up.x * yawTorque, y: up.y * yawTorque, z: up.z * yawTorque }, true);
        }
    }

    updateRotor(dt) {
        const current = this.rotorRPM;
        const target = this.targetRPM || this.profile.idleRPM;
        const lerpFactor = Math.min(1, this.profile.spoolRate * dt);
        this.rotorRPM = current + (target - current) * lerpFactor;
    }

    update(dt) {
        if (this.type === 'HELICOPTER') {
            this.updateRotor(dt);
            return;
        }

        this.applySuspensionForces(dt);
    }

    applyDriverInput(input = {}, dt = 1 / 60) {
        if (!this.chassis) return;

        if (this.type === 'HELICOPTER') {
            this.applyHelicopterInput(input, dt);
            return;
        }

        this.applyGroundInput(input, dt);
    }

    toJSON() {
        const t = this.chassis.translation();
        const r = this.chassis.rotation();
        return {
            id: this.id,
            type: this.type,
            x: t.x, y: t.y, z: t.z,
            qx: r.x, qy: r.y, qz: r.z, qw: r.w,
            wheels: this.wheelStates.map(w => w.worldPosition ? { x: w.worldPosition.x, y: w.worldPosition.y, z: w.worldPosition.z } : null),
            trackOffset: this.trackOffset,
            rotorRPM: this.rotorRPM,
            maxRPM: this.profile?.maxRPM || 0
        };
    }
}
