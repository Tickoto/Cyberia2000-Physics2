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

/**
 * Vehicle Physics Configuration
 * Defines physics parameters for all vehicle types
 */
export const vehicleConfig = {
    // JEEP - Light agile vehicle with raycast suspension
    JEEP: {
        mass: 800,
        centerOfMass: { x: 0, y: -1.0, z: 0 },
        maxSpeed: 28,
        engineForce: 12000,
        steerAngle: 0.6,
        suspension: {
            springStiffness: 35000,  // k in Hooke's Law
            damperStrength: 4500,    // b in Hooke's Law
            restLength: 0.6,
            maxTravel: 0.4
        },
        lateralGrip: 0.85,
        seatCount: 4
    },

    // TANK - Heavy armored vehicle with differential steering
    TANK: {
        mass: 8000,  // 10x heavier than jeep
        centerOfMass: { x: 0, y: -1.2, z: 0 },
        maxSpeed: 14,
        engineForce: 80000,
        neutralTurnTorque: 120000,
        suspension: {
            springStiffness: 120000,
            damperStrength: 15000,
            restLength: 0.5,
            maxTravel: 0.3
        },
        lateralGrip: 0.95,
        microSlipThreshold: 0.1,
        angularDamping: 4.0,  // High damping for "heavy" feel
        seatCount: 2
    },

    // HELICOPTER - RPM-based lift simulation
    HELICOPTER: {
        mass: 2000,
        rotor: {
            maxRPM: 400,
            idleRPM: 50,
            spoolUpRate: 40,      // RPM per second
            spoolDownRate: 60,
            liftThreshold: 0.6,   // 60% RPM for lift
            maxLiftForce: 35000
        },
        controls: {
            pitchRate: 1.5,
            rollRate: 1.8,
            yawRate: 1.2
        },
        linearDamping: 0.3,
        angularDamping: 2.5,
        seatCount: 6
    }
};

export default {
    isDebugOn,
    serverConfig,
    worldConfig,
    appearanceDefaults,
    gameplayConfig,
    renderingConfig,
    vehicleConfig
};
