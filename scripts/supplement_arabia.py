"""Map omitted 1910 Arabian land as an explicit approximate local-administration group."""
import json
from xml.etree import ElementTree as ET
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from build_geography import ROOT,save,polygons,province_anchor,project,path_for,display_path_for

def supplement():
 folder=ROOT/'data/scenarios/ww1-1910'
 atlas=json.loads((folder/'map.json').read_text(encoding='utf8'))
 geo=json.loads((folder/'geography.geojson').read_text(encoding='utf8'))
 geo['features']=[f for f in geo['features'] if not f['properties']['id'].startswith('arabia_gap_')]
 atlas['regions']=[r for r in atlas['regions'] if not r['id'].startswith('arabia_gap_')]
 for r in atlas['regions']:r['neighbors']=[n for n in r.get('neighbors',[]) if not n.startswith('arabia_gap_')]
 # Subtract existing dated sovereignty: only fill missing southern Arabian land.
 nearby=[shape(f['geometry']) for f in geo['features'] if shape(f['geometry']).bounds[2]>34 and shape(f['geometry']).bounds[0]<61 and shape(f['geometry']).bounds[3]>12 and shape(f['geometry']).bounds[1]<33]
 occupied=unary_union(nearby)
 source=json.loads((ROOT/'data/geography/sources/provinces.geojson').read_text(encoding='utf8'))
 additions=[]
 for f in source['features']:
  p=f['properties']
  if p.get('adm0_a3') not in ('YEM','SAU','OMN','ARE','IRQ','JOR','KWT','QAT','BHR'):continue
  for i,g in enumerate(polygons(shape(f['geometry']).difference(occupied))):
   if g.area<.05:continue
   anchor=province_anchor(g);rid=f'arabia_gap_{p["adm1_code"]}_{i}'
   r=dict(id=rid,name='Local administration — '+(p.get('name_en') or p['name']),nation_code='ARA',path=path_for(g),fill_rule='evenodd',marker_anchor=project(anchor.coords[0]),centroid=project(anchor.coords[0]),geographic_anchor=list(anchor.coords[0]),province_source='Natural Earth admin-1 Arabian gap; sovereignty not resolved',neighbors=[])
   additions.append((r,g))
 all_pairs=[(f['properties']['id'],shape(f['geometry'])) for f in geo['features'] if shape(f['geometry']).bounds[2]>34 and shape(f['geometry']).bounds[0]<61 and shape(f['geometry']).bounds[3]>12 and shape(f['geometry']).bounds[1]<33]
 lookup={r['id']:r for r in atlas['regions']}
 for r,g in additions:
  for rid,other in all_pairs+[(r2['id'],g2) for r2,g2 in additions]:
   if rid!=r['id'] and g.boundary.intersection(other.boundary).length>.00001:
    r['neighbors'].append(rid)
    if rid in lookup:lookup[rid]['neighbors']=sorted(set(lookup[rid]['neighbors']+[r['id']]))
  atlas['regions'].append(r)
  geo['features'].append(dict(type='Feature',properties={k:v for k,v in r.items() if k not in ('path','marker_anchor','centroid')},geometry=mapping(g)))
 manifest=json.loads((ROOT/'data/scenarios/ww1-1910.json').read_text(encoding='utf8'))
 svgpath=ROOT/'frontend'/manifest['renderer']['svgUrl'].lstrip('/')
 ET.register_namespace('','http://www.w3.org/2000/svg');svg=ET.fromstring(svgpath.read_text(encoding='utf8'))
 for el in list(svg):
  if el.get('data-supplement')=='arabia_gap' or (el.get('id') or '').startswith('arabia_gap_'):svg.remove(el)
 combined=unary_union([g for r,g in additions])
 ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'data-supplement':'arabia_gap','data-nation-base':'ARA','d':display_path_for(combined),'fill-rule':'evenodd','stroke':'#27313c','stroke-width':'.18'})
 for r,g in additions:ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'id':r['id'],'data-base-nation':'ARA','d':display_path_for(g),'fill-rule':'evenodd'})
 svgpath.write_text(ET.tostring(svg,encoding='unicode'),encoding='utf8')
 nations=json.loads((folder/'nations.json').read_text(encoding='utf8'));nations['ARA']=dict(code='ARA',name='Arabian local administrations',name_local='Approximate map coverage; not a single historical state',capital='No central capital',color='#b89972',playable=False,is_major_power=False,is_territory_group=True)
 save(folder/'nations.json',nations);save(folder/'map.json',atlas);save(folder/'geography.geojson',geo)
 report=json.loads((folder/'build-report.json').read_text(encoding='utf8'));report['regions']=len(atlas['regions']);report['supplements']=list(dict.fromkeys(report.get('supplements',[])+['1910 Arabian gaps: NE admin-1 geometry, grouped local administrations; NOT a historical sovereignty reconstruction'])) ;save(folder/'build-report.json',report)
 print('Arabian gap provinces:',len(additions))
if __name__=='__main__':supplement()
