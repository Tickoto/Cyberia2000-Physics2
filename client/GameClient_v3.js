import * as THREE from 'three';
import { io } from 'socket.io-client';
import NetworkController from './NetworkController.js';
import { ModelRig, ModelViewer } from '../model.js';
import NetworkManager from '../shared/NetworkManager.js';
import { appearanceDefaults, clientConfig, gameplayConfig, isDebugOn, renderingConfig } from '../shared/config.js';

class GameClient {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Connect to configured server URL, or same origin if not set
        // For remote connections, set clientConfig.serverUrl in shared/config.js
        // e.g., 'http://192.168.1.100:3000' or 'http://your-server.com:3000'
        const serverUrl = clientConfig?.serverUrl || null;
        this.socket = serverUrl ? io(serverUrl) : io();
        this.net = new NetworkController(this.socket);
        this.entities = new Map(); // id -> { mesh, rig? }
        this.vehicles = new Map(); // id -> { mesh, type }
        
        this.sunLight = null;
        this.dayTime = renderingConfig.dayTimeStart; // 0.25 = Noon (Sun at top)

        this.input = {
            moveDir: { x: 0, y: 0 },
            viewDir: { x: 0, y: 0, z: -1 },
            jump: false,
            interact: false,
            crouch: false,      // Shift key - throttle down for helicopter
            yawLeft: false,     // Z key - yaw left
            yawRight: false     // C key - yaw right
        };

        // Track current mounted vehicle for UI
        this.mountedVehicleId = null;
        this.mountedVehicleType = null;
        this.helicopterUI = null;

        this.interactRange = gameplayConfig.interactRange;
        this.interactRaycaster = new THREE.Raycaster();
        this.interactDebugLine = null;
        this.isDebugOn = isDebugOn === true;
        
        this.cameraRotation = { x: 0, y: 0 }; // Pitch, Yaw
        this.isLocked = false;
        this.username = appearanceDefaults.username;
        this.playerClass = "SOLDIER"; // Default
        this.hairColor = appearanceDefaults.hairColor;
        this.skinColor = appearanceDefaults.skinColor;
        this.outfit = appearanceDefaults.outfit;
        this.hairStyle = appearanceDefaults.hairStyle;
        this.currentBiome = "SCANNING...";

        this.init();
    }

    init() {
        // 1. Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(renderingConfig.backgroundColor);
        this.scene.fog = new THREE.Fog(renderingConfig.fog.color, renderingConfig.fog.near, renderingConfig.fog.far);

        this.camera = new THREE.PerspectiveCamera(renderingConfig.cameraFov, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        if (this.isDebugOn) {
            const baseDir = new THREE.Vector3(0, 0, -1);
            this.interactDebugLine = new THREE.ArrowHelper(baseDir, new THREE.Vector3(), this.interactRange, 0xff0000);
            this.interactDebugLine.frustumCulled = false;
            this.interactDebugLine.renderOrder = 999;

            // Force the interaction ray visual to always render on top and stay bright
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.95,
                fog: false,
                toneMapped: false
            });
            const coneMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.95,
                fog: false,
                toneMapped: false
            });
            this.interactDebugLine.line.material = lineMaterial;
            this.interactDebugLine.cone.material = coneMaterial;
            this.interactDebugLine.visible = false;
            this.scene.add(this.interactDebugLine);
        }

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, renderingConfig.sunLight.intensity);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = renderingConfig.sunLight.shadowMapSize;
        this.sunLight.shadow.mapSize.height = renderingConfig.sunLight.shadowMapSize;
        this.sunLight.shadow.camera.near = renderingConfig.sunLight.cameraNear;
        this.sunLight.shadow.camera.far = renderingConfig.sunLight.cameraFar;
        this.sunLight.shadow.camera.left = -renderingConfig.sunLight.cameraBounds;
        this.sunLight.shadow.camera.right = renderingConfig.sunLight.cameraBounds;
        this.sunLight.shadow.camera.top = renderingConfig.sunLight.cameraBounds;
        this.sunLight.shadow.camera.bottom = -renderingConfig.sunLight.cameraBounds;
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

        this.socket.on(NetworkManager.Packet.VEHICLE_MOUNTED, (data) => {
            if (!data || !data.vehicleId) return;

            if (!data.success) {
                console.warn(`Failed to enter vehicle seat ${data.seat}: ${data.reason || 'Unknown reason'}`);
                return;
            }

            const myEntity = this.entities.get(this.net.myId);
            if (myEntity && data.position) {
                myEntity.mesh.position.set(data.position.x, data.position.y, data.position.z);
            }

            if (this.net.networkState?.players && this.net.networkState.players[this.net.myId] && data.position) {
                const p = this.net.networkState.players[this.net.myId];
                p.x = data.position.x;
                p.y = data.position.y;
                p.z = data.position.z;
            }
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
                            this.socket.emit(NetworkManager.Packet.ENTER_VEHICLE, {
                                vehicleId: data.targetId,
                                seat: seat.id
                            });
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

        if (this.isDebugOn) {
            this.socket.on(NetworkManager.Packet.INTERACT_DEBUG, (data) => {
                console.log('[Server Interaction Debug]', data);
            });
        }
        
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
                case 'ShiftLeft':
                case 'ShiftRight': this.input.crouch = down; break;
                case 'KeyZ': this.input.yawLeft = down; break;
                case 'KeyC': this.input.yawRight = down; break;
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
    
    /**
     * Creates procedural composite meshes for vehicles
     * Each vehicle type has distinct visual elements
     */
    renderVehicle(type) {
        const group = new THREE.Group();

        if (type === 'JEEP') {
            // JEEP - Light military vehicle with visible suspension

            // Main body (chassis)
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.8 });
            const chassisGeo = new THREE.BoxGeometry(2.0, 0.5, 3.5);
            const chassis = new THREE.Mesh(chassisGeo, bodyMat);
            chassis.position.y = 0.3;
            chassis.name = 'chassis';
            group.add(chassis);

            // Hood
            const hoodGeo = new THREE.BoxGeometry(1.8, 0.4, 1.2);
            const hood = new THREE.Mesh(hoodGeo, bodyMat);
            hood.position.set(0, 0.7, 1.2);
            group.add(hood);

            // Windshield frame
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
            const windshieldFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.1), frameMat);
            windshieldFrame.position.set(0, 1.1, 0.5);
            group.add(windshieldFrame);

            // Roll cage
            const cageMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const rollBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), cageMat);
            rollBar1.position.set(-0.75, 1.1, -0.2);
            group.add(rollBar1);
            const rollBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), cageMat);
            rollBar2.position.set(0.75, 1.1, -0.2);
            group.add(rollBar2);
            const rollBarTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), cageMat);
            rollBarTop.position.set(0, 1.5, -0.2);
            group.add(rollBarTop);

            // Rear section
            const rearGeo = new THREE.BoxGeometry(1.8, 0.6, 1.0);
            const rear = new THREE.Mesh(rearGeo, bodyMat);
            rear.position.set(0, 0.5, -1.2);
            group.add(rear);

            // Fenders
            const fenderMat = new THREE.MeshStandardMaterial({ color: 0x3d4d1a });
            const fenderGeo = new THREE.BoxGeometry(0.4, 0.3, 0.8);
            [[-1.0, 0.1, 1.2], [1.0, 0.1, 1.2], [-1.0, 0.1, -1.2], [1.0, 0.1, -1.2]].forEach(pos => {
                const fender = new THREE.Mesh(fenderGeo, fenderMat);
                fender.position.set(...pos);
                group.add(fender);
            });

            // Wheels with suspension - stored for animation
            const wheelGroup = new THREE.Group();
            wheelGroup.name = 'wheels';
            const wheelPositions = [
                { x: -0.85, y: -0.3, z: 1.2, name: 'wheel_fl' },
                { x: 0.85, y: -0.3, z: 1.2, name: 'wheel_fr' },
                { x: -0.85, y: -0.3, z: -1.2, name: 'wheel_rl' },
                { x: 0.85, y: -0.3, z: -1.2, name: 'wheel_rr' }
            ];

            wheelPositions.forEach((wp, idx) => {
                const wheelAssembly = new THREE.Group();
                wheelAssembly.name = wp.name;
                wheelAssembly.position.set(wp.x, wp.y, wp.z);
                wheelAssembly.userData.baseY = wp.y;

                // Tire
                const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
                tireGeo.rotateZ(Math.PI / 2);
                const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
                const tire = new THREE.Mesh(tireGeo, tireMat);
                tire.name = 'tire';
                wheelAssembly.add(tire);

                // Rim
                const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 8);
                rimGeo.rotateZ(Math.PI / 2);
                const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
                const rim = new THREE.Mesh(rimGeo, rimMat);
                wheelAssembly.add(rim);

                // Hub detail
                const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 6);
                hubGeo.rotateZ(Math.PI / 2);
                const hub = new THREE.Mesh(hubGeo, new THREE.MeshStandardMaterial({ color: 0x444444 }));
                wheelAssembly.add(hub);

                wheelGroup.add(wheelAssembly);
            });
            group.add(wheelGroup);

            // Headlights
            const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.3 });
            const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
            lightGeo.rotateX(Math.PI / 2);
            [[-0.6, 0.65, 1.8], [0.6, 0.65, 1.8]].forEach(pos => {
                const light = new THREE.Mesh(lightGeo, lightMat);
                light.position.set(...pos);
                group.add(light);
            });

        } else if (type === 'TANK') {
            // TANK - Heavy armored vehicle with animated tracks

            const armorMat = new THREE.MeshStandardMaterial({ color: 0x3d3d32, roughness: 0.7, metalness: 0.3 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

            // Main hull
            const hullGeo = new THREE.BoxGeometry(3.2, 1.0, 5.5);
            const hull = new THREE.Mesh(hullGeo, armorMat);
            hull.position.y = 0.8;
            hull.name = 'hull';
            group.add(hull);

            // Sloped front armor
            const frontArmorGeo = new THREE.BoxGeometry(3.0, 0.6, 1.0);
            const frontArmor = new THREE.Mesh(frontArmorGeo, armorMat);
            frontArmor.position.set(0, 0.5, 3.0);
            frontArmor.rotation.x = -0.3;
            group.add(frontArmor);

            // Turret
            const turretGeo = new THREE.CylinderGeometry(1.0, 1.2, 0.7, 8);
            const turret = new THREE.Mesh(turretGeo, armorMat);
            turret.position.set(0, 1.7, 0);
            turret.name = 'turret';
            group.add(turret);

            // Turret hatch
            const hatchGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8);
            const hatch = new THREE.Mesh(hatchGeo, darkMat);
            hatch.position.set(0.3, 2.1, -0.3);
            group.add(hatch);

            // Main gun barrel
            const barrelGeo = new THREE.CylinderGeometry(0.12, 0.15, 4.0, 8);
            barrelGeo.rotateX(Math.PI / 2);
            const barrel = new THREE.Mesh(barrelGeo, darkMat);
            barrel.position.set(0, 1.7, 3.5);
            barrel.name = 'barrel';
            group.add(barrel);

            // Muzzle brake
            const muzzleGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
            muzzleGeo.rotateX(Math.PI / 2);
            const muzzle = new THREE.Mesh(muzzleGeo, darkMat);
            muzzle.position.set(0, 1.7, 5.6);
            group.add(muzzle);

            // Track assemblies (left and right)
            const trackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 });

            ['left', 'right'].forEach((side, sideIdx) => {
                const trackGroup = new THREE.Group();
                trackGroup.name = `track_${side}`;
                const xOffset = side === 'left' ? -1.8 : 1.8;
                trackGroup.position.x = xOffset;

                // Track housing
                const housingGeo = new THREE.BoxGeometry(0.6, 0.8, 5.8);
                const housing = new THREE.Mesh(housingGeo, armorMat);
                housing.position.y = 0.2;
                trackGroup.add(housing);

                // Track surface (animated)
                const trackSurfaceGeo = new THREE.BoxGeometry(0.65, 0.15, 5.9);
                const trackSurface = new THREE.Mesh(trackSurfaceGeo, trackMat);
                trackSurface.position.y = -0.25;
                trackSurface.name = 'trackSurface';
                trackGroup.add(trackSurface);

                // Track links pattern (visual detail)
                for (let i = 0; i < 12; i++) {
                    const linkGeo = new THREE.BoxGeometry(0.68, 0.05, 0.1);
                    const link = new THREE.Mesh(linkGeo, darkMat);
                    link.position.set(0, -0.35, -2.7 + i * 0.5);
                    link.name = `link_${i}`;
                    trackGroup.add(link);
                }

                // Road wheels (6 per side)
                for (let i = 0; i < 6; i++) {
                    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
                    wheelGeo.rotateZ(Math.PI / 2);
                    const wheel = new THREE.Mesh(wheelGeo, darkMat);
                    wheel.position.set(0, 0.1, -2.0 + i * 0.8);
                    wheel.name = `roadwheel_${i}`;
                    trackGroup.add(wheel);
                }

                // Drive sprocket (rear)
                const sprocketGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 12);
                sprocketGeo.rotateZ(Math.PI / 2);
                const sprocket = new THREE.Mesh(sprocketGeo, darkMat);
                sprocket.position.set(0, 0.4, -2.5);
                sprocket.name = 'sprocket';
                trackGroup.add(sprocket);

                // Idler wheel (front)
                const idlerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.35, 12);
                idlerGeo.rotateZ(Math.PI / 2);
                const idler = new THREE.Mesh(idlerGeo, darkMat);
                idler.position.set(0, 0.4, 2.5);
                idler.name = 'idler';
                trackGroup.add(idler);

                // Side skirts
                const skirtGeo = new THREE.BoxGeometry(0.1, 0.5, 4.5);
                const skirt = new THREE.Mesh(skirtGeo, armorMat);
                skirt.position.set(side === 'left' ? 0.35 : -0.35, 0.5, 0);
                trackGroup.add(skirt);

                group.add(trackGroup);
            });

            // Exhaust pipes
            const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);
            const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            [[-1.2, 1.5, -2.5], [-0.9, 1.5, -2.5]].forEach(pos => {
                const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
                exhaust.position.set(...pos);
                group.add(exhaust);
            });

        } else if (type === 'HELICOPTER') {
            // HELICOPTER - Military transport helicopter

            const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d4a3a, roughness: 0.6 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.4,
                metalness: 0.9
            });

            // Main fuselage
            const fuselageGeo = new THREE.BoxGeometry(2.2, 2.0, 5.0);
            const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
            fuselage.position.y = 0;
            fuselage.name = 'fuselage';
            group.add(fuselage);

            // Nose section (tapered)
            const noseGeo = new THREE.BoxGeometry(1.8, 1.4, 1.5);
            const nose = new THREE.Mesh(noseGeo, bodyMat);
            nose.position.set(0, -0.2, 3.0);
            group.add(nose);

            // Cockpit windows
            const windowGeo = new THREE.BoxGeometry(1.6, 0.8, 0.1);
            const cockpitWindow = new THREE.Mesh(windowGeo, glassMat);
            cockpitWindow.position.set(0, 0.3, 3.8);
            cockpitWindow.rotation.x = -0.3;
            group.add(cockpitWindow);

            // Side windows
            [[-1.15, 0.3, 1.5], [1.15, 0.3, 1.5]].forEach((pos, idx) => {
                const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 1.2), glassMat);
                sideWindow.position.set(...pos);
                group.add(sideWindow);
            });

            // Tail boom
            const tailGeo = new THREE.BoxGeometry(0.6, 0.6, 4.0);
            const tail = new THREE.Mesh(tailGeo, bodyMat);
            tail.position.set(0, 0.3, -4.5);
            tail.name = 'tail';
            group.add(tail);

            // Tail fin (vertical stabilizer)
            const finGeo = new THREE.BoxGeometry(0.1, 1.5, 1.0);
            const fin = new THREE.Mesh(finGeo, bodyMat);
            fin.position.set(0, 1.0, -6.0);
            group.add(fin);

            // Horizontal stabilizer
            const hStabGeo = new THREE.BoxGeometry(2.0, 0.1, 0.6);
            const hStab = new THREE.Mesh(hStabGeo, bodyMat);
            hStab.position.set(0, 0.8, -6.2);
            group.add(hStab);

            // Main rotor mast
            const mastGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8);
            const mast = new THREE.Mesh(mastGeo, darkMat);
            mast.position.set(0, 1.4, 0.5);
            group.add(mast);

            // Main rotor hub
            const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
            const hub = new THREE.Mesh(hubGeo, darkMat);
            hub.position.set(0, 1.9, 0.5);
            hub.name = 'rotorHub';
            group.add(hub);

            // Main rotor assembly (4 blades)
            const rotorGroup = new THREE.Group();
            rotorGroup.name = 'mainRotor';
            rotorGroup.position.set(0, 2.0, 0.5);

            for (let i = 0; i < 4; i++) {
                const bladeGeo = new THREE.BoxGeometry(0.25, 0.05, 5.0);
                const blade = new THREE.Mesh(bladeGeo, darkMat);
                blade.position.z = 2.5;
                blade.rotation.y = (i * Math.PI) / 2;

                const bladePivot = new THREE.Group();
                bladePivot.add(blade);
                bladePivot.rotation.y = (i * Math.PI) / 2;
                rotorGroup.add(bladePivot);
            }
            group.add(rotorGroup);

            // Tail rotor assembly
            const tailRotorGroup = new THREE.Group();
            tailRotorGroup.name = 'tailRotor';
            tailRotorGroup.position.set(0.35, 0.8, -6.3);
            tailRotorGroup.rotation.z = Math.PI / 2;

            for (let i = 0; i < 4; i++) {
                const tBladeGeo = new THREE.BoxGeometry(0.08, 0.02, 0.8);
                const tBlade = new THREE.Mesh(tBladeGeo, darkMat);
                tBlade.position.z = 0.4;

                const tBladePivot = new THREE.Group();
                tBladePivot.add(tBlade);
                tBladePivot.rotation.y = (i * Math.PI) / 2;
                tailRotorGroup.add(tBladePivot);
            }
            group.add(tailRotorGroup);

            // Landing skids
            const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            ['left', 'right'].forEach((side, idx) => {
                const xOff = side === 'left' ? -1.0 : 1.0;

                // Main skid tube
                const skidGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8);
                skidGeo.rotateX(Math.PI / 2);
                const skid = new THREE.Mesh(skidGeo, skidMat);
                skid.position.set(xOff, -1.3, 0.5);
                group.add(skid);

                // Support struts
                [1.2, -0.8].forEach(zOff => {
                    const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6);
                    const strut = new THREE.Mesh(strutGeo, skidMat);
                    strut.position.set(xOff, -0.8, zOff);
                    strut.rotation.z = idx === 0 ? 0.2 : -0.2;
                    group.add(strut);
                });
            });

            // Engine housing
            const engineGeo = new THREE.BoxGeometry(1.8, 0.8, 1.5);
            const engine = new THREE.Mesh(engineGeo, bodyMat);
            engine.position.set(0, 1.2, -0.5);
            group.add(engine);

            // Exhaust
            const exhaustGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.6, 8);
            exhaustGeo.rotateX(Math.PI / 2);
            const exhaust = new THREE.Mesh(exhaustGeo, darkMat);
            exhaust.position.set(0.5, 1.3, -1.5);
            group.add(exhaust);
        }

        return group;
    }

    /**
     * Animate Jeep wheels based on suspension compression and rotation
     */
    animateJeep(mesh, data) {
        const wheelsGroup = mesh.getObjectByName('wheels');
        if (!wheelsGroup) return;

        const wheelNames = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
        const suspensionCompression = data.suspensionCompression || [0, 0, 0, 0];
        const wheelRotations = data.wheelRotations || [0, 0, 0, 0];
        const steerAngle = data.steerAngle || 0;

        wheelNames.forEach((name, idx) => {
            const wheel = wheelsGroup.getObjectByName(name);
            if (wheel) {
                // Vertical movement based on suspension compression
                const baseY = wheel.userData.baseY || -0.3;
                const compression = suspensionCompression[idx] || 0;
                wheel.position.y = baseY + compression * 0.5;

                // Wheel rotation based on velocity
                const tire = wheel.getObjectByName('tire');
                if (tire) {
                    tire.rotation.x = wheelRotations[idx] || 0;
                }

                // Front wheel steering
                if (idx < 2) {
                    wheel.rotation.y = steerAngle;
                }
            }
        });
    }

    /**
     * Animate Tank tracks and road wheels
     */
    animateTank(mesh, data) {
        const leftTrack = mesh.getObjectByName('track_left');
        const rightTrack = mesh.getObjectByName('track_right');

        const leftTrackSpeed = data.leftTrackSpeed || 0;
        const rightTrackSpeed = data.rightTrackSpeed || 0;

        // Animate track links and road wheels
        [leftTrack, rightTrack].forEach((track, trackIdx) => {
            if (!track) return;

            const trackSpeed = trackIdx === 0 ? leftTrackSpeed : rightTrackSpeed;

            // Rotate road wheels
            for (let i = 0; i < 6; i++) {
                const wheel = track.getObjectByName(`roadwheel_${i}`);
                if (wheel) {
                    wheel.rotation.x += trackSpeed * 0.05;
                }
            }

            // Rotate sprocket and idler
            const sprocket = track.getObjectByName('sprocket');
            const idler = track.getObjectByName('idler');
            if (sprocket) sprocket.rotation.x += trackSpeed * 0.05;
            if (idler) idler.rotation.x += trackSpeed * 0.05;

            // Animate track links (UV offset simulation via position)
            for (let i = 0; i < 12; i++) {
                const link = track.getObjectByName(`link_${i}`);
                if (link) {
                    // Move links along track
                    link.position.z += trackSpeed * 0.01;
                    // Wrap around
                    if (link.position.z > 3.0) link.position.z -= 6.0;
                    if (link.position.z < -3.0) link.position.z += 6.0;
                }
            }
        });
    }

    /**
     * Animate Helicopter rotors based on RPM
     */
    animateHelicopter(mesh, data, entity) {
        const mainRotor = mesh.getObjectByName('mainRotor');
        const tailRotor = mesh.getObjectByName('tailRotor');

        // RPM-based rotor speed
        const rpm = data.rpm || 0;
        const maxRpm = data.maxRpm || 400;
        const rpmRatio = rpm / maxRpm;

        // Store RPM for UI
        entity.lastRPM = rpm;
        entity.maxRPM = maxRpm;
        entity.rpmRatio = rpmRatio;

        // Main rotor rotation speed based on RPM
        const rotorSpeed = rpmRatio * 0.8; // Max speed at full RPM
        if (mainRotor) {
            mainRotor.rotation.y += rotorSpeed;
        }

        // Tail rotor spins faster
        if (tailRotor) {
            tailRotor.rotation.y += rotorSpeed * 1.5;
        }
    }

    /**
     * Creates helicopter HUD with RPM gauge
     */
    createHelicopterUI() {
        // Remove existing UI if any
        this.removeHelicopterUI();

        const container = document.createElement('div');
        container.id = 'helicopter-hud';
        container.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 20, 0, 0.85);
            border: 2px solid #0f0;
            border-radius: 10px;
            padding: 15px 25px;
            font-family: 'VT323', monospace;
            color: #0f0;
            z-index: 1000;
            min-width: 300px;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
        `;

        // Title
        const title = document.createElement('div');
        title.style.cssText = 'font-size: 14px; text-align: center; margin-bottom: 10px; letter-spacing: 2px;';
        title.textContent = 'HELICOPTER SYSTEMS';
        container.appendChild(title);

        // RPM Gauge Container
        const gaugeContainer = document.createElement('div');
        gaugeContainer.style.cssText = 'margin-bottom: 10px;';

        const rpmLabel = document.createElement('div');
        rpmLabel.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;';
        rpmLabel.innerHTML = '<span>ROTOR RPM</span><span id="rpm-value">0</span>';
        gaugeContainer.appendChild(rpmLabel);

        const gaugeOuter = document.createElement('div');
        gaugeOuter.style.cssText = `
            width: 100%;
            height: 20px;
            background: #001100;
            border: 1px solid #0f0;
            border-radius: 3px;
            overflow: hidden;
            position: relative;
        `;

        // Threshold marker at 60%
        const thresholdMarker = document.createElement('div');
        thresholdMarker.style.cssText = `
            position: absolute;
            left: 60%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #ff0;
            z-index: 2;
        `;
        gaugeOuter.appendChild(thresholdMarker);

        const gaugeFill = document.createElement('div');
        gaugeFill.id = 'rpm-gauge-fill';
        gaugeFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #ff0000 0%, #ff0000 30%, #ffff00 50%, #00ff00 70%, #00ff00 100%);
            transition: width 0.1s ease-out;
            position: relative;
            z-index: 1;
        `;
        gaugeOuter.appendChild(gaugeFill);
        gaugeContainer.appendChild(gaugeOuter);
        container.appendChild(gaugeContainer);

        // Status indicators
        const statusRow = document.createElement('div');
        statusRow.style.cssText = 'display: flex; justify-content: space-around; font-size: 11px;';

        const liftStatus = document.createElement('div');
        liftStatus.id = 'lift-status';
        liftStatus.style.cssText = 'text-align: center;';
        liftStatus.innerHTML = '<div style="color: #666;">LIFT</div><div id="lift-indicator" style="color: #f00;">STALL</div>';
        statusRow.appendChild(liftStatus);

        const engineStatus = document.createElement('div');
        engineStatus.id = 'engine-status';
        engineStatus.style.cssText = 'text-align: center;';
        engineStatus.innerHTML = '<div style="color: #666;">ENGINE</div><div id="engine-indicator" style="color: #ff0;">IDLE</div>';
        statusRow.appendChild(engineStatus);

        container.appendChild(statusRow);

        // Controls hint
        const controlsHint = document.createElement('div');
        controlsHint.style.cssText = 'font-size: 10px; color: #666; text-align: center; margin-top: 10px; border-top: 1px solid #333; padding-top: 8px;';
        controlsHint.innerHTML = 'SPACE: Throttle Up | SHIFT: Throttle Down<br>W/S: Pitch | A/D: Roll | Z/C: Yaw';
        container.appendChild(controlsHint);

        document.body.appendChild(container);
        this.helicopterUI = container;
    }

    /**
     * Updates helicopter UI with current RPM data
     */
    updateHelicopterUI(rpmRatio, isEngineRunning) {
        if (!this.helicopterUI) return;

        const rpmFill = document.getElementById('rpm-gauge-fill');
        const rpmValue = document.getElementById('rpm-value');
        const liftIndicator = document.getElementById('lift-indicator');
        const engineIndicator = document.getElementById('engine-indicator');

        if (rpmFill) {
            rpmFill.style.width = `${rpmRatio * 100}%`;
        }

        if (rpmValue) {
            rpmValue.textContent = `${Math.round(rpmRatio * 100)}%`;
        }

        // Update lift status
        if (liftIndicator) {
            if (rpmRatio >= 0.6) {
                liftIndicator.textContent = 'FLYABLE';
                liftIndicator.style.color = '#0f0';
            } else if (rpmRatio >= 0.4) {
                liftIndicator.textContent = 'LOW';
                liftIndicator.style.color = '#ff0';
            } else {
                liftIndicator.textContent = 'STALL';
                liftIndicator.style.color = '#f00';
            }
        }

        // Update engine status
        if (engineIndicator) {
            if (rpmRatio >= 0.9) {
                engineIndicator.textContent = 'MAX';
                engineIndicator.style.color = '#0f0';
            } else if (rpmRatio >= 0.6) {
                engineIndicator.textContent = 'NOMINAL';
                engineIndicator.style.color = '#0f0';
            } else if (isEngineRunning || rpmRatio > 0.15) {
                engineIndicator.textContent = 'SPOOLING';
                engineIndicator.style.color = '#ff0';
            } else {
                engineIndicator.textContent = 'IDLE';
                engineIndicator.style.color = '#666';
            }
        }
    }

    /**
     * Removes helicopter UI from DOM
     */
    removeHelicopterUI() {
        if (this.helicopterUI) {
            this.helicopterUI.remove();
            this.helicopterUI = null;
        }
    }

    /**
     * Updates vehicle mount UI based on current mounted vehicle state
     * Shows helicopter HUD when piloting a helicopter, hides otherwise
     */
    updateVehicleMountUI() {
        if (!this.net.myId || !this.entities.has(this.net.myId)) {
            this.removeHelicopterUI();
            return;
        }

        const me = this.entities.get(this.net.myId);
        const mountedVehicle = me.mountedVehicle;

        // Check if we're mounted in a helicopter as the pilot (seat 0)
        if (mountedVehicle && mountedVehicle.vehicleId && mountedVehicle.seat === 0) {
            const vehicleEntity = this.vehicles.get(mountedVehicle.vehicleId);

            if (vehicleEntity && vehicleEntity.type === 'HELICOPTER') {
                // Show helicopter UI if not already visible
                if (!this.helicopterUI) {
                    this.createHelicopterUI();
                }

                // Update helicopter UI with current RPM data
                const rpmRatio = vehicleEntity.rpmRatio || 0;
                this.updateHelicopterUI(rpmRatio, vehicleEntity.lastRPM > 60);
                return;
            }
        }

        // Not piloting a helicopter, hide UI
        this.removeHelicopterUI();
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

        const interactTriggered = this.input.interact;

        // Check if player is mounted in a vehicle
        const me = this.net.myId ? this.entities.get(this.net.myId) : null;
        const isInVehicle = me && me.mountedVehicle && me.mountedVehicle.seat === 0;
        let mountedVehicleType = null;

        if (isInVehicle) {
            const vehicleEntity = this.vehicles.get(me.mountedVehicle.vehicleId);
            if (vehicleEntity) {
                mountedVehicleType = vehicleEntity.type;
            }
        }

        // Determine input based on whether we're in a vehicle
        let inputX, inputY;

        if (isInVehicle) {
            // For vehicles, send raw WASD input (vehicle-relative controls)
            // W/S = forward/back (y axis), A/D = left/right (x axis)
            inputX = this.input.moveDir.x;  // A/D raw
            inputY = this.input.moveDir.y;  // W/S raw
        } else {
            // For on-foot movement, use camera-relative movement
            const finalMove = new THREE.Vector3();
            finalMove.addScaledVector(camDir, -this.input.moveDir.y);
            finalMove.addScaledVector(camRight, this.input.moveDir.x);
            inputX = finalMove.x;
            inputY = finalMove.z;
        }

        // Send input including helicopter-specific controls
        this.net.sendInput({
            x: inputX,
            y: inputY,
            viewDir: { x: viewDir.x, y: viewDir.y, z: viewDir.z },
            jump: this.input.jump,
            interact: this.input.interact,
            crouch: this.input.crouch,
            yawLeft: this.input.yawLeft,
            yawRight: this.input.yawRight
        });
        this.input.interact = false;

        // Handle helicopter UI visibility based on mounted vehicle
        this.updateVehicleMountUI();
        
        // Chunk Update
        this.updateChunks();

        // Update Camera Position
        if (this.net.myId && this.entities.has(this.net.myId)) {
            const me = this.entities.get(this.net.myId);
            const myMesh = me.mesh;

            let target = myMesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));

            if (me.mountedVehicle && this.vehicles.has(me.mountedVehicle.vehicleId)) {
                const vMesh = this.vehicles.get(me.mountedVehicle.vehicleId).mesh;
                target = vMesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            }

            const dist = 5.0;
            const offset = new THREE.Vector3(
                0, 
                0, 
                dist
            ).applyAxisAngle(new THREE.Vector3(1, 0, 0), this.cameraRotation.x)
             .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation.y);
            
            this.camera.position.copy(target).add(offset);
            this.camera.lookAt(target);

            const headPos = myMesh.position.clone().add(new THREE.Vector3(0, 1.6, 0));
            const isPlayerObject = (obj) => {
                let current = obj;
                while (current) {
                    if (current === myMesh) return true;
                    current = current.parent;
                }
                return false;
            };

            this.interactRaycaster.far = this.interactRange;
            this.interactRaycaster.set(headPos, viewDir);
            const isInteractionDebug = (obj) => {
                let current = obj;
                while (current) {
                    if (current === this.interactDebugLine) return true;
                    current = current.parent;
                }
                return false;
            };

            const interactHits = this.interactRaycaster.intersectObjects(this.scene.children, true)
                .filter(hit => !isPlayerObject(hit.object) && !isInteractionDebug(hit.object));

            const endPoint = headPos.clone().addScaledVector(viewDir, this.interactRange);
            if (interactHits.length > 0) {
                endPoint.copy(interactHits[0].point);
            }

            if (this.isDebugOn && interactTriggered) {
                if (interactHits.length === 0) {
                    console.warn('[Client Interaction Debug] No intersection found', {
                        head: headPos.toArray(),
                        direction: viewDir.toArray(),
                        range: this.interactRange
                    });
                } else {
                    const hit = interactHits[0];
                    const chain = [];
                    let current = hit.object;
                    while (current) {
                        chain.push(current.name || current.type || current.constructor?.name);
                        current = current.parent;
                    }

                    console.log('[Client Interaction Debug] Hit detected', {
                        distance: hit.distance,
                        point: hit.point.toArray(),
                        objectName: hit.object.name || hit.object.type,
                        userData: hit.object.userData,
                        parentChain: chain
                    });
                }
            }

            if (this.interactDebugLine) {
                const targetDir = endPoint.clone().sub(headPos);
                const length = targetDir.length();

                if (length > 0.0001) {
                    this.interactDebugLine.visible = true;
                    this.interactDebugLine.position.copy(headPos);
                    this.interactDebugLine.setDirection(targetDir.normalize());
                    this.interactDebugLine.setLength(length, 0.25 * length, 0.1 * length);
                } else {
                    this.interactDebugLine.visible = false;
                }
            }

            // Rotate Player Mesh to face movement (Fixed 180 flip)
            // Only rotate when on foot (not in vehicle)
            if (!me.mountedVehicle) {
                // Reconstruct camera-relative movement for rotation
                const moveVec = new THREE.Vector3();
                moveVec.addScaledVector(camDir, -this.input.moveDir.y);
                moveVec.addScaledVector(camRight, this.input.moveDir.x);
                if (moveVec.lengthSq() > 0.001) {
                    const angle = Math.atan2(moveVec.x, moveVec.z);
                    myMesh.rotation.y = angle + Math.PI;
                }
            }
        } else if (this.interactDebugLine) {
            this.interactDebugLine.visible = false;
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

                entity.mountedVehicle = data.mountedVehicle || null;

                // Hide the player model while they are inside a vehicle
                if (!data.type && data.mountedVehicle) {
                    entity.mesh.visible = false;
                } else {
                    entity.mesh.visible = true;
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

    /**
     * Updates vehicles from state array (used in animate loop)
     * Handles creation, positioning, and animation of all vehicle types
     */
    updateVehicles(stateArray) {
        if (!stateArray) return;

        const validIds = new Set();

        stateArray.forEach(data => {
            if (!['JEEP', 'TANK', 'HELICOPTER'].includes(data.type)) return;

            const id = data.id;
            validIds.add(id);

            if (!this.vehicles.has(id)) {
                const mesh = this.renderVehicle(data.type);
                mesh.userData = { type: 'VEHICLE', vehicleId: id, vehicleType: data.type };
                this.scene.add(mesh);
                this.vehicles.set(id, { mesh, type: data.type, lastRPM: 0, rpmRatio: 0 });
            }

            const entity = this.vehicles.get(id);
            const mesh = entity.mesh;

            if (!mesh.userData || !mesh.userData.vehicleId) {
                mesh.userData = { type: 'VEHICLE', vehicleId: id, vehicleType: data.type };
            }

            mesh.position.set(data.x, data.y, data.z);
            mesh.quaternion.set(data.qx, data.qy, data.qz, data.qw);

            // Animate vehicle-specific elements based on physics state
            if (data.type === 'JEEP') {
                this.animateJeep(mesh, data);
            } else if (data.type === 'TANK') {
                this.animateTank(mesh, data);
            } else if (data.type === 'HELICOPTER') {
                this.animateHelicopter(mesh, data, entity);
            }
        });

        // Remove missing vehicles
        for (const [id, entity] of this.vehicles) {
            if (!validIds.has(id)) {
                this.scene.remove(entity.mesh);
                this.vehicles.delete(id);
            }
        }
    }
}

new GameClient();