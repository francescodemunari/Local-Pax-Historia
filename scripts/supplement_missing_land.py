"""Fill omitted mapped territory; preserve existing region IDs and dated sovereignty."""
import json
from xml.etree import ElementTree as ET
from shapely.geometry import shape,mapping,box,Point
from shapely.ops import unary_union
from build_geography import ROOT,save,polygons,province_anchor,project,path_for,display_path_for

def supplement(scenario,country,owner,bounds,prefix):
 folder=ROOT/'data/scenarios'/scenario
 atlas=json.loads((folder/'map.json').read_text(encoding='utf8'));geo=json.loads((folder/'geography.geojson').read_text(encoding='utf8'))
 atlas['regions']=[r for r in atlas['regions'] if not r['id'].startswith(prefix)]
 geo['features']=[f for f in geo['features'] if not f['properties']['id'].startswith(prefix)]
 for r in atlas['regions']:r['neighbors']=[n for n in r.get('neighbors',[]) if not n.startswith(prefix)]
 window=box(*bounds)
 nearby=[(f['properties']['id'],shape(f['geometry'])) for f in geo['features'] if shape(f['geometry']).intersects(window)]
 occupied=unary_union([g for _,g in nearby]);additions=[]
 source=json.loads((ROOT/'data/geography/sources/provinces.geojson').read_text(encoding='utf8'))
 for f in source['features']:
  p=f['properties']
  if p.get('adm0_a3')!=country:continue
  missing=shape(f['geometry']).intersection(window).difference(occupied)
  for i,g in enumerate(polygons(missing)):
   if g.area<.003:continue
   anchor=province_anchor(g);rid=f'{prefix}{p["adm1_code"]}_{i}'
   r=dict(id=rid,name=p.get('name_en') or p['name'],nation_code=owner,path=path_for(g),fill_rule='evenodd',marker_anchor=project(anchor.coords[0]),centroid=project(anchor.coords[0]),geographic_anchor=list(anchor.coords[0]),province_source='Natural Earth admin-1 coverage supplement; approximate internal boundaries',neighbors=[])
   additions.append((r,g))
 lookup={r['id']:r for r in atlas['regions']}
 for r,g in additions:
  for rid,other in nearby+[(r2['id'],g2) for r2,g2 in additions]:
   if rid!=r['id'] and g.boundary.intersection(other.boundary).length>.00001:
    r['neighbors'].append(rid)
    if rid in lookup:lookup[rid]['neighbors']=sorted(set(lookup[rid]['neighbors']+[r['id']]))
  atlas['regions'].append(r);geo['features'].append(dict(type='Feature',properties={k:v for k,v in r.items() if k not in ('path','marker_anchor','centroid')},geometry=mapping(g)))
 manifest=json.loads((ROOT/'data/scenarios'/f'{scenario}.json').read_text(encoding='utf8'));svgpath=ROOT/'frontend'/manifest['renderer']['svgUrl'].lstrip('/')
 ET.register_namespace('','http://www.w3.org/2000/svg');svg=ET.fromstring(svgpath.read_text(encoding='utf8'))
 for el in list(svg):
  if el.get('data-supplement')==prefix or (el.get('id') or '').startswith(prefix):svg.remove(el)
 for r,g in additions:
  ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'data-supplement':prefix,'data-nation-base':owner,'d':display_path_for(g),'fill-rule':'evenodd','stroke':'#27313c','stroke-width':'.18'})
  ET.SubElement(svg,'{http://www.w3.org/2000/svg}path',{'id':r['id'],'data-base-nation':owner,'d':display_path_for(g),'fill-rule':'evenodd'})
 svgpath.write_text(ET.tostring(svg,encoding='unicode'),encoding='utf8')
 nations=json.loads((folder/'nations.json').read_text(encoding='utf8'))
 if owner=='KWT':
  nations['KWT']=dict(code='KWT',name='Sheikhdom of Kuwait',name_local='Kuwait',capital='Kuwait City',color='#b68d8d',playable=True,is_major_power=False,map_supplement=True,government_type='Sheikhdom under British protection',ideology='Monarchy',leader_name='Ahmad Al-Jaber Al-Sabah',leader_title='Sheikh',ruling_party='House of Sabah',label_anchor=project((47.5,29.4)))
  cities=json.loads((folder/'cities.json').read_text(encoding='utf8'));cities=[c for c in cities if c['id']!='capital_KWT'];point=Point(47.9774,29.3759)
  matching=[(r,g) for r,g in additions if g.covers(point)]
  if not matching:raise ValueError('Kuwait capital must lie within a supplied province')
  cities.append(dict(id='capital_KWT',name='Kuwait City',coords=project(point.coords[0]),longitude=point.x,latitude=point.y,nation_code='KWT',region_id=matching[0][0]['id'],is_capital=True,type='capital',geographic=True,coastal_offset_degrees=0));save(folder/'cities.json',cities)
  profiles=json.loads((ROOT/'data/leadership-profiles.json').read_text(encoding='utf8'));profiles[scenario]['KWT']={k:nations['KWT'][k] for k in ('leader_name','leader_title','ruling_party','government_type','ideology')};profiles[scenario]['KWT']['leadership_source']='https://e.gov.kw/sites/kgoEnglish/Pages/Visitors/AboutKuwait/GoverningBodyKuwaitGoverners.aspx';save(ROOT/'data/leadership-profiles.json',profiles)
 save(folder/'map.json',atlas);save(folder/'geography.geojson',geo);save(folder/'nations.json',nations)
 report=json.loads((folder/'build-report.json').read_text(encoding='utf8'));report['regions']=len(atlas['regions']);report['nations']=len(nations);report['cities']=len(json.loads((folder/'cities.json').read_text(encoding='utf8')));report['supplements']=list(dict.fromkeys(report.get('supplements',[])+[prefix+' Natural Earth coverage supplement; approximate boundaries']));save(folder/'build-report.json',report)
 print(scenario,prefix,len(additions),'provinces')

if __name__=='__main__':
 supplement('ww1-1910','MAR','MOR',(-13.3,27.6,-1,36.1),'morocco_gap_')
 supplement('ww2-geographic','KWT','KWT',(46.3,28.4,49,30.2),'kuwait_gap_')
