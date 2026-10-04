const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const fixture=require('./fixtures/timeline-overrun.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

function mock(reply,maxRequests=1) {
 let context,calls=0;
 const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
  __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
  require:name=>require(path.join(__dirname,'../backend/services',name)),
  executeChatCompletion:async()=>{
   calls++;assert(calls<=maxRequests,'Timeline projection must not consume a correction request');
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
  for(const {worldFirst,nestedFollowup} of [{worldFirst:true},{worldFirst:false},{worldFirst:false,nestedFollowup:true}]) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start a full invasion of Ethiopia from north and south, Eritrea and Somalia, using land and air forces.');
    const count=mock(ctx=>{
     const reply=structuredClone(fixture);reply.action_resolutions[0].action_id=ctx.actions[0].id;
     if(!worldFirst)reply.events=[{title:'Major treaty concluded',description:'A binding treaty changes the international balance.',severity:'major',game_date:'1936-01-31',affected_nations:['FRA','GER']}];
     return reply;
    });
    const turn=await engine.advanceTime(game.save_id,'next_event'),state=await engine.loadGame(game.save_id);
    assert.equal(count(),1,'The real overlong timeline resolves with one generation');
    assert.equal(state.currentDate,worldFirst?'1936-01-15':'1936-01-31');
    assert.equal(state.units.length,3,'Both fronts and their air formation mobilise');
    const north=state.units.find(u=>u.name==='1st Italian Northern Army'),south=state.units.find(u=>u.name==='1st Italian Southern Army');
    assert.equal(north.region_id,worldFirst?'g531_aERI-1560_f0':'g531_aETH-3110_f8');
    assert.equal(south.region_id,'g5200_aETH-3134_f0','A future southern battle cannot move its unit early');
    assert(!turn.events.some(e=>e.title==='The Southern Push into the Ogaden'||e.title==='Campaign update unavailable'));
    assert.equal(state.nations.ETH.annexed_by,undefined);
    assert(state.campaigns[0].pending_updates.some(n=>n.kind==='front'));
    assert(!state.actions[0].ai_response.includes('motorized columns'),'Order summary excludes later claimed advances');
    assert.equal(turn.generation_info.future_effects,worldFirst?2:1);
    if(worldFirst) {
     assert(!turn.events.some(e=>e.campaign_effect));
     assert(!state.units.find(u=>u.unit_type==='air').mission,'Future reconnaissance is not applied before its battle');
    } else {
     assert(turn.events.some(e=>e.title==='The Advance from Eritrea'));
     const followupCount=mock(ctx=>{
      assert.equal(ctx.actions.length,0,'The standing operation needs no repeated player action');
      const units=ctx.recruitment.existingUnits;
      const report=structuredClone(fixture.action_resolutions[0].operation.reports[1]);
      report.campaign_id=ctx.campaigns[0].id;report.day_offset=18;
      report.movements=[{unit_id:units.find(u=>u.name===south.name).id,region_id:'g5200_aETH-3134_f5'}];
      report.support=[{unit_id:units.find(u=>u.unit_type==='air').id,region_id:'g5200_aETH-3134_f5',mission:'Reconnaissance'}];
      // A real battle is a complete reply even when empty event/proposal arrays
      // are omitted. The adapter supplies them without another model call.
      return nestedFollowup
       ? {events:null,action_resolutions:[{action_id:ctx.campaigns[0].source_action_id,summary:report.report,
          operation:{kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:report.report,
           fronts:ctx.campaigns[0].requested_fronts,reports:[report]}}]}
       : {campaign_orders:[report]};
     });
     await engine.advanceTime(game.save_id,'next_event');
     const later=await engine.loadGame(game.save_id);
     assert.equal(followupCount(),1);
     assert.equal(later.units.find(u=>u.id===south.id).region_id,'g5200_aETH-3134_f5');
     assert.equal(later.units.find(u=>u.unit_type==='air').mission.target_region_id,'g5200_aETH-3134_f5');
     assert.equal(later.currentDate,'1937-01-30','An ordinary later battle progresses within the horizon without forcing a stop');
    }
   }finally{await engine.deleteSave(game.save_id);}
  }
  for(const military of [false,true]) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,military?'Start an invasion of Ethiopia':'Change the ruling party');
    const before=await engine.loadGame(game.save_id);
    const count=mock(ctx=>{
     const id=ctx.actions[0].id;
     return {events:[{title:'French political crisis',description:'An independent development.',severity:'major',game_date:'1936-01-15',affected_nations:['FRA']},
       ...(!military?[{title:'Future government change',description:'A future appointment.',game_date:'1936-02-05',action_id:id,state_changes:{ITA:{ruling_party:'Future party'}}}]:[])],
      action_resolutions:[{action_id:id,summary:'The later order is carried out.',...(military?{operation:{kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'A future invasion.',fronts:[]}}:{day_offset:35})}],
      unit_changes:[{action:'recruit',action_id:id,day_offset:35,unit_type:'invalid_future_type',region_id:'unmapped_future_province'}],
      ...(military?{campaign_orders:[{action:'start',action_id:id,target_nation_code:'ETH',day_offset:35}]}:{})};
    });
    const turn=await engine.advanceTime(game.save_id,'next_event'),state=await engine.loadGame(game.save_id);
    assert.equal(count(),1);
    assert.equal(state.currentDate,'1936-01-15');
    assert.equal(state.actions[0].status,'pending','Future-only orders stay queued');
    assert.equal(state.units.length,0);assert.equal(state.campaigns.length,0);
    assert.equal(state.nations.ITA.ruling_party,before.nations.ITA.ruling_party);
    assert.equal(turn.processed_actions,0);
    assert(!turn.events.some(e=>e.title==='Future government change'));
   }finally{await engine.deleteSave(game.save_id);}
  }
  const game=await engine.createGame('ITA',undefined,'ww2-geographic');
  try {
   await engine.processPlayerAction(game.save_id,'Invade Ethiopia from Eritrea and Somalia using air forces');
   const count=mock(ctx=>{
    const reply=structuredClone(fixture);reply.action_resolutions[0].action_id=ctx.actions[0].id;
    const battle=reply.action_resolutions[0].operation.reports[0];battle.day_offset=5;
    battle.movements=[{unit_id:'invented_unit',region_id:'g531_aETH-3110_f8'}];
    return reply;
   },2);
   await assert.rejects(()=>engine.advanceTime(game.save_id,'next_event'),/Unknown formation invented_unit/);
   const state=await engine.loadGame(game.save_id);
   assert.equal(count(),2);assert.equal(state.currentDate,'1936-01-01');assert.equal(state.units.length,0);
   assert.equal(state.actions[0].status,'pending','A real unsafe effect still preserves the entire turn');
  }finally{await engine.deleteSave(game.save_id);}
 }finally{llm.generateEvents=original;}
 console.log('Actual overlong timeline, one-call selection, both fronts/air, later standing movement, scheduled civilian/military orders and unsafe-effect rejection passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
