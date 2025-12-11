export const isDebugOn = false;

export const serverConfig = {
    tickRate: 60,
    gravity: { x: 0.0, y: -9.81, z: 0.0 },
    port: 3000
};

export const worldConfig = {
    seed: 'cyberia-infinite',
    chunkSize: 32,
    seaLevel: -1.0,
    spawn: {
        x: 0,
        z: 0,
        fallbackHeight: 20,
        clearanceAboveGround: 2.0
    }
};

export const appearanceDefaults = {
    username: 'Guest',
    hairColor: '#c54f5c',
    skinColor: '#f7d6c2',
    outfit: 'DEFAULT',
    hairStyle: 'DEFAULT'
};

export const gameplayConfig = {
    interactRange: 2.0,
    interpolationRate: 60,
    interpolationBufferSize: 20
};

export const renderingConfig = {
    backgroundColor: 0x87CEEB,
    fog: { color: 0x87CEEB, near: 10, far: 200 },
    cameraFov: 75,
    sunLight: {
        intensity: 1,
        shadowMapSize: 2048,
        cameraNear: 0.5,
        cameraFar: 500,
        cameraBounds: 100
    },
    dayTimeStart: 0.25
};

export default {
    isDebugOn,
    serverConfig,
    worldConfig,
    appearanceDefaults,
    gameplayConfig,
    renderingConfig
};
