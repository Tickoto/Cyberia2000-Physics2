export default class NetworkManager {
    static Packet = {
        LOGIN: 'login',
        ACTION: 'action',
        UPDATE: 'update',
        CHAT: 'chat',
        CHUNK_REQUEST: 'chunk_request',
        CHUNK_DATA: 'chunk_data',
        INTERACT_MENU: 'interact_menu',
        INTERACT_DEBUG: 'interact_debug'
    };

    /**
     * Compares oldState and newState and returns an object containing only the differences.
     * @param {Object} oldState 
     * @param {Object} newState 
     * @returns {Object|null} Delta object or null if no changes
     */
    static getDelta(oldState, newState) {
        if (!oldState) return newState;
        
        const delta = {};
        let hasChanges = false;

        for (const key in newState) {
            if (typeof newState[key] === 'object' && newState[key] !== null) {
                if (!oldState[key]) {
                    delta[key] = newState[key];
                    hasChanges = true;
                } else {
                    const subDelta = this.getDelta(oldState[key], newState[key]);
                    if (subDelta && Object.keys(subDelta).length > 0) {
                        delta[key] = subDelta;
                        hasChanges = true;
                    }
                }
            } else if (oldState[key] !== newState[key]) {
                delta[key] = newState[key];
                hasChanges = true;
            }
        }

        // Handle deleted keys if necessary (simple implementation assumes additive/update only for high-perf sync usually, 
        // but robust delta might need a specific 'deleted' marker)
        
        return hasChanges ? delta : null;
    }

    /**
     * Reconstructs the full state by applying the delta to the base state.
     * @param {Object} baseState 
     * @param {Object} delta 
     * @returns {Object} New merged state
     */
    static applyDelta(baseState, delta) {
        if (!baseState) return delta;
        const newState = { ...baseState };

        for (const key in delta) {
            if (typeof delta[key] === 'object' && delta[key] !== null && !Array.isArray(delta[key])) {
                newState[key] = this.applyDelta(baseState[key], delta[key]);
            } else {
                newState[key] = delta[key];
            }
        }
        return newState;
    }
}
