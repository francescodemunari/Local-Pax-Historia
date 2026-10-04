const assert=require('node:assert/strict');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
(async()=>{
 const engine=new Engine(),original=llm.generateEvents,game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try {
  const regions=engine.scenarios.getMap('ww2-geographic').regions,by=new Map(regions.map(r=>[r.id,r]));
  const start=regions.find(r=>r.nation_code==='ITA' && r.name==='Southern Red Sea' && r.neighbors.some(id=>by.get(id)?.nation_code==='ETH'));
  const destination=by.get(start.neighbors.find(id=>by.get(id)?.nation_code==='ETH'));
  const world=[{title:'French reform',description:'Domestic reform.',affected_nations:['FRA']},{title:'German research',description:'Civil research.',affected_nations:['GER']}];
  await engine.processPlayerAction(game.save_id,'Invade Ethiopia using land and air forces.');
  llm.generateEvents=async(_,ctx)=>({events:world,action_resolutions:ctx.actions.map(a=>({action_id:a.id,summary:'Prepare forces.'})),unit_changes:ctx.actions.flatMap(a=>['infantry','air'].map(type=>({action:'recruit',action_id:a.id,nation_code:'ITA',unit_type:type,name:type,region_id:start.id}))),campaign_orders:ctx.actions.map(a=>({action:'start',action_id:a.id,target_nation_code:'ETH'}))});
  const first=await engine.advanceTime(game.save_id,'1_month');
  let state=await engine.loadGame(game.save_id);const ground=state.units.find(u=>u.unit_type==='infantry'),air=state.units.find(u=>u.unit_type==='air'),campaign=state.campaigns[0];
  assert.equal(ground.region_id,start.id,'No automatic march without AI adjudication');
  assert(!state.units.some(u=>u.source==='campaign-defence'));
  assert(!first.events.some(e=>e.title.includes('Formation raised')));
  assert.equal(first.initial_units.length,2,'Silent recruits remain visible in playback');
  const battle={action:'battle',campaign_id:campaign.id,title:'Northern front battle',report:'Ground forces take the border province with air reconnaissance; defenders withdraw inland. Supply constraints prevent further advance.',outcome:'advance',day_offset:20,movements:[{unit_id:ground.id,region_id:destination.id,strength:92}],support:[{unit_id:air.id,region_id:destination.id,mission:'Reconnaissance'}]};
  llm.generateEvents=async()=>({events:[...world,{title:'Unbacked southern advance',description:'Troops advance from Somalia.',event_type:'military',affected_nations:['ITA','ETH']}],action_resolutions:[],unit_changes:[],campaign_orders:[battle]});
  const turn=await engine.advanceTime(game.save_id,'1_month');state=await engine.loadGame(game.save_id);
  assert.equal(state.units.find(u=>u.id===ground.id).region_id,destination.id);
  assert.equal(engine.getRegionController(state,destination),'ITA');
  assert.equal(state.units.find(u=>u.id===air.id).mission.target_region_id,destination.id);
  assert.equal(turn.events.filter(e=>e.campaign_effect).length,1,'One report with multiple effects, no province spam');
  assert(!turn.events.some(e=>e.title==='Unbacked southern advance'),'Narrative-only advances must not appear alongside the real battle');
  const before=state.currentDate;
  llm.generateEvents=async()=>({events:world,unit_changes:[],campaign_orders:[{...battle,movements:[{unit_id:ground.id,region_id:'missing'}]}]});
  await assert.rejects(engine.advanceTime(game.save_id,'1_month'),/mapped province/);
  assert.equal((await engine.loadGame(game.save_id)).currentDate,before,'Rejected effects do not commit a partial turn');
  const capital=engine.scenarios.getCities(state.scenarioId).find(c=>c.nation_code==='ETH'&&c.is_capital);
  engine.setRegionController(state,capital.region_id,'ITA');engine.saveGame(game.save_id,state);
  llm.generateEvents=async()=>({events:world,unit_changes:[],campaign_orders:[{action:'annex',campaign_id:campaign.id,surrendered:true,report:'The government surrenders following the loss of the capital and agrees to annexation.'}]});
  await engine.advanceTime(game.save_id,'1_month');state=await engine.loadGame(game.save_id);
  assert.equal(state.nations.ETH.annexed_by,'ITA');
  assert(regions.filter(r=>r.nation_code==='ETH').every(r=>engine.getRegionController(state,r)==='ITA'));
  assert(!state.nations.ITA.warWith.includes('ETH'));
  engine.applyModelStateChanges(state,{ITA:{name:'Italian Federation',leader_name:'New leadership',add_cities:[{id:'test_seat',name:'New seat',region_id:start.id}],capital_city_id:'test_seat'}});
  engine.saveGame(game.save_id,state);state=await engine.loadGame(game.save_id);
  assert.equal(engine.getEffectiveNations(state).ITA.name,'Italian Federation');
  assert.equal(engine.getEffectiveCities(state).find(c=>c.id==='test_seat').is_capital,true);
  assert.equal(engine.buildWorldStateSummary(state).ITA.capital,'New seat');
  assert.throws(()=>engine.applyModelStateChanges(state,{ITA:{capital_city_id:'imaginary'}}),/mapped city/);
  const old=await engine.createGame('TUR',undefined,'ww1-1910');
  try {
   let legacy=await engine.loadGame(old.save_id);delete legacy.nations.ARA;engine.saveGame(old.save_id,legacy);
   legacy=await engine.loadGame(old.save_id);assert(legacy.nations.ARA,'Existing saves acquire the map coverage group');
   const gap=engine.scenarios.getMap(legacy.scenarioId).regions.find(r=>r.id.startsWith('arabia_gap_'));
   assert(gap);engine.applyModelStateChanges(legacy,{TUR:{occupied_regions:[gap.id]}});
   assert.equal(engine.getRegionController(legacy,gap),'TUR','AI territorial changes can claim a formerly unselectable gap');
  } finally {await engine.deleteSave(old.save_id);}
  console.log('AI battle reports, connected captures, air missions, silent recruitment, atomic rejection, surrender and saved world changes passed');
 } finally {llm.generateEvents=original;await engine.deleteSave(game.save_id);}
})().catch(error=>{console.error(error);process.exitCode=1;});
