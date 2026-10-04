const assert=require('node:assert/strict');
const {resolveCampaigns}=require('../backend/services/campaigns');
const {landGraph}=require('../backend/services/movement');
for(const era of ['1910','1936','2010']) {
 const regions=[0,1,2,3].map(i=>({id:`p${i}`,name:`Province ${i}`,nation_code:i===2?'ENEMY':'PLAYER',path:`M${i*100} 0h100v100h-100z`,marker_anchor:[i*100+50,50]}));
 const engine={scenarios:{getMap:()=>({regions}),getScenario:()=>({unitCatalog:{infantry:{landSpeed:10}}})},
  getRegionController:(s,r)=>s.owners[r.id]||r.nation_code,setRegionController:(s,id,nation)=>{s.owners[id]=nation;}};
 const state={scenarioId:era,currentDate:`${era}-01-01`,playerNationCode:'PLAYER',owners:{},nations:{PLAYER:{warWith:['ENEMY']},ENEMY:{warWith:['PLAYER'],name:'Opponent'}},
  units:[{id:'army',name:'Front army',unit_type:'infantry',nation_code:'PLAYER',region_id:'p1',strength:100,organization:100}],
  campaigns:[{id:'campaign',target:'ENEMY',status:'active',source_action_id:'standing'}]};
 const report={action:'battle',campaign_id:'campaign',title:'Enemy counterattack',report:'The enemy forces us to withdraw, inflicting losses and taking the border province.',day_offset:10,outcome:'retreat',
  movements:[{unit_id:'army',region_id:'p0'}],losses:[{unit_id:'army',strength:70,organization:60}],enemy_captures:['p1']};
 const saved=structuredClone(state),effect=resolveCampaigns(engine,saved,[report],new Set(),30)[0];
 assert.equal(saved.units[0].region_id,'p0');assert.equal(saved.units[0].strength,70);assert.equal(saved.units[0].organization,60);
 assert.equal(saved.owners.p1,'ENEMY');assert.deepEqual(effect.lost_regions,['p1']);assert(effect.reason.includes('70'));
 const destroyed=structuredClone(state),annihilation={...report,outcome:'hold',movements:[],losses:[{unit_id:'army',destroyed:true}]};
 const loss=resolveCampaigns(engine,destroyed,[annihilation],new Set(),30)[0];
 assert.equal(destroyed.units.length,0);assert.equal(destroyed.owners.p1,'ENEMY');assert.equal(loss.changes[0].action,'destroyed');
 assert.throws(()=>resolveCampaigns(engine,structuredClone(state),[{...annihilation,losses:[]}],new Set(),30),/stationed player formations/);
 assert.throws(()=>resolveCampaigns(engine,structuredClone(state),[{...report,losses:[{unit_id:'invented',destroyed:true}]}],new Set(),30),/Unknown formation/);
 assert.throws(()=>resolveCampaigns(engine,structuredClone(state),[{...report,losses:[{unit_id:'army',strength:150}]}],new Set(),30),/0 to 100/);
 // Use a held report with a destroyed formation so p0 is vacant but isolated.
 assert.throws(()=>resolveCampaigns(engine,structuredClone(state),[{...annihilation,enemy_captures:['p0']}],new Set(),30),/connected land front/);
 assert(landGraph(regions).get('p1').neighbors.has('p2'));
}
console.log('All eras: retreat losses, destruction, enemy territorial gains and impossible counterattack rejection passed');
