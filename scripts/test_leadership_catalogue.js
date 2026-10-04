const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const profiles=read('data/leadership-profiles.json'),timeline=read('data/leadership-timeline.json'),portraits=read('data/leader-portraits.json');
function image(record){
 if(!record.leader_portrait)return;
 assert.match(record.leader_portrait,/^\/assets\/leaders\/[a-z0-9-]+\.(jpg|png|webp)$/i);
 assert(fs.statSync(path.join(root,'frontend',record.leader_portrait)).size>0,'Missing portrait '+record.leader_portrait);
 assert(record.portrait_credit&&record.portrait_source,'Bundled portraits need attribution and source');
 assert.equal(new URL(record.portrait_source).protocol,'https:');
}
for(const [scenario,records] of Object.entries(profiles)){
 const nations=read(`data/scenarios/${scenario}/nations.json`);
 for(const [code,nation] of Object.entries(nations))if(nation.playable!==false)assert(records[code]?.leader_name,`Missing starting leadership: ${scenario}/${code}`);
 for(const [code,p] of Object.entries(records)){assert(nations[code],`Unknown ${scenario} nation ${code}`);assert(p.leader_name);image(p);}
 let previous='';const seen=new Set();
 for(const entry of timeline[scenario]||[]){
  assert(nations[entry.nation],`Unknown scheduled nation ${entry.nation}`);
  assert.equal(new Date(entry.date).toISOString().slice(0,10),entry.date);
  assert(entry.date>=previous,'Timeline must be chronological');previous=entry.date;
  const key=entry.nation+'/'+entry.date;assert(!seen.has(key),'Duplicate transition '+key);seen.add(key);
  assert(entry.profile.leader_name||entry.profile.head_of_state);
  assert(entry.source,'Transition needs source');
 }
}
for(const [person,record] of Object.entries(portraits)){assert.equal(record.portrait_leader,person);image(record);}
assert(fs.existsSync(path.join(root,'frontend/assets/leaders/CREDITS.md')));
console.log('Leadership catalogue IDs, dates, sources and local portrait assets passed');
