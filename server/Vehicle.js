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
            .setAdditionalMass(mass);
        const chassis = this.world.createRigidBody(chassisDesc);
        const chassisColl = RAPIER.ColliderDesc.cuboid(width, 0.5, length); 
        this.world.createCollider(chassisColl, chassis);
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
