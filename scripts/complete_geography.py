"""Apply reproducible atlas supplements without renumbering existing provinces."""
import json, math, hashlib, colorsys, re
from pathlib import Path
from xml.etree import ElementTree as ET
from shapely.geometry import shape, mapping, LineString
from shapely.ops import unary_union
from build_geography import ROOT, save, polygons, project, province_anchor, path_for, display_path_for

# Cartographic choices, not official state colours. Era overrides distinguish
# imperial Russia from the USSR and keep major neighbours visually separate.
PALETTE = {'ENG':'#bb7376','FRA':'#527dab','GER':'#7a8189','ITA':'#739568',
 'RUS':'#68835f','USA':'#718ca2','CAN':'#be987c','CHI':'#d1b36b','JAP':'#bc827e',
 'AHU':'#d3c49a','AUS':'#d6c7b4','HUN':'#96717c','TUR':'#b0a375',
 'SPA':'#c5a054','POR':'#5c9285','HOL':'#d49057','BEL':'#b8a578','SWI':'#bd6b65',
 'POL':'#b37a99','CZE':'#939cc3','YUG':'#7a84b2','SER':'#8495b5','ROM':'#c1ae6a',
 'BUL':'#6e9c91','GRE':'#729fb7','DEN':'#bc6873','NOR':'#8591a9','SWE':'#b5a96a',
 'FIN':'#a3b8c0','ETH':'#a09058','EGY':'#beae82','SAF':'#a99772','AST':'#baa878',
 'IND':'#c99369','MEX':'#729983','BRA':'#87a465','ARG':'#86b4bd','PER':'#639d99',
 'EST':'#809c8d','LAT':'#a89088','LIT':'#a8aa6b','IRE':'#70a179'}
BY_NAME={'Iraq':'#b19a76','Saudi Arabia':'#749574','Syria':'#94a28b','Afghanistan':'#819995',
 'Yemen (Arab Republic of Yemen)':'#9f8574','Oman':'#bda184'}

def complete(scenario_id):
 directory=ROOT/'data/scenarios'/scenario_id
 manifest_path=ROOT/'data/scenarios'/f'{scenario_id}.json'
 manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
 nations=json.loads((directory/'nations.json').read_text(encoding='utf-8'))
 atlas=json.loads((directory/'map.json').read_text(encoding='utf-8'))
 geography=json.loads((directory/'geography.geojson').read_text(encoding='utf-8'))
 for code,nation in nations.items():
  hue=int(hashlib.sha256(code.encode()).hexdigest()[:6],16)/0xffffff
  fallback='#'+''.join(f'{round(v*255):02x}' for v in colorsys.hls_to_rgb(hue,.43+(int(hue*100)%4)*.075,.3+(int(hue*100)%3)*.09))
  nation['color']=PALETTE.get(code,BY_NAME.get(nation['name'],fallback))
 if scenario_id=='ww2-geographic': nations['RUS']['color']='#aa6261'
 # Natural Earth supplies Greenland, omitted by this CShapes country series.
 # Internal divisions are modern approximations like the other provinces.
 sources=json.loads((ROOT/'data/geography/sources/provinces.geojson').read_text(encoding='utf-8'))
 extras=[]
 for feature in sources['features']:
  if feature['properties'].get('adm0_a3')!='GRL': continue
  props=feature['properties']
  for index,geom in enumerate(polygons(shape(feature['geometry']).simplify(.015,preserve_topology=True))):
   if geom.area < .00001: continue
   anchor=province_anchor(geom); rid=f'grl_{props["adm1_code"]}_{index}'
   region=dict(id=rid,name='Greenland — '+(props.get('name_en') or props['name']),nation_code='DEN',
    path=path_for(geom),fill_rule='evenodd',marker_anchor=project(anchor.coords[0]),centroid=project(anchor.coords[0]),
    geographic_anchor=list(anchor.coords[0]),province_source='Natural Earth admin-1 Greenland supplement',
    area_km2=round(geom.area*12364*max(.05,math.cos(math.radians(anchor.y))),2),neighbors=[])
   extras.append((region,geom))
 for region,geom in extras:
  region['neighbors']=[other['id'] for other,other_geom in extras if other['id']!=region['id'] and geom.boundary.intersection(other_geom.boundary).length>.00001]
 atlas['regions']=[r for r in atlas['regions'] if not r['id'].startswith('grl_')]+[r for r,g in extras]
 geography['features']=[f for f in geography['features'] if not f['properties']['id'].startswith('grl_')]+[
  dict(type='Feature',properties={k:v for k,v in r.items() if k not in ('path','marker_anchor','centroid')},geometry=mapping(g)) for r,g in extras]
 svg_path=ROOT/'frontend'/manifest['renderer']['svgUrl'].lstrip('/')
 ET.register_namespace('', 'http://www.w3.org/2000/svg'); svg=ET.fromstring(svg_path.read_text(encoding='utf-8'))
 for element in list(svg):
  if element.get('data-supplement')=='greenland' or (element.get('id') or '').startswith('grl_'): svg.remove(element)
 lookup={r['id']:r for r in atlas['regions']}
 for element in svg:
  if element.get('id') in lookup: element.set('data-base-nation',lookup[element.get('id')]['nation_code'])
  elif element.get('d') and element.get('data-display-simplified') != '0.04':
   # Reduce coast/base drawing complexity; canonical region paths stay intact.
   chunks=[]
   for ring in re.findall(r'M([^MZ]+)Z',element.get('d')):
    points=[tuple(map(float,p.split(','))) for p in ring.split('L')]
    if len(points)>3: points=list(LineString(points).simplify(.04).coords)
    if len(points)>2: chunks.append('M'+'L'.join(f'{x:g},{y:g}' for x,y in points)+'Z')
   if chunks:
    element.set('d',''.join(chunks));element.set('data-display-simplified','0.04')
 combined=unary_union([g for r,g in extras])
 ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'data-supplement':'greenland','data-nation-base':'DEN','d':display_path_for(combined),'fill-rule':'evenodd','stroke':'#27313c','stroke-width':'.18'})
 for region,geom in extras:
  ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'id':region['id'],'data-base-nation':'DEN','d':display_path_for(geom),'fill-rule':'evenodd'})
 svg_path.write_text(ET.tostring(svg,encoding='unicode'),encoding='utf-8')
 # Operational formation types: aviation in 1910 is reconnaissance, not modern air power.
 manifest['unitCatalog']['naval']={'label':'Naval Squadron','landSpeed':0}
 manifest['unitCatalog']['air']={'label':'Reconnaissance Flight' if int(manifest['era'])<=1914 else 'Air Wing','landSpeed':0}
 manifest['simulationRules']=manifest['simulationRules'].replace('Tracked formations require explicit player orders.','Military operation orders authorize appropriate mobilisation and deployment of previously untracked forces. Reuse existing units first; explicit recruitment wording is not required. Disbanding requires an explicit request. Use campaign_orders for ground invasions and surrender. Only engine-confirmed captures and annexation are authoritative; detailed tactical combat and naval/air transfers are not simulated.')
 save(manifest_path,manifest);save(directory/'map.json',atlas);save(directory/'nations.json',nations);save(directory/'geography.geojson',geography)
 report=json.loads((directory/'build-report.json').read_text(encoding='utf-8'));report['regions']=len(atlas['regions']);report['supplements']=['Greenland: Natural Earth admin-1; Danish realm; modern internal divisions'];save(directory/'build-report.json',report)
 print(scenario_id, 'Greenland provinces:',len(extras),'SVG bytes:',svg_path.stat().st_size)

def finish_supplements():
 from supplement_aden import supplement
 supplement()

 from supplement_arabia import supplement as supplement_arabia
 supplement_arabia()
 from supplement_missing_land import supplement as fill_land
 fill_land('ww1-1910','MAR','MOR',(-13.3,27.6,-1,36.1),'morocco_gap_')
 fill_land('ww2-geographic','KWT','KWT',(46.3,28.4,49,30.2),'kuwait_gap_')
 from optimise_map_display import optimise
 for scenario in ('ww1-1910','ww2-geographic','world-2010'):optimise(scenario)

if __name__=='__main__':
 for scenario in ('ww1-1910','ww2-geographic','world-2010'):complete(scenario)
 finish_supplements()
