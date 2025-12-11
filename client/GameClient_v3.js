import * as THREE from 'three';
import { io } from 'socket.io-client';
import NetworkController from './NetworkController.js';
import { ModelRig, ModelViewer } from '../model.js';
import NetworkManager from '../shared/NetworkManager.js';

class GameClient {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        this.socket = io();
        this.net = new NetworkController(this.socket);
        this.entities = new Map(); // id -> { mesh, rig? }
        this.vehicles = new Map(); // id -> { mesh, type }
        
        this.sunLight = null;
        this.dayTime = 0.25; // 0.25 = Noon (Sun at top)

        this.input = {
            moveDir: { x: 0, y: 0 },
            viewDir: { x: 0, y: 0, z: -1 },
            jump: false,
            interact: false
        };
        
        this.cameraRotation = { x: 0, y: 0 }; // Pitch, Yaw
        this.isLocked = false;
        this.username = "Guest";
        this.playerClass = "SOLDIER"; // Default
        this.hairColor = "#c54f5c";
        this.skinColor = "#f7d6c2";
        this.outfit = "DEFAULT";
        this.hairStyle = "DEFAULT";
        this.currentBiome = "SCANNING...";

        this.init();
    }

    init() {
        // 1. Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 10, 200);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.scene.add(this.sunLight);

        // Sun & Moon Visuals
        const sunGeo = new THREE.SphereGeometry(10, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1.0 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunMesh);

        const moonGeo = new THREE.SphereGeometry(8, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, emissive: 0xcccccc, emissiveIntensity: 0.5 });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.scene.add(this.moonMesh);

        // 2. Network Callbacks
        this.net.onLogin = (data) => {
            // No world data on login anymore
            console.log("Logged in, requesting initial chunks...");
            this.updateChunks(); 

            // After login, update local player data from server
            if (data.state.players && data.state.players[this.net.myId]) {
                const p = data.state.players[this.net.myId];
                this.username = p.username || this.username;
                this.hairColor = p.hairColor || this.hairColor;
                this.skinColor = p.skinColor || this.skinColor;
                this.playerClass = p.playerClass || this.playerClass;
                this.outfit = p.outfit || this.outfit;
                this.hairStyle = p.hairStyle || this.hairStyle;
            }
        };

        this.chunks = new Map(); // "x,z" -> { mesh, objects[] }
        this.socket.on(NetworkManager.Packet.CHUNK_DATA, (chunkData) => {
            this.loadChunk(chunkData);
        });

        this.socket.on(NetworkManager.Packet.INTERACT_MENU, (data) => {
            console.log("Interaction Menu:", data);
            const existing = document.getElementById('interact-menu');
            if (existing) existing.remove();

            const menu = document.createElement('div');
            menu.id = 'interact-menu';
            menu.style.cssText = `
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #001100; border: 2px solid #0f0; padding: 20px;
                display: flex; flex-direction: column; gap: 15px; pointer-events: auto;
                color: #0f0; font-family: 'VT323', monospace; width: 300px;
                box-shadow: 0 0 20px #0f0;
            `;

            if (data.type === 'VEHICLE') {
                // Header
                const title = document.createElement('div');
                title.textContent = `${data.vehicleType} STATUS`;
                title.style.cssText = "font-size: 24px; text-align: center; border-bottom: 1px solid #0f0; padding-bottom: 5px;";
                menu.appendChild(title);

                // Health
                const hpContainer = document.createElement('div');
                hpContainer.style.cssText = "display: flex; gap: 10px; align-items: center;";
                hpContainer.innerHTML = `<span>INTEGRITY:</span> <div style="flex: 1; height: 10px; background: #330000; border: 1px solid #0f0;"><div style="width: ${(data.health/data.maxHealth)*100}%; height: 100%; background: #0f0;"></div></div>`;
                menu.appendChild(hpContainer);

                // Seats
                const seatGrid = document.createElement('div');
                seatGrid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;";
                
                data.seats.forEach(seat => {
                    const btn = document.createElement('button');
                    btn.textContent = seat.name;
                    btn.disabled = seat.occupied;
                    const bgColor = seat.occupied ? '#550000' : '#004400';
                    const hoverColor = seat.occupied ? '#550000' : '#006600';
                    
                    btn.style.cssText = `
                        background: ${bgColor}; color: #fff; border: 1px solid #0f0; 
                        padding: 10px; cursor: ${seat.occupied ? 'not-allowed' : 'pointer'}; 
                        font-family: inherit; font-size: 18px;
                    `;
                    
                    if (!seat.occupied) {
                        btn.onmouseenter = () => btn.style.background = hoverColor;
                        btn.onmouseleave = () => btn.style.background = bgColor;
                        btn.onclick = () => {
                            console.log(`Entering ${data.vehicleType} seat ${seat.id}`);
                            // this.socket.emit('ENTER_VEHICLE', { vehicleId: data.targetId, seat: seat.id });
                            menu.remove();
                            document.body.requestPointerLock();
                        };
                    }
                    seatGrid.appendChild(btn);
                });
                menu.appendChild(seatGrid);

            } else {
                // Fallback Generic Menu
                data.options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.textContent = opt;
                    btn.style.cssText = `
                        background: #002200; color: #0f0; border: 1px solid #0f0; 
                        padding: 10px; cursor: pointer; font-family: 'VT323'; font-size: 20px;
                    `;
                    btn.onclick = () => {
                        console.log("Selected:", opt);
                        menu.remove();
                        document.body.requestPointerLock();
                    };
                    menu.appendChild(btn);
                });
            }
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = "CLOSE";
            closeBtn.style.cssText = "margin-top: 10px; background: #000; color: #0f0; border: 1px solid #0f0; padding: 5px; cursor: pointer;";
            closeBtn.onclick = () => {
                menu.remove();
                document.body.requestPointerLock();
            };
            menu.appendChild(closeBtn);

            document.body.appendChild(menu);
            document.exitPointerLock();
        });
        
        // 3. Input Listeners
        this.setupInput();
        this.setupLogin();

        // 4. Start Loop
        this.animate();
    }

    loadChunk(data) {
        const key = `${data.x},${data.z}`;
        const current = this.chunks.get(key);
        if (current && !current.pending) return;

        console.log(`Loading Chunk ${key}`, data.biomeMap[0], data.heightMap[0]);

        // Create Geometry
        // data.size is 32. We want 33 vertices (0..32).
        // PlaneGeometry(width, height, widthSegments, heightSegments)
        // Setting segments = size gives size+1 vertices.
        const size = data.size;
        const geometry = new THREE.PlaneGeometry(size, size, size, size);
        geometry.rotateX(-Math.PI / 2);
        
        const count = geometry.attributes.position.count;
        const colors = [];
        
        // Apply Height & Colors
        for (let i = 0; i < count; i++) {
            if (i < data.heightMap.length) {
                geometry.attributes.position.setY(i, data.heightMap[i]);
            
                const biome = data.biomeMap[i];
                let c = new THREE.Color(0x888888);
                
                // Enhanced Biome Colors
                switch(biome) {
                    case 'OCEAN': c.setHex(0x001133); break;
                    case 'BEACH': c.setHex(0xe6dbac); break;
                    case 'GRASSLAND': c.setHex(0x5c8c2c); break;
                    case 'HILLS': c.setHex(0x4a6b2f); break;
                    case 'PINE_FOREST': c.setHex(0x2d3e1e); break;
                    case 'DESERT': c.setHex(0xd6c08d); break;
                    case 'RUINED_CITY': c.setHex(0x3a3a3a); break;
                    case 'MOUNTAIN': c.setHex(0x666666); break;
                    case 'SNOWY_MOUNTAIN': c.setHex(0xffffff); break;
                    default: c.setHex(0x222222); break;
                }

                // Add some noise to color
                c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
                colors.push(c.r, c.g, c.b);
            } else {
                // Fallback (shouldn't happen if generator is correct)
                colors.push(0,0,0);
            }
        }
        
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ 
            vertexColors: true, 
            roughness: 0.9, 
            metalness: 0.1,
            side: THREE.DoubleSide 
        });
        const mesh = new THREE.Mesh(geometry, mat);
        
        // Position Mesh
        mesh.position.set(data.x * size + size/2, 0, data.z * size + size/2);
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Water Plane (Global Sea Level at 0)
        // Add to every chunk to ensure rivers/lakes work
        const waterGeo = new THREE.PlaneGeometry(size, size);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x004488,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.8,
            side: THREE.DoubleSide
        });
        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(data.x * size + size/2, -0.5, data.z * size + size/2); // Slightly below 0
        this.scene.add(waterMesh);

        // Spawn Objects
        const objects = [];
        if (data.objects) {
            data.objects.forEach(obj => {
                let objMesh;
                
                // Asset Factory
                switch(obj.type) {
                    case 'TREE_PINE':
                        objMesh = new THREE.Group();
                        const pt1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1.5), new THREE.MeshStandardMaterial({ color: 0x2d1e12 })); // Trunk
                        pt1.position.y = 0.75;
                        const pc1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 3, 8), new THREE.MeshStandardMaterial({ color: 0x1a2e12 }));
                        pc1.position.y = 2.5;
                        const pc2 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0x1a2e12 }));
                        pc2.position.y = 4.0;
                        const pc3 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0x1a2e12 }));
                        pc3.position.y = 5.2;
                        objMesh.add(pt1, pc1, pc2, pc3);
                        break;
                    case 'TREE_OAK':
                        objMesh = new THREE.Group();
                        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2), new THREE.MeshStandardMaterial({ color: 0x4a3c31 }));
                        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5), new THREE.MeshStandardMaterial({ color: 0x425e17 }));
                        trunk.position.y = 1;
                        leaves.position.y = 3;
                        objMesh.add(trunk, leaves);
                        break;
                    case 'TREE_PALM':
                        objMesh = new THREE.Group();
                        // Segmented Trunk
                        let ty = 0;
                        for(let k=0; k<5; k++) {
                            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: 0x8b9c3e }));
                            seg.position.y = ty + 0.6;
                            // Slight curve
                            seg.position.x = Math.sin(k * 0.5) * 0.3;
                            seg.rotation.z = -Math.sin(k * 0.5) * 0.1;
                            objMesh.add(seg);
                            ty += 1.0;
                        }
                        // Leaves
                        for(let k=0; k<6; k++) {
                            const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 4), new THREE.MeshStandardMaterial({ color: 0x4a5d43 }));
                            leaf.position.y = ty;
                            leaf.position.x = Math.sin(4) * 0.3; // Top of trunk approx
                            leaf.rotation.x = Math.PI / 3; // Fold down
                            leaf.rotation.y = (k / 6) * Math.PI * 2;
                            // Rotate around pivot? 
                            // Easier: make leaf geometry offset, or parent container
                            const pivot = new THREE.Group();
                            pivot.position.y = ty;
                            pivot.position.x = Math.sin(4) * 0.3;
                            pivot.rotation.y = (k / 6) * Math.PI * 2;
                            
                            leaf.position.set(0, 1.5, 1.5); // Offset
                            leaf.rotation.set(Math.PI/2 + 0.5, 0, 0); // Point out
                            
                            pivot.add(leaf);
                            objMesh.add(pivot);
                        }
                        break;
                    case 'CACTUS':
                        objMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3), new THREE.MeshStandardMaterial({ color: 0x5e8c31 }));
                        objMesh.position.y = 1.5;
                        break;
                    case 'RUIN_WALL':
                        objMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x555555 }));
                        objMesh.position.y = 1.5;
                        break;
                    case 'RUIN_BEAM':
                        objMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshStandardMaterial({ color: 0x443322 }));
                        objMesh.rotation.z = 0.5;
                        objMesh.position.y = 2;
                        break;
                    case 'RUBBLE_PILE':
                        objMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x333333 }));
                        objMesh.scale.y = 0.5;
                        objMesh.position.y = 0.5;
                        break;
                    case 'ROCK_BOULDER':
                    case 'ROCK_MOSSY':
                    case 'ROCK_SANDY':
                    case 'ROCK_SNOWY':
                        const rockColor = obj.type === 'ROCK_SNOWY' ? 0xcccccc : (obj.type === 'ROCK_SANDY' ? 0x8c7e6a : 0x666666);
                        objMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: rockColor }));
                        objMesh.position.y = 0.5;
                        break;
                    case 'BUILDING_TOWER':
                        objMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 12, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                        objMesh.position.y = 6;
                        break;
                    default:
                        // Generic fallback
                        objMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
                        objMesh.position.y = 0.25;
                        break;
                }

                objMesh.position.x = obj.x;
                objMesh.position.z = obj.z;
                objMesh.position.y += obj.y; // Add terrain height
                
                objMesh.scale.setScalar(obj.scale);
                objMesh.rotation.y = obj.rot;
                
                this.scene.add(objMesh);
                objects.push(objMesh);
            });
        }

        this.chunks.set(key, { mesh, waterMesh, objects, biomeMap: data.biomeMap });
    }

    updateChunks() {
        if (!this.net.myId || !this.entities.has(this.net.myId)) return;
        
        const myPos = this.entities.get(this.net.myId).mesh.position;
        const chunkSize = 32; 
        const renderDist = 3;

        const cx = Math.floor(myPos.x / chunkSize);
        const cz = Math.floor(myPos.z / chunkSize);

        const toReq = [];
        
        for (let z = cz - renderDist; z <= cz + renderDist; z++) {
            for (let x = cx - renderDist; x <= cx + renderDist; x++) {
                const key = `${x},${z}`;
                if (!this.chunks.has(key)) {
                    toReq.push({ x, z });
                    // Mark pending so we don't spam requests
                    this.chunks.set(key, { pending: true }); 
                }
            }
        }

        if (toReq.length > 0) {
            this.socket.emit(NetworkManager.Packet.CHUNK_REQUEST, toReq);
        }
    }

    setupLogin() {
        const btn = document.getElementById('join-btn');
        const usernameInput = document.getElementById('username-input');
        const classSelect = document.getElementById('class-select');
        const outfitSelect = document.getElementById('outfit-select');
        const hairStyleSelect = document.getElementById('hair-style-select');
        const hairInput = document.getElementById('hair-color');
        const skinInput = document.getElementById('skin-color');
        const overlay = document.getElementById('login-overlay');
        const previewContainer = document.getElementById('model-preview');

        // Init Viewer
        console.log("Initializing ModelViewer...");
        const viewer = new ModelViewer(previewContainer, {
            hair: new THREE.Color(hairInput.value),
            skin: new THREE.Color(skinInput.value),
            outfit: outfitSelect.value,
            hairStyle: hairStyleSelect.value
        });
        console.log("ModelViewer Initialized", viewer);

        // Update Viewer
        const updatePreview = () => {
            viewer.updateOptions({
                hair: new THREE.Color(hairInput.value),
                skin: new THREE.Color(skinInput.value),
                outfit: outfitSelect.value,
                hairStyle: hairStyleSelect.value
            });
            this.hairColor = hairInput.value;
            this.skinColor = skinInput.value;
            this.outfit = outfitSelect.value;
            this.hairStyle = hairStyleSelect.value;
        };

        hairInput.addEventListener('input', updatePreview);
        skinInput.addEventListener('input', updatePreview);
        outfitSelect.addEventListener('change', updatePreview);
        hairStyleSelect.addEventListener('change', updatePreview);

        classSelect.addEventListener('change', (e) => {
            this.playerClass = e.target.value;
            console.log("Selected Class:", this.playerClass);
        });

        btn.addEventListener('click', () => {
            if (usernameInput.value.length > 0) {
                this.username = usernameInput.value;
                document.body.requestPointerLock();
                overlay.style.display = 'none';
                this.socket.emit('join', {
                    username: this.username,
                    hairColor: this.hairColor,
                    skinColor: this.skinColor,
                    playerClass: this.playerClass,
                    outfit: this.outfit,
                    hairStyle: this.hairStyle
                });
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === document.body;
            if (!this.isLocked && overlay.style.display === 'none') {
                // Optional: Show pause menu
            }
        });
    }

    setupInput() {
        const onKey = (e, down) => {
            if (document.activeElement === document.getElementById('chat-input')) return;
            switch(e.code) {
                case 'KeyW': this.input.moveDir.y = down ? -1 : 0; break;
                case 'KeyS': this.input.moveDir.y = down ? 1 : 0; break;
                case 'KeyA': this.input.moveDir.x = down ? -1 : 0; break;
                case 'KeyD': this.input.moveDir.x = down ? 1 : 0; break;
                case 'Space': this.input.jump = down; break;
                case 'KeyE': if (down) this.input.interact = true; break;
            }
        };

        document.addEventListener('keydown', (e) => onKey(e, true));
        document.addEventListener('keyup', (e) => onKey(e, false));
        
        // Inventory Toggle
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyI' && e.target.tagName !== 'INPUT') {
                const inv = document.getElementById('inventory-window');
                if(inv) {
                    inv.style.display = inv.style.display === 'flex' ? 'none' : 'flex';
                    if (inv.style.display === 'flex') document.exitPointerLock();
                    else document.body.requestPointerLock();
                }
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isLocked) {
                const sensitivity = 0.002;
                this.cameraRotation.y -= e.movementX * sensitivity;
                this.cameraRotation.x -= e.movementY * sensitivity;
                // Clamp Pitch
                this.cameraRotation.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.cameraRotation.x));
            }
        });

        const chatInput = document.getElementById('chat-input');
        
        // Global Chat Focus
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (document.activeElement === chatInput) {
                    // Send
                    if (chatInput.value.trim().length > 0) {
                        this.net.sendChat(chatInput.value);
                        chatInput.value = '';
                    }
                    chatInput.blur();
                    document.body.requestPointerLock();
                } else {
                    // Focus
                    document.exitPointerLock();
                    chatInput.focus();
                    e.preventDefault();
                }
            }
        });
        
        this.socket.on(NetworkManager.Packet.CHAT, (msg) => {
            const div = document.createElement('div');
            div.textContent = `[${msg.type}] ${msg.senderId}: ${msg.content}`;
            const container = document.getElementById('chat-messages');
            if (container) {
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;
            }
        });
    }
    
    renderVehicle(type) {
        const group = new THREE.Group();
        
        if (type === 'JEEP') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 3), new THREE.MeshStandardMaterial({ color: 0x335533 }));
            body.position.y = 0; // Centered
            group.add(body);
            // Wheels
            const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3);
            wheelGeo.rotateZ(Math.PI/2);
            const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            
            const positions = [
                [-0.9, -0.4, 1], [0.9, -0.4, 1],
                [-0.9, -0.4, -1], [0.9, -0.4, -1]
            ];
            positions.forEach(p => {
                const w = new THREE.Mesh(wheelGeo, wMat);
                w.position.set(...p);
                group.add(w);
            });
        } else if (type === 'TANK') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 4.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            body.position.y = 0;
            group.add(body);
            const turret = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 2.0), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            turret.position.y = 0.9;
            group.add(turret);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            barrel.rotation.x = Math.PI/2;
            barrel.position.set(0, 0.9, 2.5);
            group.add(barrel);
        } else if (type === 'HELICOPTER') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 4.0), new THREE.MeshStandardMaterial({ color: 0x224466 }));
            body.position.y = 0;
            group.add(body);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.0), new THREE.MeshStandardMaterial({ color: 0x224466 }));
            tail.position.set(0, 0.2, -3.5);
            group.add(tail);
            // Rotor
            const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 7.0), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            rotor.position.y = 1.0;
            rotor.name = 'rotor'; // Tag for animation
            group.add(rotor);
        }
        
        return group;
    }

    updateVehicles(vehicleState) {
        if (!vehicleState) return;
        
        // Remove missing
        const currentIds = new Set(Object.keys(vehicleState));
        for (const [id, entity] of this.vehicles) {
            if (!currentIds.has(id)) {
                this.scene.remove(entity.mesh);
                this.vehicles.delete(id);
            }
        }

        // Add/Update
        for (const id in vehicleState) {
            const data = vehicleState[id];
            
            if (!this.vehicles.has(id)) {
                const mesh = this.renderVehicle(data.type);
                this.scene.add(mesh);
                this.vehicles.set(id, { mesh, type: data.type });
            }
            
            const entity = this.vehicles.get(id);
            const mesh = entity.mesh;
            
            mesh.position.set(data.x, data.y, data.z);
            mesh.quaternion.set(data.qx, data.qy, data.qz, data.qw);
            
            if (data.type === 'HELICOPTER') {
                const rotor = mesh.getObjectByName('rotor');
                if (rotor) rotor.rotation.y += 0.5; // Spin
            }
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());

        // 1. Day/Night Cycle (Slower)
        this.dayTime += 0.00002;
        if (this.dayTime > 1) this.dayTime -= 1;
        
        const angle = (this.dayTime - 0.25) * Math.PI * 2; // -0.25 offset so 0.25 is Noon (Top)
        const radius = 200; 
        const sunX = Math.cos(angle) * radius;
        const sunY = Math.sin(angle) * radius;
        
        this.sunLight.position.set(sunX, sunY, 0);
        this.sunMesh.position.set(sunX, sunY, 0);
        this.moonMesh.position.set(-sunX, -sunY, 0); 
        
        const dayColor = new THREE.Color(0x87CEEB);
        const nightColor = new THREE.Color(0x000022);
        const sunHeight = Math.sin(angle);
        this.scene.background.lerpColors(nightColor, dayColor, Math.max(0, sunHeight));
        this.scene.fog.color.copy(this.scene.background);
        
        this.sunLight.intensity = Math.max(0, sunHeight);

        // UI Updates
        // Time
        const totalMinutes = Math.floor(this.dayTime * 24 * 60);
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const timeStr = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        const timeEl = document.getElementById('time-display');
        if (timeEl) timeEl.textContent = timeStr;

        // Biome
        if (this.net.myId && this.entities.has(this.net.myId)) {
            const pos = this.entities.get(this.net.myId).mesh.position;
            const chunkSize = 32;
            const cx = Math.floor(pos.x / chunkSize);
            const cz = Math.floor(pos.z / chunkSize);
            const key = `${cx},${cz}`;
            
            const chunk = this.chunks.get(key);
            if (chunk && chunk.biomeMap) {
                // Local Coords (ensure positive mod)
                // pos.x can be negative.
                // relative x: pos.x - cx * 32.
                let lx = Math.floor(pos.x - cx * chunkSize);
                let lz = Math.floor(pos.z - cz * chunkSize);
                
                // Clamp to 0..32 just in case
                lx = Math.max(0, Math.min(32, lx));
                lz = Math.max(0, Math.min(32, lz));
                
                const idx = lz * 33 + lx; // Stride is 33
                const biome = chunk.biomeMap[idx];
                if (biome) {
                    const biomeEl = document.getElementById('biome-display');
                    if (biomeEl && biomeEl.textContent !== biome) biomeEl.textContent = biome.replace('_', ' ');
                }
            }
        }

        // 2. Interpolation
        const snapshot = this.net.getInterpolatedState();
        if (snapshot && snapshot.state) {
            this.updateEntities(snapshot.state);
            this.updateVehicles(snapshot.state);
        }

        // 3. Third Person Camera Logic
        const camDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation.y);
        const camRight = new THREE.Vector3(-camDir.z, 0, camDir.x);

        // Use full camera orientation (including pitch) for interaction raycasts
        const viewDir = new THREE.Vector3(0, 0, -1)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), this.cameraRotation.x)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation.y)
            .normalize();

        const finalMove = new THREE.Vector3();
        finalMove.addScaledVector(camDir, -this.input.moveDir.y);
        finalMove.addScaledVector(camRight, this.input.moveDir.x);

        this.net.sendInput({
            x: finalMove.x,
            y: finalMove.z,
            viewDir: { x: viewDir.x, y: viewDir.y, z: viewDir.z },
            jump: this.input.jump,
            interact: this.input.interact
        });
        this.input.interact = false;
        
        // Chunk Update
        this.updateChunks();

        // Update Camera Position
        if (this.net.myId && this.entities.has(this.net.myId)) {
            const myMesh = this.entities.get(this.net.myId).mesh;
            const target = myMesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            
            const dist = 5.0;
            const offset = new THREE.Vector3(
                0, 
                0, 
                dist
            ).applyAxisAngle(new THREE.Vector3(1, 0, 0), this.cameraRotation.x)
             .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation.y);
            
            this.camera.position.copy(target).add(offset);
            this.camera.lookAt(target);
            
            // Rotate Player Mesh to face movement (Fixed 180 flip)
            if (finalMove.lengthSq() > 0.001) {
                const angle = Math.atan2(finalMove.x, finalMove.z);
                myMesh.rotation.y = angle + Math.PI;
            }
        }

        this.renderer.render(this.scene, this.camera);
        this.updateMinimap();
    }

    updateMinimap() {
        const canvas = document.getElementById('minimap-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        
        // Background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // Grid lines (Radar effect)
        ctx.strokeStyle = '#004400';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, width/3, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(width, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
        ctx.stroke();
        
        // Draw Self (Green Arrow)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-this.cameraRotation.y);
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-6, 6);
        ctx.lineTo(6, 6);
        ctx.fill();
        ctx.restore();
        
        if (this.net.myId && this.entities.has(this.net.myId)) {
            const myMesh = this.entities.get(this.net.myId).mesh;
            const myPos = myMesh.position;
            const range = 200; // Increased Range
            
            this.entities.forEach((entity, id) => {
                if (id === this.net.myId) return;
                
                const pos = entity.mesh.position;
                const dx = pos.x - myPos.x;
                const dz = pos.z - myPos.z; 
                
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < range) {
                    const mapX = cx + (dx / range) * (width/2 - 10);
                    const mapY = cy + (dz / range) * (height/2 - 10);
                    
                    ctx.fillStyle = '#f00';
                    ctx.beginPath();
                    ctx.arc(mapX, mapY, 4, 0, Math.PI*2);
                    ctx.fill();
                }
            });
        }
    }

    updateEntities(state) {
        const validIds = new Set();
        if (Array.isArray(state)) {
            state.forEach(data => {
                // Skip Vehicles
                if (['JEEP', 'TANK', 'HELICOPTER'].includes(data.type)) return;

                const id = data.id;
                if (!id) return;
                validIds.add(id);
                
                if (!this.entities.has(id)) {
                    const isPlayer = !data.type; // Simplistic check, might need refinement if Units have types
                    // Units have types 'SOLDIER', 'TANK' (Wait, Unit TANK vs Vehicle TANK?)
                    // AIUnit TANK is 'TANK'. Vehicle is 'TANK'.
                    // Conflict! 
                    // AIUnit logic renders as green box. Vehicle logic renders as model.
                    // We need to distinguish.
                    // AIUnit in Player.js/AIUnit.js doesn't seem to set a 'class' property like 'vehicle'.
                    // Let's assume for now AIUnit Tank is legacy/unused or needs to be rendered as Vehicle?
                    // "WarDirector" spawns "TANK" unit.
                    // "Vehicle.js" spawns "TANK" vehicle.
                    // They share the type string.
                    // Let's rely on ID prefix? Vehicles are `veh_`. Units are `team_type_...`.
                    // Or check `data.type` strict.
                    
                    let mesh, rig;
                    if (isPlayer) {
                        const options = {};
                        if (data.hairColor) options.hair = new THREE.Color(data.hairColor);
                        if (data.skinColor) options.skin = new THREE.Color(data.skinColor);
                        if (data.outfit) options.outfit = data.outfit;
                        if (data.hairStyle) options.hairStyle = data.hairStyle;
                        
                        rig = new ModelRig(options);
                        mesh = rig.group;
                        this.scene.add(mesh);
                    } else {
                        // NPC / AI Unit
                        const geom = new THREE.BoxGeometry(1, 1, 1);
                        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                        mesh = new THREE.Mesh(geom, mat);
                        this.scene.add(mesh);
                    }
                    this.entities.set(id, { 
                        mesh, 
                        rig, 
                        hairColor: data.hairColor, 
                        skinColor: data.skinColor,
                        outfit: data.outfit,
                        hairStyle: data.hairStyle
                    });
                }

                const entity = this.entities.get(id);
                
                // ... (Customization check omitted for brevity in match, but needed) ...
                // Re-implement customization check for Players
                if (!data.type && (data.hairColor !== entity.hairColor || 
                    data.skinColor !== entity.skinColor ||
                    data.outfit !== entity.outfit ||
                    data.hairStyle !== entity.hairStyle)) {
                    
                    this.scene.remove(entity.mesh);
                    const options = {};
                    if (data.hairColor) options.hair = new THREE.Color(data.hairColor);
                    if (data.skinColor) options.skin = new THREE.Color(data.skinColor);
                    if (data.outfit) options.outfit = data.outfit;
                    if (data.hairStyle) options.hairStyle = data.hairStyle;
                    
                    entity.rig = new ModelRig(options);
                    entity.mesh = entity.rig.group;
                    this.scene.add(entity.mesh);
                    
                    entity.hairColor = data.hairColor;
                    entity.skinColor = data.skinColor;
                    entity.outfit = data.outfit;
                    entity.hairStyle = data.hairStyle;
                }

                // Interpolation handles pos
                const prevPos = entity.mesh.position.clone();
                entity.mesh.position.set(data.x, data.y, data.z);
                
                if (entity.rig) {
                    const dist = entity.mesh.position.distanceTo(prevPos);
                    const speed = dist * 60; // Units per second approx
                    entity.rig.updateAnimation(0.016, speed); 
                }
                
                if (id === this.net.myId) {
                    if (data.hp !== undefined) {
                        const hpBar = document.getElementById('hp-bar');
                        if (hpBar) hpBar.style.width = Math.max(0, Math.min(100, data.hp)) + '%';
                    }
                    if (data.username) {
                        const nameEl = document.getElementById('player-name');
                        if (nameEl) nameEl.textContent = data.username.toUpperCase();
                    }
                }
            });
        }
        for (const [id, entity] of this.entities) {
            if (!validIds.has(id)) {
                this.scene.remove(entity.mesh);
                this.entities.delete(id);
            }
        }
    }

    updateVehicles(stateArray) {
        if (!stateArray) return;
        
        const validIds = new Set();
        
        stateArray.forEach(data => {
            if (!['JEEP', 'TANK', 'HELICOPTER'].includes(data.type)) return;
            // Additional check: Vehicles from /spawnvehicle use 'veh_' prefix usually, 
            // but AI tanks use 'TEAM_TANK_...'.
            // If we want to render AI tanks as Vehicles, we should allow them here.
            // But `updateEntities` renders them as Boxes.
            // Let's prioritize `updateVehicles` for anything matching the type.
            // And ensure `updateEntities` skips them.
            
            const id = data.id;
            validIds.add(id);
            
            if (!this.vehicles.has(id)) {
                const mesh = this.renderVehicle(data.type);
                this.scene.add(mesh);
                this.vehicles.set(id, { mesh, type: data.type });
            }
            
            const entity = this.vehicles.get(id);
            const mesh = entity.mesh;
            
            mesh.position.set(data.x, data.y, data.z);
            mesh.quaternion.set(data.qx, data.qy, data.qz, data.qw);
            
            if (data.type === 'HELICOPTER') {
                const rotor = mesh.getObjectByName('rotor');
                if (rotor) rotor.rotation.y += 0.5; 
            }
        });

        // Remove missing
        for (const [id, entity] of this.vehicles) {
            if (!validIds.has(id)) {
                this.scene.remove(entity.mesh);
                this.vehicles.delete(id);
            }
        }
    }
}

new GameClient();