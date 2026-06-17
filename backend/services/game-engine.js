const fs = require('fs');
const path = require('path');
const llmService = require('./llm-service');

const savesDir = path.join(__dirname, '../../data/saves');
const nationsPath = path.join(__dirname, '../../data/nations_v2.json');

/**
 * Game Engine - File-based game logic for Pax Historia
 */
class GameEngine {
    constructor() {
        if (!fs.existsSync(savesDir)) {
            fs.mkdirSync(savesDir, { recursive: true });
        }
    }

    getNations() {
        if (fs.existsSync(nationsPath)) {
            return JSON.parse(fs.readFileSync(nationsPath, 'utf-8'));
        }
        return {};
    }

    /**
     * Create a new game
     */
    async createGame(playerNationCode, startDate = '1936-01-01') {
        const nations = this.getNations();
        const playerNation = nations[playerNationCode];

        if (!playerNation) {
            throw new Error(`Nation ${playerNationCode} not found`);
        }

        const saveId = Date.now().toString();
        const gameState = {
            id: saveId,
            name: `${playerNation.name} - ${startDate}`,
            playerNationCode: playerNationCode,
            currentDate: startDate,
            turnNumber: 1,
            nations: {},
            chats: [],
            actions: [],
            events: [],
            units: [],
            history: [],
            created_at: new Date().toISOString(),
            world_context: "Historical 1936 start. Europe is on the brink of tension as ideologies clash.",
            simulation_rules: "1. Realistic consequences. 2. Diplomatic weight. 3. Historical plausibility with player flexibility."
        };

        // Initialize all nations
        Object.keys(nations).forEach(code => {
            const nation = nations[code];
            gameState.nations[code] = {
                code: code,
                stability: 70,
                warSupport: 20,
                manpower: nation.manpower || 100000,
                politicalPower: 100,
                treasury: 1000,
                atWar: false,
                relations: {},
                occupied_regions: []
            };
        });

        // Create starting units
        this.createStartingUnits(gameState);

        this.saveGame(saveId, gameState);

        return {
            save_id: saveId,
            player_nation: playerNation,
            current_date: startDate,
            turn_number: 1
        };
    }

    /**
     * Process player action
     */
    async processPlayerAction(saveId, actionText, actionType = 'general') {
        const gameState = await this.loadGame(saveId);

        const newAction = {
            id: Date.now().toString(),
            save_id: saveId,
            nation_code: gameState.playerNationCode,
            action_text: actionText,
            action_type: actionType,
            status: 'pending',
            turn_number: gameState.turnNumber,
            created_at: new Date().toISOString()
        };

        if (!gameState.actions) gameState.actions = [];
        gameState.actions.push(newAction);

        this.saveGame(saveId, gameState);
        return newAction;
    }

    /**
     * Save game to local JSON
     */
    saveGame(saveId, gameState) {
        const filePath = path.join(savesDir, `${saveId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(gameState, null, 2));
    }

    /**
     * Load game from local JSON
     */
    async loadGame(saveId) {
        const filePath = path.join(savesDir, `${saveId}.json`);
        if (!fs.existsSync(filePath)) {
            throw new Error('Save not found');
        }

        const gameState = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const nations = this.getNations();

        return {
            ...gameState,
            playerNation: nations[gameState.playerNationCode],
            events: gameState.events || [],
            actions: gameState.actions || []
        };
    }

    async getSaves() {
        if (!fs.existsSync(savesDir)) return [];
        const files = fs.readdirSync(savesDir).filter(f => f.endsWith('.json'));
        const nations = this.getNations();

        return files.map(file => {
            const data = JSON.parse(fs.readFileSync(path.join(savesDir, file), 'utf-8'));
            return {
                id: data.id,
                name: data.name,
                nation_code: data.playerNationCode,
                nation_name: nations[data.playerNationCode]?.name || 'Unknown',
                current_date: data.currentDate,
                turn_number: data.turnNumber || 1,
                updated_at: data.created_at
            };
        });
    }

    async deleteSave(saveId) {
        const filePath = path.join(savesDir, `${saveId}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    /**
     * Create starting units for the world
     */
    createStartingUnits(gameState) {
        const startingUnits = [
            // ITALY
            { name: "1st Eritrean Division", type: "infantry", nation: "ITA", region: "Asmara", coords: [860, 460] },
            { name: "2nd Eritrean Division", type: "infantry", nation: "ITA", region: "Massawa", coords: [870, 450] },
            { name: "Native Army Corps", type: "infantry", nation: "ITA", region: "Eritrea", coords: [850, 470] },
            { name: "Granatieri Division", type: "infantry", nation: "ITA", region: "Adigrat", coords: [880, 490] },

            // ETHIOPIA
            { name: "Imperial Guard Kebur Zabagna", type: "infantry", nation: "ETH", region: "Addis Ababa", coords: [880, 480] },
            { name: "Ogaden Army", type: "infantry", nation: "ETH", region: "Ogaden", coords: [920, 500] },
            { name: "Northern Army", type: "infantry", nation: "ETH", region: "Amhara", coords: [860, 490] },

            // GERMANY
            { name: "1st Panzer Division", type: "armor", nation: "GER", region: "Berlin", coords: [750, 120] },
            { name: "1st Infantry Division", type: "infantry", nation: "GER", region: "East Prussia", coords: [800, 100] },

            // FRANCE
            { name: "1st Armored Division", type: "armor", nation: "FRA", region: "Paris", coords: [660, 150] },
            { name: "7th Army", type: "infantry", nation: "FRA", region: "Metz", coords: [690, 140] },

            // UK
            { name: "Home Fleet", type: "naval", nation: "ENG", region: "Scapa Flow", coords: [620, 80] },
            { name: "British Expeditionary Force", type: "infantry", nation: "ENG", region: "London", coords: [640, 125] }
        ];

        gameState.units = startingUnits.map((u, index) => ({
            id: `unit_${Date.now()}_${index}`,
            name: u.name,
            unit_type: u.type,
            nation_code: u.nation,
            region_id: u.region,
            centroid: u.coords, // For map placement
            strength: 100,
            organization: 100,
            experience: 0,
            created_at: gameState.created_at
        }));
    }

    /**
     * Advance time (process turn) - AI FULL INTEGRATION
     */
    async advanceTime(saveId, timeJump) {
        const gameState = await this.loadGame(saveId);
        const currentDate = new Date(gameState.currentDate);

        // 1. Prepare AI Context
        const pendingActions = (gameState.actions || []).filter(a => a.status === 'pending');
        const gameContext = {
            currentDate: gameState.currentDate,
            playerNation: gameState.playerNation,
            actions: pendingActions,
            recentEvents: (gameState.events || []).slice(-10),
            worldState: this.buildWorldStateSummary(gameState),
            worldContext: gameState.world_context,
            simulationRules: gameState.simulation_rules
        };

        // 2. Call AI to generate consequences and events
        console.log(`[Engine] Generating turn events for ${saveId} (${timeJump})...`);
        const aiResult = await llmService.generateEvents(timeJump, gameContext);

        if (aiResult.error) {
            console.error(`[Engine] AI Generation Error: ${aiResult.error}`);
        }

        console.log(`[Engine] Received ${aiResult.events?.length || 0} events from AI.`);

        // 3. Process consequences and update state
        if (aiResult.events && aiResult.events.length > 0) {
            aiResult.events.forEach(event => {
                const newEvent = {
                    ...event,
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    game_date: gameState.currentDate,
                    created_at: new Date().toISOString(),
                    turn_number: gameState.turnNumber
                };
                gameState.events.push(newEvent);

                // Apply state changes from event to nations
                if (event.state_changes) {
                    Object.keys(event.state_changes).forEach(nationCode => {
                        const changes = event.state_changes[nationCode];
                        const nationState = gameState.nations[nationCode.toUpperCase()];
                        if (nationState) {
                            if (changes.stability) nationState.stability = Math.max(0, Math.min(100, (nationState.stability || 70) + changes.stability));
                            if (changes.war_support) nationState.warSupport = Math.max(0, Math.min(100, (nationState.warSupport || 20) + changes.war_support));
                            if (changes.treasury) nationState.treasury = (nationState.treasury || 1000) + changes.treasury;
                            if (changes.occupied_regions) {
                                nationState.occupied_regions = [...new Set([...(nationState.occupied_regions || []), ...changes.occupied_regions])];
                            }
                        }
                    });
                }
            });
        }

        // 4. Update Game Date and Turn
        const nextDate = this.calculateNewDate(currentDate, timeJump);
        gameState.currentDate = nextDate.toISOString().split('T')[0];
        gameState.turnNumber += 1;

        // 5. Mark pending actions as completed
        pendingActions.forEach(a => {
            const action = gameState.actions.find(act => act.id === a.id);
            if (action) action.status = 'completed';
        });

        // 6. Save and Return
        this.saveGame(saveId, gameState);

        return {
            previous_date: currentDate.toISOString().split('T')[0],
            new_date: gameState.currentDate,
            turn_number: gameState.turnNumber,
            events: aiResult.events || [],
            processed_actions: pendingActions.length
        };
    }

    buildWorldStateSummary(gameState) {
        const nations = this.getNations();
        const summary = {};

        // 1. Identify priority nations to stay within token limits
        const priorityNations = new Set();
        priorityNations.add(gameState.playerNationCode);

        // Add Nations from Pending Actions
        (gameState.actions || []).filter(a => a.status === 'pending').forEach(a => {
            if (a.nation_code) priorityNations.add(a.nation_code);
            // If the action text mentions a country code (regex), add it
            const mentions = a.action_text?.match(/[A-Z]{3}/g);
            if (mentions) mentions.forEach(m => priorityNations.add(m));
        });

        // Add Nations from Recent Events
        (gameState.events || []).slice(-10).forEach(e => {
            if (e.affected_nations) e.affected_nations.forEach(n => priorityNations.add(n));
        });

        // Add Major Powers
        Object.keys(nations).forEach(code => {
            if (nations[code].is_major_power) priorityNations.add(code);
        });

        // 2. Build summary for prioritizing nations
        Object.keys(gameState.nations).forEach(code => {
            if (priorityNations.has(code)) {
                const state = gameState.nations[code];
                const info = nations[code];
                if (info) {
                    summary[code] = {
                        name: info.name,
                        stability: state.stability,
                        war_support: state.warSupport,
                        occupied: state.occupied_regions?.length || 0,
                        at_war: state.atWar
                    };
                }
            }
        });

        return summary;
    }

    calculateNewDate(currentDate, timeJump) {
        const newDate = new Date(currentDate);

        // Parse N_unit patterns (e.g., '10_days', '2_weeks', '4_months', '1_year')
        const match = timeJump.match(/^(\d+)_(days?|weeks?|months?|years?)$/i);
        if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2].toLowerCase().replace(/s$/, ''); // normalize plural
            switch (unit) {
                case 'day':   newDate.setDate(newDate.getDate() + amount); break;
                case 'week':  newDate.setDate(newDate.getDate() + amount * 7); break;
                case 'month': newDate.setMonth(newDate.getMonth() + amount); break;
                case 'year':  newDate.setFullYear(newDate.getFullYear() + amount); break;
                default:      newDate.setDate(newDate.getDate() + amount); break;
            }
        } else {
            // Fallback: try parsing as raw number of days
            const days = parseInt(timeJump);
            if (!isNaN(days)) {
                newDate.setDate(newDate.getDate() + days);
            } else {
                newDate.setDate(newDate.getDate() + 1);
            }
        }
        return newDate;
    }

    async getAdvisorContext(saveId) {
        const gameState = await this.loadGame(saveId);
        const nations = this.getNations();

        const playerFull = {
            ...gameState.playerNation,
            ...gameState.nations[gameState.playerNationCode]
        };

        return {
            currentDate: gameState.currentDate,
            playerNation: {
                name: playerFull.name,
                code: playerFull.code,
                atWar: playerFull.atWar,
                occupied_regions: playerFull.occupied_regions || []
            },
            worldState: this.buildWorldStateSummary(gameState),
            recentEvents: (gameState.events || []).slice(-10),
            pendingActions: (gameState.actions || []).filter(a => a.status === 'pending'),
            worldContext: gameState.world_context,
            simulationRules: gameState.simulation_rules,
            turnNumber: gameState.turnNumber || 1
        };
    }

    /**
     * Get game context/state for API consumption
     */
    async getGameContext(saveId) {
        const gameState = await this.loadGame(saveId);
        const nations = this.getNations();

        return {
            saveId: saveId,
            currentDate: gameState.currentDate,
            turnNumber: gameState.turnNumber,
            playerNationCode: gameState.playerNationCode,
            playerNation: nations[gameState.playerNationCode] || null,
            nationStates: gameState.nations,
            eventCount: (gameState.events || []).length,
            pendingActionCount: (gameState.actions || []).filter(a => a.status === 'pending').length,
            worldContext: gameState.world_context
        };
    }

    async renameSave(saveId, newName) {
        const gameState = await this.loadGame(saveId);
        gameState.name = newName;
        this.saveGame(saveId, gameState);
    }
}

module.exports = GameEngine;
