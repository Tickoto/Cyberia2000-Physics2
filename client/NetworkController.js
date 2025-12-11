import NetworkManager from '../shared/NetworkManager.js';
import { gameplayConfig } from '../shared/config.js';

// Access global from UMD bundle
const { SnapshotInterpolation } = Snap;

export default class NetworkController {
    constructor(socket) {
        this.socket = socket;
        this.SI = new SnapshotInterpolation(gameplayConfig.interpolationRate);
        this.interpolationBuffer = [];
        this.bufferSize = gameplayConfig.interpolationBufferSize; // Keep last 20 updates
        this.networkState = {}; // Local complete state
        this.myId = null;
        this.worldData = null; // Store world data here
        this.onLogin = null; // Callback
        
        this.setupListeners();
    }

    setupListeners() {
        this.socket.on(NetworkManager.Packet.LOGIN, (data) => {
            console.log('Logged in as:', data.id);
            this.myId = data.id;
            this.networkState = data.state;
            this.worldData = data.world;
            
            if (this.onLogin) this.onLogin(data);
        });

        this.socket.on(NetworkManager.Packet.UPDATE, (delta) => {
            // 1. Apply Delta to reconstruct full state
            this.networkState = NetworkManager.applyDelta(this.networkState, delta);
            
            // 2. Transform to Array for Snapshot Interpolation
            const entities = [];
            if (this.networkState.players) {
                for (const [id, data] of Object.entries(this.networkState.players)) {
                    entities.push({ id, ...data });
                }
            }
            if (this.networkState.units) {
                for (const [id, data] of Object.entries(this.networkState.units)) {
                    entities.push({ id, ...data });
                }
            }
            if (this.networkState.vehicles) {
                for (const [id, data] of Object.entries(this.networkState.vehicles)) {
                    entities.push({ id, ...data });
                }
            }

            const snapshot = {
                id: delta.timestamp.toString(),
                time: delta.timestamp,
                state: entities
            };
            
            this.SI.vault.add(snapshot);
            
            // Manual buffer implementation (backup)
            this.interpolationBuffer.push(snapshot);
            if (this.interpolationBuffer.length > this.bufferSize) {
                this.interpolationBuffer.shift();
            }
        });
    }

    sendInput(inputData) {
        this.socket.emit(NetworkManager.Packet.ACTION, { input: inputData });
    }

    sendChat(content, type = 'GLOBAL', teamId = null) {
        this.socket.emit(NetworkManager.Packet.CHAT, { content, type, teamId });
    }

    /**
     * Returns the interpolated state for the current render frame.
     * Logic: RenderTime = ServerTime - 100ms
     */
    getInterpolatedState() {
        // Use Geckos.io library
        // Returns { state: [ { id, x, y, z... } ] }
        return this.SI.calcInterpolation('x y z qx qy qz qw'); 
    }
}
