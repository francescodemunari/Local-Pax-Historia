"""Compile dated WGS84 geography into reproducible offline scenario bundles.

Install scripts/geography-requirements.txt, then run this from any directory.
Source geometry is retained; SVG and game JSON are generated artifacts.
"""
import datetime as dt
import hashlib
import html
import json
import math
import re
import unicodedata
import colorsys
from pathlib import Path

import shapefile
from shapely import make_valid
from shapely.geometry import shape, mapping, Point, box
from shapely.ops import polylabel, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/geography/sources'
TAGS = {2:'USA',20:'CAN',40:'CUB',70:'MEX',100:'COL',101:'VEN',130:'ECU',135:'PER',140:'BRA',
        145:'BOL',150:'PAR',155:'CHL',160:'ARG',165:'URG',200:'ENG',205:'IRE',210:'HOL',211:'BEL',
        212:'LUX',220:'FRA',225:'SWI',230:'SPA',235:'POR',255:'GER',290:'POL',300:'AHU',305:'AUS',
        310:'HUN',315:'CZE',325:'ITA',339:'ALB',340:'SER',341:'MNT',345:'YUG',350:'GRE',355:'BUL',
        360:'ROM',365:'RUS',366:'EST',367:'LAT',368:'LIT',375:'FIN',380:'SWE',385:'NOR',390:'DEN',
        450:'LIB',530:'ETH',560:'SAF',600:'MOR',630:'PER',640:'TUR',651:'EGY',700:'AFG',710:'CHI',
        740:'JAP',750:'IND',760:'BHU',790:'NEP',800:'SIA',900:'AST',920:'NZL'}
# Dataset names describe historical series, not always the label at that date.
NAMES = {255:'Germany',325:'Italy',360:'Romania',365:'Russia',630:'Iran',640:'Turkey',
         490:'Democratic Republic of the Congo',572:'Eswatini',580:'Madagascar',780:'Sri Lanka'}
MAJORS = {2,200,220,255,300,325,365,710,740}
IMPORTANT_CITIES = {'New York','Los Angeles','Chicago','Istanbul','Shanghai','Hong Kong','Sydney',
                    'Melbourne','Mumbai','Calcutta','Delhi','Singapore','Cape Town','Rio de Janeiro',
                    'Vladivostok','Saint Petersburg','Osaka','Milan','Naples','Marseille','Hamburg'}

def project(point):
    return [round((point[0] + 180) * 4, 5), round((90 - point[1]) * 4, 5)]

def polygons(geom):
    if geom.geom_type == 'Polygon':
        yield geom
    elif hasattr(geom, 'geoms'):
        for part in geom.geoms:
            yield from polygons(part)

def province_anchor(polygon):
    anchor=polygon.representative_point()
    # Thin coastal pieces need more clearance than SVG coordinate rounding.
    if polygon.boundary.distance(anchor) < .0001:
        anchor=polylabel(polygon,tolerance=.000001)
    return anchor

def path_for(geom):
    chunks = []
    for polygon in polygons(geom):
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = [project(p) for p in ring.coords]
            chunks.append('M' + 'L'.join(f'{x},{y}' for x,y in coords) + 'Z')
    return ''.join(chunks)

def display_path_for(geom):
    # Display-only tolerance: at maximum zoom this is about half a pixel.
    # Retain full topology for gameplay and keep every deployment anchor inside.
    parts=[]
    for polygon in polygons(geom):
        simplified=polygon.simplify(.004, preserve_topology=True)
        anchor=province_anchor(polygon)
        parts.append(simplified if simplified.contains(anchor) else polygon)
    return ''.join(path_for(part) for part in parts)

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':')) + '\n', encoding='utf8')

def compile_world(year, date, scenario_id, title):
    target = dt.date.fromisoformat(date)
    reader = shapefile.Reader(str(SOURCE / 'cshapes-2.0.zip'), encoding='utf8', encodingErrors='replace')
    records = [s for s in reader.iterShapeRecords() if s.record.gwsdate <= target <= s.record.gwedate]
    active_codes={s.record.gwcode for s in records}
    ownership=json.loads((ROOT/'data/geography/ownership.json').read_text(encoding='utf8'))[str(year)]
    owner_by_code={child:int(parent) for parent,children in ownership.items() for child in children if int(parent) in active_codes}
    places=json.loads((SOURCE/'populated_places.geojson').read_text(encoding='utf8'))
    def normalize(name):
        return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower().split('(')[0])
    tag_by_code = dict(TAGS)
    # Fix the USA/Peru tag collision explicitly.
    tag_by_code[135] = 'PRU'
    used=set(tag_by_code.values())
    for code in sorted({s.record.gwcode for s in records} - set(TAGS)):
        number=code
        while True:
            tag=''.join(chr(65+(number//power)%26) for power in (676,26,1))
            if tag not in used:break
            number+=1
        tag_by_code[code]=tag;used.add(tag)
    province_features=json.loads((SOURCE/'provinces.geojson').read_text(encoding='utf8'))['features']
    province_geoms=[make_valid(shape(f['geometry'])) for f in province_features]
    province_tree=STRtree(province_geoms)
    nations, regions, geoms, capital_specs, outlines, nation_bases = {}, [], [], [], [], []
    for item in records:
        props = item.record.as_dict()
        code=props['gwcode']; owner=owner_by_code.get(code,code); tag=tag_by_code[owner]
        name = NAMES.get(code, props['cntry_name'])
        if year <= 1914:
            name = {255:'German Empire',365:'Russian Empire',640:'Ottoman Empire',630:'Persia',710:'Qing Empire'}.get(code,name)
        if year == 1936 and code == 365: name = 'Soviet Union'
        if year < 1950 and code == 750: name='British India'
        if year < 2018 and code == 572: name='Swaziland'
        cap_name = props['capname']
        cap_point = Point(props['caplong'],props['caplat'])
        if code==750 and year in (1910,1914,1936):
            cap_name='Calcutta' if year==1910 else 'Delhi' if year==1914 else 'New Delhi'
            cap_feature=next(f for f in places['features'] if f['properties']['name']==('Kolkata' if cap_name=='Calcutta' else cap_name))
            cap_point=Point(cap_feature['geometry']['coordinates'])
        # Match an existing historical place by name, never replace a historical
        # capital with today's capital merely because the country is the same.
        matches=[f for f in places['features'] if normalize(f['properties']['name'])==normalize(cap_name)]
        if matches:
            nearest=min(matches,key=lambda f:Point(f['geometry']['coordinates']).distance(cap_point))
            candidate=Point(nearest['geometry']['coordinates'])
            if candidate.distance(cap_point)<5:cap_point=candidate
        geo = make_valid(shape(item.shape.__geo_interface__))
        # Simplify at geographic precision, never reposition city coordinates.
        geo = make_valid(geo.simplify(0.015, preserve_topology=True))
        country_parts = list(polygons(geo))
        if not country_parts: continue
        label_point=polylabel(max(country_parts,key=lambda polygon:polygon.area),tolerance=.05)
        hue=int(hashlib.sha256(tag.encode()).hexdigest()[:6],16)/0xffffff
        color='#'+''.join(f'{round(v*255):02x}' for v in colorsys.hls_to_rgb(hue,.53,.28))
        if owner==code:
            nations[tag] = dict(code=tag,name=name,name_local=name,capital=cap_name,color=color,
                is_major_power=code in MAJORS,playable=True,
                government_type='Scenario administration',ideology='unconfigured',
                leader_name='',leader_title='',
                population=None,military_strength=None,manpower=100000,source_gwcode=code)
            nations[tag]['label_anchor']=project(label_point.coords[0])
        outlines.append(path_for(geo))
        nation_bases.append((tag, outlines[-1]))
        print(f'  {year}: {name}', flush=True)
        # Dependent administrative centres are cities, not sovereign capitals.
        if owner==code:capital_specs.append((tag,cap_name,cap_point))
        # Modern administrative boundaries clipped to dated country outlines.
        # Retain source shared boundaries and attach coastline/source slivers
        # in batches, avoiding repeated unions of complex island coastlines.
        divisions=[]
        for index in sorted(int(i) for i in province_tree.query(geo)):
            clipped=make_valid(geo.intersection(province_geoms[index]))
            if clipped.area < .00001: continue
            props=province_features[index]['properties']
            divisions.append([str(props.get('adm1_code') or props['ne_id']), props.get('name_en') or props.get('name') or name, clipped])
        remaining=make_valid(geo.difference(unary_union([entry[2] for entry in divisions])))
        division_tree=STRtree([entry[2] for entry in divisions]) if divisions else None
        additions={i:[] for i in range(len(divisions))}
        for index,part in enumerate(polygons(remaining)):
            if part.area < .00001: continue
            if division_tree is not None and part.area < .2:
                additions[int(division_tree.nearest(part))].append(part)
            else:
                divisions.append([f'coast{index}',f'{name} coastal area',part])
        for index,parts in additions.items():
            if parts: divisions[index][2]=make_valid(unary_union([divisions[index][2],*parts]))
        for source_id,province_name,division in divisions:
            for fragment,polygon in enumerate(polygons(division)):
                if polygon.area < .00001: continue
                anchor=province_anchor(polygon)
                rid=f'g{code}_a{source_id}_f{fragment}'
                regions.append(dict(id=rid,name=province_name,nation_code=tag,path=path_for(polygon),fill_rule='evenodd',
                    marker_anchor=project(anchor.coords[0]),centroid=project(anchor.coords[0]),
                    geographic_anchor=list(anchor.coords[0]),province_source='Natural Earth admin-1' if not source_id.startswith('coast') else 'coastline remainder',
                    area_km2=round(polygon.area*12364*max(.05,math.cos(math.radians(anchor.y))),2)))
                geoms.append(polygon)
    tree = STRtree(geoms)
    # Stable adjacency from shared geographic borders, including subdivisions.
    for i, polygon in enumerate(geoms):
        neighbors=[]
        for j in tree.query(polygon):
            j=int(j)
            if i!=j and polygon.boundary.intersection(geoms[j].boundary).length > 0.0001:
                neighbors.append(regions[j]['id'])
        regions[i]['neighbors']=sorted(neighbors)
    cities, warnings = [], []
    def add_city(cid,name,point,tag=None,capital=False):
        candidates=[int(i) for i in tree.query(point) if geoms[int(i)].covers(point) and (tag is None or regions[int(i)]['nation_code']==tag)]
        if candidates: index=min(candidates,key=lambda i:geoms[i].area)
        else:
            eligible=[i for i,r in enumerate(regions) if tag is None or r['nation_code']==tag]
            if not eligible:return
            index=min(eligible,key=lambda i:geoms[i].distance(point))
            # Preserve true city coordinates along generalized coasts; annotate
            # associations instead of moving the city into a convenient polygon.
            distance=geoms[index].distance(point)
            if distance>.5:
                warnings.append(dict(city=name,reason='distant region association',distance_degrees=distance))
                if not capital:return
        region=regions[index]
        cities.append(dict(id=cid,name=name,coords=project(point.coords[0]),
            longitude=point.x,latitude=point.y,nation_code=region['nation_code'],region_id=region['id'],
            type='capital' if capital else 'city',is_capital=capital,
            geographic=True,coastal_offset_degrees=round(geoms[index].distance(point),6)))
    for tag,name,point in capital_specs:add_city('capital_'+tag,name,point,tag,True)
    for feature in places['features']:
        p=feature['properties']; name=p['name']
        if not (name in IMPORTANT_CITIES or (year==2010 and p.get('scalerank',99)<=3)):continue
        point=Point(feature['geometry']['coordinates'])
        if any(normalize(c['name'])==normalize(name) and math.hypot(c['longitude']-point.x,c['latitude']-point.y)<5 for c in cities):continue
        if any(math.hypot(c['longitude']-point.x,c['latitude']-point.y)<.15 for c in cities):continue
        add_city('ne_'+str(p['ne_id']),name,point)
    directory=ROOT/'data/scenarios'/scenario_id
    svg_url=f'/maps/{scenario_id}.svg'
    map_data=dict(viewBox='0 0 1440 720',width=1440,height=720,projection=dict(type='equirectangular',scale=4),
        coordinateSystem='WGS84',regions=regions)
    save(directory/'map.json',map_data);save(directory/'nations.json',nations);save(directory/'cities.json',cities)
    # Retain editable canonical geographic provinces alongside the runtime adapter.
    save(directory/'geography.geojson',dict(type='FeatureCollection',features=[dict(type='Feature',
        properties={k:v for k,v in region.items() if k not in ('path','marker_anchor','centroid')},geometry=mapping(geom))
        for region,geom in zip(regions,geoms)]))
    save(directory/'build-report.json',dict(date=date,regions=len(regions),nations=len(nations),cities=len(cities),warnings=warnings,
        sources={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [SOURCE/'cshapes-2.0.zip',SOURCE/'populated_places.geojson',SOURCE/'land.geojson',SOURCE/'provinces.geojson',ROOT/'data/geography/ownership.json']}))
    # Dated mapped territory is the display coastline; an independent land
    # backdrop otherwise creates dark, non-selectable coastal strips.
    background=''
    base_svg=''.join(f'<path data-nation-base="{tag}" d="{outline}" fill-rule="evenodd" stroke="none" pointer-events="none"/>' for tag,outline in nation_bases)
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 720">'+background+base_svg+''.join(
        f'<path id="{r["id"]}" d="{display_path_for(geom)}" fill-rule="evenodd"/>' for r,geom in zip(regions,geoms))+''.join(
        f'<path d="{outline}" fill="none" stroke="#27313c" stroke-width="0.18" pointer-events="none"/>' for outline in outlines)+'</svg>'
    svg_path=ROOT/'frontend'/svg_url.lstrip('/');svg_path.parent.mkdir(parents=True,exist_ok=True);svg_path.write_text(svg,encoding='utf8')
    contexts={1910:'Begin on 1 January 1910, with several years for diplomacy and domestic policy before a possible European war. The Qing Empire still rules China. The Italo-Turkish War, Balkan Wars and Sarajevo assassination have not occurred. Do not assume these future events or a world war are inevitable. Resolve developments from player actions and the current situation.',1914:'The July Crisis is unfolding after the Sarajevo assassination. Alliances and mobilization decisions must be adjudicated from this date, not assumed to have already escalated into world war.',
        1936:'Germany is rearming, the Italian-Ethiopian War is ongoing, and international tensions are rising. Do not assume later annexations or WWII victories have already occurred.',
        2010:'The world is emerging from the global financial crisis. Model a multipolar international system at the beginning of 2010, without knowledge of later events determining outcomes.'}
    catalog=dict(infantry=dict(label='Infantry Division',manpower=10000,treasury=50,landSpeed=2),
        cavalry=dict(label='Cavalry Brigade',manpower=4000,treasury=40,landSpeed=3)) if year<=1914 else dict(
        infantry=dict(label='Infantry Division',manpower=10000,treasury=50,landSpeed=2),
        armor=dict(label='Armored Brigade',manpower=4000,treasury=120,landSpeed=4))
    manifest=dict(id=scenario_id,version='2.0.0',name=title,era=str(year),isDefault=year==1936,
        defaultStartDate=date,startDates=[date],description=f'Dated geographic atlas sandbox ({date}). Capitals use geographic coordinates; modern province boundaries are clipped to dated national borders; historical internal divisions are approximate. Colonial control follows an explicit scenario overlay.',
        worldContext=(json.loads((ROOT/'data/scenario-briefings.json').read_text(encoding='utf-8')).get(scenario_id, {}).get('world') or contexts[year]),simulationRules='Use the selected date and nation catalog. Some map entities are dependent administrations, not independent sovereign countries. Do not treat every territory as independent. Orders are simulated through narrative consequences. Do not use approval ratings or numerical resource mechanics. Tracked formations require explicit player orders.',
        renderer=dict(type='svg-overlay',svgUrl=svg_url),assets={k:f'scenarios/{scenario_id}/{v}.json' for k,v in [('map','map'),('nations','nations'),('cities','cities')]},unitCatalog=catalog)
    for unit_type,spec in catalog.items():spec['landKmPerDay']={'infantry':40,'cavalry':60,'armor':80}[unit_type]
    if year==1936: manifest['initialWars']=[['ITA','ETH']]
    save(ROOT/'data/scenarios'/f'{scenario_id}.json',manifest)
    print(f'{scenario_id}: {len(regions)} regions, {len(nations)} administrations, {len(cities)} cities, {len(warnings)} warnings',flush=True)

if __name__=='__main__':
    for config in json.loads((ROOT/'data/geography/builds.json').read_text(encoding='utf8')):
        compile_world(config['year'],config['date'],config['id'],config['name'])
        from complete_geography import complete
        complete(config['id'])

    from complete_geography import finish_supplements
    finish_supplements()
