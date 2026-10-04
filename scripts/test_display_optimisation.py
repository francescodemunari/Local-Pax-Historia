import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
import optimise_map_display as module
with tempfile.TemporaryDirectory() as folder:
 module.ROOT=Path(folder);d=module.ROOT/'frontend/maps';d.mkdir(parents=True)
 p=d/'test.svg';p.write_text('<svg xmlns="http://www.w3.org/2000/svg"><path fill="#3b4650" d="M0,0L1,0L1,1Z"/><path data-nation-base="TEST" fill-rule="evenodd" d="M0,0L10,0L10,10L0,10Z M3,3L7,3L7,7L3,7Z M100,100L110,100L110,110L100,110Z"/><path id="province" d="M0,0L10,0L10,10Z"/></svg>')
 module.optimise('test');root=ET.parse(p).getroot();parts=[e for e in root if e.get('data-nation-base')]
 assert len(parts)==2 and parts[0].get('d').count('M')==2, 'Hole must stay with its outer polygon'
 assert any(e.get('id')=='province' for e in root), 'Province IDs must survive'
 once=p.read_bytes();module.optimise('test');assert p.read_bytes()==once, 'Optimisation must be idempotent'
 print('Display component splitting preserves holes, province IDs and repeatability')
