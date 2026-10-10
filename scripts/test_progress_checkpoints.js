const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {validateNextEvent,getTimelineSelection}=require('../backend/services/next-event');
const fixture=require('./fixtures/sparse-year-skip.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

// The policy must work independently of country IDs, dates and model arithmetic.
for(const year of [1910,1936,2010]) {
 const significance_reason='A binding settlement enters into force, changing the balance between the major powers.';
 const context={nextImportantEvent:true,currentDate:`${year}-01-01`,playerNation:{code:'PLAYER'},
  campaigns:[{id:'active',status:'active',target:'TARGET'}]};
 for(const supplied of [undefined,365,'365',-1]) {
  const reply={elapsed_days:supplied,events:[],campaign_orders:[{action:'battle',day_offset:45}]};
  validateNextEvent(reply,context);
  assert.equal(reply.elapsed_days,45);
  assert.equal(getTimelineSelection(reply).stop_reason,'campaign_checkpoint');
  validateNextEvent(reply,context);assert.equal(reply.elapsed_days,45,'Repeated validation preserves the selected date');
 }
 const empty={events:[],elapsed_days:365};validateNextEvent(empty,context);
 assert.equal(empty.elapsed_days,30,'A missing world simulation cannot consume a year');
 const late={events:[],campaign_orders:[{action:'battle',day_offset:300}]};validateNextEvent(late,context);
 assert.equal(late.elapsed_days,30);assert.equal(late.campaign_orders.length,0);
 const distantWorld={events:[{severity:'major',significance_reason,day_offset:250}],campaign_orders:[{action:'battle',day_offset:45}]};
 validateNextEvent(distantWorld,context);assert.equal(distantWorld.elapsed_days,45,'A distant world event cannot hide months of unreported campaign time');
 assert.equal(distantWorld.events.length,0);
 const futureBattle={events:[{severity:'major',significance_reason,day_offset:40}],campaign_orders:[{action:'battle',day_offset:60}]};
 validateNextEvent(futureBattle,context);assert.equal(futureBattle.elapsed_days,30,'A checkpoint cannot overrun an earlier world milestone');
 const earlierWorld={events:[{severity:'major',significance_reason,day_offset:20}],campaign_orders:[{action:'battle',day_offset:45}]};
 validateNextEvent(earlierWorld,context);assert.equal(earlierWorld.elapsed_days,20);assert.equal(getTimelineSelection(earlierWorld).stop_reason,'milestone');
 const surrender={events:[],campaign_orders:[{action:'battle',day_offset:45},{action:'annex',day_offset:155,surrendered:true}]};
 validateNextEvent(surrender,context);assert.equal(surrender.elapsed_days,155,'Real long-campaign milestones remain supported');
 const ordinary={events:[{severity:'moderate',day_offset:12}]};validateNextEvent(ordinary,{...context,campaigns:[]});
 assert.equal(ordinary.elapsed_days,12,'Ordinary dated news does not imply simulation of the rest of the year');
 const twoWars={events:[{severity:'major',significance_reason,day_offset:250}],campaign_orders:[{action:'battle',campaign_id:'active',day_offset:45}]};
 validateNextEvent(twoWars,{...context,campaigns:[...context.campaigns,{id:'other',status:'active',target:'OTHER'}]});
 assert.equal(twoWars.elapsed_days,30,'Progress in one war cannot hide a completely unreported second war');
 const futureOrder={events:[{severity:'major',significance_reason,day_offset:40}],action_resolutions:[{action_id:'later',day_offset:50,
  operation:{kind:'invasion',status:'proceed',target_nation_code:'TARGET',reports:[{action:'battle',day_offset:60}]}}]};
 validateNextEvent(futureOrder,{...context,campaigns:[],actions:[{id:'later'}]});
 assert.equal(futureOrder.elapsed_days,40,'A scheduled future offensive does not count as an active coverage gap');
 const undated={elapsed_days:250,events:[{severity:'major',significance_reason,state_changes:{PLAYER:{leader_name:'Future leader'}}}],
  campaign_orders:[{action:'battle',day_offset:45}]};
 validateNextEvent(undated,context);assert.equal(undated.elapsed_days,45);
 assert.equal(undated.events.length,0,'A legacy undated milestone and its state changes cannot be pulled forward into a checkpoint');
 const unanchored={events:[{severity:'major',significance_reason,state_changes:{PLAYER:{leader_name:'Undated leader'}}}],elapsed_days:999};
 validateNextEvent(unanchored,context);assert.equal(unanchored.elapsed_days,30);assert.equal(unanchored.events.length,0,
  'A milestone without a defensible date cannot apply political changes or appear as a major checkpoint event');
 const offsets={events:[{severity:'moderate',day_offset:10},{severity:'moderate',day_offset:'20'}],
  campaign_orders:[{action:'battle',day_offset:45}]};
 validateNextEvent(offsets,context);
 assert.deepEqual(offsets.events.map(e=>e.game_date),[`${year}-01-11`,`${year}-01-21`],'Day-offset news retains its actual dates rather than being spread across the selected turn');
}

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 const game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try {
  await engine.processPlayerAction(game.save_id,'Start the full scale invasion against Ethiopia. Attack from Eritrea and Somalia using all land and air forces. Conquer and annex Ethiopia.');
  let context,calls=0,continuation=false;
  const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
   __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
   require:name=>require(path.join(__dirname,'../backend/services',name)),executeChatCompletion:async()=>{
    assert.equal(++calls,1,'Sparse coverage must not require another expensive generation');
    if(!continuation){const reply=structuredClone(fixture);reply.action_resolutions[0].action_id=context.actions[0].id;return {content:JSON.stringify(reply)};}
    assert.equal(context.actions.length,0,'The standing offensive continues without repeating the order');
    assert(context.campaigns[0].pending_updates.some(n=>n.kind==='front'),'Missing southern progress survives into the next context');
    const units=context.recruitment.existingUnits;
    return {content:JSON.stringify({events:[],campaign_orders:[{action:'battle',campaign_id:context.campaigns[0].id,
     title:'Southern offensive',report:'After sustained fighting and air reconnaissance, the southern army advances inland. The Ethiopian resistance continues.',
     outcome:'advance',day_offset:30,front_ids:['southern_front'],
     movements:[{unit_id:units.find(u=>u.name==='Somalian Expeditionary Force').id,region_id:'g5200_aETH-3134_f5'}],
     support:[{unit_id:units.find(u=>u.unit_type==='air').id,region_id:'g5200_aETH-3134_f5',mission:'Reconnaissance'}]}]})};
   }};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
  llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
  const turn=await engine.advanceTime(game.save_id,'next_event'),state=await engine.loadGame(game.save_id);
  assert.equal(state.currentDate,'1936-02-15');assert.equal(turn.advanced_days,45);
  assert.equal(turn.next_event_checkpoint,true);assert.equal(turn.next_event_stop_reason,'campaign_checkpoint');
  assert.equal(turn.next_event_horizon_reached,false);assert.equal(turn.generation_info.requests,1);
  assert.equal(state.units.length,3);assert.equal(state.campaigns[0].status,'active');
  assert.equal(state.units.find(u=>u.name==='1st Eritrean Corps & Blackshirts').region_id,'g531_aETH-3110_f8');
  assert.equal(state.units.find(u=>u.name==='Somalian Expeditionary Force').region_id,'g5200_aSOM-2314_f0');
  assert.equal(state.units.find(u=>u.unit_type==='air').mission.target_region_id,'g531_aETH-3110_f8');
  assert.deepEqual(turn.events.map(e=>e.game_date),['1936-01-20','1936-02-15']);
  assert(!turn.events.some(e=>e.title.includes('Sanctions')),'March proposals cannot leak into a February checkpoint');
  assert.equal(state.nations.ETH.annexed_by,undefined,'Missing reports cannot invent victory');
  continuation=true;calls=0;
  const next=await engine.advanceTime(game.save_id,'next_event'),later=await engine.loadGame(game.save_id);
  assert.equal(next.advanced_days,30);assert.equal(later.currentDate,'1936-03-16');assert.equal(later.units.length,3);
  assert.equal(later.units.find(u=>u.name==='Somalian Expeditionary Force').region_id,'g5200_aETH-3134_f5');
  assert.equal(later.units.find(u=>u.unit_type==='air').mission.target_region_id,'g5200_aETH-3134_f5');
 }finally{llm.generateEvents=original;await engine.deleteSave(game.save_id);}
 console.log('Recorded year-skip regression, bounded checkpoints, later-effect exclusion and standing southern/air continuation passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
