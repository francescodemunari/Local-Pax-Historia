const assert = require('node:assert/strict');
const Engine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
(async () => {
 const engine = new Engine(), original = llm.generateEvents;
 const game = await engine.createGame('ITA', undefined, 'ww2-geographic');
 try {
  let state = await engine.loadGame(game.save_id);
  assert.equal(state.units.length,0);
  await engine.processPlayerAction(game.save_id,'Invade Ethiopia with ground forces, air reconnaissance and naval support.');
  llm.generateEvents = async (_, context) => {
   assert.equal(context.recruitment.existingUnits.length,0);
   assert(context.recruitment.controlledRegions.every(r=>r.name && r.id));
   const region = context.recruitment.validRegionIds[0];
   return {events:[],action_resolutions:context.actions.map(a=>({action_id:a.id,summary:'Forces assemble. Combat is not yet simulated.'})),
    unit_changes:['infantry','air','naval'].map(type=>({action:'recruit',action_id:context.actions[0].id,nation_code:'ITA',unit_type:type,name:`Operation ${type}`,region_id:region}))};
  };
  await engine.advanceTime(game.save_id,'1_month');
  state=await engine.loadGame(game.save_id);
  assert.deepEqual(state.units.map(u=>u.unit_type).sort(),['air','infantry','naval']);
  assert(state.units.every(u=>Array.isArray(u.centroid) && u.source_action_id));
  assert.equal(state.actions.filter(a=>a.status==='pending').length,0);
  assert.equal((await new Engine().loadGame(game.save_id)).units.length,3);
  for(const id of ['ww1-1910','ww2-geographic','world-2010']) {
   const map=engine.scenarios.getMap(id), nations=engine.scenarios.getNations(id);
   const greenland=map.regions.filter(r=>r.id.startsWith('grl_'));
   assert(greenland.length>0 && greenland.every(r=>r.nation_code==='DEN'));
   assert.notEqual(nations.ITA.color,nations.FRA.color);
   assert(engine.scenarios.getScenario(id).unitCatalog.naval);
  }
  console.log('✓ Operational mobilisation, all formation types, persistence and Greenland coverage passed');
 } finally { llm.generateEvents=original; await engine.deleteSave(game.save_id); }
})().catch(error=>{console.error(error);process.exitCode=1;});
