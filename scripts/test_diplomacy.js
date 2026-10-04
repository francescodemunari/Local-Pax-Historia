const assert = require('node:assert/strict');
const GameEngine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');

async function run() {
    const engine = new GameEngine();
    const original = llm.generateEvents;
    let saveId;
    try {
        saveId = (await engine.createGame('ITA', '1936-01-01', 'ww2-geographic')).save_id;
        const resolve = async (action, target, takesEffect = true) => {
            const order = await engine.processPlayerAction(saveId, `${action} with ${target}`, 'diplomatic');
            llm.generateEvents = async () => ({ events: [],
                action_resolutions: [{ action_id: order.id, summary: 'Fixture decision.' }],
                diplomatic_changes: takesEffect ? [
                    { action, nation_code: 'ITA', target_nation_code: target, action_id: order.id },
                    { action, nation_code: 'ITA', target_nation_code: target, action_id: order.id },
                    { action, nation_code: 'GER', target_nation_code: 'FRA', action_id: order.id },
                    { action, nation_code: 'ITA', target_nation_code: 'ITA', action_id: order.id },
                    { action, nation_code: 'ITA', target_nation_code: 'XXX', action_id: order.id },
                    { action, nation_code: 'ITA', target_nation_code: 'ENG', action_id: 'invented' }
                ] : [] });
            return engine.advanceTime(saveId, '1_day');
        };
        assert.equal((await resolve('declare_war', 'FRA', false)).diplomatic_changes.length, 0);
        const war = await resolve('declare_war', 'FRA');
        assert.equal(war.diplomatic_changes.length, 1, 'Reject duplicate and invalid proposals');
        assert.equal(war.events.length, 1, 'Expose the applied result to the event UI');
        let state = await engine.loadGame(saveId);
        assert.deepEqual(state.nations.ITA.warWith, ['ETH','FRA']);
        assert.deepEqual(state.nations.FRA.warWith, ['ITA']);
        assert.equal(state.nations.FRA.atWar, true);
        assert.equal(state.nations.GER.atWar, false);
        assert.equal(state.events.at(-1).source, 'engine');
        assert.equal((await resolve('declare_war', 'FRA')).diplomatic_changes.length, 0);
        assert.equal((await resolve('declare_war', 'ETH')).diplomatic_changes.length,0,'The ongoing 1936 war must not be declared again');
        assert.deepEqual(engine.buildWorldStateSummary(await engine.loadGame(saveId)).ETH.war_with, ['ITA']);
        await resolve('make_peace', 'FRA');
        state = await engine.loadGame(saveId);
        assert.equal(state.nations.ITA.atWar, true, 'Peace with one opponent must not end other wars');
        assert.deepEqual(state.nations.ITA.warWith, ['ETH']);
        assert.equal(state.nations.FRA.atWar, false);
        assert.deepEqual(state.nations.FRA.warWith, []);
        await resolve('make_peace', 'ETH');
        state = await engine.loadGame(saveId);
        assert.equal(state.nations.ITA.atWar, false);
        assert.equal(state.nations.ETH.atWar, false);
        assert.equal((await resolve('make_peace', 'ETH')).diplomatic_changes.length, 0);
        assert.equal((await resolve('form_alliance', 'FRA')).diplomatic_changes.length, 1);
        state = await engine.loadGame(saveId);
        assert.deepEqual(state.nations.ITA.allies, ['FRA']);
        assert.deepEqual(state.nations.FRA.allies, ['ITA']);
        assert.equal((await resolve('form_alliance', 'FRA')).diplomatic_changes.length, 0);
        assert.equal((await resolve('end_alliance', 'FRA')).diplomatic_changes.length, 1);
        assert.deepEqual((await engine.loadGame(saveId)).nations.FRA.allies, []);
        await resolve('form_alliance', 'FRA');
        await resolve('declare_war', 'FRA');
        state = await engine.loadGame(saveId);
        assert.deepEqual(state.nations.ITA.allies, []);
        assert.deepEqual(state.nations.FRA.allies, []);
        assert.equal((await resolve('form_alliance', 'FRA')).diplomatic_changes.length, 0);
        console.log('✓ Persistent bilateral war and peace checks passed');
    } finally {
        llm.generateEvents = original;
        if (saveId) await engine.deleteSave(saveId);
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
