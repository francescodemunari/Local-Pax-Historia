"""Fill the CShapes Aden Protectorate gap from NE admin-1 without changing existing IDs."""
import json
from xml.etree import ElementTree as ET
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from build_geography import ROOT,save,polygons,province_anchor,project,path_for,display_path_for

def supplement():
 folder=ROOT/'data/scenarios/ww2-geographic'
 atlas=json.loads((folder/'map.json').read_text(encoding='utf8'))
 geo=json.loads((folder/'geography.geojson').read_text(encoding='utf8'))
 geo['features']=[f for f in geo['features'] if not f['properties']['id'].startswith('aden_')]
 atlas['regions']=[r for r in atlas['regions'] if not r['id'].startswith('aden_')]
 # Subtract existing dated sovereignty: only fill missing southern Arabian land.
 nearby=[shape(f['geometry']) for f in geo['features'] if shape(f['geometry']).bounds[2]>42 and shape(f['geometry']).bounds[0]<56 and shape(f['geometry']).bounds[3]>12 and shape(f['geometry']).bounds[1]<20]
 occupied=unary_union(nearby)
 source=json.loads((ROOT/'data/geography/sources/provinces.geojson').read_text(encoding='utf8'))
 additions=[]
 for f in source['features']:
  p=f['properties']
  if p.get('adm0_a3')!='YEM':continue
  for i,g in enumerate(polygons(shape(f['geometry']).difference(occupied))):
   if g.area<.05 or g.centroid.x<45 or g.centroid.y>19:continue
   anchor=province_anchor(g);rid=f'aden_{p["adm1_code"]}_{i}'
   r=dict(id=rid,name='Aden Protectorate — '+(p.get('name_en') or p['name']),nation_code='ENG',path=path_for(g),fill_rule='evenodd',marker_anchor=project(anchor.coords[0]),centroid=project(anchor.coords[0]),geographic_anchor=list(anchor.coords[0]),province_source='Natural Earth admin-1 Aden gap supplement',neighbors=[])
   additions.append((r,g))
 all_pairs=[(f['properties']['id'],shape(f['geometry'])) for f in geo['features'] if shape(f['geometry']).bounds[2]>42 and shape(f['geometry']).bounds[0]<56 and shape(f['geometry']).bounds[3]>12 and shape(f['geometry']).bounds[1]<20]
 lookup={r['id']:r for r in atlas['regions']}
 for r,g in additions:
  for rid,other in all_pairs+[(r2['id'],g2) for r2,g2 in additions]:
   if rid!=r['id'] and g.boundary.intersection(other.boundary).length>.00001:
    r['neighbors'].append(rid)
    if rid in lookup:lookup[rid]['neighbors']=sorted(set(lookup[rid]['neighbors']+[r['id']]))
  atlas['regions'].append(r)
  geo['features'].append(dict(type='Feature',properties={k:v for k,v in r.items() if k not in ('path','marker_anchor','centroid')},geometry=mapping(g)))
 manifest=json.loads((ROOT/'data/scenarios/ww2-geographic.json').read_text(encoding='utf8'))
 svgpath=ROOT/'frontend'/manifest['renderer']['svgUrl'].lstrip('/')
 ET.register_namespace('','http://www.w3.org/2000/svg');svg=ET.fromstring(svgpath.read_text(encoding='utf8'))
 for el in list(svg):
  if el.get('data-supplement')=='aden' or (el.get('id') or '').startswith('aden_'):svg.remove(el)
 combined=unary_union([g for r,g in additions])
 ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'data-supplement':'aden','data-nation-base':'ENG','d':display_path_for(combined),'fill-rule':'evenodd','stroke':'#27313c','stroke-width':'.18'})
 for r,g in additions:ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'id':r['id'],'data-base-nation':'ENG','d':display_path_for(g),'fill-rule':'evenodd'})
 svgpath.write_text(ET.tostring(svg,encoding='unicode'),encoding='utf8')
 nations=json.loads((folder/'nations.json').read_text(encoding='utf8'));nations['BAC']['name']=nations['BAC']['name_local']='Kingdom of Yemen'
 save(folder/'nations.json',nations);save(folder/'map.json',atlas);save(folder/'geography.geojson',geo)
 report=json.loads((folder/'build-report.json').read_text(encoding='utf8'));report['regions']=len(atlas['regions']);report['supplements']=list(dict.fromkeys(report.get('supplements',[])+['Aden Protectorate: British protection; NE admin-1 fills omitted CShapes land'])) ;save(folder/'build-report.json',report)
 print('Aden supplement provinces:',len(additions))
if __name__=='__main__':supplement()
