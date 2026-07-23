/**
 * Pax Historia - API Client
 * Handles all communication with the backend server
 */

// Dynamically resolve API base from browser origin to avoid localhost vs 127.0.0.1 mismatch
const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'))
    ? `${window.location.origin}/api`
    : 'http://127.0.0.1:3000/api';

class ApiClient {
    constructor() {
        this.baseUrl = API_BASE;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        if (options.body && typeof options.body === 'object') {
            mergedOptions.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, mergedOptions);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // Health check
    async checkHealth() {
        return this.request('/health');
    }

    // ==================== Nations ====================

    async getNations(saveId = null) {
        const endpoint = saveId ? `/nations?save_id=${saveId}` : '/nations';
        return this.request(endpoint);
    }

    async getNationsForMap() {
        return this.request('/nations/map');
    }

    async getNation(code) {
        return this.request(`/nations/code/${code}`);
    }

    async searchNations(query) {
        return this.request(`/nations/search/${encodeURIComponent(query)}`);
    }

    async getMajorPowers() {
        return this.request('/nations/filter/major');
    }

    // ==================== Game Management ====================

    async createGame(nationCode, startDate) {
        return this.request('/game/new', {
            method: 'POST',
            body: { nationCode, startDate }
        });
    }

    async loadGame(saveId) {
        return this.request(`/game/load/${saveId}`);
    }

    async getSaves() {
        return this.request('/game/saves');
    }

    async deleteSave(saveId) {
        return this.request(`/game/saves/${saveId}`, {
            method: 'DELETE'
        });
    }

    async getGameState(saveId) {
        return this.request(`/game/state/${saveId}`);
    }

    async advanceTime(saveId, timeJump) {
        return this.request('/game/advance', {
            method: 'POST',
            body: { saveId, timeJump }
        });
    }

    // ==================== Actions ====================

    async submitAction(saveId, actionText, actionType = 'general') {
        return this.request('/actions', {
            method: 'POST',
            body: { saveId, actionText, actionType }
        });
    }

    async getActions(saveId) {
        return this.request(`/actions/save/${saveId}`);
    }

    async getPendingActions(saveId) {
        return this.request(`/actions/save/${saveId}/pending`);
    }

    async deleteAction(actionId) {
        return this.request(`/actions/${actionId}`, {
            method: 'DELETE'
        });
    }

    async brainstormActions(saveId) {
        return this.request('/actions/brainstorm', {
            method: 'POST',
            body: { saveId }
        });
    }

    // ==================== Events ====================

    async getEvents(saveId, limit = 50) {
        return this.request(`/events/save/${saveId}?limit=${limit}`);
    }

    async getEventsByTurn(saveId, turnNumber) {
        return this.request(`/events/save/${saveId}/turn/${turnNumber}`);
    }

    async getEventsByType(saveId, type) {
        return this.request(`/events/save/${saveId}/type/${type}`);
    }

    async getImportantEvents(saveId) {
        return this.request(`/events/save/${saveId}/important`);
    }

    // ==================== Diplomacy ====================

    async startChat(saveId, participantNations, topic = null) {
        return this.request('/chat/start', {
            method: 'POST',
            body: { saveId, participantNations, topic }
        });
    }

    async sendDiplomaticMessage(chatId, saveId, message, senderNation, isPlayer = true) {
        return this.request(`/chat/${chatId}/message`, {
            method: 'POST',
            body: { saveId, message, senderNation, isPlayer }
        });
    }

    async getChats(saveId) {
        return this.request(`/chat/save/${saveId}`);
    }

    async getChatMessages(chatId) {
        return this.request(`/chat/${chatId}/messages`);
    }

    async closeChat(chatId) {
        return this.request(`/chat/${chatId}/close`, {
            method: 'POST'
        });
    }

    async getAvailableNationsForChat(saveId) {
        return this.request(`/chat/available/${saveId}`);
    }

    // ==================== Advisor ====================

    async askAdvisor(saveId, question) {
        return this.request('/advisor/ask', {
            method: 'POST',
            body: { saveId, question }
        });
    }

    async getGameSummary(saveId) {
        return this.request(`/advisor/summary/${saveId}`);
    }

    async getStrategicAdvice(saveId, focus = 'general') {
        return this.request('/advisor/strategic', {
            method: 'POST',
            body: { saveId, focus }
        });
    }

    async testLLM() {
        return this.request('/advisor/test');
    }

    async getLLMSettings() {
        return this.request('/llm/settings');
    }

    async saveLLMSettings(settings) {
        return this.request('/llm/settings', {
            method: 'POST',
            body: settings
        });
    }

    async testLLMConnection(settings) {
        return this.request('/llm/test', {
            method: 'POST',
            body: settings
        });
    }

    // ==================== Map ====================

    async getMapGeoJSON() {
        return this.request('/map/geojson');
    }

    async getMapColors() {
        return this.request('/map/colors');
    }

    async searchMap(query) {
        return this.request(`/map/search/${encodeURIComponent(query)}`);
    }

    async getNationInfoForMap(code, saveId = null) {
        if (saveId) {
            return this.request(`/map/nation/${code}/state/${saveId}`);
        }
        return this.request(`/map/nation/${code}`);
    }

    async getRegions(saveId = null) {
        const endpoint = saveId ? `/regions?save_id=${saveId}` : '/regions';
        return this.request(endpoint);
    }
}

// Create global instance
const api = new ApiClient();

// WebSocket connection for real-time updates
class WebSocketClient {
    constructor() {
        this.ws = null;
        this.callbacks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        // Dynamically resolve WebSocket URL from browser origin
        const wsProtocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('WebSocket message parse error:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('WebSocket connection failed:', error);
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
        }
    }

    handleMessage(data) {
        const { type } = data;

        if (this.callbacks.has(type)) {
            this.callbacks.get(type).forEach(callback => callback(data));
        }

        if (this.callbacks.has('*')) {
            this.callbacks.get('*').forEach(callback => callback(data));
        }
    }

    on(type, callback) {
        if (!this.callbacks.has(type)) {
            this.callbacks.set(type, []);
        }
        this.callbacks.get(type).push(callback);
    }

    off(type, callback) {
        if (this.callbacks.has(type)) {
            const callbacks = this.callbacks.get(type);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// Create global WebSocket instance
const wsClient = new WebSocketClient();
