/**
 * Pax Historia - Main Application
 * Main entry point and application controller
 */

const app = {
    currentGame: null,
    nations: [],
    cityManager: null,
    unitManager: null,

    /**
     * Initialize the application
     */
    async init() {
        console.log('Pax Historia initializing...');

        try {
            // Check backend health
            const health = await api.checkHealth();
            console.log('Backend status:', health);

            // Connect WebSocket
            wsClient.connect();
            this.setupWebSocketHandlers();

            // Initialize map
            gameMap.init();

            // Initialize city, nation, and unit managers
            this.cityManager = new CityManager(gameMap.map);
            this.nationManager = new NationLabelManager(gameMap.map);
            this.unitManager = new UnitManager(gameMap.map);

            // Initialize panels
            actionsPanel.init();
            advisorPanel.init();
            diplomacyPanel.init();
            eventsPanel.init();
            timelinePanel.init();

            // Load nations
            await this.loadNations();

            // Load LLM settings for footer initialization
            try {
                const settings = await api.getLLMSettings();
                this.updateAIFooter(settings);
            } catch (e) {
                console.warn('Failed to load initial LLM settings for footer:', e);
            }

            // Setup UI event handlers
            this.setupEventHandlers();

            // Hide loading screen, show main menu
            this.hideLoading();
            this.showMainMenu();

        } catch (error) {
            console.error('Initialization error:', error);
            if (error.message && error.message.includes('fetch')) {
                this.showError('Unable to connect to the server. Make sure the backend is running.');
            } else {
                this.showError(`Initialization error: ${error.message}. Check the browser console for details.`);
            }
        }
    },

    /**
     * Load nations from database
     */
    async loadNations() {
        try {
            this.nations = await api.getNations();
            console.log(`Loaded ${this.nations.length} nations`);
        } catch (error) {
            console.error('Failed to load nations:', error);
        }
    },

    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers() {
        wsClient.on('time_advance_start', (data) => {
            console.log('Time advance started:', data);
        });

        wsClient.on('time_advance_complete', async (data) => {
            console.log('Time advance complete:', data);

            // 1. Update Game State
            if (this.currentGame) {
                this.currentGame.currentDate = data.data.new_date;
                this.currentGame.turnNumber = data.data.turn_number;

                // Update UI Header
                document.getElementById('current-date').textContent = this.formatDate(data.data.new_date);
            }

            // 2. Show toast for most important event (eventsPanel already handled via REST response)
            if (data.data.events && data.data.events.length > 0) {
                const major = data.data.events.find(e => ['major', 'critical'].includes(e.severity));
                if (major) {
                    this.showToast(`WORLD EVENT: ${major.title}`, 'warning');
                } else {
                    this.showToast('Time advanced. New events available.', 'success');
                }
            } else {
                this.showToast('Time advanced. No significant events.', 'info');
            }

            // 3. Refresh Map Ownership
            try {
                const refreshedRegions = await api.getRegions(this.currentGame.saveId);
                const svgElement = gameMap.svgLayer ? gameMap.svgLayer.getElement() : null;
                if (svgElement) {
                    gameMap.applyNationColorsToSVG(svgElement, refreshedRegions);
                }
            } catch (e) {
                console.error('Failed to refresh map after turn:', e);
            }

            // 4. Refresh cities and units
            await app.loadWorldObjects();

            // 5. Refresh other panels if needed
            actionsPanel.loadPendingActions();
        });

        wsClient.on('new_action', (data) => {
            console.log('New action:', data);
        });

        wsClient.on('diplomatic_message', (data) => {
            console.log('Diplomatic message:', data);
        });
    },

    /**
     * Setup UI event handlers
     */
    setupEventHandlers() {
        // Main menu buttons
        document.getElementById('btn-new-game').addEventListener('click', () => {
            this.showNationSelection();
        });

        document.getElementById('btn-load-game').addEventListener('click', () => {
            this.showLoadGame();
        });

        document.getElementById('btn-llm-settings').addEventListener('click', () => {
            this.showLLMSettings();
        });

        // Nation selection
        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.startNewGame();
        });

        // Nation filters
        document.querySelectorAll('#nation-select-modal .filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterNations(btn.dataset.filter);
                document.querySelectorAll('#nation-select-modal .filter-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Nation search
        document.getElementById('nation-search').addEventListener('input', (e) => {
            this.searchNations(e.target.value);
        });

        // Header nav buttons (panels)
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                this.togglePanel(panel);

                // Update active state
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Modal Close Buttons (unified handler for all close buttons)
        document.querySelectorAll('.modal-close, .panel-close, .popup-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
                this.closeAllPopups();
                this.closeAllPanels();
                if (!this.currentGame) {
                    this.showMainMenu();
                }
            });
        });

        // Side menu toggle
        document.getElementById('btn-menu').addEventListener('click', () => {
            document.getElementById('side-menu').classList.toggle('hidden');
        });

        // Side menu items
        document.getElementById('menu-quit').addEventListener('click', () => {
            if (confirm('Do you really want to exit to the main menu?')) {
                this.quitToMenu();
            }
        });

        document.getElementById('menu-save').addEventListener('click', () => {
            this.showToast('The game is saved automatically', 'info');
        });

        document.getElementById('menu-events').addEventListener('click', () => {
            document.getElementById('side-menu').classList.add('hidden');
            eventsPanel.show();
        });

        document.getElementById('menu-llm-settings').addEventListener('click', () => {
            document.getElementById('side-menu').classList.add('hidden');
            this.showLLMSettings();
        });

        // Click outside side menu to close
        document.addEventListener('click', (e) => {
            const sideMenu = document.getElementById('side-menu');
            const menuBtn = document.getElementById('btn-menu');
            if (!sideMenu.contains(e.target) && !menuBtn.contains(e.target)) {
                sideMenu.classList.add('hidden');
            }
        });

        // AI Settings Modal event handlers
        document.getElementById('btn-cancel-settings').addEventListener('click', (e) => {
            e.preventDefault();
            this.closeAllModals();
            if (!this.currentGame) {
                this.showMainMenu();
            }
        });

        document.getElementById('btn-save-settings').addEventListener('click', (e) => {
            e.preventDefault();
            this.saveLLMSettings();
        });

        document.getElementById('btn-test-settings').addEventListener('click', (e) => {
            e.preventDefault();
            this.testLLMSettings();
        });

        document.getElementById('settings-provider').addEventListener('change', (e) => {
            this.handleLLMProviderChange(e.target.value);
        });
    },

    /**
     * Hide loading screen
     */
    hideLoading() {
        const loading = document.getElementById('loading-screen');
        loading.classList.add('fade-out');
        setTimeout(() => {
            loading.classList.add('hidden');
        }, 400);
    },

    /**
     * Show error on loading screen
     */
    showError(message) {
        document.querySelector('.loading-text').textContent = message;
        document.querySelector('.loading-spinner').style.display = 'none';
    },

    /**
     * Show main menu
     */
    showMainMenu() {
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('game-container').classList.add('hidden');
    },

    /**
     * Hide main menu
     */
    hideMainMenu() {
        document.getElementById('main-menu').classList.add('hidden');
    },

    /**
     * Show nation selection modal
     */
    showNationSelection() {
        this.hideMainMenu();
        this.renderNationGrid();
        document.getElementById('nation-select-modal').classList.remove('hidden');
    },

    /**
     * Render nation selection grid
     */
    renderNationGrid(filter = 'all', search = '') {
        const container = document.getElementById('nation-grid');
        container.innerHTML = '';

        let filtered = this.nations;

        // Apply filter
        if (filter !== 'all') {
            if (filter === 'major') {
                filtered = filtered.filter(n => n.is_major_power);
            } else {
                filtered = filtered.filter(n => n.ideology === filter);
            }
        }

        // Apply search
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(n =>
                n.name.toLowerCase().includes(searchLower) ||
                n.code.toLowerCase().includes(searchLower) ||
                n.leader_name?.toLowerCase().includes(searchLower)
            );
        }

        // Filter: Only nations with territory
        filtered = filtered.filter(n => n.has_territory !== false);

        filtered.forEach(nation => {
            const card = document.createElement('div');
            card.className = `nation-card ${nation.is_major_power ? 'major' : ''}`;
            card.dataset.code = nation.code;
            card.innerHTML = `
                <div class="nation-flag" style="background-color: ${nation.color}"></div>
                <div class="nation-info">
                    <div class="nation-name">${nation.name}</div>
                    <div class="nation-leader">${nation.leader_name || ''}</div>
                </div>
            `;
            card.addEventListener('click', () => this.selectNation(nation.code));
            container.appendChild(card);
        });
    },

    /**
     * Filter nations in grid
     */
    filterNations(filter) {
        const search = document.getElementById('nation-search').value;
        this.renderNationGrid(filter, search);
    },

    /**
     * Search nations in grid
     */
    searchNations(query) {
        const activeFilter = document.querySelector('#nation-select-modal .filter-btn.active');
        const filter = activeFilter?.dataset.filter || 'all';
        this.renderNationGrid(filter, query);
    },

    /**
     * Select a nation
     */
    selectNation(code) {
        // Remove selection from all
        document.querySelectorAll('.nation-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Add selection to clicked
        const card = document.querySelector(`.nation-card[data-code="${code}"]`);
        if (card) {
            card.classList.add('selected');
        }

        // Enable start button
        document.getElementById('btn-start-game').disabled = false;
        document.getElementById('btn-start-game').dataset.nation = code;
    },

    /**
     * Start a new game
     */
    async startNewGame() {
        const nationCode = document.getElementById('btn-start-game').dataset.nation;
        const startDate = document.getElementById('start-date').value;

        if (!nationCode) {
            this.showToast('Select a nation', 'error');
            return;
        }

        const btn = document.getElementById('btn-start-game');
        btn.disabled = true;
        btn.textContent = 'Creating game...';

        try {
            const game = await api.createGame(nationCode, startDate);

            this.currentGame = {
                saveId: game.save_id,
                playerNation: game.player_nation,
                currentDate: game.current_date,
                turnNumber: game.turn_number
            };

            this.closeAllModals();
            await this.startGame();

        } catch (error) {
            console.error('Failed to create game:', error);
            this.showToast('Error creating game: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Start Game';
        }
    },

    /**
     * Show load game modal
     */
    async showLoadGame() {
        this.hideMainMenu();

        try {
            const saves = await api.getSaves();
            this.renderSavesList(saves);
        } catch (error) {
            console.error('Failed to load saves:', error);
        }

        document.getElementById('load-game-modal').classList.remove('hidden');
    },

    /**
     * Render saves list
     */
    renderSavesList(saves) {
        const container = document.getElementById('saves-list');
        container.innerHTML = '';

        if (saves.length === 0) {
            container.innerHTML = '<div class="no-saves">No saved games</div>';
            return;
        }

        saves.forEach(save => {
            const div = document.createElement('div');
            div.className = 'save-item';
            div.innerHTML = `
                <div class="save-info">
                    <div class="save-name">${save.name}</div>
                    <div class="save-details">
                        ${save.nation_name} • ${this.formatDate(save.current_date)} • Turn ${save.turn_number}
                    </div>
                </div>
                <div class="save-actions">
                    <button class="save-delete" title="Delete">🗑️</button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('save-delete')) {
                    this.loadGame(save.id);
                }
            });

            div.querySelector('.save-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Delete this save?')) {
                    await api.deleteSave(save.id);
                    this.showLoadGame();
                }
            });

            container.appendChild(div);
        });
    },

    /**
     * Load an existing game
     */
    async loadGame(saveId) {
        try {
            const game = await api.loadGame(saveId);

            this.currentGame = {
                saveId: saveId,
                playerNation: game.playerNation,
                currentDate: game.currentDate,
                turnNumber: game.turnNumber
            };

            // Add existing events
            eventsPanel.events = game.events || [];

            this.closeAllModals();
            await this.startGame();

        } catch (error) {
            console.error('Failed to load game:', error);
            this.showToast('Error loading game', 'error');
        }
    },

    /**
     * Start the game (after create or load)
     */
    async startGame() {
        this.hideMainMenu();
        document.getElementById('game-container').classList.remove('hidden');

        // Update UI with game info
        document.getElementById('scenario-name').textContent = 'World War II';
        document.getElementById('player-nation-name').textContent = `Playing as: ${this.currentGame.playerNation.name}`;
        document.getElementById('current-date').textContent = this.formatDate(this.currentGame.currentDate);

        // Update action panel info
        actionsPanel.updatePanelInfo();

        // Load map data (HOI4 SVG-based)
        await gameMap.asyncLoadMapData();

        // Setup region click handler
        gameMap.onRegionClick = (regionData) => {
            this.handleRegionClick(regionData);
        };

        // LEGACY: Disable old region/unit managers for fresh start
        /*
        if (typeof RegionManager !== 'undefined') {
            gameMap.regionManager = new RegionManager(gameMap.map);
            await gameMap.regionManager.loadRegions(this.currentGame.playerNation.code);
            gameMap.regionManager.drawRegions();
            console.log('Regions loaded and drawn');
        }

        if (typeof UnitManager !== 'undefined') {
            gameMap.unitManager = new UnitManager(gameMap.map);
            gameMap.unitManager.regionManager = gameMap.regionManager;
            await gameMap.unitManager.loadUnits(this.currentGame.playerNation.code);
            gameMap.unitManager.displayUnits();
            console.log('Units loaded and displayed');
        }
        */

        // Focus on player's nation - SILENT to prevent auto-opening panel
        setTimeout(() => {
            gameMap.refreshSize();
            gameMap.focusOnNation(this.currentGame.playerNation.code, true);
        }, 500);

        // Load cities and units
        await this.loadWorldObjects();

        this.showToast(`Game started as ${this.currentGame.playerNation.name}`, 'success');
    },

    /**
     * Load cities and units on the map
     */
    async loadWorldObjects() {
        try {
            // Load and display nation labels
            if (this.nationManager) {
                await this.nationManager.loadNationLabels();
                console.log('Nation labels loaded and displayed');
            }

            // Load and display cities
            if (this.cityManager) {
                await this.cityManager.loadCities();
                console.log('Cities loaded and displayed');
            }

            // Load and display units
            if (this.unitManager && this.currentGame) {
                await this.unitManager.loadUnits(this.currentGame.saveId);
                console.log('Units loaded and displayed');
            }
        } catch (error) {
            console.error('Failed to load world objects:', error);
        }
    },

    /**
     * Quit to main menu
     */
    quitToMenu() {
        this.currentGame = null;
        this.closeAllPanels();
        document.getElementById('side-menu').classList.add('hidden');
        this.showMainMenu();

        // Reset panels
        advisorPanel.reset();
        diplomacyPanel.reset();
        eventsPanel.reset();
    },

    /**
     * Toggle a panel
     */
    togglePanel(panelName) {
        this.closeAllPanels();

        switch (panelName) {
            case 'actions':
                actionsPanel.toggle();
                break;
            case 'advisor':
                advisorPanel.toggle();
                break;
            case 'diplomacy':
                diplomacyPanel.toggle();
                break;
            case 'events':
                eventsPanel.toggle();
                break;
        }
    },

    /**
     * Close all panels
     */
    closeAllPanels() {
        actionsPanel.hide();
        advisorPanel.hide();
        diplomacyPanel.hide();
        eventsPanel.hide();

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    },

    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    },

    /**
     * Handle region click from map
     */
    async handleRegionClick(regionData) {
        console.log('Region clicked:', regionData);

        try {
            const nationCode = regionData.nation_code;
            let nationInfo = null;

            // Only fetch nation info if we have a valid 3-letter nation code (not a hex color, not empty)
            if (nationCode && /^[A-Z]{3}$/.test(nationCode)) {
                nationInfo = await api.getNationInfoForMap(nationCode, this.currentGame?.saveId);
            }

            // Create and show popup/modal with region info
            this.showRegionInfo(regionData, nationInfo);
        } catch (error) {
            console.error('Error handling region click:', error);
            this.showRegionInfo(regionData, null);
        }
    },

    /**
     * Show region information in a modal or panel
     */
    async showRegionInfo(region, nation) {
        const popup = document.getElementById('region-popup');
        if (!popup) return;

        // Elements
        const nameEl = document.getElementById('popup-region-name');
        const nationEl = document.getElementById('popup-region-nation');
        const typeEl = document.getElementById('popup-region-type');
        const flagEl = document.getElementById('popup-region-flag');

        // Populate basic info
        nameEl.textContent = region.name || region.id;
        nationEl.textContent = nation ? nation.name : (region.nation_code || 'Neutral');

        // Mocking some data for now as per user request to "write important cities"
        // In a future update, this could come from a JSON mapping
        const regionType = region.is_coastal ? 'Coastal' : 'Inland';
        if (typeEl) typeEl.textContent = regionType;

        // Set Flag if available
        if (flagEl && nation && nation.code) {
            // Assuming we have a flag service or static assets
            // flagEl.style.backgroundImage = `url('assets/flags/${nation.code.toLowerCase()}.png')`;
            flagEl.style.backgroundColor = nation.color || '#333';
        }

        // Handle Bordering Regions (Mocking for now to match screenshot)
        const borderingEl = document.getElementById('popup-bordering-regions');
        if (borderingEl) {
            // In a real scenario, we'd fetch neighbors from hoi4_map.json or a pre-calculated index
            // borderingEl.innerHTML = neighbors.map(n => `<span class="border-tag">${n}</span>`).join('');
        }

        // Actions
        const advisorBtn = document.getElementById('region-popup-btn-advisor');
        const defendBtn = document.getElementById('region-popup-btn-defend');
        const infoBtn = document.getElementById('region-popup-btn-info');

        if (advisorBtn) {
            advisorBtn.onclick = () => {
                this.showToast(`Requesting advice for ${region.name}...`, 'info');
                this.togglePanel('advisor');
            };
        }

        if (defendBtn) {
            defendBtn.onclick = () => {
                this.showToast(`Defense order sent for ${region.name}`, 'success');
            };
        }

        // Nation Info Button - RE-ATTACH LISTENER EVERY TIME
        if (infoBtn) {
            if (nation) {
                infoBtn.classList.remove('hidden');
                infoBtn.onclick = (e) => {
                    e.stopPropagation();
                    gameMap.showNationPopup(nation.code);
                };
            } else {
                infoBtn.classList.add('hidden');
            }
        }

        // Show popup
        popup.classList.remove('hidden');
    },

    /**
     * Close all popups
     */
    closeAllPopups() {
        document.querySelectorAll('.region-popup, .nation-popup').forEach(p => {
            p.classList.add('hidden');
        });
    },

    /**
     * Format date for display
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });

        container.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    },

    /**
     * Show LLM Settings Modal
     */
    async showLLMSettings() {
        const statusEl = document.getElementById('test-connection-status');
        statusEl.classList.add('hidden');
        statusEl.textContent = '';

        try {
            const settings = await api.getLLMSettings();
            document.getElementById('settings-provider').value = settings.provider || 'lm-studio';
            document.getElementById('settings-api-url').value = settings.apiUrl || '';
            document.getElementById('settings-api-key').value = settings.apiKey || '';
            document.getElementById('settings-model').value = settings.model || '';

            this.handleLLMProviderChange(settings.provider);
        } catch (error) {
            console.error('Failed to load LLM settings:', error);
            this.showToast('Failed to load AI settings', 'error');
        }

        document.getElementById('llm-settings-modal').classList.remove('hidden');
    },

    /**
     * Handle LLM provider selection change
     */
    handleLLMProviderChange(provider) {
        const keyGroup = document.getElementById('group-api-key');
        const urlInput = document.getElementById('settings-api-url');
        const modelInput = document.getElementById('settings-model');

        // Show/hide API Key
        const needsKey = ['openai', 'google', 'anthropic'].includes(provider);
        if (needsKey) {
            keyGroup.style.display = 'flex';
        } else {
            keyGroup.style.display = 'none';
        }

        // Prefill default URLs and models if changing providers
        const defaults = {
            'lm-studio': { url: 'http://127.0.0.1:1234/v1', model: 'qwen3-vl-8b' },
            'ollama': { url: 'http://127.0.0.1:11434/v1', model: 'llama3' },
            'llama.cpp': { url: 'http://127.0.0.1:8080/v1', model: 'default' },
            'vllm': { url: 'http://127.0.0.1:8000/v1', model: 'default' },
            'openai': { url: 'https://api.openai.com/v1', model: 'gpt-4o' },
            'google': { url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-1.5-flash' },
            'anthropic': { url: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-20240620' }
        };

        const config = defaults[provider];
        if (config) {
            // Only update URL if empty or if it matches one of the other defaults to avoid overwriting user edits
            const defaultUrls = Object.values(defaults).map(d => d.url);
            if (!urlInput.value || defaultUrls.includes(urlInput.value)) {
                urlInput.value = config.url;
            }
            
            // Only update model if empty or if it matches one of the other defaults
            const defaultModels = Object.values(defaults).map(d => d.model);
            if (!modelInput.value || defaultModels.includes(modelInput.value)) {
                modelInput.value = config.model;
            }
        }
    },

    /**
     * Test connection with current settings
     */
    async testLLMSettings() {
        const provider = document.getElementById('settings-provider').value;
        const apiUrl = document.getElementById('settings-api-url').value;
        const apiKey = document.getElementById('settings-api-key').value;
        const model = document.getElementById('settings-model').value;

        const statusEl = document.getElementById('test-connection-status');
        statusEl.classList.remove('hidden', 'success', 'error');
        statusEl.classList.add('loading');
        statusEl.textContent = 'Testing connection... Please wait.';

        const btnTest = document.getElementById('btn-test-settings');
        btnTest.disabled = true;

        try {
            const result = await api.testLLMConnection({ provider, apiUrl, apiKey, model });
            statusEl.classList.remove('loading');
            
            if (result.success) {
                statusEl.classList.add('success');
                statusEl.innerHTML = `<strong>Success!</strong> Connected to ${result.model}.`;
                this.showToast('AI connection successful', 'success');
            } else {
                statusEl.classList.add('error');
                statusEl.innerHTML = `<strong>Failed!</strong> ${result.error || result.message}`;
                this.showToast('AI connection failed', 'error');
            }
        } catch (error) {
            statusEl.classList.remove('loading');
            statusEl.classList.add('error');
            statusEl.innerHTML = `<strong>Error!</strong> ${error.message}`;
            this.showToast('AI connection error', 'error');
        } finally {
            btnTest.disabled = false;
        }
    },

    /**
     * Save LLM settings to backend
     */
    async saveLLMSettings() {
        const provider = document.getElementById('settings-provider').value;
        const apiUrl = document.getElementById('settings-api-url').value;
        const apiKey = document.getElementById('settings-api-key').value;
        const model = document.getElementById('settings-model').value;

        const btnSave = document.getElementById('btn-save-settings');
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        try {
            const res = await api.saveLLMSettings({ provider, apiUrl, apiKey, model });
            if (res.success) {
                this.showToast('AI settings saved successfully', 'success');
                this.updateAIFooter(res.settings);
                this.closeAllModals();
                if (!this.currentGame) {
                    this.showMainMenu();
                }
            } else {
                this.showToast('Failed to save AI settings', 'error');
            }
        } catch (error) {
            console.error('Save settings error:', error);
            this.showToast('Error saving AI settings: ' + error.message, 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Settings';
        }
    },

    /**
     * Update AI footer label in Main Menu
     */
    updateAIFooter(settings) {
        const footerEl = document.getElementById('menu-ai-footer');
        if (!footerEl) return;

        const providerNames = {
            'lm-studio': 'LM Studio',
            'ollama': 'Ollama',
            'llama.cpp': 'Llama.cpp',
            'vllm': 'vLLM',
            'openai': 'OpenAI',
            'google': 'Google Gemini',
            'anthropic': 'Anthropic Claude'
        };

        const providerName = providerNames[settings.provider] || 'AI';
        const modelName = settings.model ? ` • ${settings.model}` : '';
        footerEl.textContent = `Powered by ${providerName}${modelName}`;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
