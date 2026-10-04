const assert=require('node:assert/strict'),fs=require('node:fs');
const Engine=require('../backend/services/game-engine'),{contains}=require('../backend/services/map-geometry');
(async()=>{
 const engine=new Engine();
 for(const scenario of ['ww1-1910','ww2-geographic','world-2010']){
  const svg=fs.readFileSync(require.resolve(`../frontend/maps/${scenario}.svg`),'utf8');
  assert(!svg.includes('fill="#3b4650"'),'Unmapped land backdrop must not create false coastal strips');
  assert(svg.includes('data-display-component="1"'),'Distant islands should render as bounded components');
 }
 for(const [scenario,prefix,owner,points] of [
  ['ww1-1910','morocco_gap_','MOR',[[-5,35.3],[-11,28.5]]],
  ['ww2-geographic','kuwait_gap_','KWT',[[47.8,29.3]]]]){
  const regions=engine.scenarios.getMap(scenario).regions,added=regions.filter(r=>r.id.startsWith(prefix));
  assert(added.length>0);assert(added.every(r=>r.nation_code===owner));
  for(const [x,y] of points)assert(added.some(r=>contains(r.path,[(x+180)*4,(90-y)*4],'evenodd')),'Reported missing land must be selectable');
  const ids=new Set(regions.map(r=>r.id));for(const r of added)assert(r.neighbors.every(id=>ids.has(id)));
 }
 const game=await engine.createGame('ITA',undefined,'ww2-geographic');
 try {const state=await engine.loadGame(game.save_id);delete state.nations.KWT;engine.saveGame(game.save_id,state);assert((await engine.loadGame(game.save_id)).nations.KWT,'Existing saves acquire supplemented Kuwait');}
 finally{await engine.deleteSave(game.save_id);}
 console.log('Coast backdrops, Morocco/Kuwait province coverage and existing-save migration passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
