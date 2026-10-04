const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GameEngine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
const { contains } = require('../backend/services/map-geometry');

async function run() {
    const engine = new GameEngine();
    const originalGenerateEvents = llm.generateEvents;
    const saveIds = [];

    try {
        const game = await engine.createGame('ITA', '1936-01-01', 'ww2-geographic');
        saveIds.push(game.save_id);
        const before = await engine.loadGame(game.save_id);
        const scenarioMap = engine.scenarios.getMap('ww2-geographic');
        const regionIds = new Set(scenarioMap.regions.map(region => region.id));
        assert.equal(before.units.length, 0, 'New games must not spawn scenario formations');
        before.units.forEach(unit => {
            assert(contains(scenarioMap.regions.find(region => region.id === unit.region_id).path, unit.centroid), `${unit.name} must lie inside its deployment region`);
            assert(regionIds.has(unit.region_id), `${unit.name} must deploy in a real map region`);
            assert(Array.isArray(unit.centroid) && unit.centroid.length === 2, `${unit.name} must have a map-derived centroid`);
        });

        const germanRegion = scenarioMap.regions
            .find(region => region.nation_code === 'GER');
        assert(germanRegion, 'Expected at least one German region in the WW2 scenario');

        const requestedAction = await engine.processPlayerAction(
            game.save_id,
            `Secure ${germanRegion.name} and establish a local garrison.`,
            'military'
        );
        assert.equal((await engine.loadGame(game.save_id)).units.length, 0, 'Queuing an order must not spawn troops');
        llm.generateEvents = async () => ({
            events: [{
                title: 'Integration-test occupation',
                description: 'A controlled test of territorial state.',
                event_type: 'military',
                severity: 'minor',
                affected_nations: ['ITA', 'GER'],
                state_changes: {
                    ITA: { stability: -2, occupied_regions: [germanRegion.id, 'unknown-region'] },
                    GER: { treasury: -10 }
                }
            }],
            action_resolutions: [{
                action_id: requestedAction.id,
                status: 'approved',
                summary: 'The garrison is authorised after local control is established.'
            }, {
                action_id: 'unknown-action',
                status: 'rejected',
                summary: 'This must not affect a real order.'
            }],
            unit_changes: [{
                action: 'recruit',
                action_id: requestedAction.id,
                nation_code: 'ITA',
                unit_type: 'infantry',
                region_id: germanRegion.id,
                name: 'Integration-test Garrison'
            }, {
                action: 'recruit',
                action_id: requestedAction.id,
                nation_code: 'GER',
                unit_type: 'infantry',
                region_id: germanRegion.id,
                name: 'Invalid foreign formation'
            }, {
                action: 'recruit',
                action_id: requestedAction.id,
                nation_code: 'ITA',
                unit_type: 'unsupported-type',
                region_id: germanRegion.id,
                name: 'Invalid catalog formation'
            }, {
                action: 'recruit',
                nation_code: 'ITA',
                unit_type: 'infantry',
                region_id: germanRegion.id,
                name: 'Unlinked formation'
            }]
        });

        const result = await engine.advanceTime(game.save_id, '1_month');
        const after = await engine.loadGame(game.save_id);
        const controlledRegion = engine.getMapWithControl(after).regions
            .find(region => region.id === germanRegion.id);

        assert.equal(result.events.filter(e=>e.source!=='historical-schedule').length, 3, 'Retain the model event and two rejected proposal explanations; recruitment is silent');
        assert(!result.events.some(e=>e.source==='historical-schedule'),'Routine successions are silent');
        assert.equal(engine.getEffectiveNations(await engine.loadGame(game.save_id)).ENG.head_of_state,'Edward VIII');
        assert.equal(result.events.filter(event => event.title === 'Recruitment not applied').length, 2);
        assert.equal(result.unit_changes.length, 1, 'Expected Game Master recruitment to be applied');
        assert.equal(controlledRegion.nation_code, 'ITA', 'Map control should follow state changes');
        assert(after.nations.ITA.occupied_regions.includes(germanRegion.id), 'Occupation should be canonicalized to a region id');
        assert.equal(after.units.at(-1).source, 'game-master');
        assert.equal(after.units.at(-1).source_action_id, requestedAction.id);
        assert.equal(after.units.length, 1, 'Only the approved formation should persist');
        assert.equal(after.units.at(-1).region_id, germanRegion.id);
        assert.equal(after.nations.ITA.manpower, before.nations.ITA.manpower);
        assert.equal(after.nations.ITA.treasury, before.nations.ITA.treasury);
        assert.equal(after.actions.at(-1).status, 'completed');
        assert.equal(after.actions.at(-1).resolution_status, undefined);
        assert.equal(after.actions.at(-1).ai_response, 'The garrison is authorised after local control is established.');
        assert.equal(result.action_resolutions.length, 1, 'Only pending action ids may receive a resolution');

        const omittedAction = await engine.processPlayerAction(game.save_id, 'Raise another infantry division.', 'military');
        const proposedUnit = { action: 'recruit', action_id: omittedAction.id, nation_code: 'ITA',
            unit_type: 'infantry', region_id: germanRegion.id, name: 'Unapproved formation' };
        llm.generateEvents = async () => ({events:[],unit_changes:[proposedUnit],action_resolutions:[]});
        await assert.rejects(() => engine.advanceTime(game.save_id, '1_day'), /omitted an order outcome/);
        assert.equal((await engine.loadGame(game.save_id)).actions.at(-1).status,'pending');
        llm.generateEvents = async () => ({events:[{title:'Preparations delayed',description:'The order could not be carried out during this interval because training facilities were unavailable.'}],unit_changes:[],action_resolutions:[{action_id:omittedAction.id,summary:'Preparations delayed by unavailable training facilities.'}]});
        const delayed = await engine.advanceTime(game.save_id,'1_day');
        assert.equal(delayed.unit_changes.length,0);
        const resolved = await engine.loadGame(game.save_id);
        assert.equal(resolved.actions.at(-1).status,'completed');
        assert.equal(resolved.units.length,1);
        assert.equal(resolved.actions.at(-1).resolution_status,undefined);

        const persisted = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/saves', `${game.save_id}.json`), 'utf8'));
        assert(!Object.hasOwn(persisted, 'playerNation'), 'UI-only player data must not be persisted');
        assert(!Object.hasOwn(persisted, 'scenario'), 'UI-only scenario summary must not be persisted');

        const unavailableGame = await engine.createGame('GER', '1936-01-01', 'ww2-geographic');
        saveIds.push(unavailableGame.save_id);
        await engine.processPlayerAction(unavailableGame.save_id, 'Raise a division.', 'military');
        const unavailableBefore = await engine.loadGame(unavailableGame.save_id);
        llm.generateEvents = async () => ({ events: [], error: 'simulated outage' });
        await assert.rejects(
            () => engine.advanceTime(unavailableGame.save_id, '1_month'),
            error => error.code === 'GAME_MASTER_UNAVAILABLE'
        );
        const unavailableAfter = await engine.loadGame(unavailableGame.save_id);
        assert.equal(unavailableAfter.currentDate, unavailableBefore.currentDate);
        assert.equal(unavailableAfter.turnNumber, unavailableBefore.turnNumber);
        assert.equal(unavailableAfter.actions.filter(action => action.status === 'pending').length, 1);

        await assert.rejects(
            () => engine.advanceTime(unavailableGame.save_id, '999_years'),
            error => error.code === 'INVALID_TIME_JUMP'
        );
        await assert.rejects(
            () => engine.createGame('GER', '1936-02-31', 'ww2-geographic'),
            error => error.code === 'INVALID_START_DATE'
        );
        await assert.rejects(
            () => engine.loadGame('../outside'),
            error => error.code === 'INVALID_SAVE_ID'
        );

        const lockedGame = await engine.createGame('FRA', '1936-01-01', 'ww2-geographic');
        saveIds.push(lockedGame.save_id);
        let startGeneration;
        let finishGeneration;
        const generationStarted = new Promise(resolve => { startGeneration = resolve; });
        const generationFinished = new Promise(resolve => { finishGeneration = resolve; });
        llm.generateEvents = async () => {
            startGeneration();
            await generationFinished;
            return { events: [], unit_changes: [] };
        };
        const firstTurn = engine.advanceTime(lockedGame.save_id, '1_week');
        await generationStarted;
        const otherEngine = new GameEngine();
        await assert.rejects(
            () => otherEngine.advanceTime(lockedGame.save_id, '1_week'),
            error => error.code === 'TURN_IN_PROGRESS'
        );
        await assert.rejects(
            () => otherEngine.processPlayerAction(lockedGame.save_id, 'Do not lose this order'),
            error => error.code === 'TURN_IN_PROGRESS'
        );
        await assert.rejects(
            () => otherEngine.renameSave(lockedGame.save_id, 'Conflicting rename'),
            error => error.code === 'TURN_IN_PROGRESS'
        );
        await assert.rejects(
            () => otherEngine.deleteSave(lockedGame.save_id),
            error => error.code === 'TURN_IN_PROGRESS'
        );
        finishGeneration();
        await firstTurn;

        // Two requests may read the same revision before either writes.
        const staleState = await engine.loadGame(lockedGame.save_id);
        await otherEngine.processPlayerAction(lockedGame.save_id, 'Keep this newer order');
        staleState.name = 'Stale AI response';
        assert.throws(() => engine.saveGame(lockedGame.save_id, staleState), error => error.code === 'SAVE_CONFLICT');
        assert.equal((await engine.loadGame(lockedGame.save_id)).actions.at(-1).action_text, 'Keep this newer order');

        // Failure before replacement must leave the previous file intact.
        const durablePath = engine.getSavePath(lockedGame.save_id);
        const originalBytes = fs.readFileSync(durablePath, 'utf8');
        const stateToWrite = await engine.loadGame(lockedGame.save_id);
        const originalRename = fs.renameSync;
        try {
            fs.renameSync = () => { throw new Error('Simulated disk failure'); };
            assert.throws(() => engine.saveGame(lockedGame.save_id, stateToWrite), /Simulated disk failure/);
        } finally {
            fs.renameSync = originalRename;
        }
        assert.equal(fs.readFileSync(durablePath, 'utf8'), originalBytes);
        assert(!fs.readdirSync(path.dirname(durablePath)).some(name => name.startsWith(`${lockedGame.save_id}.json.`)));

        await engine.deleteSave(lockedGame.save_id);
        assert.throws(() => engine.saveGame(lockedGame.save_id, stateToWrite), error => error.code === 'SAVE_CONFLICT');
        assert(!fs.existsSync(durablePath), 'A delayed response must not resurrect a deleted save');

        const corruptId = `test_corrupt_${Date.now()}`;
        saveIds.push(corruptId);
        fs.writeFileSync(engine.getSavePath(corruptId), '{broken');
        assert((await engine.getSaves()).some(save => save.id === game.save_id), 'One corrupt save must not hide valid saves');

        for (const [date, jump, expected] of [
            ['1936-01-31', '1_month', '1936-02-29'],
            ['1936-02-29', '1_year', '1937-02-28'],
            ['1936-12-31', '1_month', '1937-01-31'],
            ['1936-03-29', '1_week', '1936-04-05']
        ]) {
            assert.equal(engine.calculateNewDate(new Date(`${date}T00:00:00Z`), jump).toISOString().slice(0, 10), expected);
        }

        llm.generateEvents = async () => null;
        await assert.rejects(() => engine.advanceTime(game.save_id, '1_week'), error => error.code === 'GAME_MASTER_INVALID_RESPONSE');
        await engine.renameSave(game.save_id, 'Lock released after invalid AI output');

        console.log('✓ Game engine integration checks passed');
    } finally {
        llm.generateEvents = originalGenerateEvents;
        await Promise.all(saveIds.map(saveId => engine.deleteSave(saveId)));
    }
}

run().catch(error => {
    console.error('Game engine integration checks failed:', error);
    process.exitCode = 1;
});
