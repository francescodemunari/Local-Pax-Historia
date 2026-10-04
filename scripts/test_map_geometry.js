const assert = require('node:assert/strict');
const { contains, interiorPoint } = require('../backend/services/map-geometry');

// A bbox center is in the missing corner of this concave territory.
const concave = 'M0 0H10V2H2V10H0Z';
assert.equal(contains(concave, [5, 5]), false);
assert(contains(concave, interiorPoint(concave)));
const archipelago = 'M0 0h3v3h-3z M100 0h2v2h-2z';
assert.equal(contains(archipelago, [50, 1]), false);
assert(contains(archipelago, interiorPoint(archipelago)));
const hole = 'M0 0H10V10H0Z M3 3V7H7V3Z';
assert.equal(contains(hole, [5, 5]), false);
assert(contains(hole, interiorPoint(hole)));
const evenodd = 'M0 0H10V10H0Z M3 3H7V7H3Z';
assert.equal(contains(evenodd, [5, 5], 'evenodd'), false);
assert.equal(contains(evenodd, [5, 5]), true);
const circle = 'M10 0A10 10 0 1 1-10 0A10 10 0 1 1 10 0Z';
assert(contains(circle, [0, 9]));
assert.equal(contains(circle, [9, 9]), false);
assert(contains(circle, interiorPoint(circle)));
const curves = 'M0 0C0 10 10 10 10 0S20-10 20 0L20 20Q10 10 0 20T-20 20Z';
assert(contains(curves, interiorPoint(curves)));
assert.throws(() => interiorPoint('M0 0L1 1'), /no area/);
assert.throws(() => interiorPoint('this is not a path'), /Invalid SVG path/);
assert.equal(contains(concave, [NaN, 0]), false);
console.log('✓ Curves, arcs, holes, islands, and concave territory checks passed');

const atlas=require('../data/scenarios/ww2-geographic/map.json');
const aden=atlas.regions.filter(r=>r.id.startsWith('aden_'));
assert(aden.length>0 && aden.every(r=>r.nation_code==='ENG'));
assert(aden.some(r=>contains(r.path,[(49+180)*4,(90-15)*4],r.fill_rule)),'The Hadhramaut gap must be covered by a playable province');
console.log('Aden supplement covers the previously unassigned southern Arabian land');
