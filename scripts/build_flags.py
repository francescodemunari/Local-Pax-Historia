"""Build a local dated flag catalog from a pinned, attributed source dataset."""
import json, re, urllib.request, concurrent.futures
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
source = ROOT/'data/flags'
revision = (source/'source-revision.txt').read_text().strip()
base = f'https://raw.githubusercontent.com/niemela/flags/{revision}/'
if not (source/'source-index.json').exists(): (source/'source-index.json').write_bytes(urllib.request.urlopen(base+'data/flags.json').read())
flags = json.loads((source/'source-index.json').read_text())['flags']
aliases = {'United States of America':'United States','German Empire':'Germany','German Federal Republic':'Germany','Russian Empire':'Russia','Qing Empire':'Qing Dynasty','British India':'British Raj','Orange Free State':'Orange River Colony','Surinam':'Suriname','Czech Republic':'Czechia','Macedonia (FYROM/North Macedonia)':'North Macedonia','Bosnia-Herzegovina':'Bosnia and Herzegovina','Belarus (Byelorussia)':'Belarus',"Cote D'Ivoire":"Côte d'Ivoire",'Burkina Faso (Upper Volta)':'Burkina Faso','Congo':'Republic of the Congo','Tanzania (Tanganyika)':'Tanzania','Zimbabwe (Rhodesia)':'Zimbabwe','Swaziland':'Eswatini','Yemen (Arab Republic of Yemen)':'Yemen','Kyrgyz Republic':'Kyrgyzstan',"Korea, People's Republic of":'North Korea','Korea, Republic of':'South Korea','Myanmar (Burma)':'Myanmar','Cambodia (Kampuchea)':'Cambodia','Vietnam, Democratic Republic of':'Vietnam','East Timor':'Timor-Leste'}
overrides = {1910:{'United Kingdom':'GB','Netherlands':'NL','Panama':'PA','Newfoundland':'CA-NL_1949','Serbia':'kingdom-of-serbia','Montenegro':'kingdom-of-montenegro','Oman':'muscat-and-oman','Thailand':'TH_1916','Natal':'GB','Transvaal':'GB','Canada':'CA_1922','Russia':'RU_1918'},1936:{'United Kingdom':'GB','Yemen (Arab Republic of Yemen)':'mutawakkilite-yemen','Netherlands':'NL','Canada':'CA_1957','Newfoundland':'CA-NL_1949','Tibet':'tibet','Danzig':'free-city-of-danzig','Iraq':'kingdom-of-iraq','Egypt':'kingdom-of-egypt','Oman':'muscat-and-oman','China':'TW','Mongolia':'MN_1940','Ireland':'IE'},2010:{'United Kingdom':'GB'}}
output = ROOT/'frontend/assets/flags';output.mkdir(parents=True,exist_ok=True)
lookup={f['id']:f for f in flags}
selected={};catalog={};missing={}
for scenario,year in [('ww1-1910',1910),('ww2-geographic',1936),('world-2010',2010)]:
 nations=json.loads((ROOT/f'data/scenarios/{scenario}/nations.json').read_text());catalog[scenario]={};missing[scenario]=[]
 for code,n in nations.items():
  name=aliases.get(n['name'],n['name'])
  candidates=[f for f in flags if f['name'].split(' (')[0].casefold()==name.casefold() and ('country' in f['type'] or 'historical' in f['type']) and (not f.get('variant') or any(v in ['civil','state'] for v in f['variant'])) and ('civil' in f.get('variant',[]) or not any(v in ['naval-ensign','royal-standard','presidential-standard','vice-presidential-standard','government','jack'] for v in f.get('variant',[])))]
  forced=overrides.get(year,{}).get(n['name'])
  if forced:candidates=[lookup[forced]]
  valid=[f for f in candidates if any((a is None or a<=year) and (b is None or year<=b) for a,b in f.get('t',[[None,None]]))]
  if forced:valid=candidates
  if not valid:missing[scenario].append(n['name']);continue
  # Prefer an explicitly dated historical variant over an overlapping generic record.
  valid.sort(key=lambda f:max((a or 0) for a,b in f.get('t',[[None,None]])),reverse=True)
  chosen=valid[0]
  # Keep matching national identity variants for date lookup; don't cross to unrelated successor states.
  variants=candidates if not forced else valid
  catalog[scenario][code]={'initial':chosen['id'],'variants':[f['id'] for f in variants]}
  for f in variants:selected[f['id']]=f

previous = json.loads((source/'catalog.json').read_text(encoding='utf-8'))['flags'] if (source/'catalog.json').exists() else {}
def fetch(id):
 if id in previous and (output/(id+'.svg')).exists():return id,previous[id]
 meta=json.load(urllib.request.urlopen(base+'data/'+id+'.json',timeout=30))
 image=urllib.request.urlopen(base+'data/'+id+'.svg',timeout=30).read()
 # Serve as an image only; reject active or externally dependent SVG content.
 if re.search(rb'<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|xlink:href)\s*=\s*[\"\'](?:https?:|javascript:)',image,re.I):raise ValueError('Active SVG: '+id)
 (output/(id+'.svg')).write_bytes(image)
 return id,{'name':meta['name'],'periods':meta.get('periods',[]),'sources':meta.get('sources',[]),'file':'/assets/flags/'+id+'.svg'}
records={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 futures={pool.submit(fetch,id):id for id in selected}
 for future in concurrent.futures.as_completed(futures):
  try:id,record=future.result();records[id]=record
  except Exception as e:errors.append((futures[future],str(e)))
for scenario,nations in catalog.items():
 for code,value in list(nations.items()):
  value['variants']=[id for id in value['variants'] if id in records]
  if value['initial'] not in records:del nations[code]
(source/'catalog.json').write_text(json.dumps({'source':'https://github.com/niemela/flags','revision':revision,'license':'CC BY-SA 4.0 metadata; individual image licenses retained','scenarios':catalog,'flags':records},ensure_ascii=False,indent=2),encoding='utf-8')
(source/'LICENSE.txt').write_bytes(urllib.request.urlopen(base+'LICENSE').read())
(source/'coverage.json').write_text(json.dumps({'missing':missing,'downloadErrors':errors},indent=2))
print('Flag assets:',len(records),'Missing:',missing,'Errors:',errors)
