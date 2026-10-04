const assert=require('node:assert/strict');
const Engine=require('../backend/services/game-engine');
const {validateOperations}=require('../backend/services/operation-contract');
(async()=>{
 const engine=new Engine(),game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try{
  const state=await engine.loadGame(game.save_id),recruitment=engine.getRecruitmentContext(state,30);
  const south='g5200_aETH-3134_f0',north='g531_aERI-1560_f0';
  const staging=recruitment.controlledRegions.find(r=>r.id===south);
  assert(staging,'An ETH source code may identify a controlled Somali fragment');
  const destination=staging.adjacent_foreign_regions.find(r=>r.controller==='ETH');assert(destination);
  assert(staging.area_km2<10,'Staging context identifies the tiny border fragment');
  const ctx={actions:[{id:'order',action_text:'Attack Ethiopia from north and south, Eritrea and Somalia, using land and air forces'}],nationCatalog:[{code:'ETH'}],recruitment};
  const result={events:[],unit_changes:[{action:'recruit',action_id:'order',unit_type:'infantry',region_id:north},{action:'recruit',action_id:'order',unit_type:'infantry',region_id:south},{action:'recruit',action_id:'order',unit_type:'air',region_id:north}],
   action_resolutions:[{action_id:'order',operation:{kind:'invasion',status:'proceed',reason:'Both fronts accounted for',target_nation_code:'ETH',air_support_reason:'Weather prevents flying',fronts:[{name:'Northern front (Eritrea)',region_id:north,status:'ready',hold_reason:'Supply preparation'},{name:'Southern front (Somalia)',region_id:south,status:'ready'}]}}],
   campaign_orders:[{action:'start',action_id:'order',target_nation_code:'ETH'},{action:'battle',title:'Battle report',day_offset:12,campaign_id:'order',outcome:'advance',report:'The southern force enters the neighbouring enemy province.',movements:[{source_action_id:'order',unit_type:'infantry',from_region_id:south,region_id:destination.id}]}]};
  validateOperations(result,ctx);
  const stationary=structuredClone(result);stationary.campaign_orders[1].movements[0].region_id=south;
  assert.throws(()=>validateOperations(stationary,ctx),/repeats origin/,'Stationary conquests must reach the repair loop');
  const foreign=structuredClone(result);foreign.action_resolutions[0].operation.fronts[1].region_id=destination.id;
  assert.throws(()=>validateOperations(foreign,ctx),/currently controlled/,'A matching front name must not authorize recruiting on enemy land');
  console.log('Historical Somali staging, real neighbouring destinations and stationary-advance rejection passed');
 }finally{await engine.deleteSave(game.save_id);}
})().catch(e=>{console.error(e);process.exitCode=1;});
