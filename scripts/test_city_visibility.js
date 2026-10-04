const assert = require('node:assert/strict');
const CityManager = require('../frontend/js/cities');
const map = { on() {}, getPane: () => ({}), getSize: () => ({ x: 1000, y: 600 }),
    latLngToContainerPoint: point => point };
const manager = new CityManager(map);
function marker(name, x, y) {
    const icon = { style: {} }, label = { style: {} };
    return { cityData: { name }, isCapital: true, labelMinZoom: null,
        getLatLng: () => ({ x, y }), getElement: () => icon,
        getTooltip: () => ({ getElement: () => label }), icon, label };
}
const first = marker('Rome', 100, 100), overlapping = marker('Nearby capital', 115, 100);
const distant = marker('Paris', 400, 200), offscreen = marker('Elsewhere', 1500, 100);
manager.cityMarkers = [first, overlapping, distant, offscreen];
manager.updateVisibility(1);
assert(manager.cityMarkers.every(m => m.icon.style.display === 'none' && m.label.style.display === 'none'));
manager.updateVisibility(2.5);
assert.equal(first.icon.style.display, '');
assert.equal(first.label.style.display, 'none');
manager.updateVisibility(3);
assert.equal(first.label.style.display, 'block');
assert.equal(distant.label.style.display, 'block');
assert.equal(overlapping.icon.style.display, 'none');
assert.equal(offscreen.icon.style.display, 'none');
manager.updateVisibility(0);
assert(manager.cityMarkers.every(m => m.icon.style.display === 'none' && m.label.style.display === 'none'));
console.log('✓ Capital zoom thresholds, overlap suppression and viewport visibility passed');
const NationLabelManager = require('../frontend/js/nations');
const layers = new Set(); let inside = true;
const labelMap = {on(){},getPane:()=>({}),getBounds:()=>({pad:()=>({contains:()=>inside})}),
 hasLayer: marker=>layers.has(marker),removeLayer:marker=>layers.delete(marker)};
const nationManager = new NationLabelManager(labelMap);
const labelNode={offsetWidth:100,style:{setProperty(){}}};
const labelMarker={getLatLng:()=>({}),addTo(){layers.add(this);},getElement:()=>({classList:{toggle(){}},querySelector:()=>labelNode})};
nationManager.nationLabels=[{marker:labelMarker,sizeClass:'large',span:40}];
global.getComputedStyle=()=>({fontSize:'18px'});
try {
 nationManager.updateVisibility(1);assert(layers.has(labelMarker),'Major labels should appear in the regional overview');
 inside=false;nationManager.updateVisibility(2);assert.equal(layers.size,1,'Panning must retain labels without removing and rebuilding their DOM');
 inside=true;nationManager.updateVisibility(2);assert(layers.has(labelMarker),'Panning back must restore labels');
 nationManager.labelsVisible=false;nationManager.updateVisibility(2);assert.equal(layers.size,0);
} finally { delete global.getComputedStyle; }
console.log('✓ Nation label viewport removal, restoration and overview visibility passed');
