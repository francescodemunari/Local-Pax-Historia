const svgpath = require('svgpath');

// SVG coordinates, not longitude/latitude. Flatten curves to 0.005 map units
// and use SVG's nonzero winding rule, including disconnected islands and holes.
const cache = new Map();
const tolerance = 0.005;
const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function segmentDistance(point, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function flatten(points, output, depth = 0) {
    const end = points.at(-1);
    if (depth >= 18 || points.slice(1, -1).every(p => segmentDistance(p, points[0], end) <= tolerance)) {
        output.push(end);
        return;
    }
    let level = points;
    const left = [points[0]], right = [end];
    while (level.length > 1) {
        level = level.slice(1).map((p, i) => midpoint(level[i], p));
        left.push(level[0]);
        right.unshift(level.at(-1));
    }
    flatten(left, output, depth + 1);
    flatten(right, output, depth + 1);
}

function bounds(points) {
    return points.reduce((b, [x, y]) => ({
        minX: Math.min(b.minX, x), minY: Math.min(b.minY, y),
        maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function geometry(pathData) {
    if (cache.has(pathData)) return cache.get(pathData);
    const parsed = svgpath(pathData);
    if (parsed.err) throw new Error(`Invalid SVG path: ${parsed.err}`);
    const rings = [];
    let ring = null;
    parsed.abs().unshort().unarc().iterate((s, index, x, y) => {
        const type = s[0].toUpperCase();
        if (type === 'M') { ring = [[s[1], s[2]]]; rings.push(ring); }
        else if (type === 'L') ring.push([s[1], s[2]]);
        else if (type === 'H') ring.push([s[1], y]);
        else if (type === 'V') ring.push([x, s[1]]);
        else if (type === 'C') flatten([[x, y], [s[1], s[2]], [s[3], s[4]], [s[5], s[6]]], ring);
        else if (type === 'Q') flatten([[x, y], [s[1], s[2]], [s[3], s[4]]], ring);
        else if (type !== 'Z') throw new Error(`Unsupported SVG command ${type}`);
    });
    const usable = rings.filter(r => r.length >= 3);
    if (!usable.length) throw new Error('SVG region has no area');
    const result = { rings: usable, bounds: bounds(usable.flat()), ringBounds: usable.map(bounds) };
    cache.set(pathData, result);
    return result;
}

function signedDistance(shape, point, fillRule = 'nonzero') {
    let winding = 0, distance = Infinity;
    for (const ring of shape.rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            distance = Math.min(distance, segmentDistance(point, a, b));
            const side = (b[0] - a[0]) * (point[1] - a[1]) - (point[0] - a[0]) * (b[1] - a[1]);
            if (a[1] <= point[1] && b[1] > point[1] && side > 0) winding++;
            if (a[1] > point[1] && b[1] <= point[1] && side < 0) winding--;
        }
    }
    const inside = fillRule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
    return inside ? distance : -distance;
}

function contains(pathData, point, fillRule = 'nonzero') {
    return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) &&
        signedDistance(geometry(pathData), point, fillRule) > tolerance;
}

function interiorPoint(pathData, fillRule = 'nonzero') {
    const shape = geometry(pathData);
    if (shape[fillRule]) return [...shape[fillRule]];
    let best = null, bestDistance = -Infinity;
    const consider = point => {
        const distance = signedDistance(shape, point, fillRule);
        if (distance > bestDistance) { bestDistance = distance; best = point; }
    };
    // Search the largest components separately; the combined bounding rectangle
    // of an archipelago can put its center in the ocean between islands.
    const components = [...shape.ringBounds].sort((a, b) =>
        (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY));
    for (const b of components.slice(0, 8)) {
        for (let row = 0; row < 12; row++) for (let col = 0; col < 12; col++) {
            consider([b.minX + (col + 0.5) * (b.maxX - b.minX) / 12,
                b.minY + (row + 0.5) * (b.maxY - b.minY) / 12]);
        }
    }
    let radius = Math.max(shape.bounds.maxX - shape.bounds.minX, shape.bounds.maxY - shape.bounds.minY) / 20;
    for (let level = 0; level < 10; level++, radius /= 2) {
        const center = best;
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) consider([center[0] + x * radius / 2, center[1] + y * radius / 2]);
    }
    if (!(bestDistance > tolerance)) throw new Error('Could not find an interior point for SVG region');
    shape[fillRule] = best;
    return [...best];
}

module.exports = { geometry, contains, interiorPoint, signedDistance };
