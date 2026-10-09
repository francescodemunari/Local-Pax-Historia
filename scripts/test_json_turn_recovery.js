const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/malformed-turn-brackets.txt'),'utf8');

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 const game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try {
  await engine.processPlayerAction(game.save_id,'Start the full invasion of Ethiopia from Eritrea and Somalia with land and air forces. Annex Ethiopia and prevent Haile Selassie escaping to the United Kingdom.');
  let context,calls=0,needsCorrection=false;
  const writes=new Map();
  const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
   __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(file,body){writes.set(path.basename(file),body);}},
   require:name=>require(path.join(__dirname,'../backend/services',name)),
   executeChatCompletion:async(messages,temperature,tokens,options)=>{
    calls++;
    assert(calls<=(needsCorrection?2:1),'Closing-bracket recovery should not need another model request');
    assert.equal(options.json,true,'Both generation and correction must request JSON output');
    if(needsCorrection && calls===1) {
     const first=require('../backend/services/model-json').parseModelJSON(fixture.replaceAll('malformed_brackets_order',context.actions[0].id));
     first.action_resolutions[0].operation.reports[0].movements[0]={unit_id:'invented_unit',region_id:'g531_aETH-3110_f4'};
     first.events[1].title='Original world event preserved';
     return {content:JSON.stringify(first)};
    }
    if(needsCorrection)assert.match(messages.at(-1).content,/military section only/);
    return {content:fixture.replaceAll('malformed_brackets_order',context.actions[0].id),finish_reason:'stop'};
   }};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
  llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
  const turn=await engine.advanceTime(game.save_id,'next_event'),state=await engine.loadGame(game.save_id);
  assert.equal(state.currentDate,'1936-03-07');
  assert.equal(turn.generation_info.requests,1);assert.equal(turn.generation_info.json_recoveries,1);
  assert.equal(state.units.length,3);
  assert.equal(state.campaigns[0].status,'active');assert.equal(state.nations.ETH.annexed_by,undefined);
  assert.equal(state.units.find(u=>u.name==='Northern Italian Army Group').region_id,'g531_aETH-3110_f4');
  assert.equal(state.units.find(u=>u.name==='Southern Italian Army Group').region_id,'g5200_aSOM-2412_f0');
  assert.equal(state.units.find(u=>u.unit_type==='air').mission.target_region_id,'g531_aETH-3110_f4');
  assert(!turn.events.some(e=>e.title.includes('Addis')),'Later predictions stay outside the selected timeline');
  assert(writes.has('last_ai_initial_response.txt'));
  assert.equal(writes.get('last_ai_repair_response.txt'),'','A one-call turn clears stale correction diagnostics');
  const provider=sandbox.executeChatCompletion;
  // A provider length stop may contain a valid JSON prefix. Never commit it.
  const before=JSON.stringify(state);
  sandbox.executeChatCompletion=async(_messages,_temperature,_tokens,options)=>{
   assert.equal(options.json,true);
   return {content:'{"events":[],"action_resolutions":[]}',finish_reason:'length'};
  };
  await assert.rejects(()=>engine.advanceTime(game.save_id,'next_event'),/output limit/);
  assert.equal(JSON.stringify(await engine.loadGame(game.save_id)),before,'Two truncated replies leave the save unchanged');
  assert.equal(JSON.parse(writes.get('last_turn_diagnostics.json')).truncated_replies,2);
  assert.equal(writes.get('last_ai_repair_response.txt'),'{"events":[],"action_resolutions":[]}');
  // The failed user reply was a correction. Exercise that path too, preserving
  // the first response's world section and allowing no second correction.
  const correctedGame=await engine.createGame('ITA',undefined,'ww2-geographic');
  try {
   await engine.processPlayerAction(correctedGame.save_id,'Invade Ethiopia from Eritrea and Somalia using land and air forces.');
   needsCorrection=true;calls=0;sandbox.executeChatCompletion=provider;
   const corrected=await engine.advanceTime(correctedGame.save_id,'next_event');
   assert.equal(corrected.generation_info.requests,2);assert.equal(corrected.generation_info.json_recoveries,1);
   assert.equal(corrected.new_date,'1936-03-07');
   assert(corrected.events.some(e=>e.title==='Original world event preserved'));
   assert(writes.get('last_ai_initial_response.txt').includes('invented_unit'));
   assert(!writes.get('last_ai_repair_response.txt').includes('invented_unit'));
  }finally{await engine.deleteSave(correctedGame.save_id);}
  const rejectedGame=await engine.createGame('ITA',undefined,'ww2-geographic');
  try {
   await engine.processPlayerAction(rejectedGame.save_id,'Invade Ethiopia from Eritrea and Somalia using land and air forces.');
   const untouched=JSON.stringify(await engine.loadGame(rejectedGame.save_id));
   sandbox.executeChatCompletion=async()=>({content:fixture.replaceAll('malformed_brackets_order',context.actions[0].id)
    .replace('"movements":[{"formation_ref":"ita_north_army"','"movements":[{"unit_id":"invented_unit"')});
   await assert.rejects(()=>engine.advanceTime(rejectedGame.save_id,'next_event'),/Unknown formation invented_unit/);
   assert.equal(JSON.stringify(await engine.loadGame(rejectedGame.save_id)),untouched,'Syntax recovery cannot bypass world validation');
  }finally{await engine.deleteSave(rejectedGame.save_id);}
 }finally{llm.generateEvents=original;await engine.deleteSave(game.save_id);}
 console.log('Actual malformed turn resolves in one request with both fronts and air; truncation never commits partial state');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
