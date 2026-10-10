const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {worldSeverity,isImportantWorldEvent}=require('../backend/services/event-importance');
const {validateNextEvent,getTimelineSelection}=require('../backend/services/next-event');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const fixture=require('./fixtures/debate-stop.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');
const debate=fixture.events.find(e=>e.title.includes('Debates'));
assert.equal(worldSeverity(debate),'moderate','A Major label without an explained strategic outcome is insufficient');
for(const development_status of ['discussion','proposed','preparatory','unknown'])
 assert.equal(worldSeverity({...debate,severity:'critical',development_status,significance_reason:'The proposed sanctions could isolate a major power.'}),'moderate');
assert.equal(worldSeverity({...debate,development_status:'occurred'}),'moderate','An occurrence label also needs an importance explanation');
const enacted={title:'Binding embargo takes effect',description:'A binding embargo blocks strategically important arms deliveries.',
 severity:'major',development_status:'occurred',significance_reason:'The enforced embargo cuts a major supply route, altering the ongoing war.'};
assert(isImportantWorldEvent(enacted));
assert(isImportantWorldEvent({...enacted,development_status:undefined}),'Legacy explained milestones remain usable');
assert(!isImportantWorldEvent({...enacted,severity:'moderate'}),'Do not promote every enacted decision');

for(const year of [1910,1936,2010]) {
 const context={currentDate:`${year}-01-01`,nextImportantEvent:true,playerNation:{code:'PLAYER'}};
 for(const development_status of ['discussion','proposed','preparatory']) {
  const reply={events:[{...debate,game_date:undefined,day_offset:10,development_status,significance_reason:'A possible embargo is under consideration.'},
   {...enacted,day_offset:20}]};
  validateNextEvent(reply,context);
  assert.equal(reply.elapsed_days,20);assert.equal(reply.events[0].severity,'moderate');
  assert.equal(getTimelineSelection(reply).stop_reason,'milestone');
 }
 const decisiveBattle={events:[{...debate,game_date:undefined,day_offset:10}],campaign_orders:[
  {action:'battle',day_offset:20,severity:'major',significance_reason:'The enemy main army is defeated, opening the decisive front.'}]};
 validateNextEvent(decisiveBattle,context);assert.equal(decisiveBattle.elapsed_days,20);
 const future={elapsed_days:60,events:[{...debate,game_date:undefined,state_changes:{PLAYER:{leader_name:'Future leader'}}}],
  campaign_orders:[{action:'battle',day_offset:15}]};
 validateNextEvent(future,context);assert.equal(future.elapsed_days,15);assert.equal(future.events.length,0,'Downgrading importance cannot pull undated future state effects forward');
}

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  for(const fixed of [false,true]) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start the full invasion of Ethiopia from Eritrea and Somalia with land and air forces. Conquer and annex Ethiopia.');
    let context,calls=0;
    const sandbox={structuredClone,getHistoricalRoadmapContext:()=>'',console,path,__dirname:path.join(__dirname,'../backend/services'),
     fs:{existsSync:()=>true,writeFileSync(){}},require:name=>require(path.join(__dirname,'../backend/services',name)),
     executeChatCompletion:async()=>{
      assert.equal(++calls,1,'Importance normalization must not need another model request');
      const reply=structuredClone(fixture);reply.action_resolutions[0].action_id=context.actions[0].id;
      if(fixed)reply.events.push({...enacted,event_type:'diplomatic',game_date:'1936-02-15',affected_nations:['FRA','GER']});
      return {content:JSON.stringify(reply)};
     }};
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
    llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
    const turn=await engine.advanceTime(game.save_id,fixed?'3_months':'next_event'),saved=await engine.loadGame(game.save_id);
    assert.equal(saved.currentDate,fixed?'1936-04-01':'1936-01-26');
    assert.equal(saved.units.length,3);
    assert.equal(saved.units.find(u=>u.name==='1st Eritrean Corps').region_id,'g531_aETH-3110_f0');
    assert.equal(saved.units.find(u=>u.name==='1st Somali Corps').region_id,'g5200_aSOM-2412_f0');
    assert.equal(saved.units.find(u=>u.unit_type==='air').mission.target_region_id,'g531_aETH-3110_f0');
    if(fixed) {
     const event=turn.events.find(e=>e.title===debate.title);
     assert.equal(event.severity,'moderate','Playback and saved events agree with skip selection');
     assert.equal(saved.events.find(e=>e.id===event.id).severity,'moderate');
     const milestone=turn.events.find(e=>e.title===enacted.title);
     assert.equal(milestone.severity,'major');
     assert.equal(milestone.development_status,'occurred');
     assert.equal(milestone.significance_reason,enacted.significance_reason);
     assert.deepEqual(saved.events.find(e=>e.id===milestone.id),milestone,'Importance metadata survives save/reload');
    } else {
     assert.equal(turn.next_event_stop_reason,'campaign_checkpoint');assert.equal(turn.next_event_checkpoint,true);
     assert(!turn.events.some(e=>e.title===debate.title),'A later debate cannot terminate the skip');
    }
    assert.equal(saved.campaigns[0].status,'active');assert.equal(saved.nations.ETH.annexed_by,undefined);
   }finally{await engine.deleteSave(game.save_id);}
  }
 }finally{llm.generateEvents=original;}
 console.log('All eras: proposed diplomacy cannot stop a strategic skip; actual milestones, both fronts/air and consistent news severity passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
