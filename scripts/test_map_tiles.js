const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const contexts = [];
const sandbox = {setTimeout:fn=>fn(), L: { GridLayer: class { constructor(options) { this.options = options; } redraw() {} } },
    Path2D: class { constructor(d) { this.d = d; } }, window: { devicePixelRatio: 3 },
    document: { createElement() {
        const context = { calls: [], clearRect(){this.calls.push(['clear']);}, drawImage(){this.calls.push(["copy"]);}, setTransform(...args) { this.calls.push(['transform', ...args]); },
            fill(path, rule) { this.calls.push(['fill', path.d, rule, this.fillStyle]); },
            stroke(path) { this.calls.push(['stroke', path.d]); },
            isPointInPath(path, x, y, rule) { return x >= 110 && x <= 130 && y >= 220 && y <= 240 && !(rule === 'evenodd' && x === 120); } };
        contexts.push(context); return { dataset:{},getContext: () => context };
    } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/map-tiles.js'), 'utf8') + '\nthis.Tiles = ScenarioTiles;', sandbox);
const attrs = { d: 'province-with-hole', fill: '#123456', stroke: 'white', 'fill-rule': 'evenodd' };
const province = { regionData: { id: 'province' }, getBBox: () => ({x:110,y:220,width:20,height:20}), getAttribute: key => attrs[key] };
const tiles = new sandbox.Tiles({ svgWidth: 360, svgHeight: 180, svgOrigin: [100,200] }, {querySelectorAll: () => [province]});
for (const lng of [15,375,-345]) assert.equal(tiles.regionAt({lng,lat:150}), province, 'Hit testing must wrap and include the viewBox origin');
assert.equal(tiles.regionAt({lng:20,lat:150}), null, 'A polygon hole must not select its province');
assert.equal(tiles.regionAt({lng:50,lat:150}), null, 'Outside geometry must not select');
const tile = tiles.createTile({x:0,y:-1,z:0});
assert.equal(tile.width,512,'Cap high-DPI backing buffers at 2x');
let calls = contexts.at(-1).calls;
assert(calls.some(c => c[0] === 'fill' && c[2] === 'evenodd' && c[3] === '#123456'));
assert(!calls.some(c => c[0] === 'stroke'),'Hover strokes must never be baked into province tiles');
assert.deepEqual(calls.find(c=>c[0]==='transform').slice(1),[2,0,0,2,-200,-248]);
attrs['data-original-fill'] = '#abcdef';
tiles.createTile({x:0,y:-1,z:0});
assert(contexts.at(-1).calls.some(c=>c[0]==='fill' && c[3]==='#abcdef'),'Rebuilt tiles must use updated ownership colors');
console.log('✓ Tile wrapping, nonzero origins, hole hit testing, transforms, DPI and current colors passed');
attrs['data-base-nation']='ITA';tiles.owner.nationColors={ITA:{color:'#abcdef'}};
tiles.createTile({x:0,y:-1,z:0});
assert(!contexts.at(-1).calls.some(c=>c[0]==='fill'),'Unchanged provinces must use the country base instead of double painting');
attrs['data-original-fill']='#ff0000';tiles.createTile({x:0,y:-1,z:0});
assert(contexts.at(-1).calls.some(c=>c[0]==='fill' && c[3]==='#ff0000'),'Occupation overlays must still paint');

const firstCached=tiles.createTile({x:1,y:-1,z:0},()=>{});
const repeated=tiles.createTile({x:1,y:-1,z:0},()=>{});
assert.equal(repeated.dataset.renderer,'cache');
assert(contexts.at(-1).calls.some(c=>c[0]==='copy'));
tiles.redraw();assert.equal(tiles.tileCache.size,0,'Ownership changes invalidate cached pixels');
for(let i=0;i<40;i++)tiles.rememberTile(String(i),{width:512,height:512});
assert(tiles.cacheBytes<=32*1024*1024);assert(!tiles.tileCache.has('0'));
console.log('Tile revisits use cached pixels with bounded memory and ownership invalidation');
const visible=tiles.createTile({x:0,y:-1,z:0});
tiles._map={};tiles._tiles={visible:{el:visible,coords:{x:0,y:-1,z:0},loaded:true}};
tiles.redraw();
assert.equal(tiles._tiles.visible.el,visible,'Capture recolouring must retain the visible canvas');
assert(visible.getContext('2d').calls.some(c=>c[0]==='clear'),'Replacement pixels must clear previous ownership');
assert.equal(province.getBBox().width,20,'Detached geometry retains cached bounds');

assert(province.isPointInFill({x:115,y:230}),'Detached SVG label anchors retain polygon containment');
assert(!province.isPointInFill({x:120,y:230}),'Detached geometry respects polygon holes');
sandbox.DOMPoint=class { constructor(x,y){this.x=x;this.y=y;} };
vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/nations.js'),'utf8')+'\nthis.LabelManager=NationLabelManager;',sandbox);
const labels=new sandbox.LabelManager({getPane:()=>({})});
assert.equal(labels.getTerritorySpan([province],[115,230],0),8.5,'Detached province geometry must retain a nonzero nation-label span');
