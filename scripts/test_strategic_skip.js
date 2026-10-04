const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {resolveFormation,normalizeFormationDeclarations}=require('../backend/services/formation-references');
const {validateOperations}=require('../backend/services/operation-contract');
const {resolveCampaigns}=require('../backend/services/campaigns');
const reused=require('./fixtures/reused-formations.json'),initial=require('./fixtures/timeline-overrun.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

function mock(reply) {
 let context,calls=0;
 const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
  __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
  require:name=>require(path.join(__dirname,'../backend/services',name)),executeChatCompletion:async()=>{
   assert.equal(++calls,1,'Harmless roster repetition or routine progress must not need a correction call');
   return {content:JSON.stringify(reply(context))};
  }};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
 llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
 return ()=>calls;
}

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  // Replay the actual three-month response against existing forces. Its IDs
  // are substituted with test-save identities; no user's save is modified.
  const game=await engine.createGame('ITA',undefined,'ww2-geographic');
  try {
   const order=await engine.processPlayerAction(game.save_id,'Invade Ethiopia from Eritrea and Somalia using land and air forces.');
   const state=await engine.loadGame(game.save_id),op=reused.action_resolutions[0].operation;
   state.currentDate='1936-02-01';engine.setRegionController(state,'g531_aETH-3110_f8','ITA');
   const bindings=engine.applyModelUnitChanges(state,op.formations.map(f=>({...f,action:'recruit',action_id:order.id,nation_code:'ITA'})),new Set([order.id]));
   assert.equal(bindings.length,3);
   const ids=new Map(bindings.map(b=>[b.formation_ref,b.unit.id]));
   state.actions[0].status='completed';
   state.campaigns=[{id:`campaign_${order.id}`,source_action_id:order.id,target:'ETH',status:'active',original_order:order.action_text,
    requested_fronts:op.fronts,front_progress:op.fronts.map((f,i)=>({...f,front_id:f.id,unit_ids:[bindings[i].unit.id]}))}];
   engine.saveGame(game.save_id,state);
   const calls=mock(ctx=>{
    let text=JSON.stringify(reused).replaceAll('standing_order',ctx.campaigns[0].source_action_id);
    for(const [ref,id] of ids)text=text.replaceAll(ref,id);
    return JSON.parse(text);
   });
   const turn=await engine.advanceTime(game.save_id,'3_months'),saved=await engine.loadGame(game.save_id);
   assert.equal(calls(),1);assert.equal(saved.currentDate,'1936-05-01');assert.equal(saved.units.length,3);
   assert.deepEqual(saved.units.map(u=>u.id).sort(),state.units.map(u=>u.id).sort(),'Roster declarations cannot create duplicate troops');
   assert.equal(saved.units.find(u=>u.id===ids.get('saved_south')).region_id,'g530_aETH-3134_f0');
   assert.equal(saved.units.find(u=>u.id===ids.get('saved_north')).region_id,'g531_aETH-3110_f8');
   assert.equal(saved.units.find(u=>u.id===ids.get('saved_air')).mission.target_region_id,'g531_aETH-3110_f8');
   assert(turn.events.filter(e=>e.campaign_effect).every(e=>e.severity==='moderate'),'Routine combat is not labelled Major');
   const context={playerNation:{code:'ITA'},recruitment:engine.getRecruitmentContext(saved,90)};
   const north=saved.units.find(u=>u.id===ids.get('saved_north'));
   assert.equal(resolveFormation({formation_ref:north.id},context.recruitment.existingUnits).unit.id,north.id);
   assert(resolveFormation({formation_ref:'old_turn_alias'},context.recruitment.existingUnits).error);
   const flat={unit_changes:[{action:'recruit',formation_ref:north.id,unit_type:'infantry',region_id:'unmapped'}]};
   normalizeFormationDeclarations(flat,context);assert.equal(flat.unit_changes.length,0,'An exact identity is reused without applying declared attributes');
   assert.throws(()=>normalizeFormationDeclarations({unit_changes:[{action:'recruit',formation_ref:north.id,unit_type:'air'}]},context),/cannot change unit_type/);
  }finally{await engine.deleteSave(game.save_id);}

  // A campaign can have routine progress, successive moves and an eventual
  // surrender beyond 90 days. Earlier world milestones still take precedence.
  for(const earlierWorld of [false,true]) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Invade and annex Ethiopia using land and air forces.');
    const capital=engine.scenarios.getCities('ww2-geographic').find(c=>c.nation_code==='ETH'&&c.is_capital);
    const calls=mock(ctx=>{
     const reply=structuredClone(initial),resolution=reply.action_resolutions[0];resolution.action_id=ctx.actions[0].id;
     const first=resolution.operation.reports[0];first.day_offset=30;
     resolution.operation.reports=[first,{action:'battle',title:'Capital occupied',report:'After sustained fighting both fronts advance. The northern army reaches the capital; resistance collapses after prolonged negotiations.',
      outcome:'advance',day_offset:150,movements:[{formation_ref:'ita_north_army',region_id:capital.region_id},{formation_ref:'ita_south_army',region_id:'g5200_aETH-3134_f5'}],
      support:[{formation_ref:'ita_air_corps',region_id:capital.region_id,mission:'Reconnaissance'}]},
      {action:'annex',title:'Ethiopian surrender',report:'The government accepts surrender and annexation following the loss of its capital and field army.',surrendered:true,day_offset:151}];
     reply.events=earlierWorld?[{title:'Major world treaty',description:'A binding settlement transforms relations between the great powers.',severity:'major',game_date:'1936-03-01',affected_nations:['FRA','GER']}]:[];
     return reply;
    });
    const turn=await engine.advanceTime(game.save_id,'next_event'),saved=await engine.loadGame(game.save_id);
    assert.equal(calls(),1);assert.equal(turn.next_event_horizon_days,365);assert.equal(turn.next_event_horizon_reached,false);
    assert.equal(saved.currentDate,earlierWorld?'1936-03-01':'1936-05-31');
    const reports=turn.events.filter(e=>e.campaign_effect);
    assert.equal(reports.length,earlierWorld?1:3);
    assert.equal(reports[0].severity,'moderate');
    assert.equal(saved.nations.ETH.annexed_by,earlierWorld?undefined:'ITA');
    if(!earlierWorld) {
     assert.equal(reports.at(-1).severity,'critical');
     const laterMove=reports[1].applied_unit_changes.find(c=>c.unit.name==='1st Italian Northern Army');
     assert.equal(laterMove.previous_region_id,'g531_aETH-3110_f8','Second movement starts at the first report destination');
     assert.equal(laterMove.unit.region_id,capital.region_id);
     assert.equal(saved.campaigns[0].status,'completed');
    }
   }finally{await engine.deleteSave(game.save_id);}
  }
 }finally{llm.generateEvents=original;}

 // Generic maps test temporal feasibility independently of Ethiopia/scenario IDs.
 for(const era of ['1910','1936','2010']) {
  const regions=[0,1,2,3].map(i=>({id:`p${i}`,name:`Province ${i}`,path:`M${i*100} 0h100v100h-100z`,marker_anchor:[i*100+50,50],nation_code:i?'TARGET':'PLAYER'}));
  const stub={scenarios:{getScenario:()=>({unitCatalog:{infantry:{landSpeed:10}}}),getMap:()=>({regions}),getCities:()=>[{nation_code:'TARGET',is_capital:true,region_id:'p3'}]},
   getRegionController:(s,r)=>s.owners[r.id]||r.nation_code,setRegionController:(s,id,code)=>{s.owners[id]=code;}};
  const state={scenarioId:era,playerNationCode:'PLAYER',units:[{id:'army',unit_type:'infantry',nation_code:'PLAYER',region_id:'p0'}],owners:{},nations:{PLAYER:{warWith:['TARGET']},TARGET:{warWith:['PLAYER']}},
   campaigns:[{id:'campaign',source_action_id:'standing',target:'TARGET',status:'active'}]};
  const reports=[1,2,3].map(i=>({action:'battle',campaign_id:'campaign',title:`Advance ${i}`,report:'After fighting, the force advances along the connected front.',outcome:'advance',day_offset:i*10,movements:[{unit_id:'army',region_id:`p${i}`}]}));
  const context={actions:[],campaigns:state.campaigns,recruitment:{catalog:{infantry:{landSpeed:10}},existingUnits:state.units,movement:{available_days:40}}};
  validateOperations({events:[],unit_changes:[],campaign_orders:structuredClone(reports)},context);
  const effects=resolveCampaigns(stub,structuredClone(state),reports,new Set(),40);
  assert.deepEqual(effects.map(e=>e.changes[0].previous_region_id),['p0','p1','p2']);
  const tooFast=structuredClone(reports);tooFast[1].day_offset=11;
  assert.throws(()=>resolveCampaigns(stub,structuredClone(state),tooFast,new Set(),40),/time since its previous movement/,'Travel time is not reset at every battle');
  const simultaneous=structuredClone(reports);simultaneous[1].day_offset=10;
  assert.throws(()=>validateOperations({unit_changes:[],campaign_orders:simultaneous},context),/increasing dates/);
 }
 console.log('Actual saved-ID reuse, one-call three-month turn, strategic surrender/earlier world stop and successive dated routes passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
