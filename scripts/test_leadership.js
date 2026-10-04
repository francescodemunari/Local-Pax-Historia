const assert=require('node:assert/strict');
const E=require('../backend/services/game-engine');
(async()=>{
 const engine=new E();const game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try {
  let state=await engine.loadGame(game.save_id);
  assert.equal(engine.getEffectiveNations(state).ITA.leader_name,'Benito Mussolini');
  assert.equal(engine.getEffectiveNations(state).ITA.ruling_party,'National Fascist Party');
  engine.applyModelStateChanges(state,{ITA:{leader_name:'New leader',ruling_party:'Reform coalition',ideology:'democratic',head_of_state:'New president'}});
  state.nations.ITA.leader_portrait='data:image/jpeg;base64,/9j/2Q==';state.nations.ITA.portrait_leader='New leader';
  engine.saveGame(game.save_id,state);state=await engine.loadGame(game.save_id);
  const nation=engine.getEffectiveNations(state).ITA;
  assert.equal(nation.leader_name,'New leader');assert.equal(nation.ruling_party,'Reform coalition');assert.equal(nation.portrait_leader,'New leader');
  assert.equal(engine.getNations('ww2-geographic').ITA.leader_name,'Benito Mussolini','Save changes must not mutate scenario defaults');
  assert.equal(engine.getNations('ww1-1910').ITA.leader_name,'Sidney Sonnino');
  assert.equal(engine.getNations('world-2010').ITA.leader_name,'Silvio Berlusconi');
  assert.equal(engine.getNations('world-2010').AKA.leader_name,'Angela Merkel');
  const historical={scenarioId:'ww1-1910',currentDate:'1910-03-30',nations:{ITA:{},ENG:{}}};
  assert.equal(engine.getEffectiveNations(historical).ITA.leader_name,'Sidney Sonnino');
  historical.currentDate='1910-03-31';
  assert.equal(engine.getEffectiveNations(historical).ITA.leader_name,'Luigi Luzzatti');
  historical.nations.ITA={portrait_leader:'Sidney Sonnino',leader_portrait:'data:image/jpeg;base64,old'};
  assert.equal(engine.getEffectiveNations(historical).ITA.portrait_leader,'Luigi Luzzatti');
  assert.notEqual(engine.getEffectiveNations(historical).ITA.leader_portrait,'data:image/jpeg;base64,old');
  historical.currentDate='1911-03-30';
  assert.equal(engine.getEffectiveNations(historical).ITA.leader_name,'Giovanni Giolitti');
  historical.nations.ITA={leader_name:'Alternative leader'};
  assert.equal(engine.getEffectiveNations(historical).ITA.leader_name,'Alternative leader');
  assert.equal(require('../backend/services/leadership').transitions(historical,'1910-01-01','1911-04-01').filter(t=>t.nation==='ITA').length,0);
  console.log('Dated leadership defaults, saved political changes and portrait persistence passed');
 }finally{await engine.deleteSave(game.save_id);}
})().catch(e=>{console.error(e);process.exitCode=1;});
