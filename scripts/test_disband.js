const assert = require('node:assert/strict');
const Engine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
async function run() {
    const engine = new Engine(), original = llm.generateEvents;
    let id;
    try {
        id = (await engine.createGame('ITA', undefined, 'ww1-1910')).save_id;
        const state = await engine.loadGame(id);
        const region = engine.scenarios.getMap(state.scenarioId).regions.find(r => r.nation_code === 'ITA' && r.area_km2 > 100);
        const rejected = [];
        const poor = structuredClone(state); poor.nations.ITA.manpower = 0;
        engine.applyModelUnitChanges(poor, [{ action:'recruit',action_id:'raise',nation_code:'ITA',unit_type:'infantry',region_id:region.id }], new Set(['raise']), {rejectedChanges:rejected});
        assert.equal(rejected.length,0, 'Retired manpower balances must not block orders');
        assert.equal(poor.units.length,1);
        engine.applyModelUnitChanges(state, [{ action:'recruit',action_id:'raise',nation_code:'ITA',unit_type:'infantry',region_id:region.id }], new Set(['raise']));
        engine.saveGame(id, state);
        const before = await engine.loadGame(id), unit = before.units[0];
        const proposal = {action:'disband',action_id:'missing',nation_code:'ITA',unit_id:unit.id};
        assert.equal(engine.applyModelUnitChanges(structuredClone(before), [proposal]).length,0);
        const order = await engine.processPlayerAction(id, `Disband ${unit.name}.`, 'military');
        proposal.action_id = order.id;
        llm.generateEvents = async () => ({events:[],action_resolutions:[{action_id:order.id,status:'approved'}],unit_changes:[proposal,proposal]});
        const result = await engine.advanceTime(id,'1_day');
        const after = await engine.loadGame(id);
        assert.equal(result.unit_changes.length,1);
        assert.equal(after.units.length,0);
        assert.equal(after.nations.ITA.manpower,before.nations.ITA.manpower);
        assert.equal(after.nations.ITA.treasury,before.nations.ITA.treasury);
        assert.match(after.events.at(-1).title,/Formation disbanded/);
        console.log('✓ Authorized disbanding, duplicate prevention, persistence and recruitment failure explanations passed');
    } finally { llm.generateEvents = original; if (id) await engine.deleteSave(id); }
}
run().catch(error => { console.error(error);process.exitCode=1; });
