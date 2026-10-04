const assert = require('node:assert/strict');
const GameEngine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
const { contains } = require('../backend/services/map-geometry');
const { findLandRoute } = require('../backend/services/movement');

async function run() {
    const engine = new GameEngine();
    const original = llm.generateEvents;
    let saveId;
    try {
        const squares = [0, 1, 2].map(i => ({ id: String(i), path: `M${i * 10} 0h10v10h-10z` }));
        assert.deepEqual(findLandRoute(squares, '0', '2', 'infantry', () => true),
            { region_ids: ['0', '1', '2'], required_days: 10 });
        assert.equal(findLandRoute(squares, '0', '2', 'infantry', r => r.id !== '1'), null, 'Foreign corridor blocks travel');
        assert.equal(findLandRoute(squares, '0', '2', 'naval', () => true), null, 'Ships cannot traverse the land graph');
        const islands = [...squares, { id: 'island', path: 'M50 0h10v10h-10z' }];
        assert.equal(findLandRoute(islands, '0', 'island', 'infantry', () => true), null);
        saveId = (await engine.createGame('ITA', '1936-01-01', 'ww2-geographic')).save_id;
        const regions = engine.scenarios.getMap('ww2-geographic').regions;
        const origin = regions.find(region => region.nation_code === 'ITA' && region.name === 'Rome' && region.area_km2 > 100);
        const destination = regions.find(region => region.nation_code === 'ITA' && region.name === 'Milan' && region.area_km2 > 100);
        const foreign = regions.find(region => region.nation_code === 'FRA');
        const recruitOrder = await engine.processPlayerAction(saveId, 'Raise an infantry division.', 'military');
        llm.generateEvents = async () => ({ events: [],
            action_resolutions: [{ action_id: recruitOrder.id, status: 'approved' }],
            unit_changes: [{ action: 'recruit', action_id: recruitOrder.id, nation_code: 'ITA',
                unit_type: 'infantry', region_id: origin.id }] });
        await engine.advanceTime(saveId, '1_month');
        const before = await engine.loadGame(saveId);
        const unit = before.units[0];
        let order = await engine.processPlayerAction(saveId, `Move ${unit.name} to ${destination.name}.`, 'military');
        const proposal = { action: 'move', action_id: order.id, nation_code: 'ITA', unit_id: unit.id, region_id: destination.id };
        const shortTurn = structuredClone(before), rejections = [];
        assert.equal(engine.applyModelUnitChanges(shortTurn, [proposal], new Set([order.id]),
            { availableDays: 1, rejectedChanges: rejections }).length, 0);
        assert.equal(shortTurn.units[0].region_id, origin.id);
        assert.match(rejections[0].reason, /requires .* days/);
        llm.generateEvents = async () => ({ events: [], action_resolutions: [], unit_changes: [proposal] });
        await assert.rejects(() => engine.advanceTime(saveId, '1_day'), /omitted an order outcome/);
        llm.generateEvents = async () => ({ events: [],
            action_resolutions: [{ action_id: order.id, status: 'approved' }], unit_changes: [proposal] });
        const tooShort = await engine.advanceTime(saveId, '1_day');
        assert.equal(tooShort.unit_changes.length, 0);
        assert.match(tooShort.rejected_unit_changes[0].reason, /requires .* days/);
        const blockedState = await engine.loadGame(saveId);
        assert.equal(blockedState.units[0].region_id, origin.id);
        assert.equal(blockedState.events.at(-1).title, 'Movement not applied');
        order = await engine.processPlayerAction(saveId, `Move ${unit.name} to ${destination.name} over the coming month.`, 'military');
        proposal.action_id = order.id;
        llm.generateEvents = async () => ({ events: [],
            action_resolutions: [{ action_id: order.id, status: 'approved', summary: 'Transfer approved.' }],
            unit_changes: [
                { ...proposal, region_id: foreign.id }, { ...proposal, unit_id: 'invented' },
                { ...proposal, nation_code: 'FRA' }, { ...proposal, region_id: 'unknown' },
                { ...proposal, action_id: 'invented' }, proposal, { ...proposal, region_id: origin.id }
            ] });
        const result = await engine.advanceTime(saveId, '1_month');
        assert.equal(result.unit_changes.length, 1);
        assert.equal(result.unit_changes[0].action, 'move');
        assert.equal(result.unit_changes[0].previous_region_id, origin.id);
        const after = await engine.loadGame(saveId);
        assert.equal(after.units.length, 1, 'Movement must not create a replacement');
        assert.equal(after.units[0].id, unit.id);
        assert.equal(after.units[0].region_id, destination.id);
        assert.equal(after.units[0].last_order_id, order.id);
        assert(contains(destination.path, after.units[0].centroid, destination.fill_rule));
        assert.equal(after.nations.ITA.manpower, before.nations.ITA.manpower);
        assert.equal(after.nations.ITA.treasury, before.nations.ITA.treasury);
        assert.equal(after.events.at(-1).applied_unit_change.action, 'move');
        assert.equal(engine.getRecruitmentContext(after).existingUnits[0].region_id, destination.id);
        console.log('✓ Approved movement, invalid proposals, event history, and reload checks passed');
    } finally {
        llm.generateEvents = original;
        if (saveId) await engine.deleteSave(saveId);
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
