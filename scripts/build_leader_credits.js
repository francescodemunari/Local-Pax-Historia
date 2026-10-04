const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function buildCredits(){
 const portraits=JSON.parse(fs.readFileSync(path.join(root,'data/leader-portraits.json'),'utf8'));
 const profiles=JSON.parse(fs.readFileSync(path.join(root,'data/leadership-profiles.json'),'utf8'));
 for(const records of Object.values(profiles))for(const p of Object.values(records))if(p.leader_portrait&&!portraits[p.leader_name])portraits[p.leader_name]=p;
 const clean=s=>String(s||'').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
 const rows=['# Leader portrait credits','','These local thumbnails are supplied with the individual attribution and licence below. Source pages document authorship and reuse terms. Files are downloaded unchanged; the game crops them for display. Photo dates may differ from a scenario start. Uploaded player images are not part of this catalogue.','','Regenerate with `node scripts/build_leader_credits.js`.','','| Person | Asset | Credit | Source and licence |','| --- | --- | --- | --- |'];
 for(const [name,p] of Object.entries(portraits).sort(([a],[b])=>a.localeCompare(b))){
  const links=[p.portrait_source&&`[Source](<${p.portrait_source}>)`,p.portrait_license&&`[Licence](<${p.portrait_license}>)`].filter(Boolean).join(' · ');
  rows.push(`| ${clean(name)} | ${path.basename(p.leader_portrait)} | ${clean(p.portrait_credit)} | ${links} |`);
 }
 fs.writeFileSync(path.join(root,'frontend/assets/leaders/CREDITS.md'),rows.join('\n')+'\n');
}
if(require.main===module)buildCredits();
module.exports=buildCredits;
