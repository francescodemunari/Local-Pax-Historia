const assert=require('node:assert/strict');
const {validateOperations}=require('../backend/services/operation-contract');
const context={actions:[{id:'a',action_text:'Invade Ethiopia from Eritrea and Somalia'}],nationCatalog:[{code:'ETH'}],recruitment:{catalog:{infantry:{landKmPerDay:40}},existingUnits:[]}};
const result={campaign_orders:[{action:'start',action_id:'a',target_nation_code:'ETH'}],unit_changes:[{action:'recruit',action_id:'a',unit_type:'infantry',region_id:'g_aERI-1'}],action_resolutions:[{action_id:'a',operation:{kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'Advance from both fronts',fronts:[{name:'Eritrea',status:'ready',region_id:'g_aERI-1'}]}}]};
assert.throws(()=>validateOperations(result,context),/Somalia/);
result.action_resolutions[0].operation.fronts.push({name:'Somalia',status:'blocked',reason:'No connected staging forces this turn'});
result.campaign_orders.push({action:'battle',title:'Battle report',day_offset:12,campaign_id:'campaign_a',outcome:'hold',report:'Forces assemble while the southern front remains unavailable.'});
validateOperations(result,context);
assert.throws(()=>validateOperations({...result,campaign_orders:undefined},context),/campaign_orders/);
assert.throws(()=>validateOperations({...result,unit_changes:[]},context),/ground formation/);
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
(async()=>{const engine=new Engine(),game=await engine.createGame('ITA',undefined,'ww1-1910'),original=llm.generateEvents;
try {
 llm.generateEvents=async(_,ctx)=>{assert(ctx.nextImportantEvent);return {elapsed_days:12,events:[{title:'Major change',description:'An independent development.',severity:'major',affected_nations:['FRA']}],unit_changes:[],campaign_orders:[],action_resolutions:[]};};
 await engine.advanceTime(game.save_id,'next_event');assert.equal((await engine.loadGame(game.save_id)).currentDate,'1910-01-13');
 llm.generateEvents=async()=>({elapsed_days:91,events:[]});await engine.advanceTime(game.save_id,'next_event');
 assert.equal((await engine.loadGame(game.save_id)).currentDate,'1910-02-12','A quiet response uses a short checkpoint rather than the search horizon');
 await engine.processPlayerAction(game.save_id,'Invade Ethiopia from Eritrea and Somalia');
 llm.generateEvents=async()=>({events:[],error:'Missing required campaign_orders array.'});
 await assert.rejects(()=>engine.advanceTime(game.save_id,'1_month'),/campaign_orders/);
 const preserved=await engine.loadGame(game.save_id);
 assert.equal(preserved.currentDate,'1910-02-12');assert.equal(preserved.actions.at(-1).status,'pending');
 console.log('Operation schema, missing fronts and bounded next-event advancement passed');
}finally{llm.generateEvents=original;await engine.deleteSave(game.save_id);}})().catch(e=>{console.error(e);process.exitCode=1;});

// Exercise the actual prompt and bounded repair loop without a network request.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');
let calls=0;
const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,
 require:name=>require(path.join(__dirname,'../backend/services',name)),
 path, __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
 executeChatCompletion:async messages=>{calls++;assert(messages[0].content.includes('"campaign_orders"'));return {content:JSON.stringify(calls===1?{events:[]}:{events:[],campaign_orders:[],action_resolutions:[],unit_changes:[]})};}};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
sandbox.generate('1_week',{playerNation:{name:'Italy'},actions:[]}).then(output=>{assert(!output.error);assert.equal(calls,1);console.log('Omitted empty proposal arrays require no repair request');}).catch(error=>{console.error(error);process.exitCode=1;});

const airContext={...context,actions:[{id:'a',action_text:'Attack Ethiopia with air forces'}],recruitment:{...context.recruitment,existingUnits:[{id:'air1',unit_type:'air'}]}};
assert.throws(()=>validateOperations(result,airContext),/air forces/);
result.action_resolutions[0].operation.air_support_reason='Weather prevents flying.';
validateOperations(result,airContext);

const silent={campaign_orders:[{action:'start',action_id:'mobilise',target_nation_code:'ETH'}],events:[],action_resolutions:[]};
validateOperations(silent,{actions:[],campaigns:[],recruitment:{movement:{available_days:30}}});
assert(silent.campaign_orders.some(o=>o.unresolved && o.outcome==='hold' && o.movements.length===0));
const reused={campaign_orders:[{action:'start',action_id:'new_order',target_nation_code:'ETH'},{action:'battle',title:'Battle report',day_offset:12,campaign_id:'campaign_new_order',report:'The existing front holds.',outcome:'hold'}],action_resolutions:[]};
validateOperations(reused,{actions:[],campaigns:[{id:'campaign_original',target:'ETH',status:'active'}]});
assert.equal(reused.campaign_orders[1].campaign_id,'campaign_original');
assert(!reused.campaign_orders.some(o=>o.unresolved));
const nextEvent={elapsed_days:12,campaign_orders:[],action_resolutions:[]};
const activeContext={actions:[],campaigns:[{id:'ongoing',target:'ETH',status:'active'}],recruitment:{movement:{available_days:90}}};
assert.throws(()=>validateOperations(nextEvent,activeContext,{allowUnresolved:false}),/needs one battle report/);
validateOperations(nextEvent,activeContext);
assert.equal(nextEvent.campaign_orders[0].day_offset,12);
const advanceContext={...airContext,actions:[{id:'a',action_text:'Advance with land and air forces'}]};
const advance=structuredClone(result);delete advance.action_resolutions[0].operation.air_support_reason;
assert.throws(()=>validateOperations(advance,advanceContext),/air forces/,'Advance orders must validate requested air support');
const frontsContext={...context,actions:[{id:'a',action_text:'Advance from north and south'}]};
assert.throws(()=>validateOperations(structuredClone(result),frontsContext),/north front/,'Directional fronts cannot silently disappear');
const phantom={campaign_orders:[{action:'battle',title:'Battle report',day_offset:12,campaign_id:'ongoing',report:'Troops advance.',outcome:'advance',movements:[]}],action_resolutions:[]};
assert.throws(()=>validateOperations(phantom,activeContext),/actual formation movements/);


const combinedContext={actions:[{id:'both',action_text:'Advance from north and south with land and air forces'}],nationCatalog:[{code:'ETH'}],campaigns:[{id:'campaign_both',target:'ETH',status:'active'}],recruitment:{catalog:{infantry:{landKmPerDay:40}},existingUnits:[{id:'north',region_id:'n',unit_type:'infantry'},{id:'south',region_id:'s',unit_type:'infantry'},{id:'wing',region_id:'n',unit_type:'air'}]}};
const combined={action_resolutions:[{action_id:'both',operation:{kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'Combined offensive',fronts:[{name:'Northern front',status:'ready',region_id:'n'},{name:'Southern front',status:'ready',region_id:'s'}]}}],campaign_orders:[{action:'battle',title:'Battle report',day_offset:12,campaign_id:'campaign_both',report:'Both fronts advance with reconnaissance.',outcome:'advance',movements:[{unit_id:'north',region_id:'target1'},{unit_id:'south',region_id:'target2'}],support:[{unit_id:'wing',region_id:'target1',mission:'Reconnaissance'}]}]};
validateOperations(structuredClone(combined),combinedContext);
const omitted=structuredClone(combined);omitted.campaign_orders[0].movements.pop();
assert.throws(()=>validateOperations(omitted,combinedContext),/Southern front has no formation movement/);
omitted.action_resolutions[0].operation.fronts[1].hold_reason='Southern supply road remains impassable.';
validateOperations(omitted,combinedContext);
console.log('Both requested fronts and air support are accounted for, including explicit held-front explanations');


const followupContext=structuredClone(combinedContext);
followupContext.actions[0].action_text='Advance all our forces';
followupContext.campaigns[0].original_order='Invade from north and south';
const forgotten=structuredClone(combined);forgotten.action_resolutions[0].operation.fronts.pop();
assert.throws(()=>validateOperations(forgotten,followupContext),/south front/,'Follow-up advance keeps the original southern front');
validateOperations(structuredClone(combined),followupContext);

const rawId=structuredClone(result);rawId.campaign_orders[1].campaign_id='a';
validateOperations(rawId,context);
assert.equal(rawId.campaign_orders[1].campaign_id,'campaign_a');
assert(!rawId.campaign_orders.some(o=>o.unresolved),'An action-ID alias must not hide an actual battle');
const unknownId=structuredClone(result);unknownId.campaign_orders[1].campaign_id='unrelated';
assert.throws(()=>validateOperations(unknownId,context),/Unknown campaign_id/);
