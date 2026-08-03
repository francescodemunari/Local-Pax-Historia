const fs = require('fs');
const path = require('path');

console.log('--- Pax Historia Map Data Validator ---');

const projectRoot = path.join(__dirname, '..');
const nationsPath = path.join(projectRoot, 'data/nations_v2.json');
const mapPath = path.join(projectRoot, 'data/hoi4_map.json');
const citiesPath = path.join(projectRoot, 'data/cities.json');
const nationsJsPath = path.join(projectRoot, 'frontend/js/nations.js');

let errors = 0;
let warnings = 0;

// Load Data
const nations = JSON.parse(fs.readFileSync(nationsPath, 'utf8'));
const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

const validNationCodes = new Set(Object.keys(nations));

console.log(`Loaded ${validNationCodes.size} valid nation codes from nations_v2.json`);
console.log(`Loaded ${mapData.regions.length} SVG regions from hoi4_map.json`);
console.log(`Loaded ${cities.length} cities from cities.json`);

// 1. Validate Cities
console.log('\n[1] Validating Cities Data...');
cities.forEach(c => {
    if (!c.id || !c.name || !c.coords || !Array.isArray(c.coords)) {
        console.error(`❌ ERROR: City missing required attributes:`, c);
        errors++;
    } else {
        if (!validNationCodes.has(c.nation_code)) {
            console.error(`❌ ERROR: City '${c.name}' (${c.id}) has invalid nation_code '${c.nation_code}'`);
            errors++;
        }
        const [x, y] = c.coords;
        if (x < 0 || x > 1400.16 || y < 0 || y > 600) {
            console.error(`❌ ERROR: City '${c.name}' coordinates [${x}, ${y}] are out of map bounds`);
            errors++;
        }
    }
});

// 2. Validate Map Regions
console.log('\n[2] Validating Map SVG Regions...');
const unmappedHexCodes = new Set();
const invalidRegionNations = new Set();

mapData.regions.forEach(r => {
    if (r.nation_code) {
        if (r.nation_code.startsWith('#')) {
            unmappedHexCodes.add(r.nation_code);
        } else if (!validNationCodes.has(r.nation_code)) {
            invalidRegionNations.add(r.nation_code);
        }
    }
});

if (unmappedHexCodes.size > 0) {
    console.error(`❌ ERROR: Found ${unmappedHexCodes.size} unmapped hex nation codes in hoi4_map.json:`, Array.from(unmappedHexCodes));
    errors++;
} else {
    console.log(`✓ All map regions use clean 3-letter nation codes.`);
}

if (invalidRegionNations.size > 0) {
    console.warn(`⚠️ WARNING: Found region nation codes not in nations_v2.json:`, Array.from(invalidRegionNations));
    warnings++;
}

// 3. Validate Nations.js Label Overlay Data
console.log('\n[3] Validating Frontend Nation Labels...');
const nationsJsContent = fs.readFileSync(nationsJsPath, 'utf8');

// Extract nationCoordinates keys
const coordsMatch = nationsJsContent.match(/this\.nationCoordinates\s*=\s*\{([\s\S]*?)\};/);
if (coordsMatch) {
    const block = coordsMatch[1];
    const keyMatches = block.match(/'([A-Z0-9]+)':/g) || [];
    const labelKeys = keyMatches.map(k => k.replace(/[':]/g, ''));
    
    const keyCounts = {};
    labelKeys.forEach(k => {
        keyCounts[k] = (keyCounts[k] || 0) + 1;
        if (!validNationCodes.has(k)) {
            console.warn(`⚠️ WARNING: Label defined for nation code '${k}' which is not in nations_v2.json`);
            warnings++;
        }
    });

    const duplicates = Object.keys(keyCounts).filter(k => keyCounts[k] > 1);
    if (duplicates.length > 0) {
        console.error(`❌ ERROR: Found duplicate nation label keys in nations.js:`, duplicates);
        errors++;
    } else {
        console.log(`✓ All ${labelKeys.length} nation label keys in nations.js are unique.`);
    }
} else {
    console.error(`❌ ERROR: Could not parse nationCoordinates from nations.js`);
    errors++;
}

// Summary
console.log('\n=======================================');
if (errors === 0) {
    console.log(`✅ MAP DATA VALIDATION PASSED! (${warnings} warnings)`);
    process.exit(0);
} else {
    console.error(`❌ MAP DATA VALIDATION FAILED with ${errors} error(s) and ${warnings} warning(s).`);
    process.exit(1);
}
