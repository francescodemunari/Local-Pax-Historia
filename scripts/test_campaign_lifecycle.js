const assert = require('node:assert/strict');
const Engine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
const {resolveCampaigns} = require('../backend/services/campaigns');
const {mentionedNations} = require('../backend/services/nation-mentions');
const {validateTurn} = require('../backend/services/turn-validation');

async function run() {
 const engine = new Engine(), original = llm.generateEvents;
 try {
  for (const scenario of ['ww1-1910','ww2-geographic','world-2010']) {
   const game = await engine.createGame('ITA', undefined, scenario);
   try {
    await engine.processPlayerAction(game.save_id, 'Improve relations with Portugal.');
    llm.generateEvents = async (_, context) => {
     assert(context.mapRegions.some(r => r.controller === 'POR'), 'A neutral named country supplies its full mapped provinces');
     assert(context.worldState.POR, 'Its political and diplomatic context is supplied too');
     return {events:[],action_resolutions:context.actions.map(a => ({action_id:a.id,summary:'Diplomatic contact established.'}))};
    };
    await engine.advanceTime(game.save_id, '1_day');
    const state = await engine.loadGame(game.save_id);
    const regions = engine.scenarios.getMap(scenario).regions, by = new Map(regions.map(r => [r.id,r]));
    const origin = regions.find(r => engine.getRegionController(state,r) === 'ITA' && r.neighbors.some(id => engine.getRegionController(state,by.get(id)) === 'FRA'));
    assert(origin, 'A real Italian/French land frontier exists');
    const destination = by.get(origin.neighbors.find(id => engine.getRegionController(state,by.get(id)) === 'FRA'));
    state.actions.push({id:'standing',action_text:'Invade France',status:'completed'});
    state.nations.ITA.warWith.push('FRA');state.nations.FRA.warWith=['ITA'];
    state.nations.ITA.atWar=state.nations.FRA.atWar=true;
    state.campaigns=[{id:'campaign_standing',source_action_id:'standing',target:'FRA',status:'active'}];
    state.units=[{id:'ground',nation_code:'ITA',unit_type:'infantry',region_id:origin.id,centroid:origin.marker_anchor,name:'Border army',source_action_id:'standing'},
     {id:'wing',nation_code:'ITA',unit_type:'air',region_id:origin.id,name:'Support wing',mission:{campaign_id:'campaign_standing',target_region_id:destination.id}}];
    engine.saveGame(game.save_id,state);
    const order = await engine.processPlayerAction(game.save_id, 'Agree peace with France.');
    const battle={action:'battle',campaign_id:'campaign_standing',title:'Border engagement',report:'The army advances with losses before negotiations conclude.',outcome:'advance',day_offset:10,movements:[{unit_id:'ground',region_id:destination.id}],losses:[{unit_id:'ground',strength:70,organization:60}]};
    const peace={action:'make_peace',action_id:order.id,nation_code:'ITA',target_nation_code:'FRA',day_offset:20};
    const outside=Object.keys(state.nations).filter(code=>!['ITA','FRA','ARA',...(state.nations.ITA.warWith||[])].includes(code)).slice(0,2)
     .map((code,i)=>({title:`Domestic development ${i}`,description:'Independent domestic changes.',affected_nations:[code]}));
    llm.generateEvents=async(_,context)=>validateTurn({events:outside,action_resolutions:[{action_id:order.id,summary:'Peace terms are accepted.'}],campaign_orders:[battle],diplomatic_changes:[peace]},context,{allowUnresolved:true,allowIncomplete:true});
    const turn=await engine.advanceTime(game.save_id,'1_month'),saved=await engine.loadGame(game.save_id);
    assert.equal(saved.units[0].region_id,destination.id,'An earlier battle is applied before the later peace');
    assert.equal(saved.units[0].strength,70,'Adjudicated battle losses survive save/reload');
    assert.equal(engine.getRecruitmentContext(saved,31).existingUnits.find(u=>u.id==='ground').organization,60,'The next model sees the surviving formation condition');
    const controllers=engine.getRegionControllers(saved);
    for(const region of [origin,destination,...regions.filter(r=>r.nation_code==='POR').slice(0,3)])assert.equal(controllers.get(region.id),engine.getRegionController(saved,region));
    const totalItaly=[...controllers.values()].filter(code=>code==='ITA').length;
    assert.equal(engine.buildWorldStateSummary(saved).ITA.controlled_provinces,totalItaly,'One-pass province counts match saved control');
    assert.equal(saved.campaigns[0].status,'cancelled');assert.equal(saved.campaigns[0].pending_updates.length,0);
    assert(!saved.nations.ITA.warWith.includes('FRA'));assert(!saved.units[1].mission,'Peace clears stale support assignments');
    const date=new Date(Date.parse(turn.previous_date)+20*86400000).toISOString().slice(0,10);
    assert.equal(saved.campaigns[0].ended_on,date);
    assert.equal(turn.events.find(e=>e.applied_diplomatic_change)?.game_date,date,'Treaty event retains its actual date');
    const preview=structuredClone(state);
    assert.throws(()=>resolveCampaigns(engine,preview,[{...battle,day_offset:25}],new Set(['standing']),31,[],[],[peace],new Set([order.id])),/paused or ended campaign/,'An offensive after peace cannot silently execute or restart war');
    const independent=structuredClone(saved);independent.nations.FRA.annexed_by='ITA';
    assert.equal(engine.applyModelDiplomaticChanges(independent,[{...peace,action:'declare_war'}],new Set([order.id])).length,0,'A surrendered government cannot declare another war');
    assert.throws(()=>resolveCampaigns(engine,structuredClone(saved),[{action:'start',action_id:'standing',target_nation_code:'FRA'}],new Set(['standing']),31,[],[],[],new Set()),/new pending player order/,'A completed standing order cannot restart war after peace');
    // A peaceful settlement requires no invented end-of-turn battle report.
    const resumed=structuredClone(saved);
    resumed.campaigns=structuredClone(state.campaigns);resumed.units=structuredClone(state.units);
    resumed.nations.ITA.warWith=[...new Set([...resumed.nations.ITA.warWith,'FRA'])];resumed.nations.FRA.warWith=['ITA'];
    resumed.nations.ITA.atWar=resumed.nations.FRA.atWar=true;
    engine.saveGame(game.save_id,resumed);
    const secondOrder=await engine.processPlayerAction(game.save_id,'Agree peace with France immediately.');
    llm.generateEvents=async(_,context)=>validateTurn({events:outside,action_resolutions:context.actions.map(a=>({action_id:a.id,summary:'Peace terms are accepted.'})),campaign_orders:[],diplomatic_changes:[{...peace,action_id:secondOrder.id,day_offset:1}]},context,{allowUnresolved:true,allowIncomplete:true});
    const settled=await engine.advanceTime(game.save_id,'1_month');
    assert(!settled.events.some(e=>e.campaign_effect),'No synthetic missing-battle card after peace');
    assert.equal((await engine.loadGame(game.save_id)).campaigns[0].status,'cancelled');
   } finally { await engine.deleteSave(game.save_id); }
  }
 } finally { llm.generateEvents=original; }
 assert.deepEqual(mentionedNations([{action_text:'Visit the United States and the Republic of Example.'}],{USA:{name:'United States'},EXA:{name:'Republic of Example'},ATE:{name:'Statesman'}}),['USA','EXA']);
 assert.deepEqual(mentionedNations([{action_text:'Negotiate with Atlantic Union.'}],{POR:{name:'Atlantic Union',name_local:'Portugal'}}),['POR'],'Saved nation names are recognized');
 console.log('All three scenarios: neutral target context, dated battle/peace ordering, campaign closure, missions, save/reload and ended-war rejection passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
