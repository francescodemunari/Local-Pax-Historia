const assert = require('node:assert/strict');
const GameEngine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
const { findLandRoute } = require('../backend/services/movement');

async function run() {
    const engine = new GameEngine(), original = llm.generateEvents;
    let saveId;
    try {
        const base = engine.scenarios.getScenario('ww2-geographic');
        const fixture = { ...structuredClone(base), id: 'test-other-era', isDefault: false,
            name: 'Scenario contract fixture', era: '1914', startDates: ['1914-07-28'], defaultStartDate: '1914-07-28',
            unitCatalog: { cavalry: { label: 'Cavalry', manpower: 1000, treasury: 5, landSpeed: 3 } },
            initialNationState: { ITA: { stability: 99, treasury: 2, manpower: 0 } } };
        engine.scenarios.validateManifest(fixture, 'fixture');
        engine.scenarios.validateScenarioAssets(fixture);
        assert.throws(() => engine.scenarios.validateManifest({ ...fixture, startDates: ['1914-02-30'] }, 'fixture'));
        assert.throws(() => engine.scenarios.validateScenarioAssets({ ...fixture, initialNationState: { ITA: { treasury: -1 } } }));
        assert.throws(() => engine.scenarios.validateScenarioAssets({ ...fixture,
            unitCatalog: { cavalry: { ...fixture.unitCatalog.cavalry, landSpeed: -1 } } }));
        engine.scenarios.scenarios.set(fixture.id, fixture);
        const map = engine.scenarios.getMap(fixture.id);
        assert.strictEqual(engine.scenarios.getMap(fixture.id), map, 'Reuse map assets so movement graphs remain cached');
        const squares = [0, 1].map(i => ({ id: String(i), path: `M${i * 12} 0h12v12h-12z` }));
        assert.equal(findLandRoute(squares, '0', '1', 'cavalry', () => true, 3).required_days, 4);
        saveId = (await engine.createGame('ITA', undefined, fixture.id)).save_id;
        let state = await engine.loadGame(saveId);
        assert.equal(state.currentDate, '1914-07-28');
        assert.equal(state.nations.ITA.manpower, 0);
        assert.deepEqual(state.units, []);
        llm.generateEvents = async () => ({ events: [null, { title: 'Incomplete' }, {
            title: 'A valid event', description: 'Fixture consequences.', event_type: {}, severity: 'unknown',
            affected_nations: 'ITA', source: 'engine', id: 'forged', applied_state_changes: [{ forged: true }],
            state_changes: { ITA: { stability: 50, treasury: -100 } }
        }], unit_changes: [] });
        const result = await engine.advanceTime(saveId, '1_day');
        state = await engine.loadGame(saveId);
        assert.equal(result.events.length, 1);
        const event = result.events[0];
        assert.equal(event.source, 'game-master');
        assert.equal(event.event_type, 'political');
        assert.deepEqual(event.affected_nations, []);
        assert.notEqual(event.id, 'forged');
        assert.equal(event.applied_state_changes, undefined, 'Retired numerical state changes must be ignored');
        assert.deepEqual(state.events[0], event, 'REST and persisted events must agree');
        llm.generateEvents = async () => ({ events: [{ title: null, description: {} }] });
        await assert.rejects(() => engine.advanceTime(saveId, '1_day'), error => error.code === 'GAME_MASTER_INVALID_RESPONSE');
        assert.equal((await engine.loadGame(saveId)).revision, state.revision);
        console.log('✓ Other-era defaults, custom movement, asset reuse, and model event validation passed');
    } finally {
        llm.generateEvents = original;
        if (saveId) await engine.deleteSave(saveId);
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
