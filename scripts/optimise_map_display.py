"""Display-only SVG optimisation: remove mismatched backdrop, split distant islands.
Canonical gameplay paths and all province IDs are retained unchanged.
"""
import re,json
from xml.etree import ElementTree as ET
from shapely.geometry import Polygon
from shapely.strtree import STRtree
from build_geography import ROOT
NS='{http://www.w3.org/2000/svg}'
def optimise(scenario):
 p=ROOT/'frontend/maps'/f'{scenario}.svg';root=ET.fromstring(p.read_text(encoding='utf8'));before=p.stat().st_size;removed=split=0
 for el in list(root):
  if el.get('fill')=='#3b4650' and not el.get('id') and not el.get('data-nation-base'):
   root.remove(el);removed+=1;continue
  if el.get('id') or el.get('data-display-component') or not el.get('d'):continue
  rings=re.findall(r'M[^MZ]+Z',el.get('d'))
  if len(rings)<2:continue
  try:
   geoms=[Polygon([tuple(map(float,q.split(','))) for q in ring[1:-1].split('L')]) for ring in rings]
   if not all(g.is_valid for g in geoms):continue
   tree=STRtree(geoms);parents=[]
   for i,g in enumerate(geoms):
    enclosing=[int(j) for j in tree.query(g) if j!=i and geoms[j].area>g.area and geoms[j].covers(g)]
    parents.append(min(enclosing,key=lambda j:geoms[j].area) if enclosing else None)
   def depth(i):
    n=0
    while parents[i] is not None:i=parents[i];n+=1
    return n
   parts=[rings[i]+''.join(rings[j] for j in range(len(rings)) if parents[j]==i) for i in range(len(rings)) if depth(i)%2==0]
   if len(parts)<2:continue
   index=list(root).index(el);root.remove(el)
   for offset,d in enumerate(parts):
    attrs=dict(el.attrib);attrs.update(d=d,**{'data-display-component':'1'});root.insert(index+offset,ET.Element(NS+'path',attrs))
   split+=1
  except (ValueError,TypeError):continue
 ET.register_namespace('',NS[1:-1]);p.write_text(ET.tostring(root,encoding='unicode'),encoding='utf8')
 print(scenario,'backdrop paths removed',removed,'multipart records split',split,'bytes',before,'->',p.stat().st_size)
if __name__=='__main__':
 for s in ('ww1-1910','ww2-geographic','world-2010'):optimise(s)
