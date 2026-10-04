"""Apply directly verified Commons files that fill gaps in the flag dataset."""
import json,urllib.request,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'data/flags/catalog.json';catalog=json.loads(p.read_text(encoding='utf-8'))
extras=[('Mexico (1893','MEX','ww1-1910','1893-01-01','1916-12-31'),('Mexico (1934','MEX','ww2-geographic','1934-12-01','1968-09-15'),('Hungary (1915','HUN','ww2-geographic','1919-08-01','1946-12-31'),('Iceland (1918',None,'ww2-geographic','1918-12-01','1944-06-16'),('Morocco (1666',None,'ww1-1910','1666-01-01','1915-11-16'),('Venezuela (1905',None,'ww1-1910','1905-01-01','1930-12-31'),('Afghanistan (2004',None,'world-2010','2004-01-04','2013-08-18')]
pages=json.loads((root/'data/flags/commons-metadata.json').read_text(encoding='utf-8'))['query']['pages']
for fragment,code,scenario,start,end in extras:
 page=next(p for p in pages.values() if fragment in p['title']);info=page['imageinfo'][0];meta=info['extmetadata'];name=fragment.split(' (')[0]
 nations=json.loads((root/f'data/scenarios/{scenario}/nations.json').read_text(encoding='utf-8'));code=code or next(c for c,n in nations.items() if n['name']==name)
 id=f'{code}_{start[:4]}_commons';file=root/f'frontend/assets/flags/{id}.svg'
 if not file.exists():file.write_bytes(urllib.request.urlopen(urllib.request.Request(info['url'].split('?')[0],headers={'User-Agent':'LocalPaxHistoria/1.0'}),timeout=30).read())
 catalog['flags'][id]={'name':page['title'][5:-4],'periods':[{'start':start,'end':end}],'sources':[info['descriptionurl']],'license':meta.get('LicenseShortName',{}).get('value'),'attribution':re.sub('<[^>]+>','',meta.get('Artist',{}).get('value','')),'file':f'/assets/flags/{id}.svg'}
 catalog['scenarios'][scenario][code]={'initial':id,'variants':[id]}
catalog['flags']['KW_1915']={'name':'Kuwait (1915–1956)','periods':[{'start':'1915','end':'1956'}],'sources':['https://commons.wikimedia.org/wiki/File:Flag_of_Kuwait_(1915–1956).svg'],'file':'/assets/flags/KW_1915.svg','credit':'Jaume Ollé; later SVG revisions credited on Commons','license':'CC BY-SA 3.0','license_url':'https://creativecommons.org/licenses/by-sa/3.0/'}
catalog['scenarios']['ww2-geographic']['KWT']={'initial':'KW_1915','variants':['KW_1915','KW_1961','KW']}
p.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
coverage = {}
for scenario, entries in catalog['scenarios'].items():
 nations = json.loads((root/f'data/scenarios/{scenario}/nations.json').read_text(encoding='utf-8'))
 missing = [nation['name'] for code, nation in nations.items() if not entries.get(code, {}).get('initial')]
 coverage[scenario] = {'total':len(nations),'withFlags':len(nations)-len(missing),'withoutVerifiedFlag':missing}
(root/'data/flags/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8')
print('Added',len(extras),'verified historical flags')
