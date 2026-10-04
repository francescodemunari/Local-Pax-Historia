/**
 * Pax Historia - Main Application
 * Main entry point and application controller
 */

const app = {
    currentGame: null,
    nations: [],
    scenarios: [],
    selectedScenarioId: null,
    loadedNationScenarioId: null,
    nationLoadRequest: 0,
    scenarioLoading: false,
    isCreatingGame: false,
    cityManager: null,
    unitManager: null,
    lastTurnRefreshKey: null,
    activeTurnRefresh: null,
    lastDeploymentAnnouncementKey: null,

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

            // Initialize map overlays. Region selection is handled directly by
            // GameMap's SVG controller; the old GeoJSON RegionManager was a
            // competing click path that could immediately close the dossier.
            this.cityManager = new CityManager(gameMap.map);
            this.nationManager = new NationLabelManager(gameMap.map);
            this.unitManager = new UnitManager(gameMap.map);

            // Initialize panels
            actionsPanel.init();
            advisorPanel.init();
            diplomacyPanel.init();
            eventsPanel.init();
            timelinePanel.init();

            // Load the scenario registry before nations. Selecting a future
            // scenario changes the available nations without a code change.
            await countryFlags.load();
            await this.loadScenarios();
            await this.loadNations(this.selectedScenarioId);
            this.updateScenarioFilters();

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
    async loadNations(scenarioId = null) {
        const request = ++this.nationLoadRequest;
        const nations = await api.getNations(scenarioId);
        if (request !== this.nationLoadRequest) return false;
        this.nations = nations;
        this.loadedNationScenarioId = scenarioId;
        return true;
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
            if (!this.currentGame || (data.saveId && data.saveId !== this.currentGame.saveId)) {
                return;
            }

            // The initiating client handles its REST result. Other clients
            // receive the same presentation once through the socket.
            if (!timelinePanel.isAdvancing) await timelinePanel.receiveTurn(data.data, this.currentGame.saveId);
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
        document.getElementById('home-tab-scenarios').addEventListener('click', () => this.selectHomeTab('scenarios'));
        document.getElementById('home-tab-recent').addEventListener('click', () => this.selectHomeTab('recent'));
        document.getElementById('btn-refresh-recent').addEventListener('click', () => this.loadRecentGames());
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

        document.getElementById('scenario-select').addEventListener('change', (e) => {
            this.selectScenario(e.target.value);
        });

        document.getElementById('btn-fetch-models').addEventListener('click', () => this.fetchLLMModels());
        document.getElementById('settings-model-list').addEventListener('change', event => {
            if (event.target.value) document.getElementById('settings-model').value = event.target.value;
        });
        ['settings-api-url', 'settings-api-key'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                this.modelDiscoveryRequest = (this.modelDiscoveryRequest || 0) + 1;
                document.getElementById('settings-model-list').replaceChildren(new Option('Fetch models for these settings', ''));
            });
            document.getElementById(id).addEventListener('change', () => this.fetchLLMModels());
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

        document.getElementById('menu-load').addEventListener('click', () => {
            document.getElementById('side-menu').classList.add('hidden');
            this.showLoadGame();
        });

        document.getElementById('menu-events').addEventListener('click', () => {
            document.getElementById('side-menu').classList.add('hidden');
            eventsPanel.show();
        });

        document.getElementById('menu-tutorial').addEventListener('click', () => {
            this.showTutorial();
        });

        document.getElementById('menu-map-settings').addEventListener('click', () => {
            this.showMapSettings();
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

        document.getElementById('btn-close-tutorial').addEventListener('click', () => {
            this.closeAllModals();
        });

        document.getElementById('btn-apply-map-settings').addEventListener('click', () => {
            this.applyMapSettings();
        });

        document.getElementById('btn-reset-map-from-settings').addEventListener('click', () => {
            gameMap.resetView();
        });

    },

    showTutorial() {
        document.getElementById('side-menu').classList.add('hidden');
        document.getElementById('tutorial-modal').classList.remove('hidden');
    },

    showMapSettings() {
        document.getElementById('side-menu').classList.add('hidden');
        document.getElementById('setting-nation-labels').checked = this.nationManager?.labelsVisible !== false;
        document.getElementById('setting-city-markers').checked = this.cityManager?.citiesVisible !== false;
        document.getElementById('setting-unit-markers').checked = this.unitManager?.unitsVisible !== false;
        document.getElementById('map-settings-modal').classList.remove('hidden');
    },

    applyMapSettings() {
        this.nationManager?.setVisible(document.getElementById('setting-nation-labels').checked);
        this.cityManager?.setVisible(document.getElementById('setting-city-markers').checked);
        this.unitManager?.toggleUnits(document.getElementById('setting-unit-markers').checked);
        this.closeAllModals();
        this.showToast('Map settings applied', 'success');
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
        this.loadRecentGames();
    },

    /**
     * Hide main menu
     */
    selectHomeTab(tab) {
        for (const name of ['scenarios', 'recent']) {
            const active = name === tab;
            const button = document.getElementById(`home-tab-${name}`);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        }
        document.getElementById('home-scenarios-panel').classList.toggle('hidden', tab !== 'scenarios');
        document.getElementById('recent-games-panel').classList.toggle('hidden', tab !== 'recent');
        document.getElementById('btn-new-game').classList.toggle('hidden', tab !== 'scenarios');
        if (tab === 'recent') this.loadRecentGames();
    },

    async loadRecentGames() {
        const request = this.recentGamesRequest = (this.recentGamesRequest || 0) + 1;
        const container = document.getElementById('recent-games-list');
        if (!container) return;
        container.textContent = 'Loading saved campaigns…';
        try {
            const saves = await api.getSaves();
            if (request !== this.recentGamesRequest) return;
            document.getElementById('recent-games-count').textContent = saves.length ? String(saves.length) : '';
            container.replaceChildren();
            if (!saves.length) {
                const empty = document.createElement('div'); empty.className = 'home-empty';
                const title = document.createElement('strong'); title.textContent = 'Your next chapter starts here';
                const text = document.createElement('p'); text.textContent = 'Choose a scenario to begin. Your saved campaigns will appear here.';
                empty.append(title, text); container.append(empty); return;
            }
            saves.slice(0, 8).forEach(save => {
                const card = document.createElement('button'); card.type = 'button'; card.className = 'recent-game';
                const info = document.createElement('div');
                const title = document.createElement('strong'); title.textContent = save.nation_name;
                const scenario = document.createElement('p'); scenario.textContent = save.scenario_name || 'Campaign';
                const date = document.createElement('p'); date.textContent = `${this.formatDate(save.current_date)} · Turn ${save.turn_number}`;
                const resume = document.createElement('span'); resume.className = 'resume-label'; resume.textContent = 'Resume →';
                info.append(title, scenario, date); card.append(info, resume);
                card.addEventListener('click', async () => { card.disabled = true; resume.textContent = 'Opening…'; try { await this.loadGame(save.id); } finally { card.disabled = false; resume.textContent = 'Resume →'; } });
                container.append(card);
            });
        } catch (error) {
            if (request === this.recentGamesRequest) container.textContent = 'Unable to load campaigns. Check the backend and press Refresh.';
        }
    },

    hideMainMenu() {
        document.getElementById('main-menu').classList.add('hidden');
    },

    /**
     * Show nation selection modal
     */
    showNationSelection() {
        if (this.scenarioLoading || this.loadedNationScenarioId !== this.selectedScenarioId) return;
        this.hideMainMenu();
        this.renderNationGrid();
        document.getElementById('nation-select-modal').classList.remove('hidden');
        document.getElementById('nation-search').focus();
    },

    /**
     * Render nation selection grid
     */
    renderNationGrid(filter = 'all', search = '') {
        const container = document.getElementById('nation-grid');
        container.innerHTML = '';

        let filtered = this.nations.filter(nation => nation.playable !== false);

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

        if (!filtered.length) {
            const empty = document.createElement('p');
            empty.className = 'nation-empty';
            empty.textContent = this.scenarioLoading ? 'Loading nations…' : 'No nations match. Try another search or filter.';
            container.appendChild(empty);
        }

        filtered.forEach(nation => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `nation-card ${nation.is_major_power ? 'major' : ''}`;
            card.dataset.code = nation.code;
            const selected = document.getElementById('btn-start-game').dataset.nation === nation.code;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
            const flag = document.createElement('span');
            flag.className = 'nation-flag';
            countryFlags.paint(flag,nation.code,this.selectedScenarioId,document.getElementById('start-date').value || this.scenarios.find(s=>s.id===this.selectedScenarioId)?.defaultStartDate);
            const info = document.createElement('span');
            info.className = 'nation-info';
            const name = document.createElement('span');
            name.className = 'nation-name';
            name.textContent = nation.name;
            const leader = document.createElement('span');
            leader.className = 'nation-leader';
            leader.textContent = nation.leader_name || '';
            info.append(name, leader);
            card.append(flag, info);
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
        if (this.scenarioLoading || this.isCreatingGame || this.loadedNationScenarioId !== this.selectedScenarioId ||
            !this.nations.some(nation => nation.code === code && nation.playable !== false)) return;
        // Remove selection from all
        document.querySelectorAll('.nation-card').forEach(card => {
            card.classList.remove('selected');
            card.setAttribute('aria-pressed', 'false');
        });

        // Add selection to clicked
        const card = document.querySelector(`.nation-card[data-code="${code}"]`);
        if (card) {
            card.classList.add('selected');
            card.setAttribute('aria-pressed', 'true');
        }

        // Enable start button
        document.getElementById('btn-start-game').disabled = false;
        document.getElementById('btn-start-game').dataset.nation = code;
    },

    /**
     * Start a new game
     */
    async startNewGame() {
        if (this.isCreatingGame || this.scenarioLoading || this.loadedNationScenarioId !== this.selectedScenarioId) return;
        const nationCode = document.getElementById('btn-start-game').dataset.nation;
        const startDate = document.getElementById('start-date').value;

        if (!nationCode) {
            this.showToast('Select a nation', 'error');
            return;
        }

        const btn = document.getElementById('btn-start-game');
        this.isCreatingGame = true;
        document.getElementById('scenario-select').disabled = true;
        btn.disabled = true;
        btn.textContent = 'Creating game...';

        try {
            const game = await api.createGame(nationCode, startDate, this.selectedScenarioId);

            this.currentGame = {
                saveId: game.save_id,
                playerNation: game.player_nation,
                currentDate: game.current_date,
                turnNumber: game.turn_number,
                scenario: game.scenario
            };

            this.closeAllModals();
            await this.startGame();

        } catch (error) {
            console.error('Failed to create game:', error);
            this.showToast('Error creating game: ' + error.message, 'error');
        } finally {
            this.isCreatingGame = false;
            document.getElementById('scenario-select').disabled = false;
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
                turnNumber: game.turnNumber,
                scenario: game.scenario
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
        actionsPanel.reset();
        diplomacyPanel.reset();
        this.hideMainMenu();
        document.getElementById('game-container').classList.remove('hidden');

        // Update UI with game info
        document.getElementById('scenario-name').textContent = this.currentGame.scenario?.name || 'Scenario';
        document.getElementById('player-nation-name').textContent = this.currentGame.playerNation.name;
        countryFlags.paint(document.getElementById('player-nation-flag'),this.currentGame.playerNation.code,this.currentGame.scenario?.id,this.currentGame.currentDate);
        document.getElementById('player-nation-button').onclick=()=>gameMap.showNationPopup(this.currentGame.playerNation.code);
        document.getElementById('current-date').textContent = this.formatDate(this.currentGame.currentDate);

        // Update action panel info
        actionsPanel.updatePanelInfo();

        // Load map data (HOI4 SVG-based)
        await gameMap.asyncLoadMapData(this.currentGame.saveId);

        // Setup region click handler
        gameMap.onRegionClick = (regionData) => {
            this.handleRegionClick(regionData);
        };

        // Focus on player's nation - SILENT to prevent auto-opening panel
        gameMap.refreshSize();
        gameMap.focusOnNation(this.currentGame.playerNation.code, true);

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
                await this.nationManager.loadNationLabels(this.currentGame.saveId);
                console.log('Nation labels loaded and displayed');
            }

            // Load and display cities
            if (this.cityManager) {
                await this.cityManager.loadCities(this.currentGame.saveId);
                console.log('Cities loaded and displayed');
            }

            // Game state owns units. Restore formations recorded in this save.
            if (this.unitManager) {
                await this.unitManager.loadUnits(this.currentGame.saveId);
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
        actionsPanel.reset();
        diplomacyPanel.reset();
        turnPlayback.stop();
        timelinePanel.lastPresentedTurn = null;
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
            const nationRequest = nationCode && /^[A-Z]{3}$/.test(nationCode)
                ? api.getNationInfoForMap(nationCode, this.currentGame?.saveId).catch(() => null)
                : Promise.resolve(null);
            const statsRequest = this.currentGame
                ? api.getRegionStats(regionData.id, this.currentGame.saveId).catch(() => null)
                : Promise.resolve(null);
            const [nationInfo, regionStats] = await Promise.all([nationRequest, statsRequest]);

            // Create and show popup/modal with region info
            this.showRegionInfo(regionData, nationInfo, regionStats);
        } catch (error) {
            console.error('Error handling region click:', error);
            this.showRegionInfo(regionData, null);
        }
    },

    /**
     * Show region information in a modal or panel
     */
    async showRegionInfo(region, nation, stats = null) {
        const popup = document.getElementById('region-popup');
        if (!popup) return;

        // Elements
        const nameEl = document.getElementById('popup-region-name');
        const nationEl = document.getElementById('popup-region-nation');
        const typeEl = document.getElementById('popup-region-type');
        const citiesEl = document.getElementById('popup-region-cities');
        const capacityEl = document.getElementById('popup-region-capacity');
        const infraEl = document.getElementById('popup-region-infra');
        const flagEl = document.getElementById('popup-region-flag');

        // Populate basic info
        nameEl.textContent = region.name || region.id;
        nationEl.textContent = nation ? nation.name : (region.nation_code || 'Neutral');

        if (typeEl) typeEl.textContent = stats?.terrain || (region.is_coastal ? 'Coastal' : 'Unknown');
        if (citiesEl) citiesEl.textContent = stats?.important_cities?.join(', ') || '—';
        if (capacityEl) capacityEl.textContent = stats?.supply_capacity ?? '—';
        if (infraEl) infraEl.textContent = stats?.infrastructure == null ? '—' : `${stats.infrastructure}/10`;

        // Set Flag if available
        if (flagEl && nation && nation.code) {
            countryFlags.paint(flagEl,nation.code,this.currentGame?.scenario?.id,this.currentGame?.currentDate);
        }

        // Actions
        const advisorBtn = document.getElementById('region-popup-btn-advisor');
        const defendBtn = document.getElementById('region-popup-btn-defend');
        const infoBtn = document.getElementById('region-popup-btn-info');

        const unitsInRegion = (this.unitManager?.units || [])
            .filter(unit => unit.region_id === region.id || unit.region_id === region.name);
        this.renderRegionUnits(unitsInRegion);

        if (advisorBtn) {
            advisorBtn.onclick = () => {
                popup.classList.add('hidden');
                this.togglePanel('advisor');
                advisorPanel.show();
                const input = document.getElementById('advisor-input');
                if (input) {
                    input.value = `Assess ${region.name}: its strategic importance, vulnerabilities, and recommended preparations.`;
                    input.focus();
                }
            };
        }

        if (defendBtn) {
            defendBtn.onclick = () => {
                // The region dossier has a higher z-index than side panels, so
                // close it before opening the editable order draft.
                popup.classList.add('hidden');
                actionsPanel.prefillAction(
                    `Order defensive preparations in ${region.name}. Prioritise readiness, supply, and local fortifications.`
                );
                this.showToast('Defence order drafted for the Game Master', 'info');
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
     * Keep a completed turn visible even if the WebSocket reconnects late or
     * is unavailable. The REST result and socket notification share a key, so
     * receiving both cannot redraw the world twice.
     */
    async refreshAfterTurn(turnResult) {
        if (!this.currentGame || !turnResult?.turn_number) return;

        const key = `${this.currentGame.saveId}:${turnResult.turn_number}`;
        if (this.lastTurnRefreshKey === key && this.activeTurnRefresh) {
            return this.activeTurnRefresh;
        }
        this.lastTurnRefreshKey = key;
        this.activeTurnRefresh = (async () => {
            try {
                if(!turnResult.world_changed && Array.isArray(turnResult.territory_changes) && !turnResult.territory_changes.length) {
                    await this.unitManager.loadUnits(this.currentGame.saveId);
                    return;
                }
                if(turnResult.world_changed) {
                    await gameMap.loadNationColors(this.currentGame.saveId);
                    const player=gameMap.nationColors[this.currentGame.playerNation.code];
                    if(player){this.currentGame.playerNation.name=player.name;document.getElementById('player-nation-name').textContent=player.name;}
                }
                const refreshedRegions = await api.getRegions(this.currentGame.saveId);
                gameMap.applyNationColorsToAllSVG(refreshedRegions);
                await this.loadWorldObjects();
            } catch (error) {
                console.error('Failed to refresh the world after a turn:', error);
            } finally {
                actionsPanel.loadPendingActions();
            }
        })();

        return this.activeTurnRefresh;
    },

    announceGameMasterDeployments(unitChanges) {
        const deployments = (unitChanges || [])
            .map(change => change.unit)
            .filter(Boolean);
        if (!deployments.length || !this.currentGame) return;

        const key = `${this.currentGame.saveId}:${this.currentGame.turnNumber}:${deployments.map(unit => `${unit.id || unit.name}:${unit.region_id}`).join(',')}`;
        if (this.lastDeploymentAnnouncementKey === key) return;
        this.lastDeploymentAnnouncementKey = key;

        const names = deployments.map(unit => unit.name).filter(Boolean).join(', ');
        this.showToast(`Formation update: ${names || 'new formations'}`, 'success');
    },

    renderRegionUnits(units) {
        const container = document.getElementById('popup-unit-list');
        if (!container) return;

        if (units.length === 0) {
            container.innerHTML = '<p class="no-units">No units stationed here.</p>';
            return;
        }

        const icons = { infantry: '🪖', armor: '🛡️', naval: '⚓', air: '✈️' };
        const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
        container.innerHTML = units.map(unit => `
            <div class="unit-item">
                <div class="unit-item-icon">${icons[unit.unit_type] || '⚔️'}</div>
                <div class="unit-item-info">
                    <span class="unit-item-name">${escapeHtml(unit.name || 'Unnamed unit')}</span>
                    <span class="unit-item-stats">Str: ${unit.strength ?? 100}% | Org: ${unit.organization ?? 100}%</span>
                </div>
            </div>
        `).join('');
    },

    async loadScenarios() {
        try {
            this.scenarios = await api.getScenarios();
            this.scenarios.sort((a, b) => {
                return (a.defaultStartDate || a.startDates?.[0] || '').localeCompare(b.defaultStartDate || b.startDates?.[0] || '');
            });
            const defaultScenario = this.scenarios.find(scenario => scenario.isDefault) || this.scenarios[0];
            this.selectedScenarioId = defaultScenario?.id || null;
            this.renderScenarioOptions();
        } catch (error) {
            console.error('Failed to load scenarios:', error);
            this.showToast('Unable to load scenario catalog', 'error');
        }
    },

    renderScenarioOptions() {
        const select = document.getElementById('scenario-select');
        if (!select) return;
        select.innerHTML = '';
        this.scenarios.forEach(scenario => {
            const option = document.createElement('option');
            option.value = scenario.id;
            option.textContent = scenario.name;
            select.appendChild(option);
        });
        select.value = this.selectedScenarioId || '';
        this.renderScenarioCards();
        this.updateScenarioDetails();
    },

    renderScenarioCards() {
        const container = document.getElementById('scenario-cards');
        if (container.children.length === this.scenarios.length && this.scenarios.length) {
            container.querySelectorAll('.scenario-card').forEach(card => {
                const selected = card.dataset.scenario === this.selectedScenarioId;
                card.classList.toggle('selected', selected);
                card.setAttribute('aria-pressed', String(selected));
                card.querySelector('.scenario-card-state').textContent = selected ? 'Selected' : 'Select scenario';
            });
            return;
        }
        container.replaceChildren();
        const summaries = {
            'ww1-1910': 'Shape the years before the Great War through diplomacy, reform, and preparation.',
            'ww2-geographic': 'A fragile peace, rising powers, and a world approaching war.',
            'world-2010': 'Lead a nation through a connected world of competing powers and new possibilities.',

        };
        this.scenarios.forEach(scenario => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'scenario-card';
            card.dataset.scenario = scenario.id;
            const selected = scenario.id === this.selectedScenarioId;
            card.classList.toggle('selected', selected);
            card.setAttribute('aria-pressed', String(selected));
            const year = document.createElement('span');
            year.className = 'scenario-year';
            year.textContent = (scenario.defaultStartDate || scenario.startDates?.[0] || scenario.era || '').slice(0, 4);
            const name = document.createElement('span');
            name.className = 'scenario-card-name';
            name.textContent = scenario.name;
            const summary = document.createElement('span');
            summary.className = 'scenario-card-summary';
            summary.textContent = summaries[scenario.id] || scenario.description || '';
            const state = document.createElement('span');
            state.className = 'scenario-card-state';
            state.textContent = selected ? 'Selected' : 'Select scenario';
            card.append(year, name, summary, state);
            card.addEventListener('click', () => this.selectScenario(scenario.id));
            container.appendChild(card);
        });
    },

    async selectScenario(scenarioId) {
        if (this.isCreatingGame || !this.scenarios.some(scenario => scenario.id === scenarioId)) return;
        this.selectedScenarioId = scenarioId;
        this.scenarioLoading = true;
        this.loadedNationScenarioId = null;
        this.nations = [];
        document.getElementById('scenario-select').value = scenarioId;
        document.getElementById('btn-start-game').disabled = true;
        delete document.getElementById('btn-start-game').dataset.nation;
        document.getElementById('btn-new-game').disabled = true;
        document.getElementById('nation-search').value = '';
        document.querySelectorAll('#nation-select-modal .filter-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.filter === 'all');
        });
        this.renderScenarioCards();
        this.renderNationGrid();
        this.updateScenarioDetails();
        const setStatus = message => {
            document.getElementById('scenario-load-status').textContent = message;
            document.getElementById('nation-load-status').textContent = message;
        };
        setStatus('Loading nations…');
        const request = this.nationLoadRequest + 1;
        try {
            if (!await this.loadNations(scenarioId)) return;
            this.scenarioLoading = false;
            this.renderNationGrid();
            this.updateScenarioFilters();
            document.getElementById('btn-new-game').disabled = false;
            setStatus(`${this.nations.filter(nation => nation.playable !== false && nation.has_territory !== false).length} nations available. Choose a nation to begin.`);
        } catch (error) {
            if (request !== this.nationLoadRequest) return;
            this.scenarioLoading = false;
            setStatus('Could not load nations. Select the scenario again to retry.');
            document.getElementById('nation-grid').textContent = 'Nation list unavailable.';
        }
    },

    updateScenarioFilters() {
        document.querySelectorAll('#nation-select-modal .filter-btn').forEach(button => {
            const filter = button.dataset.filter;
            button.hidden = !['all', 'major'].includes(filter) && !this.nations.some(nation => nation.ideology === filter);
        });
    },

    updateScenarioDetails() {
        const scenario = this.scenarios.find(item => item.id === this.selectedScenarioId);
        const description = document.getElementById('scenario-description');
        const dateInput = document.getElementById('start-date');
        if (!scenario) return;

        description.textContent = scenario.description || '';
        const briefing = document.getElementById('scenario-briefing-text');
        if (briefing) briefing.textContent = scenario.worldContext || 'Starting context is supplied by this scenario.';
        const dates = scenario.startDates || [];
        dateInput.innerHTML = '';
        dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = this.formatDate(date);
            dateInput.appendChild(option);
        });
        if (dates.length) dateInput.value = scenario.defaultStartDate || dates[0];

        const era = scenario.era ? ` • ${scenario.era}` : '';
        const menuSubtitle = document.getElementById('menu-scenario-subtitle');
        const tacticalId = document.getElementById('menu-tactical-id');
        if (menuSubtitle) menuSubtitle.textContent = `${scenario.name}${era}`;
        if (tacticalId) tacticalId.textContent = `Command Operations // ${scenario.era || scenario.name}`;
        document.title = `Pax Historia — ${scenario.name}`;
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
            <span class="toast-message"></span>
            <button class="toast-close">&times;</button>
        `;
        toast.querySelector('.toast-message').textContent = String(message ?? '');

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
            const [settings, providers] = await Promise.all([api.getLLMSettings(), api.getLLMProviders()]);
            this.llmProviders = providers;
            this.savedLLMSettings = settings;
            this.llmDrafts = {};
            this.activeLLMProvider = settings.provider;
            const select = document.getElementById('settings-provider');
            select.replaceChildren();
            for (const group of ['Local', 'Cloud', 'Custom']) {
                const optgroup = document.createElement('optgroup'); optgroup.label = group;
                providers.filter(provider => provider.group === group).forEach(provider => optgroup.appendChild(new Option(provider.name, provider.id)));
                select.appendChild(optgroup);
            }
            document.getElementById('settings-provider').value = settings.provider || 'lm-studio';
            document.getElementById('settings-api-url').value = settings.apiUrl || '';
            document.getElementById('settings-api-key').value = settings.apiKey || '';
            document.getElementById('settings-model').value = settings.model || '';

            this.handleLLMProviderChange(settings.provider, true);
        } catch (error) {
            console.error('Failed to load LLM settings:', error);
            this.showToast('Failed to load AI settings', 'error');
        }

        document.getElementById('llm-settings-modal').classList.remove('hidden');
    },

    /**
     * Handle LLM provider selection change
     */
    handleLLMProviderChange(provider, opening = false) {
        const config = this.llmProviders?.find(item => item.id === provider);
        if (!config) return;
        const url = document.getElementById('settings-api-url');
        const key = document.getElementById('settings-api-key');
        const model = document.getElementById('settings-model');
        if (!opening) {
            this.llmDrafts[this.activeLLMProvider] = { apiUrl: url.value, apiKey: key.value, model: model.value };
            const draft = this.llmDrafts[provider];
            url.value = draft?.apiUrl ?? config.apiUrl;
            key.value = draft?.apiKey ?? '';
            model.value = draft?.model ?? '';
        }
        this.activeLLMProvider = provider;
        key.placeholder = provider === this.savedLLMSettings?.provider && this.savedLLMSettings.hasApiKey
            ? 'Saved key retained for the same endpoint' : config.requiresKey ? 'Enter this provider’s API key' : 'Optional server API key';
        document.getElementById('group-api-key').style.display = 'flex';
        document.getElementById('test-connection-status').classList.add('hidden');
        this.fetchLLMModels();
    },

    async fetchLLMModels() {
        const request = this.modelDiscoveryRequest = (this.modelDiscoveryRequest || 0) + 1;
        const provider = document.getElementById('settings-provider').value;
        const apiUrl = document.getElementById('settings-api-url').value;
        const apiKey = document.getElementById('settings-api-key').value;
        const config = this.llmProviders?.find(item => item.id === provider);
        const list = document.getElementById('settings-model-list');
        const status = document.getElementById('model-discovery-status');
        list.replaceChildren(new Option('Choose an available model', ''));
        list.disabled = true;
        if (!apiUrl || (config?.requiresKey && !apiKey && !(this.savedLLMSettings?.provider === provider && this.savedLLMSettings?.hasApiKey))) {
            status.textContent = !apiUrl ? 'Enter your server’s API base URL.' : 'Enter an API key to fetch models. You can also type a model ID.';
            return;
        }
        status.textContent = 'Fetching models from this provider…';
        try {
            const { models } = await api.getLLMModels({ provider, apiUrl, apiKey });
            if (request !== this.modelDiscoveryRequest) return;
            models.forEach(model => list.appendChild(new Option(model.name === model.id ? model.id : `${model.name} — ${model.id}`, model.id)));
            const input = document.getElementById('settings-model');
            list.value = models.some(model => model.id === input.value) ? input.value : '';
            list.disabled = models.length === 0;
            status.textContent = models.length ? `${models.length} models returned. Choose a chat model, or enter its ID below. Availability does not guarantee access or game compatibility.` : 'No chat models returned. Load a model in your server or enter an ID manually.';
        } catch (error) {
            if (request !== this.modelDiscoveryRequest) return;
            status.textContent = `Could not fetch models: ${error.message}`;
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

        const providerName = this.llmProviders?.find(provider => provider.id === settings.provider)?.name || providerNames[settings.provider] || settings.provider || 'AI';
        const modelName = settings.model ? ` • ${settings.model}` : '';
        footerEl.textContent = `Powered by ${providerName}${modelName}`;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
