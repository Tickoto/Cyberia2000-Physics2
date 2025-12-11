export default class ChatSystem {
    constructor() {
        this.channels = {
            GLOBAL: [],
            TEAM: {} // Map teamId -> array of messages
        };
        this.maxHistory = 50;
    }

    addMessage(type, senderId, content, teamId = null) {
        const message = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: Date.now(),
            senderId,
            content,
            type // 'GLOBAL' or 'TEAM'
        };

        if (type === 'GLOBAL') {
            this.channels.GLOBAL.push(message);
            if (this.channels.GLOBAL.length > this.maxHistory) {
                this.channels.GLOBAL.shift();
            }
        } else if (type === 'TEAM' && teamId) {
            if (!this.channels.TEAM[teamId]) {
                this.channels.TEAM[teamId] = [];
            }
            this.channels.TEAM[teamId].push(message);
            if (this.channels.TEAM[teamId].length > this.maxHistory) {
                this.channels.TEAM[teamId].shift();
            }
        }
        
        return message;
    }

    getMessages(type, teamId = null) {
        if (type === 'GLOBAL') {
            return this.channels.GLOBAL;
        }
        if (type === 'TEAM' && teamId) {
            return this.channels.TEAM[teamId] || [];
        }
        return [];
    }
}
