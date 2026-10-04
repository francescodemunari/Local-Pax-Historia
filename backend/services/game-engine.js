const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const llmService = require('./llm-service');
const ScenarioService = require('./scenario-service');
const { contains, interiorPoint } = require('./map-geometry');
const { findLandRoute, SPEED } = require('./movement');
const { resolveCampaigns } = require('./campaigns');

function getRegionAnchor(region) {
    if (region.geographic_anchor && region.marker_anchor) return [...region.marker_anchor];
    return contains(region.path, region.marker_anchor, region.fill_rule)
        ? [...region.marker_anchor] : interiorPoint(region.path, region.fill_rule);
}

const savesDir = path.join(__dirname, '../../data/saves');
const SAVE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const TIME_JUMP_LIMITS = { day: 365, week: 52, month: 24, year: 5 };
const activeTurnSaves = new Set();

const DEFAULT_UNIT_CATALOG = {
    infantry: { label: 'Infantry Division', manpower: 10000, treasury: 50 },
    armor: { label: 'Armored Division', manpower: 6500, treasury: 140 },
    air: { label: 'Air Wing', manpower: 1800, treasury: 120 },
    naval: { label: 'Naval Flotilla', manpower: 3200, treasury: 160 }
};

function inputError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function isValidIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Game Engine - File-based game logic for Pax Historia
 */
class GameEngine {
    constructor() {
        this.scenarios = new ScenarioService();
        if (!fs.existsSync(savesDir)) {
            fs.mkdirSync(savesDir, { recursive: true });
        }
    }

    getNations(scenarioId) {
        const scenario=this.scenarios.getScenario(scenarioId);
        const profiles=require('../../data/leadership-profiles.json')[scenario.id]||{};
        return Object.fromEntries(Object.entries(this.scenarios.getNations(scenario.id)).map(([code,nation])=>[code,{...nation,...profiles[code]}]));
    }

    getEffectiveNations(state) {
        const leadership=require('./leadership');
        return Object.fromEntries(Object.entries(this.getNations(state.scenarioId)).map(([code,n])=>[code,{...n,...leadership.profileAt(state.scenarioId,code,state.currentDate,state.nations[code])}]));
    }

    getEffectiveCities(state) {
        const cities=[...this.scenarios.getCities(state.scenarioId),...(state.addedCities||[])];
        const regions=new Map(this.scenarios.getMap(state.scenarioId).regions.map(r=>[r.id,r]));
        return cities.map(city=>{
            const nation=state.nations[city.nation_code]||{};
            const selected=nation.capital_city_id ? nation.capital_city_id===city.id : city.is_capital;
            const controlled=this.getRegionController(state,regions.get(city.region_id))===city.nation_code;
            return {...city,is_capital:Boolean(selected && controlled && !nation.annexed_by),type:selected && controlled?'capital':'city'};
        });
    }

    validateSaveId(saveId) {
        if (typeof saveId !== 'string' || !SAVE_ID_PATTERN.test(saveId)) {
            throw inputError('Invalid save id', 'INVALID_SAVE_ID');
        }
        return saveId;
    }

    getSavePath(saveId) {
        return path.join(savesDir, `${this.validateSaveId(saveId)}.json`);
    }

    normalizeTimeJump(timeJump) {
        const match = typeof timeJump === 'string' && timeJump.trim()
            .match(/^(\d+)_(days?|weeks?|months?|years?)$/i);
        if (!match) {
            throw inputError('Invalid time jump. Use a value such as 1_week or 3_months.', 'INVALID_TIME_JUMP');
        }

        const amount = Number(match[1]);
        const unit = match[2].toLowerCase().replace(/s$/, '');
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > TIME_JUMP_LIMITS[unit]) {
            throw inputError(`Time jumps may not exceed ${TIME_JUMP_LIMITS[unit]} ${unit}s.`, 'INVALID_TIME_JUMP');
        }
        return `${amount}_${unit}${amount === 1 ? '' : 's'}`;
    }

    getRegionController(gameState, region) {
        if (!gameState?.nations || !region) return region?.nation_code || null;
        for (const [code, state] of Object.entries(gameState.nations)) {
            const occupied = state?.occupied_regions || [];
            if (occupied.includes(region.id) || occupied.includes(region.name)) return code;
        }
        return region.nation_code || null;
    }

    getMapWithControl(gameState) {
        const map = this.scenarios.getMap(gameState?.scenarioId);
        if (!gameState) return map;
        const controllers = this.getRegionControllers(gameState);
        return {
            ...map,
            regions: (map.regions || []).map(region => ({
                ...region,
                nation_code: controllers.get(region.id)
            }))
        };
    }

    setRegionController(gameState, requestedRegionId, controllerCode) {
        const region = this.scenarios.getMap(gameState.scenarioId).regions.find(candidate =>
            candidate.id === requestedRegionId || candidate.name === requestedRegionId
        );
        const controller = String(controllerCode || '').toUpperCase();
        if (!region || !gameState.nations[controller]) return null;

        // Occupations are sparse overrides over the historical map. Remove any
        // old override first so a province can never have two controllers.
        Object.values(gameState.nations).forEach(state => {
            state.occupied_regions = (state.occupied_regions || [])
                .filter(value => value !== region.id && value !== region.name);
        });
        if (controller !== region.nation_code) {
            gameState.nations[controller].occupied_regions.push(region.id);
        }
        return { region, controller };
    }

    normalizeEventLocation(location) {
        if (!isRecord(location)) return null;
        const { longitude, latitude } = location;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
        return { longitude, latitude, name: typeof location.name === 'string' ? location.name.slice(0, 120) : '' };
    }

    getRegionControllers(gameState) {
        const regions = this.scenarios.getMap(gameState.scenarioId).regions;
        const ids = new Set(regions.map(r => r.id)), names = new Map(), overrides = new Map();
        for (const region of regions) {
            if (!names.has(region.name)) names.set(region.name, []);
            names.get(region.name).push(region.id);
        }
        for (const [code, state] of Object.entries(gameState.nations || {})) {
            for (const value of Array.isArray(state.occupied_regions) ? state.occupied_regions : []) {
                for (const id of ids.has(value) ? [value] : names.get(value) || []) if (!overrides.has(id)) overrides.set(id, code);
            }
        }
        // Build a fresh index per snapshot; mutable turn state never reuses it.
        return new Map(regions.map(r => [r.id, overrides.get(r.id) || r.nation_code || null]));
    }

    getContextNationCodes(gameState, nations = this.getEffectiveNations(gameState)) {
        const player = gameState.nations[gameState.playerNationCode];
        return new Set([gameState.playerNationCode, 'ARA', ...(player?.warWith || []), ...(player?.allies || []),
            ...(gameState.campaigns || []).filter(c => ['active','held'].includes(c.status)).map(c => c.target),
            ...require('./nation-mentions').mentionedNations((gameState.actions || []).filter(a => a.status === 'pending'), nations)]);
    }

    applyModelStateChanges(gameState, changesByNation) {
        if (!isRecord(changesByNation)) return [];
        const applied = [];

        Object.entries(changesByNation).forEach(([rawCode, changes]) => {
            const nationCode = rawCode.toUpperCase();
            const nationState = gameState.nations[nationCode];
            if (!nationState || !isRecord(changes)) return;

            const changeSummary = { nation_code: nationCode };
            for(const key of ['name','name_local','leader_name','leader_title','ideology','government_type','ruling_party','head_of_state']) {
                if(typeof changes[key]==='string' && changes[key].trim()) {
                    nationState[key]=changes[key].trim().slice(0,160);changeSummary[key]=nationState[key];
                    if(nationCode===gameState.playerNationCode){if(gameState.playerNation)gameState.playerNation[key]=nationState[key];}
                }
            }
            for(const city of (Array.isArray(changes.add_cities)?changes.add_cities:[]).slice(0,8)) {
                const region=this.scenarios.getMap(gameState.scenarioId).regions.find(r=>r.id===city.region_id);
                if(!region || this.getRegionController(gameState,region)!==nationCode || !city.name?.trim())throw new Error('A new city needs a name and a controlled mapped province.');
                const coords=city.coords || getRegionAnchor(region);
                if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||!contains(region.path,coords,region.fill_rule))throw new Error('City coordinates must lie inside its province.');
                const id=String(city.id||'');
                if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new Error('A new city needs a stable alphanumeric ID.');
                if(this.getEffectiveCities(gameState).some(c=>c.id===id))continue;
                gameState.addedCities ||= [];
                gameState.addedCities.push({id,name:city.name.trim().slice(0,120),nation_code:nationCode,region_id:region.id,coords,type:'city',is_capital:false,approximate_location:!city.coords});
                changeSummary.cities_changed=true;
            }
            if(typeof changes.capital_city_id==='string') {
                const city=this.getEffectiveCities(gameState).find(c=>c.id===changes.capital_city_id && c.nation_code===nationCode);
                const region=city && this.scenarios.getMap(gameState.scenarioId).regions.find(r=>r.id===city.region_id);
                if(!region || this.getRegionController(gameState,region)!==nationCode)throw new Error('A relocated capital must be a mapped city in controlled territory.');
                nationState.capital_city_id=city.id;nationState.capital=city.name;changeSummary.capital_city_id=city.id;
            }

            if (Array.isArray(changes.occupied_regions)) {
                const occupied = changes.occupied_regions.slice(0, 25)
                    .map(regionId => this.setRegionController(gameState, regionId, nationCode))
                    .filter(Boolean)
                    .map(({ region }) => region.id);
                if (occupied.length) changeSummary.occupied_regions = occupied;
            }
            if (Object.keys(changeSummary).length > 1) applied.push(changeSummary);
        });

        return applied;
    }

    /**
     * Create a new game
     */
    async createGame(playerNationCode, startDate = null, scenarioId = null) {
        const scenario = this.scenarios.getScenario(scenarioId);
        startDate = startDate ?? scenario.defaultStartDate ?? scenario.startDates[0];
        const nations = this.getNations(scenario.id);
        const nationCode = String(playerNationCode || '').toUpperCase();
        const playerNation = nations[nationCode];

        if (!playerNation || playerNation.playable === false) {
            throw new Error(`Nation ${playerNationCode} not found`);
        }
        if (!isValidIsoDate(startDate) || !scenario.startDates.includes(startDate)) {
            throw inputError(`Start date must be one of this scenario's supported dates: ${scenario.startDates.join(', ')}`, 'INVALID_START_DATE');
        }

        const saveId = uniqueId('save');
        const gameState = {
            id: saveId,
            name: `${scenario.name}: ${playerNation.name} - ${startDate}`,
            scenarioId: scenario.id,
            scenarioVersion: scenario.version,
            playerNationCode: nationCode,
            currentDate: startDate,
            turnNumber: 1,
            nations: {},
            initialDiplomacyApplied: true,
            chats: [],
            actions: [],
            events: [],
            units: [],
            history: [],
            created_at: new Date().toISOString(),
            world_context: scenario.worldContext || '',
            simulation_rules: scenario.simulationRules || ''
        };

        // Initialize all nations
        Object.keys(nations).forEach(code => {
            const nation = nations[code];
            gameState.nations[code] = {
                code: code,
                atWar: false,
                warWith: [],
                allies: [],
                relations: {},
                occupied_regions: [],
                ...(scenario.initialNationState?.[code] || {})
            };
        });

        // Formations enter the map only through resolved player orders.
        for(const [a,b] of scenario.initialWars||[])for(const [first,second] of [[a,b],[b,a]]) {
            gameState.nations[first].atWar=true;
            gameState.nations[first].warWith=[...new Set([...gameState.nations[first].warWith,second])];
        }

        this.saveGame(saveId, gameState);

        return {
            save_id: saveId,
            player_nation: playerNation,
            current_date: startDate,
            turn_number: 1,
            scenario: this.getScenarioSummary(scenario)
        };
    }

    /**
     * Process player action
     */
    async processPlayerAction(saveId, actionText, actionType = 'general') {
        const gameState = await this.loadGame(saveId);

        const newAction = {
            id: uniqueId('action'),
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
    saveGame(saveId, gameState, { turnCommit = false } = {}) {
        const filePath = this.getSavePath(saveId);
        if (activeTurnSaves.has(saveId) && !turnCommit) {
            throw inputError('The Game Master is resolving this save. Please retry when the turn finishes.', 'TURN_IN_PROGRESS');
        }
        const exists = fs.existsSync(filePath);
        const storedRevision = exists ? (JSON.parse(fs.readFileSync(filePath, 'utf8')).revision || 0) : 0;
        if ((!exists && gameState.revision !== undefined) || storedRevision !== (gameState.revision || 0)) {
            throw inputError('This save changed while the request was running. Refresh and try again.', 'SAVE_CONFLICT');
        }
        // loadGame enriches a state for UI use. Derived response data belongs
        // in memory, not in a durable save where it can leak local metadata.
        const { playerNation, scenario, ...persistentState } = gameState;
        persistentState.revision = storedRevision + 1;
        persistentState.updated_at = new Date().toISOString();
        const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporaryPath, JSON.stringify(persistentState, null, 2), { flag: 'wx' });
            fs.renameSync(temporaryPath, filePath);
        } finally {
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        }
        gameState.revision = persistentState.revision;
        gameState.updated_at = persistentState.updated_at;
    }

    /**
     * Load game from local JSON
     */
    async loadGame(saveId) {
        const filePath = this.getSavePath(saveId);
        if (!fs.existsSync(filePath)) {
            throw inputError('Save not found', 'SAVE_NOT_FOUND');
        }

        const storedState = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const scenario = this.scenarios.getSaveScenario(storedState);
        const gameState = {
            ...storedState,
            revision: storedState.revision || 0,
            scenarioId: scenario.id,
            scenarioVersion: storedState.scenarioVersion || scenario.version
        };
        this.normalizeUnitDeployments(gameState, scenario);
        if(!gameState.initialDiplomacyApplied && scenario.id==='ww2-geographic') {
            const peace=(gameState.events||[]).some(e=>e.applied_diplomatic_change?.action==='make_peace' &&
                [e.applied_diplomatic_change.nation_code,e.applied_diplomatic_change.target_nation_code].sort().join(',')==='ETH,ITA');
            if(!peace && !gameState.nations.ETH?.annexed_by && gameState.nations.ITA && gameState.nations.ETH) {
                for(const [a,b] of [['ITA','ETH'],['ETH','ITA']]) {
                    gameState.nations[a].warWith=[...new Set([...(gameState.nations[a].warWith||[]),b])];gameState.nations[a].atWar=true;
                }
            }
            gameState.initialDiplomacyApplied=true;
        }
        const nations = this.getNations(scenario.id);
        for(const [code,n] of Object.entries(nations))if(!gameState.nations[code] && (n.is_territory_group||n.map_supplement))gameState.nations[code]={code,warWith:[],allies:[],occupied_regions:[],atWar:false};
        const effective=this.getEffectiveNations(gameState);

        return {
            ...gameState,
            playerNation: effective[gameState.playerNationCode],
            scenario: this.getScenarioSummary(scenario),
            events: gameState.events || [],
            actions: gameState.actions || []
        };
    }

    async getSaves() {
        if (!fs.existsSync(savesDir)) return [];
        const files = fs.readdirSync(savesDir).filter(f => f.endsWith('.json'));
        return files.flatMap(file => {
            try {
            const data = JSON.parse(fs.readFileSync(path.join(savesDir, file), 'utf-8'));
            const scenario = this.scenarios.getSaveScenario(data);
            const nations = this.getNations(scenario.id);
            return {
                id: data.id,
                name: data.name,
                nation_code: data.playerNationCode,
                nation_name: nations[data.playerNationCode]?.name || 'Unknown',
                current_date: data.currentDate,
                turn_number: data.turnNumber || 1,
                scenario_id: scenario.id,
                scenario_name: scenario.name,
                updated_at: data.updated_at || data.created_at
            };
            } catch (error) {
                console.warn(`[Saves] Skipping unreadable save ${file}: ${error.message}`);
                return [];
            }
        }).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }

    async deleteSave(saveId) {
        const filePath = this.getSavePath(saveId);
        if (activeTurnSaves.has(saveId)) {
            throw inputError('Wait for the Game Master to finish before deleting this save.', 'TURN_IN_PROGRESS');
        }
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    /**
     * Old saves can name a city or a historical theatre instead of the SVG
     * region that now renders its formation. Resolve optional scenario aliases
     * and always recalculate the marker position from the active map. The
     * caller may save the normalized state later, but merely loading a save
     * never rewrites a player's file.
     */
    normalizeUnitDeployments(gameState, scenario) {
        if (!Array.isArray(gameState.units)) return;

        const mapRegions = this.scenarios.getMap(scenario.id).regions || [];
        const aliases = scenario.regionAliases || {};
        gameState.units.forEach(unit => {
            const requestedId = typeof unit?.region_id === 'string' ? unit.region_id : '';
            const resolvedId = aliases[requestedId] || requestedId;
            const region = mapRegions.find(candidate => candidate.id === resolvedId || candidate.name === resolvedId);
            if (!region) return;

            unit.region_id = region.id;
            const centroid = getRegionAnchor(region);
            if (centroid) unit.centroid = centroid;
        });
    }

    getScenarioBriefing(gameState) {
        const scenario = this.scenarios.getScenario(gameState.scenarioId);
        const briefings = require('../../data/scenario-briefings.json');
        const baseId = scenario.id.replace(/-sectors-v1$/, '');
        const briefing = briefings[baseId];
        const player = gameState.playerNation;
        return [briefing?.world || scenario.worldContext, `PLAYER: ${player.name} [${player.code}]. Capital: ${player.capital || 'see map'}.`,
            briefing?.nations?.[player.code] || 'Assess this nation within the regional situation and its actual sovereignty. Do not invent precise economic statistics or leadership details when uncertain.',
            'Starting context is background only. The current date, saved events, territory and diplomatic changes take precedence.'].join('\n\n');
    }

    getRecruitmentContext(gameState, availableDays = 0) {
        const scenario = this.scenarios.getScenario(gameState.scenarioId);
        const playerCode = gameState.playerNationCode;
        const playerState = gameState.nations[playerCode] || {};
        const mapRegions=this.scenarios.getMap(scenario.id).regions;
        const regionLookup=new Map(mapRegions.map(r=>[r.id,r]));
        const controlledRegions = this.scenarios.getMap(scenario.id).regions
            .filter(region => this.getRegionController(gameState, region) === playerCode)
            .map(region => region.id);

        return {
            catalog: Object.fromEntries(Object.entries(scenario.unitCatalog || DEFAULT_UNIT_CATALOG).map(([key, { manpower, treasury, ...spec }]) => [key, spec])),
            validRegionIds: controlledRegions,
            controlledRegions: this.scenarios.getMap(scenario.id).regions
                .filter(region => this.getRegionController(gameState, region) === playerCode)
                .map(({id,name,geographic_anchor,area_km2,neighbors=[]}) => ({id,name,location:geographic_anchor,area_km2,
                    adjacent_foreign_regions:neighbors.map(n=>regionLookup.get(n)).filter(r=>r && this.getRegionController(gameState,r)!==playerCode)
                        .map(r=>({id:r.id,name:r.name,controller:this.getRegionController(gameState,r)}))})),
            mobilisationRule: 'Operation orders can mobilise previously untracked forces needed to attempt them. Use appropriate controlled staging regions; reuse existing units first. No automatic starting roster.',
            movement: { available_days: availableDays,
                svg_units_per_day: Object.fromEntries(Object.entries(scenario.unitCatalog).map(([type, spec]) => [type, spec.landSpeed ?? SPEED[type] ?? 0])),
                kilometers_per_day: Object.fromEntries(Object.entries(scenario.unitCatalog).filter(([,spec])=>spec.landKmPerDay).map(([type,spec])=>[type,spec.landKmPerDay])),
                rule: 'Land units only; a continuous route through player-controlled main land components is required. No sea or air transfers.' },
            existingUnits: (gameState.units || []).filter(unit => unit.nation_code === playerCode)
                .map(({ id, name, unit_type, region_id, source_action_id, strength, organization, mission }) => ({ id, name, unit_type, region_id, source_action_id, strength, organization, mission }))
        };
    }

    applyModelUnitChanges(gameState, requestedChanges, approvedActionIds = new Set(), { availableDays = 0, rejectedChanges = [] } = {}) {
        const scenario = this.scenarios.getScenario(gameState.scenarioId);
        const catalog = scenario.unitCatalog || DEFAULT_UNIT_CATALOG;
        const mapRegions = this.scenarios.getMap(scenario.id).regions || [];
        const playerCode = gameState.playerNationCode;
        const playerState = gameState.nations[playerCode];
        const applied = [];

        if (!Array.isArray(requestedChanges) || !playerState) return applied;
        const existingUnits = new Map((gameState.units || []).map(unit => [unit.id, unit]));
        const movedUnits = new Set();

        // A single turn may authorise a small production programme, but never
        // an unbounded number of units because of malformed model output.
        requestedChanges.slice(0, 8).forEach(change => {
            if (!isRecord(change)) return;
            const operation = String(change.action || '').toLowerCase();
            if (!['recruit', 'move', 'disband'].includes(operation)) return;

            // A formation must be linked to an actual order the Game Master
            // submitted. This prevents an unrelated model completion from
            // creating armies without a player request.
            const standingRecruit=operation==='recruit' && (gameState.campaigns||[]).some(c=>
                c.status==='active' && !c.manual_hold && c.source_action_id===change.action_id);
            if (typeof change.action_id !== 'string' || (!approvedActionIds.has(change.action_id) && !standingRecruit)) return;

            const reject = reason => rejectedChanges.push({ action: operation, action_id: change.action_id, unit_id: change.unit_id, reason });
            const nationCode = String(change.nation_code || '').toUpperCase();
            const unitType = String(change.unit_type || '').toLowerCase();
            const unitSpec = catalog[unitType];
            const region = mapRegions.find(candidate =>
                candidate.id === change.region_id || candidate.name === change.region_id
            );

            if (operation === 'disband') {
                const unit = existingUnits.get(change.unit_id);
                if (nationCode !== playerCode || !unit || unit.nation_code !== playerCode || movedUnits.has(unit.id)) {
                    reject('Only an existing player formation that has not acted this turn can be disbanded.'); return;
                }
                gameState.units = gameState.units.filter(candidate => candidate.id !== unit.id);
                movedUnits.add(unit.id);
                applied.push({ action: 'disband', action_id: change.action_id, unit: { ...unit } });
                return;
            }

            if (operation === 'move') {
                const unit = existingUnits.get(change.unit_id);
                if (nationCode !== playerCode || !unit || unit.nation_code !== playerCode ||
                    movedUnits.has(unit.id) || !region || unit.region_id === region.id ||
                    this.getRegionController(gameState, region) !== playerCode) {
                    reject('Movement requires an existing player formation, an unused turn order, and a different player-controlled destination.'); return;
                }
                const centroid = getRegionAnchor(region);
                if (!centroid) return;
                const route = findLandRoute(mapRegions, unit.region_id, region.id, unit.unit_type,
                    candidate => this.getRegionController(gameState, candidate) === playerCode,
                    catalog[unit.unit_type]?.landSpeed ?? SPEED[unit.unit_type] ?? 0,
                    catalog[unit.unit_type]?.landKmPerDay ?? null);
                if (!route || route.required_days > availableDays) {
                    rejectedChanges.push({ action_id: change.action_id, unit_id: unit.id,
                        reason: !route ? 'No supported land route through controlled territory.'
                            : `This move requires ${route.required_days} days; the turn allows ${availableDays}.` });
                    return;
                }
                const previousRegionId = unit.region_id;
                unit.region_id = region.id;
                unit.centroid = centroid;
                unit.last_order_id = change.action_id;
                movedUnits.add(unit.id);
                applied.push({ action: 'move', action_id: change.action_id,
                    previous_region_id: previousRegionId, route, unit: { ...unit } });
                return;
            }

            // Recruitment is only resolved for the player nation. Other nations
            // remain part of the narrative until their autonomous military model
            // is implemented, preventing a stray completion from spawning armies.
            if (nationCode !== playerCode || !unitSpec || !region) {
                reject('Recruitment requires your nation, a supported unit type and an existing province.'); return;
            }

            const controlled = this.getRegionController(gameState, region) === playerCode;
            if (!controlled) {
                reject('Recruitment requires a player-controlled province.');
                return;
            }

            const centroid = getRegionAnchor(region);
            if (!centroid) return;

            const suppliedName = typeof change.name === 'string' ? change.name.trim() : '';
            const count = (gameState.units || []).filter(unit => unit.unit_type === unitType && unit.nation_code === playerCode).length + 1;
            const fallbackName = `${count}${count === 1 ? 'st' : count === 2 ? 'nd' : count === 3 ? 'rd' : 'th'} ${unitSpec.label}`;
            const unit = {
                id: uniqueId('unit'),
                name: (suppliedName || fallbackName).slice(0, 80),
                unit_type: unitType,
                nation_code: playerCode,
                region_id: region.id,
                centroid,
                strength: 100,
                organization: 100,
                experience: 0,
                created_at: new Date().toISOString(),
                source: 'game-master',
                source_action_id: change.action_id
            };

            gameState.units = gameState.units || [];
            gameState.units.push(unit);
            applied.push({ action: 'recruit', action_id: change.action_id, formation_ref: change.formation_ref, day_offset: change.day_offset,
                unit: structuredClone(unit) });
        });

        return applied;
    }

    applyModelActionResolutions(gameState, pendingActions, requestedResolutions, deferredActionIds = []) {
        const pendingById = new Map((pendingActions || []).map(action => [action.id, action]));
        const resolutionsById = new Map();

        if (Array.isArray(requestedResolutions)) {
            requestedResolutions.forEach(resolution => {
                if (!isRecord(resolution) || !pendingById.has(resolution.action_id) || resolutionsById.has(resolution.action_id)) return;

                const summary = typeof resolution.summary === 'string'
                    ? resolution.summary.replace(/\s+/g, ' ').trim().slice(0, 600)
                    : '';
                resolutionsById.set(resolution.action_id, { summary });
            });
        }

        return (pendingActions || []).flatMap(pendingAction => {
            const action = gameState.actions.find(candidate => candidate.id === pendingAction.id);
            const resolution = resolutionsById.get(pendingAction.id);
            // A missing outcome is an incomplete simulation. Preserve the entire turn for retry.
            if (!resolution) throw inputError('The simulation omitted an order outcome. Your orders were preserved; retry the turn.', 'GAME_MASTER_INVALID_RESPONSE');
            if(deferredActionIds.includes(pendingAction.id))return [{action_id:pendingAction.id,...resolution,deferred:true}];
            if (action) {
                action.status = 'completed';
                delete action.resolution_status;
                action.ai_response = resolution.summary;
                action.resolved_at = new Date().toISOString();
            }
            return { action_id: pendingAction.id, ...resolution };
        });
    }

    /**
     * Advance time (process turn) - AI FULL INTEGRATION
     */
    async advanceTime(saveId, timeJump) {
        this.validateSaveId(saveId);
        if (activeTurnSaves.has(saveId)) {
            throw inputError('This turn is already being resolved by the Game Master.', 'TURN_IN_PROGRESS');
        }

        activeTurnSaves.add(saveId);
        try {
            return await this.advanceTimeUnlocked(saveId, timeJump);
        } finally {
            activeTurnSaves.delete(saveId);
        }
    }

    async advanceTimeUnlocked(saveId, timeJump) {
        const gameState = await this.loadGame(saveId);
        const initialUnits = structuredClone(gameState.units || []);
        const turnEventStart = gameState.events.length;
        const initialControl = this.getRegionControllers(gameState);
        const nextImportantEvent = timeJump === 'next_event';
        const nextEventHorizonDays = require('./next-event').NEXT_EVENT_HORIZON;
        let normalizedTimeJump = this.normalizeTimeJump(nextImportantEvent ? `${nextEventHorizonDays}_days` : timeJump);
        const currentDate = new Date(gameState.currentDate);
        let nextDate = this.calculateNewDate(currentDate, normalizedTimeJump);
        let availableDays = Math.round((nextDate - currentDate) / 86400000);

        // 1. Prepare AI Context
        const pendingActions = (gameState.actions || []).filter(a => a.status === 'pending');
        const contextNations = this.getEffectiveNations(gameState);
        const contextNationCodes = this.getContextNationCodes(gameState, contextNations);
        const gameContext = {
            nextImportantEvent,
            nextEventHorizonDays,
            scheduledLeadership:require('./leadership').transitions(gameState,gameState.currentDate,nextDate.toISOString().slice(0,10)),
            scenarioId: gameState.scenarioId,
            scenarioName: this.scenarios.getScenario(gameState.scenarioId).name,
            scenarioEra: this.scenarios.getScenario(gameState.scenarioId).era,
            currentDate: gameState.currentDate,
            playerNation: gameState.playerNation,
            actions: pendingActions,
            campaigns: gameState.campaigns || [],
            mapRegions: this.scenarios.getMap(gameState.scenarioId).regions.filter(r=>contextNationCodes.has(initialControl.get(r.id))).map(r=>({id:r.id,name:r.name,controller:initialControl.get(r.id)})),
            recentOrders: (gameState.actions || []).slice(-12).map(a=>({id:a.id,text:a.action_text,status:a.status})),
            nationCatalog: Object.entries(contextNations).map(([code,n])=>({code,name:n.name,name_local:n.name_local,
                aliases:n.aliases,annexed_by:gameState.nations[code]?.annexed_by})),
            recentEvents: (gameState.events || []).slice(-10),
            worldState: this.buildWorldStateSummary(gameState),
            worldContext: this.getScenarioBriefing(gameState),
            simulationRules: this.scenarios.getScenario(gameState.scenarioId).simulationRules,
            recruitment: this.getRecruitmentContext(gameState, availableDays)
        };

        gameContext.previewMilitaryResult = result => {
            const preview=structuredClone(gameState);
            const days=nextImportantEvent?result.elapsed_days:availableDays;
            const authorized=new Set(pendingActions.map(a=>a.id));
            const rejected=[];
            const targets=[...(preview.campaigns||[]).map(c=>c.target),...(result.campaign_orders||[]).filter(c=>c.action==='start').map(c=>c.target_nation_code)];
            const protectedNations=new Set(targets.length?[preview.playerNationCode,...targets]:[]);
            for(const event of (result.events||[]).slice(0,50)) {
                if(!isRecord(event) || typeof event.title!=='string' || !event.title.trim() || typeof event.description!=='string' || !event.description.trim())continue;
                const safe=Object.fromEntries(Object.entries(isRecord(event.state_changes)?event.state_changes:{}).map(([code,changes])=>[code,protectedNations.has(code.toUpperCase())?{...changes,occupied_regions:undefined}:changes]));
                try {this.applyModelStateChanges(preview,safe);}
                catch(error) {error.scope='world';throw error;}
            }
            const changes=this.applyModelUnitChanges(preview,result.unit_changes,authorized,{availableDays:days,rejectedChanges:rejected});
            if(rejected.length)throw new Error(rejected.map(r=>r.reason).join('\n'));
            const campaignIds=new Set([...authorized,...preview.units.map(u=>u.source_action_id).filter(id=>preview.actions.some(a=>a.id===id))]);
            resolveCampaigns(this,preview,result.campaign_orders,campaignIds,days,changes.filter(c=>c.action==='move').map(c=>c.unit.id),changes,result.diplomatic_changes,authorized);
        };

        // 2. Call AI to generate consequences and events
        console.log(`[Engine] Generating turn events for ${saveId} (${normalizedTimeJump})...`);
        const aiResult = await llmService.generateEvents(normalizedTimeJump, gameContext);

        if (aiResult?.error) {
            console.error(`[Engine] AI Generation Error: ${aiResult.error}`);
            const error = new Error(`Game Master could not resolve this turn: ${aiResult.error}`);
            error.code = 'GAME_MASTER_UNAVAILABLE';
            throw error;
        }
        if (!isRecord(aiResult) || !Array.isArray(aiResult.events)) {
            const error = new Error('Game Master returned an invalid turn response. Pending orders were preserved.');
            error.code = 'GAME_MASTER_INVALID_RESPONSE';
            throw error;
        }
        if(nextImportantEvent) {
            try { require('./next-event').validateNextEvent(aiResult,gameContext); }
            catch(cause) { const error=new Error(`Unable to stop at the next important event: ${cause.message} Your turn and orders are unchanged.`);error.code='GAME_MASTER_INVALID_RESPONSE';throw error; }
            availableDays=aiResult.elapsed_days;normalizedTimeJump=`${availableDays}_days`;
            nextDate=this.calculateNewDate(currentDate,normalizedTimeJump);
        }
        require('./operation-plan').compileOperationPlans(aiResult,gameContext);

        console.log(`[Engine] Received ${aiResult.events?.length || 0} events from AI.`);

        // 3. Process consequences and update state
        const narrativeEvents = aiResult.events.length ? aiResult.events : pendingActions.filter(action => !aiResult.deferred_action_ids?.includes(action.id)).flatMap(action => {
            const outcome = (Array.isArray(aiResult.action_resolutions) ? aiResult.action_resolutions : []).find(result => result?.action_id === action.id);
            const hasProposal = [...(Array.isArray(aiResult.unit_changes) ? aiResult.unit_changes : []), ...(Array.isArray(aiResult.diplomatic_changes) ? aiResult.diplomatic_changes : [])]
                .some(proposal => proposal?.action_id === action.id);
            return !hasProposal && typeof outcome?.summary === 'string' && outcome.summary.trim()
                ? [{title:'Order outcome',description:outcome.summary,game_date:outcome.game_date || outcome.date ||
                    (Number.isInteger(Number(outcome.day_offset)) ? require('./event-dates').atDay(currentDate,Number(outcome.day_offset),availableDays) : undefined),
                    affected_nations:[gameState.playerNationCode],event_type:'political'}] : [];
        });
        const modelEvents = narrativeEvents.slice(0, 50)
            .filter(event => isRecord(event) && typeof event.title === 'string' && event.title.trim() &&
                typeof event.description === 'string' && event.description.trim())
            .map((event,index) => ({
                game_date: require('./event-dates').withinTurn(event.game_date || event.date,currentDate,nextDate) || require('./event-dates').atDay(currentDate,(index+1)*availableDays/Math.max(1,narrativeEvents.length),availableDays),
                title: event.title.trim().slice(0, 200), description: event.description.trim().slice(0, 12000),
                event_type: ['political', 'military', 'economic', 'diplomatic', 'social'].includes(event.event_type) ? event.event_type : 'political',
                severity: ['minor', 'moderate', 'major', 'critical'].includes(event.severity) ? event.severity : 'minor',
                affected_nations: [...new Set((Array.isArray(event.affected_nations) ? event.affected_nations : [])
                    .filter(code => typeof code === 'string' && Object.hasOwn(gameState.nations, code)))],
                state_changes: isRecord(event.state_changes) ? event.state_changes : {},
                location: this.normalizeEventLocation(event.location),
                source: 'game-master'
            }));
        if (aiResult.events.length && !modelEvents.length) {
            throw inputError('Game Master returned no usable events. The turn was not saved.', 'GAME_MASTER_INVALID_RESPONSE');
        }
        if (modelEvents.length > 0) {
            modelEvents.forEach(event => {
                const newEvent = {
                    ...event,
                    id: uniqueId('event'),
                    game_date: event.game_date,
                    created_at: new Date().toISOString(),
                    turn_number: gameState.turnNumber
                };
                gameState.events.push(newEvent);

                // The model can narrate arbitrary consequences, but durable
                // state must pass the engine's ownership/resource guardrails.
                const campaignTargets = [...(gameState.campaigns||[]).map(c=>c.target),...(Array.isArray(aiResult.campaign_orders)?aiResult.campaign_orders:[]).filter(o=>o?.action==='start').map(o=>o.target_nation_code)];
                const protectedNations = new Set(campaignTargets.length?[gameState.playerNationCode,...campaignTargets]:[]);
                const safeChanges = Object.fromEntries(Object.entries(event.state_changes||{}).map(([code,changes])=>[code,protectedNations.has(code.toUpperCase()) ? {...changes,occupied_regions:undefined} : changes]));
                const appliedChanges = this.applyModelStateChanges(gameState, safeChanges);
                if (appliedChanges.length) newEvent.applied_state_changes = appliedChanges;
                // Return the same normalized event that was persisted, including
                // its identity, timestamp and actual effects.
                Object.assign(event, newEvent);
            });
        }

        // Narrative outcomes are model-authored, but only existing pending
        // player orders can be consumed by this simulation.
        const actionResolutions = this.applyModelActionResolutions(
            gameState,
            pendingActions,
            aiResult.action_resolutions,
            aiResult.deferred_action_ids || []
        );

        // The Game Master alone can authorise concrete divisions. A proposal
        // must be tied to a pending order, then passes ownership,
        // type and map-placement guardrails before being saved.
        const approvedActionIds = new Set(pendingActions.map(action => action.id));
        const appliedEventStart = gameState.events.length;
        for(const resolution of aiResult.action_resolutions||[]) {
            if(!pendingActions.some(a=>a.id===resolution.action_id) || !resolution.operation)continue;
            const op=resolution.operation;
            const explanations=[op.status==='blocked'?op.reason:null,op.air_support_reason,...(op.fronts||[]).filter(f=>f.status==='blocked' || f.hold_reason).map(f=>`${f.name}: ${f.hold_reason || f.reason}`)].filter(Boolean);
            if(explanations.length)gameState.events.push({id:uniqueId('event'),event_type:'military',severity:'minor',
                title:'Operation constraints',description:explanations.join('\n'),affected_nations:[gameState.playerNationCode],
                game_date:gameState.currentDate,turn_number:gameState.turnNumber,source:'engine'});
        }
        const rejectedUnitChanges = [];
        const unitChanges = this.applyModelUnitChanges(gameState, aiResult.unit_changes, approvedActionIds,
            { availableDays, rejectedChanges: rejectedUnitChanges });
        for (const rejection of rejectedUnitChanges) {
            gameState.events.push({ id: uniqueId('event'), event_type: 'military', severity: 'minor',
                title: rejection.action === 'recruit' ? 'Recruitment not applied' : rejection.action === 'disband' ? 'Disbanding not applied' : 'Movement not applied', description: rejection.reason,
                affected_nations: [gameState.playerNationCode], rejected_unit_change: rejection,
                game_date: gameState.currentDate, turn_number: gameState.turnNumber,
                created_at: new Date().toISOString(), source: 'engine' });
        }
        for (const change of unitChanges.filter(c=>c.action!=='recruit')) {
            const moving = change.action === 'move';
            const disbanding = change.action === 'disband';
            gameState.events.push({
                id: uniqueId('event'), event_type: 'military', severity: 'minor',
                title: `${disbanding ? 'Formation disbanded' : moving ? 'Formation moved' : 'Formation raised'}: ${change.unit.name}`,
                description: disbanding ? `${change.unit.name} was disbanded.` : moving
                    ? `${change.unit.name} moved from ${change.previous_region_id} to ${change.unit.region_id}.`
                    : `${change.unit.name} formed in ${change.unit.region_id}.`,
                affected_nations: [change.unit.nation_code], applied_unit_change: change,
                game_date: gameState.currentDate, turn_number: gameState.turnNumber,
                created_at: new Date().toISOString(), source: 'engine'
            });
        }
        const campaignAuthorizations = new Set([...approvedActionIds,...(gameState.units||[]).map(u=>u.source_action_id).filter(id=>(gameState.actions||[]).some(a=>a.id===id))]);
        const campaignEffects = resolveCampaigns(this,gameState,aiResult.campaign_orders,campaignAuthorizations,availableDays,unitChanges.filter(c=>c.action==='move').map(c=>c.unit.id),unitChanges,aiResult.diplomatic_changes,approvedActionIds);
        const diplomaticChanges = gameState.events.slice(appliedEventStart).flatMap(event => event.applied_diplomatic_change ? [event.applied_diplomatic_change] : []);
        for(const resolution of aiResult.action_resolutions||[]) {
            const op=resolution.operation;
            const campaign=op && gameState.campaigns?.find(c=>c.target===op.target_nation_code && c.status==='active');
            if(!approvedActionIds.has(resolution.action_id) && campaign?.source_action_id!==resolution.action_id)continue;
            if(campaign && op.fronts?.length) {
                const replace=op.front_scope==='replace' && approvedActionIds.has(resolution.action_id) && typeof op.scope_reason==='string' && op.scope_reason.trim();
                campaign.requested_fronts=require('./operation-progress').mergeFronts(campaign.requested_fronts||[],op.fronts,replace);
                if(replace)campaign.current_order=pendingActions.find(a=>a.id===resolution.action_id).action_text;
            }
        }
        require('./operation-progress').persistOperationProgress(gameState,aiResult,unitChanges,nextDate.toISOString().slice(0,10));
        for (const effect of campaignEffects) {
            gameState.events.push({id:uniqueId('event'),event_type:'military',severity:effect.severity,source:'game-master',
                title:effect.title || 'Surrender and annexation',description:effect.reason,
                region_id:effect.region_id,applied_unit_change:effect.changes?.[0],applied_unit_changes:effect.changes||[],campaign_effect:effect,
                affected_nations:[gameState.playerNationCode,effect.target_nation_code].filter(Boolean),
                game_date:require('./event-dates').atDay(currentDate,effect.day_offset || availableDays,availableDays),turn_number:gameState.turnNumber+1,created_at:new Date().toISOString()});
        }
        const engineEvents=gameState.events.slice(appliedEventStart);
        const successions=require('./leadership').transitions(gameState,gameState.currentDate,nextDate.toISOString().slice(0,10));
        // Routine dated successions update effective profiles silently. A death,
        // coup or other significant development can still be a model event.
        const reportTitles=new Set(engineEvents.map(e=>e.title));
        // A campaign report is the only source of player battle narration: free
        // text in events has no formations/effects and used to describe phantom
        // advances on fronts that did not exist on the map.
        const campaignTargets=new Set([...(gameState.campaigns||[]).filter(c=>['active','held'].includes(c.status)).map(c=>c.target),...campaignEffects.map(c=>c.target_nation_code)]);
        const narrative=modelEvents.filter(e=>!reportTitles.has(e.title) && !(e.event_type==='military' && campaignTargets.size && e.affected_nations.some(c=>c===gameState.playerNationCode||campaignTargets.has(c))));
        for(const event of engineEvents) {
            if(!require('./event-dates').withinTurn(event.game_date,currentDate,nextDate))event.game_date=require('./event-dates').atDay(currentDate,event.applied_unit_change?.route?.required_days || 1,availableDays);
        }
        const turnEvents=[...engineEvents,...narrative].sort((a,b)=>a.game_date.localeCompare(b.game_date));
        gameState.events.splice(turnEventStart,gameState.events.length-turnEventStart,...turnEvents);
        const territoryChanges=this.scenarios.getMap(gameState.scenarioId).regions.flatMap(r=>{
            const controller=this.getRegionController(gameState,r);
            return controller!==initialControl.get(r.id)?[{region_id:r.id,previous_controller:initialControl.get(r.id),controller}]:[];
        });

        // 4. Update Game Date and Turn
        gameState.currentDate = nextDate.toISOString().split('T')[0];
        gameState.turnNumber += 1;

        // 5. Save and Return
        this.saveGame(saveId, gameState, { turnCommit: true });

        return {
            previous_date: currentDate.toISOString().split('T')[0],
            new_date: gameState.currentDate,
            turn_number: gameState.turnNumber,
            events: turnEvents,
            initial_units: [...initialUnits.filter(u=>u.source!=='campaign-defence'),...unitChanges.filter(c=>c.action==='recruit').map(c=>c.unit)],
            territory_changes: territoryChanges,
            world_changed: successions.length>0 || modelEvents.some(e=>e.applied_state_changes?.length),
            campaigns: gameState.campaigns || [],
            unit_changes: unitChanges,
            rejected_unit_changes: rejectedUnitChanges,
            diplomatic_changes: diplomaticChanges,
            action_resolutions: actionResolutions,
            resolution_notes: aiResult.resolution_notes || [],
            generation_info: aiResult.generation_info,
            processed_actions: actionResolutions.filter(r=>!r.deferred).length,
            next_event_horizon_days: nextImportantEvent ? nextEventHorizonDays : undefined,
            next_event_horizon_reached: nextImportantEvent && availableDays===nextEventHorizonDays && !turnEvents.some(e=>['major','critical'].includes(e.severity))
        };
    }

    applyModelDiplomaticChanges(gameState, proposals, approvedActionIds, {gameDate = gameState.currentDate} = {}) {
        const applied = [];
        const changedPairs = new Set();
        for (const proposal of (Array.isArray(proposals) ? proposals.slice(0, 20) : [])) {
            if (!isRecord(proposal) || !approvedActionIds.has(proposal.action_id)) continue;
            const { action, nation_code: first, target_nation_code: second } = proposal;
            if (!['declare_war', 'make_peace', 'form_alliance', 'end_alliance'].includes(action) || first === second ||
                first !== gameState.playerNationCode ||
                !Object.hasOwn(gameState.nations, first) || !Object.hasOwn(gameState.nations, second)) continue;
            const pair = [first, second].sort().join(':');
            if (changedPairs.has(pair)) continue;
            const a = gameState.nations[first], b = gameState.nations[second];
            if (a.annexed_by || b.annexed_by) continue;
            const opponentsA = new Set(Array.isArray(a.warWith) ? a.warWith : []);
            const opponentsB = new Set(Array.isArray(b.warWith) ? b.warWith : []);
            const alreadyAtWar = opponentsA.has(second) || opponentsB.has(first);
            const alliesA = new Set(Array.isArray(a.allies) ? a.allies : []);
            const alliesB = new Set(Array.isArray(b.allies) ? b.allies : []);
            const allied = alliesA.has(second) || alliesB.has(first);
            if (action === 'form_alliance') {
                if (alreadyAtWar || allied) continue;
                alliesA.add(second); alliesB.add(first);
            } else if (action === 'end_alliance') {
                if (!allied) continue;
                alliesA.delete(second); alliesB.delete(first);
            } else if ((action === 'declare_war') === alreadyAtWar) continue;
            if (action === 'declare_war') {
                opponentsA.add(second); opponentsB.add(first);
                alliesA.delete(second); alliesB.delete(first);
            } else if (action === 'make_peace') {
                opponentsA.delete(second); opponentsB.delete(first);
                for (const campaign of gameState.campaigns || []) if (campaign.target === second && ['active','held'].includes(campaign.status)) {
                    campaign.status = 'cancelled'; campaign.ended_on = gameDate; campaign.end_reason = 'Peace agreement';
                    campaign.pending_updates = [];
                    for (const unit of gameState.units || []) if (unit.mission?.campaign_id === campaign.id) delete unit.mission;
                }
            }
            a.allies = [...alliesA]; b.allies = [...alliesB];
            a.warWith = [...opponentsA]; b.warWith = [...opponentsB];
            a.atWar = a.warWith.length > 0; b.atWar = b.warWith.length > 0;
            changedPairs.add(pair);
            const change = { action, nation_code: first, target_nation_code: second, action_id: proposal.action_id };
            applied.push(change);
            gameState.events.push({
                id: uniqueId('event'), event_type: 'diplomatic', severity: 'major',
                title: `${{ declare_war: 'War declared', make_peace: 'Peace agreed', form_alliance: 'Alliance agreed', end_alliance: 'Alliance ended' }[action]}: ${first}–${second}`,
                description: {
                    declare_war: `[${first}] and [${second}] are now at war. Any bilateral alliance has ended.`,
                    make_peace: `[${first}] and [${second}] are now at peace. Territorial control is unchanged by this agreement.`,
                    form_alliance: `[${first}] and [${second}] are now allies. This agreement does not automatically grant transit or join other wars.`,
                    end_alliance: `The alliance between [${first}] and [${second}] has ended.`
                }[action],
                affected_nations: [first, second], applied_diplomatic_change: change,
                game_date: gameDate, turn_number: gameState.turnNumber,
                created_at: new Date().toISOString(), source: 'engine'
            });
        }
        return applied;
    }

    buildWorldStateSummary(gameState) {
        const nations = this.getEffectiveNations(gameState);
        const cities=this.getEffectiveCities(gameState);
        const summary = {};
        const provinceCounts = new Map();
        for (const code of this.getRegionControllers(gameState).values()) provinceCounts.set(code, (provinceCounts.get(code) || 0) + 1);

        // 1. Identify priority nations to stay within token limits
        const priorityNations = this.getContextNationCodes(gameState, nations);
        priorityNations.add(gameState.playerNationCode);
        (gameState.nations[gameState.playerNationCode]?.warWith || []).forEach(code => priorityNations.add(code));
        (gameState.nations[gameState.playerNationCode]?.allies || []).forEach(code => priorityNations.add(code));

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
            if (priorityNations.has(code) || nations[code]?.is_territory_group) {
                const state = gameState.nations[code];
                const info = nations[code];
                if (info) {
                    summary[code] = {
                        name: info.name,
                        leader:info.leader_name,government:info.government_type,ideology:info.ideology,ruling_party:info.ruling_party,
                        capital:cities.find(c=>c.nation_code===code && c.is_capital)?.name || null,
                        cities:cities.filter(c=>c.nation_code===code).map(c=>({id:c.id,name:c.name,region_id:c.region_id,is_capital:c.is_capital})),
                        controlled_provinces:provinceCounts.get(code) || 0,
                        occupied: state.occupied_regions?.length || 0,
                        at_war: state.atWar,
                        war_with: state.warWith || [],
                        allies: state.allies || [],
                        annexed_by: state.annexed_by || null
                    };
                }
            }
        });

        return summary;
    }

    calculateNewDate(currentDate, timeJump) {
        const newDate = new Date(currentDate);
        const [count, rawUnit] = this.normalizeTimeJump(timeJump).split('_');
        const amount = Number(count);
        const unit = rawUnit.replace(/s$/, '');
        if (unit === 'day' || unit === 'week') {
            newDate.setUTCDate(newDate.getUTCDate() + amount * (unit === 'week' ? 7 : 1));
        } else {
            const day = newDate.getUTCDate();
            newDate.setUTCDate(1);
            newDate.setUTCMonth(newDate.getUTCMonth() + amount * (unit === 'year' ? 12 : 1));
            const endOfMonth = new Date(newDate);
            endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
            newDate.setUTCDate(Math.min(day, endOfMonth.getUTCDate()));
        }
        return newDate;
    }

    async getAdvisorContext(saveId) {
        const gameState = await this.loadGame(saveId);
        const playerFull = {
            ...gameState.playerNation,
            ...gameState.nations[gameState.playerNationCode]
        };

        return {
            scenarioId: gameState.scenarioId,
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
            worldContext: this.getScenarioBriefing(gameState),
            simulationRules: this.scenarios.getScenario(gameState.scenarioId).simulationRules,
            turnNumber: gameState.turnNumber || 1
        };
    }

    /**
     * Get game context/state for API consumption
     */
    async getGameContext(saveId) {
        const gameState = await this.loadGame(saveId);
        const effective = this.getEffectiveNations(gameState);

        return {
            saveId: saveId,
            currentDate: gameState.currentDate,
            turnNumber: gameState.turnNumber,
            playerNationCode: gameState.playerNationCode,
            playerNation: effective[gameState.playerNationCode] || null,
            nationStates: gameState.nations,
            eventCount: (gameState.events || []).length,
            pendingActionCount: (gameState.actions || []).filter(a => a.status === 'pending').length,
            worldContext: this.getScenarioBriefing(gameState),
            scenario: this.getScenarioSummary(this.scenarios.getScenario(gameState.scenarioId))
        };
    }

    async renameSave(saveId, newName) {
        if (typeof newName !== 'string' || !newName.trim() || newName.trim().length > 120) {
            throw inputError('Save name must be between 1 and 120 characters.', 'INVALID_SAVE_NAME');
        }
        const gameState = await this.loadGame(saveId);
        gameState.name = newName.trim();
        this.saveGame(saveId, gameState);
    }

    getScenarioSummary(scenario) {
        return {
            id: scenario.id,
            name: scenario.name,
            era: scenario.era,
            version: scenario.version,
            description: scenario.description || ''
        };
    }
}

module.exports = GameEngine;
