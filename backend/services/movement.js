const { geometry, interiorPoint } = require('./map-geometry');

// These are game-balance speeds in schematic SVG units/day, not kilometres.
const SPEED = Object.freeze({ infantry: 2, armor: 4 });
const cache = new WeakMap();
function distanceKm(a, b) {
    const rad = Math.PI / 180;
    const h = Math.sin((b[1]-a[1])*rad/2)**2 + Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
const key = point => point.map(value => Math.round(value * 100)).join(',');
const area = ring => Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - b[0] * a[1];
}, 0));

function landGraph(regions) {
    if (cache.has(regions)) return cache.get(regions);
    const graph = new Map(), edges = new Map();
    if (regions.every(region => Array.isArray(region.neighbors) && region.geographic_anchor)) {
        const ids = new Set(regions.map(region => region.id));
        for (const region of regions) graph.set(region.id, { region, anchor: region.marker_anchor,
            neighbors: new Set(region.neighbors.filter(id => ids.has(id))) });
        cache.set(regions, graph);
        return graph;
    }
    for (const region of regions) {
        // Use the main land component only: a province's remote islands must
        // not become a free bridge across the sea.
        const ring = [...geometry(region.path).rings].sort((a, b) => area(b) - area(a))[0];
        const anchor = interiorPoint(region.path, region.fill_rule);
        graph.set(region.id, { region, anchor, neighbors: new Set() });
        ring.forEach((a, i) => {
            const b = ring[(i + 1) % ring.length];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) return;
            const edgeKey = [key(a), key(b)].sort().join(':');
            if (!edges.has(edgeKey)) edges.set(edgeKey, new Set());
            edges.get(edgeKey).add(region.id);
        });
    }
    for (const owners of edges.values()) {
        if (owners.size !== 2) continue;
        const [a, b] = [...owners];
        graph.get(a).neighbors.add(b); graph.get(b).neighbors.add(a);
    }
    cache.set(regions, graph);
    return graph;
}

function findLandRoute(regions, origin, destination, unitType, canEnter, speed = SPEED[unitType], kilometersPerDay = null) {
    if ((!Number.isFinite(speed) || speed <= 0) && !(Number.isFinite(kilometersPerDay) && kilometersPerDay > 0)) return null;
    const graph = landGraph(regions);
    if (!graph.has(origin) || !graph.has(destination) || !canEnter(graph.get(origin).region)) return null;
    const distance = new Map([[origin, 0]]), previous = new Map(), visited = new Set();
    while (true) {
        let current, best = Infinity;
        for (const [id, cost] of distance) if (!visited.has(id) && cost < best) { current = id; best = cost; }
        if (!current) return null;
        if (current === destination) {
            const route = [current];
            while (previous.has(route[0])) route.unshift(previous.get(route[0]));
            const result = { region_ids: route, required_days: Math.ceil(best - 1e-9) };
            if (kilometersPerDay > 0 && route.every(id=>graph.get(id).region.geographic_anchor)) result.distance_km = Math.round(route.slice(1).reduce((sum,id,i) =>
                sum + distanceKm(graph.get(route[i]).region.geographic_anchor,graph.get(id).region.geographic_anchor),0));
            return result;
        }
        visited.add(current);
        const node = graph.get(current);
        for (const id of node.neighbors) {
            const next = graph.get(id);
            if (visited.has(id) || !canEnter(next.region)) continue;
            const duration = kilometersPerDay > 0 && node.region.geographic_anchor && next.region.geographic_anchor
                ? distanceKm(node.region.geographic_anchor,next.region.geographic_anchor) / kilometersPerDay
                : Math.hypot(node.anchor[0]-next.anchor[0],node.anchor[1]-next.anchor[1]) / speed;
            const cost = best + Math.max(1, duration);
            if (cost < (distance.get(id) ?? Infinity)) { distance.set(id, cost); previous.set(id, current); }
        }
    }
}

module.exports = { landGraph, findLandRoute, SPEED };
