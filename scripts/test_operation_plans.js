const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Engine=require('../backend/services/game-engine'),llm=require('../backend/services/llm-service');
const {compileOperationPlans}=require('../backend/services/operation-plan');
const {validateOperations}=require('../backend/services/operation-contract');
const {resolveFormation}=require('../backend/services/formation-references');
const {findLandRoute}=require('../backend/services/movement');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');

async function run() {
 const engine=new Engine(),original=llm.generateEvents;
 try {
  for(const mode of ['next_event','1_month']) {
   const game=await engine.createGame('ITA',undefined,'ww2-geographic');
   try {
    await engine.processPlayerAction(game.save_id,'Start the invasion of Ethiopia from north and south, Eritrea and Somalia, with all land and air forces.');
    const before=await engine.loadGame(game.save_id);
    const regions=engine.scenarios.getMap(before.scenarioId).regions,by=new Map(regions.map(r=>[r.id,r]));
    const north=regions.find(r=>r.nation_code==='ITA'&&r.name==='Southern Red Sea'&&r.neighbors.some(id=>by.get(id)?.nation_code==='ETH'));
    const south=by.get('g5200_aETH-3134_f0');
    const spec=engine.scenarios.getScenario(before.scenarioId).unitCatalog.infantry;
    const destination=from=>from.neighbors.map(id=>by.get(id)).find(r=>r.nation_code==='ETH' &&
     findLandRoute(regions,from.id,r.id,'infantry',r=>['ITA','ETH'].includes(r.nation_code),spec.landSpeed,spec.landKmPerDay)?.required_days<=20);
    const n=destination(north),s=destination(south);assert(n&&s,'Both real map fronts have feasible enemy destinations');
    let calls=0,context,corrected;
    const sandbox={structuredClone,PROMPTS:llm.PROMPTS,getHistoricalRoadmapContext:()=>'',console,path,
     __dirname:path.join(__dirname,'../backend/services'),fs:{existsSync:()=>true,writeFileSync(){}},
     require:name=>require(path.join(__dirname,'../backend/services',name)),
     executeChatCompletion:async messages=>{
      calls++;
      if(calls===1) {
       const action=context.actions[0].id;
       const fronts=[{id:'north',name:'Northern Front (Eritrea)',status:'ready',region_id:north.id},{id:'south',name:'Southern Front (Somalia)',status:'ready',region_id:south.id}];
       const op={kind:'invasion',status:'proceed',target_nation_code:'ETH',reason:'A coordinated offensive.',fronts,
        formations:[{formation_ref:'north_ground',unit_type:'infantry',name:'Northern division',region_id:north.id},
         {formation_ref:'south_ground',unit_type:'infantry',name:'Southern division',region_id:south.id},
         {formation_ref:'wing',unit_type:'air',name:'Air wing',region_id:north.id}],
        reports:[{action:'battle',title:'Border offensive',report:'Ground formations take the border positions after fighting, supported by reconnaissance. Resistance continues inland.',outcome:'advance',day_offset:20,
         movements:[{formation_ref:'north_ground',region_id:n.id},{formation_ref:'south_ground',region_id:s.id}],
         support:[{formation_ref:'wing',region_id:n.id,mission:'Reconnaissance'}]}]};
       corrected={action_resolutions:[{action_id:action,summary:'Border offensive',operation:op}],unit_changes:[],campaign_orders:[]};
       const bad=structuredClone(corrected);
       bad.elapsed_days=20;
       bad.events=[{title:'French domestic reform',description:'An independent reform.',game_date:'1936-01-10',severity:'minor',affected_nations:['FRA']},
        {title:'German research',description:'Independent research.',game_date:'1936-01-12',severity:'minor',affected_nations:['GER']}];
       bad.diplomatic_changes=[];bad.consequences='Preserved world context';
       if(mode==='next_event') {
        bad.action_resolutions[0].operation.formations.pop();
        bad.action_resolutions[0].operation.reports[0].movements=[{unit_id:'unit_ita_north_1',region_id:n.id}];
        bad.action_resolutions[0].operation.reports[0].support=[];
       } else {
        // Structurally valid IDs with impossible travel must reach repair too.
        bad.action_resolutions[0].operation.reports[0].movements[0].region_id=regions.find(r=>r.nation_code==='ITA'&&r.name==='Rome').id;
       }
       return {content:JSON.stringify(bad)};
      }
      assert.equal(calls,2,'Only one repair request');
      const prompt=messages.at(-1).content;
      assert(prompt.includes('military section only'));
      if(mode==='next_event')for(const issue of ['Unknown formation unit_ita_north_1','Northern Front','Southern Front','air forces'])assert(prompt.includes(issue),issue);
      else assert(prompt.includes('feasible connected route'),'Engine route rejection is included in repair');
      // A military repair cannot erase unrelated world news or change time.
      return {content:JSON.stringify({...corrected,elapsed_days:90,consequences:'Discard this replacement'})};
     }};
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',sandbox);
    llm.generateEvents=async(jump,ctx)=>{context=ctx;return sandbox.generate(jump,ctx);};
    const turn=await engine.advanceTime(game.save_id,mode),state=await engine.loadGame(game.save_id);
    assert.equal(calls,2);
    assert.equal(state.units.length,3,'Exactly two ground formations and one air wing');
    assert.equal(state.units.find(u=>u.name==='Northern division').region_id,n.id);
    assert.equal(state.units.find(u=>u.name==='Southern division').region_id,s.id);
    assert.equal(state.units.find(u=>u.name==='Air wing').mission.target_region_id,n.id);
    assert.equal(engine.getRegionController(state,n),'ITA');assert.equal(engine.getRegionController(state,s),'ITA');
    assert.equal(state.currentDate,mode==='next_event'?'1936-01-21':'1936-02-01');
    assert.equal(turn.events.find(e=>e.campaign_effect).severity,'moderate','Ordinary border gains are not major milestones');
    if(mode==='next_event')assert(turn.next_event_checkpoint && !turn.next_event_horizon_reached,'A border battle is a checkpoint, not an invented milestone or quiet year');
    assert(turn.events.some(e=>e.title==='French domestic reform'),'Unrelated news survives repair');
    const battle=turn.events.find(e=>e.campaign_effect);
    assert.equal(battle.applied_unit_changes.length,2);
    assert(battle.description.includes('Recorded map effects:')&&battle.description.includes('Air wing'));
    assert(!state.units.some(u=>u.id==='north_ground'||u.formation_ref),'Turn-local aliases never become saved unit IDs');
    const compiled=compileOperationPlans(structuredClone(corrected),context);
    const duplicate=structuredClone(compiled);duplicate.unit_changes[1].formation_ref='north_ground';
    assert.throws(()=>validateOperations(duplicate,context),/unique|Ambiguous/);
    const held=structuredClone(compiled);
    held.campaign_orders[1].movements.pop();
    held.campaign_orders.push({action:'battle',campaign_id:held.campaign_orders[1].campaign_id,title:'Southern front held',report:'Supply delays prevent movement.',outcome:'hold',day_offset:20,front_ids:['south'],movements:[],support:[]});
    validateOperations(held,context);
    assert(resolveFormation({formation_ref:'north_ground'},state.units,[]).error,'Aliases cannot bind troops from an earlier turn');
   } finally {await engine.deleteSave(game.save_id);}
  }
  console.log('Nested operations, aggregated repair, real north/south movement, air support, route preflight and preserved world events passed in both turn modes');
 } finally {llm.generateEvents=original;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
