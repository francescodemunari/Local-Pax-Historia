const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {buildTurnMessages}=require('../backend/services/turn-prompt');
const {prepareActionOutcomes}=require('../backend/services/action-outcomes');
const {parseModelJSON}=require('../backend/services/model-json');
const {validateNextEvent}=require('../backend/services/next-event');
const fixture=require('./fixtures/omitted-order.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  for(const {repairSucceeds,reply,expectedDate} of [
   {repairSucceeds:true,reply:fixture,expectedDate:'1936-01-14'},
   {repairSucceeds:false,reply:fixture,expectedDate:'1936-01-14'},
   {repairSucceeds:false,reply:{...fixture,events:[],elapsed_days:90},expectedDate:'1936-12-31'}
  ]) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start the full invasion of Ethiopia from north and south, Eritrea and Somalia, using land and air forces.');
    let context,calls=0;
    const diagnosticWrites=new Map();
    const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
     __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(filename,content){diagnosticWrites.set(path.basename(filename),content);}},
     require:name=>require(path.join(__dirname,'../backend/services',name)),
     executeChatCompletion:async messages=>{
      calls++;
      if(calls===1 || !repairSucceeds)return {content:JSON.stringify(reply)};
      assert(messages.at(-1).content.includes(context.actions[0].id),'Repair explicitly identifies the forgotten order');
      assert(!messages.at(-1).content.includes('Stop at the earliest'),'Calendar arithmetic does not consume a repair');
      // A model can adjudicate preparation as a hold, rather than invent victory.
      return {content:JSON.stringify({action_resolutions:[{action_id:context.actions[0].id,summary:'The attack is delayed pending preparation.',operation:{kind:'invasion',status:'blocked',reason:'The proposed coordination is not ready within this interval.',target_nation_code:'ETH',fronts:[],formations:[],reports:[]}}],unit_changes:[],campaign_orders:[]})};
     }};
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
    llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
    const turn=await engine.advanceTime(game.save_id,'next_event'),state=await engine.loadGame(game.save_id);
    assert.equal(calls,2,'At most one corrective call');
    assert.equal(state.currentDate,expectedDate,'Actual date or quiet horizon determines the advance');
    assert.equal(state.actions[0].status,repairSucceeds?'completed':'pending');
    assert.equal(turn.processed_actions,repairSucceeds?1:0);
    assert.equal(state.units.length,0,'Omitted or blocked operations cannot invent troops');
    assert.equal(turn.generation_info.requests,2);
    assert.equal(turn.generation_info.failed,0);
    assert.deepEqual(JSON.parse(diagnosticWrites.get('last_turn_diagnostics.json')),JSON.parse(JSON.stringify(turn.generation_info)));
    if(reply.events.length)assert(turn.events.some(e=>e.title===fixture.events[0].title),'Valid world event preserved');
    else assert.equal(turn.events.length,0,'Unresolved pending orders use the Actions notice, not an invented event card');
    if(!repairSucceeds) {
     assert(turn.resolution_notes.some(n=>n.kind==='order'));
     const priorId=state.actions[0].id;
     llm.generateEvents=async(_,ctx)=>{assert.equal(ctx.actions[0].id,priorId,'The same queued order reaches the next turn automatically');return {error:'Stop mocked follow-up before committing'};};
     await assert.rejects(()=>engine.advanceTime(game.save_id,'1_month'),/Stop mocked/);
    }
    const data=JSON.parse(buildTurnMessages('90_days',context)[1].content);
    const ids=new Set(data.provinces.map(r=>r[0]));
    assert.equal(ids.size,data.provinces.length,'Every supplied province serialized once');
    for(const r of context.recruitment.controlledRegions)assert(ids.has(r.id));
    for(const r of context.mapRegions)assert(ids.has(r.id));
    const oldBlocks=[context.actions,context.recentEvents,context.worldState,context.recruitment,context.campaigns,context.recentOrders,context.nationCatalog]
     .map(v=>JSON.stringify(v||[],null,2)).join('')+JSON.stringify(context.mapRegions);
    const compact=buildTurnMessages('90_days',context)[1].content;
    assert(compact.length<oldBlocks.length*0.8,'Compact context materially reduces duplicate serialization');
    if(repairSucceeds)console.log(`Serialized context: ${oldBlocks.length} → ${compact.length} characters (${Math.round(100*(1-compact.length/oldBlocks.length))}% smaller; not a live latency measurement)`);
    if(repairSucceeds) {
     sandbox.executeChatCompletion=async()=>{throw new Error('Mock provider unavailable');};
     const failed=await sandbox.generate('90_days',context);
     assert.match(failed.error,/Mock provider unavailable/);
     const last=JSON.parse(diagnosticWrites.get('last_turn_diagnostics.json'));
     assert.equal(last.failed,1,'A failed request replaces stale successful diagnostics');
     assert.equal(last.requests,1);
     for(const value of Object.values(last))assert.equal(typeof value,'number','Diagnostics contain only sizes, counters and timings');
    }
   }finally{await engine.deleteSave(game.save_id);}
  }
 }finally{llm.generateEvents=original;}
 assert.deepEqual(parseModelJSON('```json\n{"action_resolutions":[]}\n```',{requireEvents:false}),{action_resolutions:[]});
 assert.deepEqual(parseModelJSON('{"explanation":"This is metadata"}\n{"action_resolutions":[]}',{requireEvents:false}),{action_resolutions:[]},'Partial parser skips unrelated leading JSON');
 const context={actions:[{id:'civilian',action_text:'Reform the education system'}],playerNation:{code:'AAA'}};
 const omitted={events:[],action_resolutions:[]};prepareActionOutcomes(omitted,context,{allowDeferred:true});
 assert.deepEqual(omitted.deferred_action_ids,['civilian'],'Omitted non-military orders also remain pending');
 assert.throws(()=>prepareActionOutcomes({events:[{state_changes:{AAA:{leader_name:'Someone'}}}],action_resolutions:[]},context,{allowDeferred:true}),/Missing outcome/,'Do not defer and replay an order whose player-state effects may already be applied');
 const dated={...fixture,elapsed_days:91};validateNextEvent(dated,{nextImportantEvent:true,currentDate:'1936-01-01'});assert.equal(dated.elapsed_days,13);
 const later=structuredClone(fixture);later.events.push({severity:'minor',game_date:'1936-01-20'});
 validateNextEvent(later,{nextImportantEvent:true,currentDate:'1936-01-01'});assert.equal(later.events.length,1,'Select the dated prefix without applying later effects');
 console.log('Actual omitted-order reply, military-only JSON repair, authoritative dates, deferred orders and compact context passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
