import RAPIER from '@dimforge/rapier3d-compat';

class AIUnit {
    constructor(id, type, teamId, world, position, physicsSystems) {
        this.id = id;
        this.type = type; // 'SOLDIER', 'TRUCK', 'TANK', 'HELICOPTER'
        this.teamId = teamId;
        this.world = world;
        this.physicsSystems = physicsSystems;
        
        this.state = 'IDLE'; // IDLE, MOVE, CHASE, ATTACK, HARVEST, RETURN
        this.target = null; // Position or Entity ID
        this.path = [];
        
        this.stats = this.getStats(type);
        this.hp = this.stats.hp;
        
        this.initPhysics(position);
    }

    getStats(type) {
        switch(type) {
            case 'SOLDIER': return { hp: 100, speed: 5, range: 20, damage: 10 };
            case 'TRUCK': return { hp: 300, speed: 10, range: 0, damage: 0, capacity: 100 };
            case 'TANK': return { hp: 1000, speed: 3, range: 50, damage: 100 };
            case 'HELICOPTER': return { hp: 200, speed: 15, range: 80, damage: 20 };
            default: return { hp: 100, speed: 5 };
        }
    }

    initPhysics(pos) {
        let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z);
        let colliderDesc;

        if (this.type === 'HELICOPTER') {
            bodyDesc.setGravityScale(0.5); // Lighter gravity
            colliderDesc = RAPIER.ColliderDesc.cuboid(1, 1, 2);
        } else if (this.type === 'TANK') {
            bodyDesc.setAdditionalMass(2000);
            colliderDesc = RAPIER.ColliderDesc.cuboid(1.5, 1, 2.5);
        } else if (this.type === 'TRUCK') {
            bodyDesc.setAdditionalMass(1000);
            colliderDesc = RAPIER.ColliderDesc.cuboid(1, 1, 2);
        } else {
            // Soldier
            bodyDesc.lockRotations();
            colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.5);
        }

        this.rigidBody = this.world.createRigidBody(bodyDesc);
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);
    }

    update(dt, worldData, enemies) {
        if (this.hp <= 0) return;

        const pos = this.rigidBody.translation();

        // 1. Perception
        const nearbyEnemies = this.scanForEnemies(pos, enemies);

        // 2. State Machine Transition
        if (this.type === 'SOLDIER' || this.type === 'TANK') {
            if (nearbyEnemies.length > 0) {
                this.target = nearbyEnemies[0];
                this.state = 'ATTACK';
            } else if (this.state === 'ATTACK' && nearbyEnemies.length === 0) {
                this.state = 'IDLE';
                this.target = null;
            }
        }

        // 3. State Execution
        switch (this.state) {
            case 'IDLE':
                // Random patrol if soldier
                if (this.type === 'SOLDIER' && Math.random() < 0.01) {
                    this.moveTo({ 
                        x: pos.x + (Math.random() - 0.5) * 50, 
                        y: pos.y, 
                        z: pos.z + (Math.random() - 0.5) * 50 
                    });
                }
                break;

            case 'MOVE':
            case 'RETURN':
                this.executeMove(dt);
                break;

            case 'ATTACK':
                if (this.target) {
                    const dist = this.distance(pos, this.target.position);
                    if (dist < this.stats.range) {
                        this.stopMove();
                        this.fireWeapon(this.target);
                    } else {
                        // Chase
                        this.moveTo(this.target.position);
                        this.executeMove(dt);
                    }
                }
                break;
                
            case 'HARVEST':
                // Truck logic handled by Director mostly, or simple timer here
                break;
        }
        
        // Helicopter Flight Logic
        if (this.type === 'HELICOPTER') {
            // Hover logic: Apply force to counteract gravity + bobbing
            const hoverHeight = 20;
            const currentHeight = pos.y;
            const error = hoverHeight - currentHeight;
            const upForce = (9.81 * this.rigidBody.mass()) + (error * 50);
            this.rigidBody.applyImpulse({ x: 0, y: upForce * dt, z: 0 }, true);
        }
    }

    scanForEnemies(pos, enemies) {
        return enemies.filter(e => {
            return e.teamId !== this.teamId && this.distance(pos, e.position) < 50;
        });
    }

    distance(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.z - b.z, 2));
    }

    moveTo(targetPos) {
        this.path = [targetPos]; // Simplified: Direct line. A* would go here.
        this.state = this.state === 'RETURN' ? 'RETURN' : 'MOVE';
    }

    executeMove(dt) {
        if (this.path.length === 0) return;
        
        const target = this.path[0];
        const current = this.rigidBody.translation();
        
        const dx = target.x - current.x;
        const dz = target.z - current.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < 2.0) {
            this.path.shift(); // Reached waypoint
            if (this.path.length === 0) this.state = 'IDLE';
            return;
        }

        // Normalize
        const moveDir = { x: dx/dist, z: dz/dist };
        
        // Apply Velocity directly for simple AI navigation
        // Or Impulse if we want physical pushing
        const speed = this.stats.speed;
        
        // Preserve Y velocity (gravity)
        const linVel = this.rigidBody.linvel();
        
        this.rigidBody.setLinvel({
            x: moveDir.x * speed,
            y: linVel.y,
            z: moveDir.z * speed
        }, true);
        
        // Face direction
        // (Simplified rotation logic omitted for brevity, would use torque)
    }

    stopMove() {
        const linVel = this.rigidBody.linvel();
        this.rigidBody.setLinvel({ x: 0, y: linVel.y, z: 0 }, true);
    }

    fireWeapon(target) {
        // Rate of fire limiter would go here
        // console.log(`${this.type} ${this.id} firing at ${target.id}`);
        // Raycast shoot or spawn projectile
    }
}

export default AIUnit;
