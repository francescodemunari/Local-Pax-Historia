const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const fixture=require('./fixtures/missing-operation-target.json');
const {buildTurnMessages}=require('../backend/services/turn-prompt');
const {validateTurn}=require('../backend/services/turn-validation');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  for(const mode of ['next_event','6_months']) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start the full invasion of Ethiopia from north and south, Eritrea and Somalia, using land and air forces. Conquer and annex Ethiopia; prevent Haile Selassie escaping to the United Kingdom.');
    let context,calls=0,followup=false;
    const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
     __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
     require:name=>require(path.join(__dirname,'../backend/services',name)),
     executeChatCompletion:async()=>{
      assert.equal(++calls,1,'Missing identity metadata must not consume a corrective inference');
      const reply=structuredClone(fixture);
      // Keep the original operation; explain its consequential world milestone.
      reply.events.find(e=>e.title.includes('Rhineland')).significance_reason='The actual military deployment ends demilitarization and changes the European security balance.';
      reply.action_resolutions[0].action_id=followup
       ? context.campaigns[0].source_action_id : context.actions[0].id;
      if(followup) {
       reply.events=[];
       reply.action_resolutions[0].action_id=context.campaigns[0].source_action_id;
       const op=reply.action_resolutions[0].operation,refs=new Map(op.formations.map(f=>
        [f.formation_ref,context.recruitment.existingUnits.find(u=>u.name===f.name).id]));
       op.formations=[];
       op.reports=op.reports.filter(r=>r.day_offset>66);
       for(const r of op.reports) {
        r.day_offset-=66;
        for(const ref of [...(r.movements||[]),...(r.support||[])]) {
         ref.unit_id=refs.get(ref.formation_ref);delete ref.formation_ref;
        }
       }
      }
      return {content:JSON.stringify(reply)};
     }};
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
    llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
    const turn=await engine.advanceTime(game.save_id,mode),state=await engine.loadGame(game.save_id);
    assert.equal(calls,1);
    assert.equal(turn.generation_info.requests,1);
    assert.equal(state.campaigns[0].target,'ETH','The UK exile destination is not the campaign target');
    assert.equal(state.campaigns[0].status,mode==='next_event'?'active':'completed');
    assert.equal(state.nations.ETH.annexed_by,mode==='next_event'?undefined:'ITA');
    assert(!state.nations.ITA.warWith.includes('ENG'));
    assert.equal(state.units.length,4);
    assert(turn.events.some(e=>e.campaign_effect?.support?.some(u=>u.unit_type==='air')),'Requested air support is applied in the dated battle');
    assert.equal(Boolean(state.units.find(u=>u.unit_type==='air').mission),mode==='next_event','Settlement clears the finished air mission');
    assert.equal(state.units.find(u=>u.name.includes('(North)')).region_id,'g531_aETH-3110_f4');
    assert.equal(state.units.find(u=>u.name.includes('(South)')).region_id,mode==='next_event'?'g5200_aETH-3134_f0':'g5200_aSOM-2412_f0');
    assert.equal(turn.events.some(e=>e.campaign_effect?.action==='annex'),mode!=='next_event');
    assert.equal(state.currentDate,mode==='next_event'?'1936-03-07':'1936-07-01');
    const prompt=JSON.parse(buildTurnMessages(mode,context)[1].content);
    assert.equal(prompt.pending_orders[0].target_nation_code_hint,undefined,'Do not guess from multiple named countries');
    // Explicit invalid current metadata still fails before commit.
    const invalid=structuredClone(fixture);invalid.action_resolutions[0].action_id=context.actions[0].id;
    invalid.action_resolutions[0].operation.target_nation_code='invented_target';
    assert.throws(()=>validateTurn(invalid,context),/Unknown nation reference/);
    if(mode==='next_event') {
     followup=true;calls=0;
     await engine.advanceTime(game.save_id,'next_event');
     const settled=await engine.loadGame(game.save_id);
     assert.equal(calls,1,'A standing source identifies the same campaign without another player order');
     assert.equal(settled.currentDate,'1936-06-04');
     assert.equal(settled.campaigns[0].status,'completed');
     assert.equal(settled.nations.ETH.annexed_by,'ITA');
     assert.equal(settled.units.find(u=>u.name.includes('(South)')).region_id,'g5200_aSOM-2412_f0');
    }
   }finally{await engine.deleteSave(game.save_id);}
  }
  const game=await engine.createGame('ITA',undefined,'ww2-geographic');
  try {
   await engine.processPlayerAction(game.save_id,'Invade Ethiopia from north and south, Eritrea and Somalia, using land and air forces. Prevent escape to United Kingdom.');
   let context,calls=0;
   const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
    __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
    require:name=>require(path.join(__dirname,'../backend/services',name)),
    executeChatCompletion:async messages=>{
     const reply=structuredClone(fixture);
     reply.events.find(e=>e.title.includes('Rhineland')).significance_reason='The actual military deployment ends demilitarization and changes the European security balance.';
     reply.action_resolutions[0].action_id=context.actions[0].id;
     if(++calls===1)reply.diplomatic_changes=[{action:'declare_war',action_id:context.actions[0].id,nation_code:'ITA',target_nation_code:'ENG'}];
     else {
      assert.equal(calls,2);
      assert(messages.at(-1).content.includes('Repair the entire JSON response'),'A conflicting declaration must not be preserved by a military-only repair');
     }
     return {content:JSON.stringify(reply)};
    }};
   vm.createContext(sandbox);
   vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
   llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
   await engine.advanceTime(game.save_id,'next_event');
   const state=await engine.loadGame(game.save_id);
   assert.equal(calls,2);assert.equal(state.campaigns[0].target,'ETH');
   assert(!state.nations.ITA.warWith.includes('ENG'),'A mistaken unrelated declaration is not committed');
  }finally{await engine.deleteSave(game.save_id);}
 }finally{llm.generateEvents=original;}
 console.log('Actual missing-target reply resolves in one generation; both fronts, air support, settlement and saved state remain authoritative');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
