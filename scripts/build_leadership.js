/* Reproducible, opt-in historical data import. No game/provider credentials used.
 * Wikidata statements are accepted only with a dated term spanning scenario start.
 * Existing curated profiles win. Portraits require an explicit reusable licence.
 */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const write=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2)+'\n');
const profiles=read('data/leadership-profiles.json'),portraits=read('data/leader-portraits.json'),timeline=read('data/leadership-timeline.json');
const cache=path.join(root,'data/debug/leadership-import');fs.mkdirSync(cache,{recursive:true});
const errors=[];
let lastRequest=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(base,params) {
 const url=base+'?'+new URLSearchParams({...params,format:'json'});
 const key=require('node:crypto').createHash('sha256').update(url).digest('hex');
 const file=path.join(cache,key+'.json');
 if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
 await delay(Math.max(0,1500-(Date.now()-lastRequest)));lastRequest=Date.now();
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(60000)});}catch(e){throw new Error(`${new URL(base).hostname}: ${e.message}; query ${String(params.ids||params.titles).slice(0,80)}`);}
 if(response.status===429){const retry=Number(response.headers.get('retry-after'))||60;if(retry>60)throw new Error('RATE_LIMIT: retry after '+retry+' seconds; progress cached');await delay(60000);lastRequest=Date.now();response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(response.status===429)throw new Error('RATE_LIMIT: import stopped; rerun later using cached progress');}
 if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(base).hostname}`);
 const data=await response.json();if(data.error)throw new Error(data.error.info);
 fs.writeFileSync(file,JSON.stringify(data));return data;
}
const entities=new Map(),pageIds=new Map(),imageInfos=new Map();
async function entity(id){if(!entities.has(id))entities.set(id,(await request('https://www.wikidata.org/w/api.php',{action:'wbgetentities',ids:id,props:'claims|labels|info',languages:'en'})).entities[id]);return entities.get(id);}
async function pageEntity(title) {
 if(!pageIds.has(title))await preloadPages([title]);return pageIds.get(title);
}
async function preloadPages(titles){
 titles=[...new Set(titles)];
 for(let i=0;i<titles.length;i+=40){
  const batch=titles.slice(i,i+40),data=await request('https://en.wikipedia.org/w/api.php',{action:'query',titles:batch.join('|'),redirects:1,prop:'pageprops',ppprop:'wikibase_item'});
  const redirects=new Map([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map(r=>[r.from,r.to]));
  for(const original of batch){let title=original;for(let hop=0;hop<10&&redirects.has(title);hop++)title=redirects.get(title);pageIds.set(original,Object.values(data.query?.pages||{}).find(p=>p.title===title)?.pageprops?.wikibase_item);}
 }
}
async function preloadEntities(ids){
 ids=[...new Set(ids.filter(Boolean))];
 for(let i=0;i<ids.length;i+=10){const data=await request('https://www.wikidata.org/w/api.php',{action:'wbgetentities',ids:ids.slice(i,i+10).join('|'),props:'claims|labels|info',languages:'en'});for(const [id,e] of Object.entries(data.entities||{}))entities.set(id,e);}
}
async function preloadImages(files){
 files=[...new Set(files.filter(Boolean))];
 for(let i=0;i<files.length;i+=30){
  const batch=files.slice(i,i+30),data=await request('https://commons.wikimedia.org/w/api.php',{action:'query',titles:batch.map(f=>'File:'+f).join('|'),redirects:1,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:320});
  const redirects=new Map([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map(r=>[r.from,r.to]));
  const pages=Object.values(data.query?.pages||{});
  for(const original of batch){let title='File:'+original;for(let hop=0;hop<10&&redirects.has(title);hop++)title=redirects.get(title);imageInfos.set(original.replaceAll('_',' '),pages.find(p=>p.title===title)?.imageinfo?.[0]);}
 }
}
const value=s=>s?.mainsnak?.datavalue?.value;
const time=q=>q?.find(s=>s.datavalue?.value?.precision>=11)?.datavalue?.value?.time?.slice(1,11);
function bound(qualifiers,isStart){
 const v=qualifiers?.find(s=>s.datavalue?.value?.precision>=9)?.datavalue?.value;if(!v)return null;
 const raw=v.time.slice(1,11);
 if(v.precision>=11)return raw;
 if(v.precision===10)return raw.slice(0,7)+(isStart?'-31':'-01');
 return raw.slice(0,4)+(isStart?'-12-31':'-01-01');
}
function term(claims,date) {
 return (claims||[]).filter(s=>s.rank!=='deprecated' && value(s)?.id && bound(s.qualifiers?.P580,true) &&
   bound(s.qualifiers.P580,true)<=date && (bound(s.qualifiers.P582,false)>date || (!s.qualifiers.P582 && s.rank==='preferred')))
   .sort((a,b)=>bound(b.qualifiers.P580,true).localeCompare(bound(a.qualifiers.P580,true)))[0];
}
const aliases={'United States of America':'United States','German Federal Republic':'Germany','Surinam':'Suriname',
 'Macedonia (FYROM/North Macedonia)':'North Macedonia','Bosnia-Herzegovina':'Bosnia and Herzegovina',
 'Belarus (Byelorussia)':'Belarus',"Cote D'Ivoire":'Ivory Coast','Burkina Faso (Upper Volta)':'Burkina Faso',
 'Congo':'Republic of the Congo','Tanzania (Tanganyika)':'Tanzania','Zimbabwe (Rhodesia)':'Zimbabwe',
 'Swaziland':'Eswatini','Yemen (Arab Republic of Yemen)':'Yemen','Kyrgyz Republic':'Kyrgyzstan',
 "Korea, People's Republic of":'North Korea','Korea, Republic of':'South Korea','Myanmar (Burma)':'Myanmar',
 'Cambodia (Kampuchea)':'Cambodia','Vietnam, Democratic Republic of':'Vietnam','Newfoundland':'Dominion of Newfoundland',
 'Danzig':'Free City of Danzig','Persia':'Qajar Iran','Oman':'Muscat and Oman'};
const countryTitle=n=>(n.scenario!=='world-2010' && n.nation.name==='Italy')?'Kingdom of Italy':(n.scenario==='ww2-geographic' && n.nation.name==='Germany')?'Nazi Germany':aliases[n.nation.name]||n.nation.name;
const label=e=>e?.labels?.en?.value;
const strip=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
async function importNation(scenario,code,nation,date) {
 if(nation.playable===false)return;
 const id=await pageEntity(countryTitle({scenario,nation}));if(!id)return;
 const country=await entity(id),government=term(country.claims?.P6,date),head=term(country.claims?.P35,date),chosen=government||head;
 if(!chosen)return;
 const person=await entity(value(chosen).id);if(!label(person))return;
 const profile={leader_name:label(person),leader_title:government?'Head of Government':'Head of State',
   leadership_source:`https://www.wikidata.org/wiki/${id}`,leadership_revision:country.lastrevid,
   leader_entity:person.id,term_start:bound(chosen.qualifiers.P580,true),term_end:bound(chosen.qualifiers.P582,false),term_dates_are_conservative_bounds:!time(chosen.qualifiers.P580)||!time(chosen.qualifiers.P582)};
 if(head && value(head).id!==person.id)profile.head_of_state=label(await entity(value(head).id));
 const party=term(person.claims?.P102,date);
 if(party)profile.ruling_party=label(await entity(value(party).id));
 if(!profiles[scenario][code]?.leader_name){profiles[scenario][code]=profile;console.log('Profile:',scenario,code,profile.leader_name);write('data/leadership-profiles.json',profiles);}
 // Only extend schedules when the chosen office agrees with the curated leader.
 // This prevents replacing an executive monarch with a ceremonial/other office.
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 if(normalize(profiles[scenario][code].leader_name)!==normalize(profile.leader_name))return;
 const terms=(country.claims[government?'P6':'P35']||[]).filter(s=>s.rank!=='deprecated' && value(s)?.id && time(s.qualifiers?.P580)>date && time(s.qualifiers.P582) && Number(time(s.qualifiers.P580).slice(0,4))<=Number(date.slice(0,4))+15);
 timeline[scenario] ||= [];
 for(const statement of terms){
  const start=time(statement.qualifiers.P580);if(timeline[scenario].some(e=>e.nation===code&&e.date===start))continue;
  const successor=await entity(value(statement).id);if(!label(successor))continue;
  const next={leader_name:label(successor),leader_title:profile.leader_title,leader_entity:successor.id,ruling_party:null,ideology:null};
  const party=term(successor.claims?.P102,start);if(party)next.ruling_party=label(await entity(value(party).id));
  timeline[scenario].push({nation:code,date:start,profile:next,source:`https://www.wikidata.org/wiki/${id}`,revision:country.lastrevid});
 }
 timeline[scenario].sort((a,b)=>a.date.localeCompare(b.date));write('data/leadership-timeline.json',timeline);
}
// Reviewed name candidates only become profiles after a dated national office
// statement spans the scenario start. Missing evidence remains a coverage gap.
async function importCandidates(scenarios) {
 const candidates=read('scripts/leadership-candidates.json');
 const pending=Object.entries(candidates).flatMap(([scenario,rows])=>Object.entries(rows).filter(([code])=>!profiles[scenario][code]?.leader_name).map(([code,name])=>({scenario,code,name,date:scenarios[scenario]})));
 await preloadPages(pending.map(p=>p.name));
 await preloadEntities(pending.map(p=>pageIds.get(p.name)));
 const dated=pending.map(p=>({...p,person:entities.get(pageIds.get(p.name))})).map(p=>({...p,terms:(p.person?.claims?.P39||[]).filter(s=>term([s],p.date))}));
 await preloadEntities(dated.flatMap(p=>p.terms.map(s=>value(s)?.id)));
 for(const p of dated) {
  const accepted=p.terms.filter(s=>{
   const role=label(entities.get(value(s)?.id))||'';
   return /^(prime minister|premier|president|sultan|king|regent|viceroy|governor|state elder|head of state)/i.test(role) && !/(party|parliament|assembly|chamber|senate(?! of the Free City)|municipal|university|association|bank|pro tempore|Union of|African Union|United Nations)/i.test(role);
  });
  if(!accepted.length)continue;
  const statement=accepted.sort((a,b)=>bound(b.qualifiers.P580,true).localeCompare(bound(a.qualifiers.P580,true)))[0];
  const role=label(entities.get(value(statement).id));
  profiles[p.scenario][p.code]={leader_name:label(p.person),leader_title:role,leader_entity:p.person.id,
   leadership_source:'https://www.wikidata.org/wiki/'+p.person.id,leadership_revision:p.person.lastrevid,
   term_start:bound(statement.qualifiers.P580,true),term_end:bound(statement.qualifiers.P582,false)};
  const party=term(p.person.claims?.P102,p.date);
  if(party)profiles[p.scenario][p.code].ruling_party=label(await entity(value(party).id));
  console.log('Office-verified profile:',p.scenario,p.code,label(p.person),'—',role);
 }
 write('data/leadership-profiles.json',profiles);
}
const titleAliases={'Zaifeng, Prince Chun':'Zaifeng, Prince Chun','Nicholas II':'Nicholas II of Russia','Franz Joseph I':'Franz Joseph I of Austria','Wilhelm II':'Wilhelm II, German Emperor','Peter I':'Peter I of Serbia','Nicholas I':'Nicholas I of Montenegro','George I':'George I of Greece','Gustaf V':'Gustaf V of Sweden','Albert I':'Albert I of Belgium','Frederick VIII':'Frederick VIII of Denmark','Manuel II':'Manuel II of Portugal','Ferdinand I':'Ferdinand I of Bulgaria','Carol I':'Carol I of Romania','George II':'George II of Greece','Fuad I':'Fuad I of Egypt'};
Object.assign(titleAliases,{'Abbas II':'Abbas II of Egypt','Albert Meyer':'Albert Meyer (politician)','Ghazi':'Ghazi of Iraq','Abdullah II':'Abdullah II of Jordan','Haakon VII':'Haakon VII of Norway','Gilbert Elliot-Murray-Kynynmound, Earl of Minto':'Gilbert Elliot-Murray-Kynynmound, 4th Earl of Minto'});
async function importPortrait(name,profile) {
 if(portraits[name] || profile.leader_portrait)return;

 const id=profile.leader_entity||await pageEntity(titleAliases[name]||name);if(!id)return;
 const person=await entity(id);
 // Do not accidentally use a disambiguation page, office, dynasty or country.
 if(!(person.claims?.P31||[]).some(s=>value(s)?.id==='Q5'))return;
 const image=(person.claims?.P18||[]).filter(s=>s.rank!=='deprecated').sort((a,b)=>(b.rank==='preferred')-(a.rank==='preferred'))[0];
 if(typeof value(image)!=='string')return;
 const fileName=value(image).replaceAll('_',' ');if(!imageInfos.has(fileName))await preloadImages([fileName]);
 const info=imageInfos.get(fileName),meta=info?.extmetadata;
 const licence=meta?.LicenseShortName?.value||'';
 if(!/^(Public domain|CC0|CC BY(?:-SA)? [1234]\.0|PDM)/i.test(licence))return;
 const url=info.thumburl||info.url;
 if(!url || !['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(url).hostname))return;
 await delay(Math.max(0,1500-(Date.now()-lastRequest)));lastRequest=Date.now();
 const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(response.status===429)throw new Error('RATE_LIMIT: portrait import stopped; rerun later');if(!response.ok)throw new Error(`Portrait download ${response.status}: ${name}`);
 const bytes=Buffer.from(await response.arrayBuffer());const extension=bytes[0]===255&&bytes[1]===216?'jpg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':null;if(bytes.length>5*1024*1024 || !extension)return;
 const file=`${id.toLowerCase()}.${extension}`;fs.writeFileSync(path.join(root,'frontend/assets/leaders',file),bytes);
 portraits[name]={leader_portrait:'/assets/leaders/'+file,portrait_leader:name,portrait_credit:`${strip(meta.Artist?.value)||'Unknown photographer'} · ${licence} · Wikimedia thumbnail`,
   portrait_source:info.descriptionurl,portrait_license:meta.LicenseUrl?.value||null,portrait_date:strip(meta.DateTimeOriginal?.value),download_url:url};
 write('data/leader-portraits.json',portraits);console.log('Portrait:',name);
}
async function pool(items,fn) {
 let index=0;
 await Promise.all(Array.from({length:1},async()=>{while(index<items.length){const item=items[index++];try{await fn(item);}catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({item:item.name||item.code||item[0],error:e.message});}}}));
}
(async()=>{
 const scenarios={'ww1-1910':'1910-01-01','ww2-geographic':'1936-01-01','world-2010':'2010-01-01'};
 const nations=[];for(const [scenario,date] of Object.entries(scenarios))for(const [code,nation] of Object.entries(read(`data/scenarios/${scenario}/nations.json`)))nations.push({scenario,date,code,nation});
 if(!process.argv.includes('--portraits')){
  const eligible=nations.filter(n=>n.nation.playable!==false);
  await preloadPages(eligible.map(countryTitle));
  await preloadEntities([...pageIds.values()]);
  const ids=[];
  for(const n of eligible){const e=entities.get(pageIds.get(countryTitle(n)));for(const key of ['P6','P35'])for(const statement of e?.claims?.[key]||[]){const start=time(statement.qualifiers?.P580),end=time(statement.qualifiers?.P582);if(start && start.slice(0,4)<=String(Number(n.date.slice(0,4))+15) && (!end||end>n.date))ids.push(value(statement)?.id);}}
  await preloadEntities(ids);
  await pool(eligible,n=>importNation(n.scenario,n.code,n.nation,n.date));
  await importCandidates(scenarios);
 }
 write('data/leadership-profiles.json',profiles);
 console.log('Dated profiles:',Object.fromEntries(Object.entries(profiles).map(([s,p])=>[s,Object.keys(p).length])));
 const people=new Map(Object.values(profiles).flatMap(p=>Object.values(p)).map(p=>[p.leader_name,p]));
 for(const entries of Object.values(read('data/leadership-timeline.json')))for(const entry of entries)if(entry.profile.leader_name)people.set(entry.profile.leader_name,entry.profile);
 const pending=[...people].filter(([name,p])=>!portraits[name]&&!p.leader_portrait);
 await preloadPages(pending.filter(([,p])=>!p.leader_entity).map(([name])=>titleAliases[name]||name));
 await preloadEntities(pending.map(([name,p])=>p.leader_entity||pageIds.get(titleAliases[name]||name)));
 await preloadImages(pending.map(([name,p])=>entities.get(p.leader_entity||pageIds.get(titleAliases[name]||name))).map(e=>value((e?.claims?.P18||[]).filter(s=>s.rank!=='deprecated').sort((a,b)=>(b.rank==='preferred')-(a.rank==='preferred'))[0])).filter(v=>typeof v==='string'));
 await pool(pending,([name,p])=>importPortrait(name,p));write('data/leader-portraits.json',portraits);
 const coverage={generated:new Date().toISOString(),scenarios:{},errors};
 for(const scenario of Object.keys(scenarios)) {
  const list=nations.filter(n=>n.scenario===scenario && n.nation.playable!==false);
  coverage.scenarios[scenario]={total:list.length,withLeader:list.filter(n=>profiles[scenario][n.code]?.leader_name).length,
   withPortrait:list.filter(n=>portraits[profiles[scenario][n.code]?.leader_name]||profiles[scenario][n.code]?.leader_portrait).length,
   missingLeaders:list.filter(n=>!profiles[scenario][n.code]?.leader_name).map(n=>({code:n.code,name:n.nation.name})),
   missingPortraits:list.filter(n=>!portraits[profiles[scenario][n.code]?.leader_name]&&!profiles[scenario][n.code]?.leader_portrait).map(n=>({code:n.code,name:n.nation.name,leader:profiles[scenario][n.code]?.leader_name||null}))};
 }
 write('data/leadership-coverage.json',coverage);require('./build_leader_credits')();console.log('Portraits:',Object.keys(portraits).length,'Import errors:',errors.length);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
