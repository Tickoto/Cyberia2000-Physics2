import RAPIER from '@dimforge/rapier3d-compat';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import NetworkManager from '../shared/NetworkManager.js';
import ChatSystem from '../shared/ChatSystem.js';
import WorldGenerator from './WorldGenerator.js';
import PhysicsSystems from './PhysicsSystems.js';
import Player from './Player.js';
import WarDirector from './WarDirector.js';
import Vehicle from './Vehicle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

// Serve static files
app.use(express.static(path.join(__dirname, '../')));

// Default Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Game State
const TICK_RATE = 60;
const TICK_DT = 1000 / TICK_RATE;
let physicsWorld;
let worldData; // Store generated world
let physicsSystems;
let warDirector;
let generator;
const chunkCache = new Map(); // "x,z" -> ChunkData
const players = new Map(); // socketId -> Player Data
const vehicles = new Map(); // id -> Vehicle
const physicsHandleMap = new Map(); // handle -> { type, instance }
const chatSystem = new ChatSystem();
let lastState = {};

async function initPhysics() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    physicsWorld = new RAPIER.World(gravity);
    console.log('Rapier Physics World Initialized');
    
    physicsSystems = new PhysicsSystems(physicsWorld);

    // Infinite World Generator
    generator = new WorldGenerator('cyberia-infinite');

    // Remove Static Physics Floor (using dynamic chunks now)
    
    // Init War Director
    warDirector = new WarDirector(physicsWorld, {}, physicsSystems, generator); // Pass generator
}

// Entity Factory - Handled by Player class now

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Init player
    if (physicsWorld) {
        // Calculate spawn height safely
        const spawnX = 0;
        const spawnZ = 0;
        let spawnY = 20; // Default fallback
        if (generator) {
            spawnY = generator.getGroundHeight(spawnX, spawnZ) + 2.0;
        }

        const player = new Player(
            socket,
            physicsWorld,
            { x: spawnX, y: spawnY, z: spawnZ },
            physicsSystems,
            physicsHandleMap,
            vehicles
        );
        players.set(socket.id, player);

        // Send initial state (No world data, client requests chunks)
        socket.emit(NetworkManager.Packet.LOGIN, { 
            id: socket.id, 
            state: serializeState()
        });
    }

    socket.on('join', (data) => {
        if (players.has(socket.id)) {
            const p = players.get(socket.id);
            p.data.username = data.username.substring(0, 12); 
            p.data.hairColor = data.hairColor || '#c54f5c';
            p.data.skinColor = data.skinColor || '#f7d6c2';
            p.data.outfit = data.outfit || 'DEFAULT';
            p.data.hairStyle = data.hairStyle || 'DEFAULT';
            console.log(`Player ${socket.id} joined as ${p.data.username} with outfit ${p.data.outfit}`);
        }
    });

    socket.on(NetworkManager.Packet.CHUNK_REQUEST, (chunks) => {
        // Expects array of { x, z }
        if (Array.isArray(chunks)) {
            chunks.forEach(c => {
                const key = `${c.x},${c.z}`;
                let chunkData;
                
                if (!chunkCache.has(key)) {
                    // Generate Logic
                    chunkData = generator.generateChunk(c.x, c.z);
                    
                    // Generate Physics Collider
                    try {
                        const size = chunkData.size;
                        // size is number of segments (32)
                        // Vertices grid is (size+1) * (size+1)
                        const vRows = size + 1;
                        const vCols = size + 1;
                        const heights = chunkData.heightMap;
                        
                        const vertices = new Float32Array(vRows * vCols * 3);
                        const indices = new Uint32Array(size * size * 6); // 2 tris per quad

                        // Build Vertices
                        for (let z = 0; z < vRows; z++) {
                            for (let x = 0; x < vCols; x++) {
                                const idx = z * vCols + x;
                                const h = isNaN(heights[idx]) ? 0 : heights[idx];
                                
                                vertices[idx * 3 + 0] = x;
                                vertices[idx * 3 + 1] = h;
                                vertices[idx * 3 + 2] = z;
                            }
                        }

                        // Build Indices
                        let iPtr = 0;
                        for (let z = 0; z < size; z++) {
                            for (let x = 0; x < size; x++) {
                                // Quads indices
                                const a = z * vCols + x;
                                const b = z * vCols + (x + 1);
                                const c = (z + 1) * vCols + x;
                                const d = (z + 1) * vCols + (x + 1);

                                // Tri 1 (a-c-b)
                                indices[iPtr++] = a;
                                indices[iPtr++] = c;
                                indices[iPtr++] = b;

                                // Tri 2 (b-c-d)
                                indices[iPtr++] = b;
                                indices[iPtr++] = c;
                                indices[iPtr++] = d;
                            }
                        }

                        // Create Trimesh
                        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);

                        // Body Position (Corner of chunk)
                        // Trimesh coords are 0..32 local.
                        // So body placed at chunk start coordinates.
                        const bx = c.x * size;
                        const bz = c.z * size;
                        
                        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                            .setTranslation(bx, 0, bz);
                        
                        const body = physicsWorld.createRigidBody(bodyDesc);
                        physicsWorld.createCollider(colliderDesc, body);
                        
                        chunkData.physicsBody = body; 
                        // console.log(`Generated physics for chunk ${key}`);
                        
                    } catch (e) {
                        console.error(`Failed to generate physics for chunk ${key}`, e);
                    }

                    chunkCache.set(key, chunkData);
                } else {
                    chunkData = chunkCache.get(key);
                }
                
                // Don't send the physics body object to client
                const { physicsBody, ...netData } = chunkData;
                socket.emit(NetworkManager.Packet.CHUNK_DATA, netData);
            });
        }
    });

    socket.on(NetworkManager.Packet.ACTION, (data) => {
        if (players.has(socket.id)) {
            const p = players.get(socket.id);
            // Process inputs using Player class logic
            // data.input should contain { moveDir, viewDir, jump, interact }
            p.update(TICK_DT / 1000, data.input); 
        }
    });

    socket.on(NetworkManager.Packet.CHAT, (data) => {
        // Command Handling
        if (data.content.startsWith('/spawnvehicle')) {
            const parts = data.content.split(' ');
            const type = (parts[1] || 'JEEP').toUpperCase();
            
            if (['JEEP', 'TANK', 'HELICOPTER'].includes(type)) {
                if (players.has(socket.id)) {
                    const p = players.get(socket.id);
                    const pos = p.rigidBody.translation();
                    const spawnPos = { x: pos.x + 5, y: pos.y + 2, z: pos.z };
                    
                    const vId = `veh_${Date.now()}`;
                    const v = new Vehicle(vId, type, physicsWorld, spawnPos);
                    vehicles.set(vId, v);
                    
                    // Register ALL vehicle parts (Chassis + Wheels) for interaction
                    const registerVehicleBody = (body) => {
                        if (!body) return;
                        physicsHandleMap.set(body.handle, { type: 'VEHICLE', instance: v });

                        // Also register each collider handle in case raycasts report collider handles
                        // instead of body handles (Rapier can return either depending on API).
                        const colliderCount = body.numColliders ? body.numColliders() : 0;
                        for (let i = 0; i < colliderCount; i++) {
                            const colliderHandle = body.collider(i);
                            physicsHandleMap.set(colliderHandle, { type: 'VEHICLE', instance: v });
                        }
                    };

                    if (v.bodies) {
                        v.bodies.forEach(registerVehicleBody);
                    } else {
                        // Fallback
                        registerVehicleBody(v.chassis);
                    }
                    
                    // Feedback
                    const msg = chatSystem.addMessage('SYSTEM', 'SERVER', `Spawned ${type} at ${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)}`, null);
                    socket.emit(NetworkManager.Packet.CHAT, msg);
                }
            }
            return;
        }

        let senderName = socket.id;
        if (players.has(socket.id)) {
            const p = players.get(socket.id);
            senderName = p.data.username || socket.id;
        }

        const msg = chatSystem.addMessage(data.type, senderName, data.content, data.teamId);
        // Broadcast chat to relevant scope
        if (data.type === 'GLOBAL') {
            io.emit(NetworkManager.Packet.CHAT, msg);
        }
        // Team logic omitted for brevity
    });

    socket.on(NetworkManager.Packet.ENTER_VEHICLE, (data) => handleVehicleEntry(socket, data));

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (players.has(socket.id)) {
            const p = players.get(socket.id);
            p.dismountVehicle();
            physicsWorld.removeRigidBody(p.rigidBody);
            players.delete(socket.id);
        }
    });
});

function handleVehicleEntry(socket, payload) {
    const { vehicleId, seat } = payload || {};
    if (!vehicleId || seat === undefined) return;

    const player = players.get(socket.id);
    const vehicle = vehicles.get(vehicleId);

    if (!player || !vehicle) return;

    const seatIndex = Number(seat);
    if (Number.isNaN(seatIndex) || seatIndex < 0 || seatIndex >= vehicle.seats.length) return;

    // Seat already taken by someone else
    if (vehicle.seats[seatIndex] && vehicle.seats[seatIndex] !== socket.id) return;

    // Free previous mount if any
    player.dismountVehicle();

    vehicle.seats[seatIndex] = socket.id;
    player.mountVehicle(vehicleId, seatIndex);
}

function serializeState() {
    const state = {
        timestamp: Date.now(),
        players: {},
        units: {}, // Add AI Units
        vehicles: {}
    };
    
    players.forEach((p, id) => {
        const t = p.rigidBody.translation();
        // No rotation for capsule usually needed for rendering except viewDir
        // But for consistency let's send what we have or just position
        state.players[id] = {
            x: Number(t.x.toFixed(3)),
            y: Number(t.y.toFixed(3)),
            z: Number(t.z.toFixed(3)),
            // Add other props like health, faction for UI
            hp: p.data.health,
            faction: p.data.faction,
            hairColor: p.data.hairColor,
            skinColor: p.data.skinColor,
            outfit: p.data.outfit,
            hairStyle: p.data.hairStyle,
            username: p.data.username
        };
    });
    
    if (warDirector) {
        warDirector.allUnits.forEach((u, id) => {
            const t = u.rigidBody.translation();
            const r = u.rigidBody.rotation();
            state.units[id] = {
                type: u.type,
                teamId: u.teamId,
                x: Number(t.x.toFixed(3)),
                y: Number(t.y.toFixed(3)),
                z: Number(t.z.toFixed(3)),
                qx: Number(r.x.toFixed(3)),
                qy: Number(r.y.toFixed(3)),
                qz: Number(r.z.toFixed(3)),
                qw: Number(r.w.toFixed(3))
            };
        });
    }

    vehicles.forEach((v, id) => {
        state.vehicles[id] = v.toJSON();
    });

    return state;
}

function gameLoop() {
    try {
        if (!physicsWorld) return;
        
        // Update War Director (AI)
        if (warDirector) {
            warDirector.updateUnits(TICK_DT / 1000);
            // We should call tickSlow occasionally, effectively handled via internal counters or separate interval
            // For simplicity:
            if (Math.random() < 0.01) warDirector.tickSlow(TICK_DT / 1000);
        }

        // Update Vehicles
        vehicles.forEach(v => v.update(TICK_DT / 1000));

        // Step Physics
        physicsWorld.step();

        // Prepare State
        const currentState = serializeState();
        
        // Delta Compression
        const delta = NetworkManager.getDelta(lastState, currentState);

        if (delta) {
            // Add timestamp for interpolation if not in delta (delta might be partial)
            delta.timestamp = currentState.timestamp; 
            
            // Broadcast
            io.emit(NetworkManager.Packet.UPDATE, delta);
        }

        lastState = currentState;
    } catch (err) {
        console.error("Game Loop Error:", err);
    }
}

// Start Server
initPhysics().then(() => {
    // 60Hz Loop
    setInterval(gameLoop, TICK_DT);
    
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
