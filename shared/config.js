export const isDebugOn = false;

export const serverConfig = {
    tickRate: 60,
    gravity: { x: 0.0, y: -9.81, z: 0.0 },
    port: 3000,
    // Host address for server binding
    // '0.0.0.0' = listen on all interfaces (allows remote connections)
    // '127.0.0.1' = localhost only (local machine only)
    host: '0.0.0.0'
};

// Client connection configuration
// Set serverUrl to connect to a specific server address
// null/empty = connect to same origin (default, works when served from the game server)
// Example: 'http://192.168.1.100:3000' or 'http://your-server.com:3000'
export const clientConfig = {
    serverUrl: null
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

/**
 * Vehicle Physics Configuration
 * Defines physics parameters for all vehicle types
 * Note: Primary source is server/Vehicle.js - this is for client reference
 */
export const vehicleConfig = {
    // JEEP - Light agile vehicle with raycast suspension
    JEEP: {
        mass: 800,
        centerOfMass: { x: 0, y: -0.3, z: 0 },
        maxSpeed: 28,
        engineForce: 12000,
        steerAngle: 0.6,
        suspension: {
            springStiffness: 45000,  // k in Hooke's Law
            damperStrength: 5500,    // b in Hooke's Law
            restLength: 0.5,
            maxTravel: 0.35,
            wheelRadius: 0.35,
            mountHeight: -0.2
        },
        lateralGrip: 0.85,
        seatCount: 4
    },

    // TANK - Heavy armored vehicle with differential steering
    TANK: {
        mass: 8000,  // 10x heavier than jeep
        centerOfMass: { x: 0, y: -0.4, z: 0 },
        maxSpeed: 14,
        engineForce: 80000,
        neutralTurnTorque: 120000,
        suspension: {
            springStiffness: 180000,
            damperStrength: 22000,
            restLength: 0.45,
            maxTravel: 0.25,
            wheelRadius: 0.4,
            mountHeight: -0.3
        },
        lateralGrip: 0.95,
        microSlipThreshold: 0.1,
        angularDamping: 4.0,  // High damping for "heavy" feel
        seatCount: 2
    },

    // HELICOPTER - RPM-based lift simulation with physics-based controls
    HELICOPTER: {
        mass: 2000,
        skids: {
            width: 1.4,
            length: 2.5,
            height: 0.08,
            dropHeight: 1.2
        },
        rotor: {
            maxRPM: 400,
            idleRPM: 0,           // Engine off = 0 RPM
            spoolUpRate: 50,      // RPM per second when holding throttle up
            spoolDownRate: 35,    // RPM per second when holding throttle down
            liftThreshold: 0.55,  // 55% RPM for lift
            maxLiftForce: 35000,
            controlMinRPM: 0.2    // 20% RPM for any control response
        },
        controls: {
            pitchRate: 1.8,
            rollRate: 2.0,
            yawRate: 1.4,
            groundedDamping: 0.1
        },
        linearDamping: 0.3,
        angularDamping: 2.5,
        seatCount: 6
    }
};

export default {
    isDebugOn,
    serverConfig,
    clientConfig,
    worldConfig,
    appearanceDefaults,
    gameplayConfig,
    renderingConfig,
    vehicleConfig
};
