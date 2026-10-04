"""Rebuild display paths without changing region IDs, anchors or movement geometry."""
import json
import xml.etree.ElementTree as ET
from shapely.geometry import shape
from build_geography import ROOT, display_path_for

ET.register_namespace('', 'http://www.w3.org/2000/svg')
for scenario in ['ww1-1910', 'ww1-1914', 'ww2-geographic', 'world-2010']:
    source=ROOT/'data/scenarios'/scenario/'geography.geojson'
    if not source.exists():
        print(f'{scenario}: no local editable geometry; skipping display rebuild.',flush=True)
        continue
    features=json.loads(source.read_text(encoding='utf8'))['features']
    paths={feature['properties']['id']:display_path_for(shape(feature['geometry'])) for feature in features}
    filename=ROOT/'frontend/maps'/f'{scenario}.svg'
    before=filename.stat().st_size
    tree=ET.parse(filename)
    for element in tree.getroot().iter():
        if element.get('id') in paths: element.set('d',paths[element.get('id')])
    tree.write(filename,encoding='utf-8')
    print(f'{scenario}: {before:,} -> {filename.stat().st_size:,} bytes',flush=True)
