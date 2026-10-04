const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {resolveCampaigns}=require('../backend/services/campaigns');
const {validateOperations}=require('../backend/services/operation-contract');
const fixture=require('./fixtures/ai-surrender.json');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

function mock(reply) {
 let context,calls=0;
 const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
  __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
  require:name=>require(path.join(__dirname,'../backend/services',name)),executeChatCompletion:async()=>{
   assert.equal(++calls,1,'An explicit AI surrender or unfinished annexation objective needs no repair request');
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
  for(const mode of ['next_event','1_month','unfinished']) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start the full-scale invasion of Ethiopia from Eritrea and Somalia, using land and air forces, to conquer and annex it.');
    const before=await engine.loadGame(game.save_id),regions=engine.scenarios.getMap(before.scenarioId).regions;
    const capital=engine.scenarios.getCities(before.scenarioId).find(c=>c.nation_code==='ETH'&&c.is_capital);
    const capitalRegion=regions.find(r=>r.id===capital.region_id);
    assert.equal(engine.getRegionController(before,capitalRegion),'ETH');
    const calls=mock(ctx=>{
     const reply=structuredClone(fixture),resolution=reply.action_resolutions[0];resolution.action_id=ctx.actions[0].id;
     if(mode!=='next_event') {
      resolution.operation.reports.forEach((r,i)=>{r.day_offset=[20,25,30][i];});
      resolution.operation.reports.at(-1).day_offset='30';
      reply.events=[{title:'French policy',description:'Domestic changes.',game_date:'1936-01-10',affected_nations:['FRA']},
       {title:'German research',description:'Research continues.',game_date:'1936-01-15',affected_nations:['GER']}];
     }
     if(mode==='unfinished') {
      resolution.operation.reports=resolution.operation.reports.filter(r=>r.action!=='annex');
      resolution.summary=resolution.operation.reason='The annexation objective remains unfinished. Both fronts continue operations.';
     }
     return reply;
    });
    const turn=await engine.advanceTime(game.save_id,mode==='unfinished'?'1_month':mode),saved=await engine.loadGame(game.save_id);
    assert.equal(calls(),1);
    assert.equal(saved.currentDate,mode==='next_event'?'1936-04-30':'1936-02-01');
    assert.equal(saved.units.length,4);
    assert(saved.units.every(u=>u.region_id!==capital.region_id),'A political settlement does not invent a march to the capital');
    const surrender=turn.events.find(e=>e.campaign_effect?.action==='annex');
    if(mode==='unfinished') {
     assert.equal(surrender,undefined);assert.equal(saved.nations.ETH.annexed_by,undefined);
     assert.equal(engine.getRegionController(saved,capitalRegion),'ETH');assert.equal(saved.campaigns[0].status,'active');
     assert.equal(saved.campaigns[0].front_progress.length,2,'Annexation objectives retain both front records');
     assert(saved.campaigns[0].front_progress.every(f=>f.status==='reported'));
    }else {
     assert(surrender);assert.equal(surrender.severity,'critical');assert.equal(saved.nations.ETH.annexed_by,'ITA');
     assert.equal(surrender.campaign_effect.day_offset,mode==='next_event'?120:30,'Numeric date strings normalize consistently in fixed turns');
     assert.equal(engine.getRegionController(saved,capitalRegion),'ITA');assert.equal(saved.campaigns[0].status,'completed');
     assert(regions.filter(r=>engine.getRegionController(before,r)==='ETH').every(r=>engine.getRegionController(saved,r)==='ITA'));
     assert(!saved.nations.ITA.warWith.includes('ETH'));assert.equal(saved.nations.ETH.atWar,false);
     assert(surrender.campaign_effect.captured_regions.includes(capital.region_id),'Capital changes control in the dated settlement event');
    }
   }finally{await engine.deleteSave(game.save_id);}
  }
 }finally{llm.generateEvents=original;}

 // Country and era independent: defeat/negotiation can produce surrender
 // without occupying a capital, or even without a mapped capital at all.
 for(const era of ['1910','1936','2010']) {
  const regions=[{id:'home',nation_code:'PLAYER'},{id:'capital',nation_code:'TARGET'},{id:'remaining',nation_code:'TARGET'},{id:'foreign',nation_code:'OTHER'}];
  const engine={scenarios:{getScenario:()=>({unitCatalog:{}}),getMap:()=>({regions}),getCities:()=>[]},
   getRegionController:(s,r)=>s.owners[r.id]||r.nation_code,setRegionController:(s,id,code)=>{s.owners[id]=code;}};
  const state={scenarioId:era,playerNationCode:'PLAYER',owners:{},nations:{PLAYER:{warWith:['TARGET','OTHER']},TARGET:{warWith:['PLAYER']},OTHER:{allies:['TARGET']}},
   units:[{id:'army',nation_code:'PLAYER',region_id:'home'},{id:'opponent',nation_code:'TARGET',region_id:'capital'},{id:'third_party',nation_code:'OTHER',region_id:'foreign'}],
   campaigns:[{id:'campaign',source_action_id:'order',target:'TARGET',status:'active'}],chats:[{participant_nations:['PLAYER','TARGET'],is_active:true}]};
  const surrender={action:'annex',campaign_id:'campaign',title:'Government accepts settlement',surrendered:true,report:'The government agrees to surrender and annexation after negotiations.',day_offset:10};
  const committed=structuredClone(state);
  const effects=resolveCampaigns(engine,committed,[surrender],new Set(),30);
  assert.equal(effects.length,1);assert.equal(committed.nations.TARGET.annexed_by,'PLAYER');
  assert.equal(committed.owners.capital,'PLAYER');assert.equal(committed.owners.remaining,'PLAYER');assert.equal(committed.owners.foreign,undefined);
  assert.deepEqual(committed.units.map(u=>u.id),['army','third_party']);assert.equal(committed.units[0].region_id,'home');
  assert.deepEqual(committed.nations.PLAYER.warWith,['OTHER']);assert.equal(committed.chats[0].is_active,false);
  for(const invalid of [{surrendered:false},{report:''},{day_offset:31}]) {
   const preview=structuredClone(state);
   assert.throws(()=>resolveCampaigns(engine,preview,[{...surrender,...invalid}],new Set(),30),/surrender report|outside the turn/);
   assert.equal(preview.nations.TARGET.annexed_by,undefined);assert.deepEqual(preview.owners,{});
  }
  const paused=structuredClone(state);paused.campaigns[0].status='held';paused.campaigns[0].manual_hold=true;
  assert.equal(resolveCampaigns(engine,paused,[surrender],new Set(),30).length,0);assert.equal(paused.nations.TARGET.annexed_by,undefined);
  const occupied=structuredClone(state);occupied.owners.capital='PLAYER';
  assert.equal(resolveCampaigns(engine,occupied,[],new Set(),30).length,0);assert.equal(occupied.nations.TARGET.annexed_by,undefined,'Capital capture cannot force surrender');
  const context={actions:[],campaigns:state.campaigns,recruitment:{existingUnits:state.units}};
  assert.throws(()=>validateOperations({unit_changes:[],campaign_orders:[{...surrender,campaign_id:'invented_campaign'}]},context),/Unknown campaign_id/);
 }
 console.log('Actual AI surrender, unfinished annexation objectives, political settlement without capital capture, war cleanup and integrity boundaries passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
