const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {validateOperations}=require('../backend/services/operation-contract');
const {findLandRoute}=require('../backend/services/movement');
const {mergeFronts}=require('../backend/services/operation-progress');
const fixture=require('./fixtures/incomplete-operation.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  for(const mode of ['next_event','1_month']) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Attack Ethiopia from north and south, Eritrea and Somalia, using land and air forces.');
    let context,calls=0;
    const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
     __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
     require:name=>require(path.join(__dirname,'../backend/services',name)),
     executeChatCompletion:async()=>{
      calls++;const reply=structuredClone(fixture);reply.action_resolutions[0].action_id=context.actions[0].id;
      if(mode==='1_month')reply.events.push(
       {title:'French policy',description:'Domestic policy changes.',affected_nations:['FRA'],severity:'minor',game_date:'1936-01-15'},
       {title:'German research',description:'New research.',affected_nations:['GER'],severity:'minor',game_date:'1936-01-18'});
      // Deliberately repeat the omission after repair: the user must not retry
      // forever because a valid battle covers only one of several fronts.
      return {content:JSON.stringify(reply)};
     }};
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
    llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
    const turn=await engine.advanceTime(game.save_id,mode),saved=await engine.loadGame(game.save_id);
    assert.equal(calls,mode==='next_event'?1:2,'Early stop permits pending fronts; a full interval attempts one repair');
    const campaign=saved.campaigns[0],south=saved.units.find(u=>u.name==='1st Somaliland Division');
    assert.equal(south.region_id,'g5200_aSOM-2409_f0','No invented southern movement');
    assert.equal(saved.units.find(u=>u.name==='1st Eritrean Division').region_id,'g531_aETH-3110_f0');
    assert(saved.units.find(u=>u.unit_type==='air').mission);
    assert.equal(campaign.front_progress.find(p=>p.front_id==='south_front').status,'awaiting_report');
    assert(campaign.front_progress.find(p=>p.front_id==='south_front').unit_ids.includes(south.id));
    assert.equal(turn.resolution_notes.filter(n=>n.kind==='front').length,1);
    assert.equal(turn.events.filter(e=>e.campaign_effect).length,1,'No invented battle/hold/creation card for missing progress');
    assert(!turn.events.some(e=>e.title==='Operation constraints'),'No invented reason for delay');
    // A later turn must retain unattended fronts even without a fresh order.
    const ongoing={actions:[],campaigns:saved.campaigns,recruitment:engine.getRecruitmentContext(saved,30)};
    const noOrders={action_resolutions:[],unit_changes:[],campaign_orders:[{action:'battle',campaign_id:campaign.id,title:'One theatre report',report:'Existing forces maintain their position.',outcome:'hold',day_offset:10,front_ids:['north_front'],movements:[],support:[]}]};
    validateOperations(noOrders,ongoing,{allowIncomplete:true});
    assert.equal(noOrders.front_progress.find(p=>p.front_id==='south_front').status,'awaiting_report');
    assert(noOrders.resolution_notes.some(n=>n.kind==='air_support'),'Unreported standing air orders remain outstanding');
    const regions=engine.scenarios.getMap(saved.scenarioId).regions,by=new Map(regions.map(r=>[r.id,r]));
    const target=by.get(by.get(south.region_id).neighbors.find(id=>engine.getRegionController(saved,by.get(id))==='ETH'));
    const spec=engine.scenarios.getScenario(saved.scenarioId).unitCatalog.infantry;
    const route=findLandRoute(regions,south.region_id,target.id,'infantry',r=>['ITA','ETH'].includes(engine.getRegionController(saved,r)),spec.landSpeed,spec.landKmPerDay);
    assert(route && route.required_days<=28);
    const day=Math.max(1,route.required_days),air=saved.units.find(u=>u.unit_type==='air');
    sandbox.executeChatCompletion=async()=>{
     assert.equal(context.actions.length,0,'No repeated player order');
     assert(context.campaigns[0].pending_updates.some(p=>p.front_id==='south_front'),'Pending work reaches the next model context');
     return {content:JSON.stringify({events:[{title:'French policy',description:'Domestic changes.',affected_nations:['FRA']},{title:'German research',description:'Research continues.',affected_nations:['GER']}],unit_changes:[],campaign_orders:[],action_resolutions:[{
      action_id:campaign.source_action_id,operation:{kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'Southern operations progress.',fronts:[{id:'south_front',name:'Southern Front (Somaliland)',status:'ready',region_id:south.region_id}],formations:[],reports:[
       {action:'battle',title:'Southern advance',report:'Southern troops advance to the adjacent province with reconnaissance support.',outcome:'advance',day_offset:day,movements:[{unit_id:south.id,region_id:target.id}],support:[{unit_id:air.id,region_id:target.id,mission:'Reconnaissance'}]},
       {action:'battle',title:'Northern consolidation',report:'The northern force consolidates its positions.',outcome:'hold',day_offset:day,front_ids:['north_front'],movements:[],support:[]}
      ]}}]})};
    };
    const followup=await engine.advanceTime(game.save_id,'1_month'),advanced=await engine.loadGame(game.save_id);
    assert.equal(advanced.units.find(u=>u.id===south.id).region_id,target.id);
    assert.equal(engine.getRegionController(advanced,target),'ITA');
    assert.equal(followup.resolution_notes.length,0,'Completed and explicitly held fronts clear their outstanding notes');
    assert.equal(advanced.campaigns[0].front_progress.find(p=>p.front_id==='south_front').status,'reported');
    assert.equal(advanced.campaigns[0].front_progress.find(p=>p.front_id==='north_front').status,'held');
    await engine.processPlayerAction(game.save_id,'Advance only on the southern front.');
    sandbox.executeChatCompletion=async()=>({content:JSON.stringify({events:[
     {title:'French policy',description:'Domestic changes.',affected_nations:['FRA']},
     {title:'German research',description:'Research continues.',affected_nations:['GER']}],unit_changes:[],campaign_orders:[],action_resolutions:[{
      action_id:context.actions[0].id,summary:'The operation now focuses on the southern front.',operation:{
       kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'The player changed the scope.',front_scope:'replace',scope_reason:'Only the southern front is now ordered to advance.',
       fronts:[{id:'south_front',name:'Southern Front (Somaliland)',status:'ready',region_id:target.id}],formations:[],
       reports:[{action:'battle',title:'Southern preparations',report:'The southern force prepares supplies before proceeding.',outcome:'hold',day_offset:10,front_ids:['south_front'],movements:[],support:[]}]
      }}]})});
    await engine.advanceTime(game.save_id,'1_month');
    const narrowedSave=await engine.loadGame(game.save_id);
    assert.equal(narrowedSave.campaigns[0].requested_fronts.length,1,'New scope persists through save/reload');
    assert.equal(narrowedSave.campaigns[0].front_progress.length,1);
    assert.equal(narrowedSave.campaigns[0].current_order,'Advance only on the southern front.');
    assert(narrowedSave.campaigns[0].original_order.includes('north and south'),'Original order remains history, not the active scope');
    const recruits=engine.applyModelUnitChanges(saved,[{action:'recruit',action_id:campaign.source_action_id,nation_code:'ITA',unit_type:'infantry',region_id:south.region_id,name:'Reinforcements'}],new Set());
    assert.equal(recruits.length,1,'An active campaign may fulfil its standing mobilisation order');
    const remove=engine.applyModelUnitChanges(saved,[{action:'disband',action_id:campaign.source_action_id,nation_code:'ITA',unit_id:south.id}],new Set());
    assert.equal(remove.length,0,'Standing recruitment authority cannot disband forces');
    campaign.manual_hold=true;
    assert.equal(engine.applyModelUnitChanges(saved,[{action:'recruit',action_id:campaign.source_action_id,nation_code:'ITA',unit_type:'infantry',region_id:south.region_id}],new Set()).length,0);
   } finally {await engine.deleteSave(game.save_id);}
  }
 } finally {llm.generateEvents=original;}

 // Geography-independent fixtures exercise arbitrary nations and front names.
 for(const target of ['TARGET_1910','TARGET_1936','TARGET_2010']) {
  const context={actions:[],campaigns:[{id:'campaign',source_action_id:'order',target,status:'active',requested_fronts:[{id:'coast',name:'Coastal theatre',region_id:'a'},{id:'plateau',name:'Plateau theatre',region_id:'b'}]}],
   recruitment:{catalog:{infantry:{landKmPerDay:40}},existingUnits:[{id:'one',unit_type:'infantry',region_id:'a'},{id:'two',unit_type:'infantry',region_id:'b'}]}};
  const result={action_resolutions:[],unit_changes:[],campaign_orders:[{action:'battle',campaign_id:'campaign',title:'Coastal battle',report:'The coastal force advances.',outcome:'advance',day_offset:5,movements:[{unit_id:'one',region_id:'c'}]}]};
  validateOperations(result,context,{allowIncomplete:true});
  assert.equal(result.front_progress.find(p=>p.front_id==='plateau').status,'awaiting_report');
  const invalid=structuredClone(result);invalid.campaign_orders[0].movements[0].unit_id='invented';
  assert.throws(()=>validateOperations(invalid,context,{allowIncomplete:true}),/Unknown formation/,'Incomplete progress never authorizes invalid effects');
  const narrowedContext=structuredClone(context);
  narrowedContext.actions=[{id:'narrow',action_text:'Advance only along the coast.'}];narrowedContext.nationCatalog=[{code:target}];
  const narrowed=structuredClone(result);
  narrowed.action_resolutions=[{action_id:'narrow',operation:{kind:'invasion',status:'proceed',target_nation_code:target,reason:'Coastal operation.',front_scope:'replace',scope_reason:'Player restricted the operation to the coast.',fronts:[{id:'coast',name:'Coastal theatre',status:'ready',region_id:'a'}]}}];
  validateOperations(narrowed,narrowedContext,{allowIncomplete:true});
  assert.equal(narrowed.front_progress.length,1,'An explicit revised order can remove the other standing front');
  assert.throws(()=>validateOperations(structuredClone(narrowed),context,{allowIncomplete:true}),/new player order/,'The model cannot narrow standing fronts without a fresh order');
 }
 assert.equal(mergeFronts([{id:'old',name:'Coastal theatre',region_id:'a'}],[{id:'new',name:'Coastal Theatre',region_id:'a'}]).length,1,'A renamed front does not duplicate the same theatre');
 const pending={id:'civilian_order',status:'pending'},mixedState={actions:[pending]};
 const resolved=engine.applyModelActionResolutions(mixedState,[pending],[{action_id:'standing_campaign',summary:'Campaign report'},{action_id:pending.id,summary:'The reform begins.'}]);
 assert.equal(resolved.length,1);assert.equal(pending.status,'completed','A standing report before a pending action cannot hide its resolution');
 console.log('Actual incomplete reply advances in both modes; arbitrary fronts, standing orders and hard-effect rejection passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
