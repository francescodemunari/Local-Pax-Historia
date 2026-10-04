const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../backend/services/game-engine');
const { landGraph, findLandRoute } = require('../backend/services/movement');

async function run() {
    const engine=new Engine(), ids=[];
    try {
        for(const id of ['ww1-1910','ww2-geographic','world-2010']) {
            const game=await engine.createGame('ITA',undefined,id);ids.push(game.save_id);
            const state=await engine.loadGame(game.save_id);
            const map=engine.scenarios.getMap(id), graph=landGraph(map.regions);
            const origin=map.regions.find(r=>r.nation_code==='ITA' && [...graph.get(r.id).neighbors].some(n=>graph.get(n).region.nation_code==='ITA'));
            const destination=[...graph.get(origin.id).neighbors].find(n=>graph.get(n).region.nation_code==='ITA');
            const route=findLandRoute(map.regions,origin.id,destination,'infantry',r=>r.nation_code==='ITA',2,40);
            assert(route && route.distance_km > 0 && route.required_days > 0);
            assert.equal(state.units.length,0);
            const order={id:'fixture-order'};
            engine.applyModelUnitChanges(state,[{action:'recruit',action_id:order.id,nation_code:'ITA',unit_type:'infantry',region_id:origin.id}],new Set([order.id]));
            const moved=engine.applyModelUnitChanges(state,[{action:'move',action_id:order.id,nation_code:'ITA',unit_id:state.units[0].id,region_id:destination}],new Set([order.id]),{availableDays:365});
            assert.equal(moved.length,1);assert.equal(moved[0].route.distance_km,route.distance_km);
            engine.saveGame(game.save_id,state);
            assert.equal((await engine.loadGame(game.save_id)).units[0].region_id,destination);
            const capital=engine.scenarios.getCities(id).find(c=>c.nation_code==='ITA'&&c.is_capital);
            assert(Math.abs(capital.latitude-41.9)<.2 && Math.abs(capital.longitude-12.5)<.2,'Rome must be at real coordinates');
        }
        const archivedId='ww1-1914-sectors-v1';
        const archived=await engine.createGame('ITA',undefined,archivedId); ids.push(archived.save_id);
        const oldFile=path.resolve(__dirname,`../data/saves/${archived.save_id}.json`);
        const oldState=JSON.parse(fs.readFileSync(oldFile,'utf8'));
        const oldRegion=engine.scenarios.getMap(archivedId).regions.find(region=>region.nation_code==='ITA');
        engine.applyModelUnitChanges(oldState,[{action:'recruit',action_id:'old-order',nation_code:'ITA',unit_type:'infantry',region_id:oldRegion.id}],new Set(['old-order']));
        oldState.scenarioId='ww1-1914'; oldState.scenarioVersion='1.0.0';
        fs.writeFileSync(oldFile,JSON.stringify(oldState));
        const restored=await engine.loadGame(archived.save_id);
        assert.equal(restored.scenarioId,archivedId);
        assert.equal(restored.units[0].region_id,oldRegion.id);
        assert.equal(engine.scenarios.listScenarios().some(scenario=>scenario.id===archivedId),false);
        assert.equal((await engine.getSaves()).find(save=>save.id===archived.save_id).scenario_id,archivedId);
        assert.throws(() => engine.scenarios.getSaveScenario({}), /removed WWII illustrated map/);
        assert.equal(engine.scenarios.getScenario('ww1-1910').defaultStartDate, '1910-01-01');
        assert.equal(engine.scenarios.listScenarios().length, 3);
        assert.equal(engine.scenarios.getNations('ww1-1910').CHI.name, 'Qing Empire');
        assert.equal(engine.scenarios.getCities('ww1-1910').find(city => city.nation_code === 'IND' && city.is_capital).name, 'Calcutta');
        assert.equal(engine.scenarios.getMap('ww1-1910').regions.some(region => region.id.startsWith('g620_') && region.nation_code === 'ITA'), false);
        const separate = new Engine();
        engine.scenarios.scenarios.set('test-catalog-isolation', {});
        assert.equal(separate.scenarios.scenarios.has('test-catalog-isolation'), false);
        console.log('✓ Geographic recruitment/movement, real Rome coordinates, and legacy save compatibility passed');
    } finally { for(const id of ids) await engine.deleteSave(id); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
