const fs = require('fs');
const path = require('path');
const { contains, geometry, signedDistance } = require('./map-geometry');

const dataDirectory = path.resolve(__dirname, '../../data');
const scenariosDirectory = path.join(dataDirectory, 'scenarios');
const frontendDirectory = path.resolve(__dirname, '../../frontend');
const sharedAssetCache = new Map();
let installedScenarios;

function isFiniteCoordinatePair(value) {
    return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

/**
 * Loads versioned scenario manifests and their assets.  The service deliberately
 * constrains all assets to data/ so a manifest cannot read arbitrary local files.
 */
class ScenarioService {
    constructor() {
        this.assetCache = sharedAssetCache;
        // Routes share the installed catalog. Validate large geographic bundles
        // once per process, rather than once for every engine/router instance.
        if (!installedScenarios) installedScenarios = this.loadScenarios();
        this.scenarios = new Map(installedScenarios);
    }

    loadScenarios() {
        if (!fs.existsSync(scenariosDirectory)) return new Map();

        const scenarios = new Map();
        for (const filename of fs.readdirSync(scenariosDirectory).filter(file => file.endsWith('.json'))) {
            const manifestPath = path.join(scenariosDirectory, filename);
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            this.validateManifest(manifest, filename);
            this.validateScenarioAssets(manifest);
            if (scenarios.has(manifest.id)) {
                throw new Error(`Duplicate scenario id: ${manifest.id}`);
            }
            scenarios.set(manifest.id, manifest);
        }
        const defaults = Array.from(scenarios.values()).filter(scenario => scenario.isDefault);
        if (defaults.length !== 1) {
            throw new Error(`Exactly one scenario must be marked isDefault (found ${defaults.length})`);
        }

        return scenarios;
    }

    validateManifest(manifest, filename) {
        if (!manifest || typeof manifest !== 'object' || !/^[a-z0-9-]+$/.test(manifest.id || '')) {
            throw new Error(`Invalid scenario manifest: ${filename}`);
        }
        if (!manifest.name || !manifest.era || !manifest.version || !manifest.assets || !manifest.assets.nations || !manifest.assets.map || !manifest.assets.cities) {
            throw new Error(`Scenario ${manifest.id} must define name, era, version, nations, map, and cities assets`);
        }
        if (typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.era !== 'string' || !manifest.era.trim()) {
            throw new Error(`Scenario ${manifest.id} must define non-empty name and era strings`);
        }
        if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version)) {
            throw new Error(`Scenario ${manifest.id} has an invalid semantic version`);
        }
        if (!Array.isArray(manifest.startDates) || manifest.startDates.length === 0 ||
            manifest.startDates.some(date => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
            throw new Error(`Scenario ${manifest.id} must provide valid ISO startDates`);
        }
        if (manifest.defaultStartDate !== undefined && !manifest.startDates.includes(manifest.defaultStartDate)) {
            throw new Error(`Scenario ${manifest.id} has an unsupported defaultStartDate`);
        }
        if (!manifest.renderer) throw new Error(`Scenario ${manifest.id} requires an SVG renderer`);
        if (manifest.renderer) {
            const { type, svgUrl } = manifest.renderer;
            if (type !== 'svg-overlay' || typeof svgUrl !== 'string' ||
                !svgUrl.startsWith('/') || svgUrl.includes('..') || /:\/\//.test(svgUrl)) {
                throw new Error(`Scenario ${manifest.id} has an invalid SVG renderer`);
            }
            const svgPath = path.resolve(frontendDirectory, `.${svgUrl}`);
            if (svgPath !== frontendDirectory && !svgPath.startsWith(`${frontendDirectory}${path.sep}`)) {
                throw new Error(`Scenario ${manifest.id} has an unsafe SVG renderer path`);
            }
            if (!fs.existsSync(svgPath)) {
                throw new Error(`Scenario ${manifest.id} is missing renderer SVG: ${svgUrl}`);
            }
        }
    }

    validateScenarioAssets(manifest) {
        const readRequiredJson = assetName => {
            const assetPath = this.resolveAsset(manifest, assetName);
            if (!fs.existsSync(assetPath)) {
                throw new Error(`Scenario ${manifest.id} is missing ${assetName} asset: ${assetPath}`);
            }
            try {
                return JSON.parse(fs.readFileSync(assetPath, 'utf8'));
            } catch (error) {
                throw new Error(`Scenario ${manifest.id} has invalid ${assetName} JSON: ${error.message}`);
            }
        };

        const nations = readRequiredJson('nations');
        const map = readRequiredJson('map');
        if (!nations || Array.isArray(nations) || typeof nations !== 'object' || Object.keys(nations).length === 0) {
            throw new Error(`Scenario ${manifest.id} must define at least one nation`);
        }
        Object.entries(nations).forEach(([code, nation]) => {
            if (!/^[A-Z0-9]{3}$/.test(code) || !nation || typeof nation.name !== 'string' || !nation.name.trim() ||
                typeof nation.capital !== 'string' || !nation.capital.trim()) {
                throw new Error(`Scenario ${manifest.id} has invalid nation data for ${code}`);
            }
        });

        const viewBox = String(map?.viewBox || '').trim().split(/\s+/).map(Number);
        if (!Array.isArray(map?.regions) || map.regions.length === 0 || viewBox.length !== 4 ||
            viewBox.some(value => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
            throw new Error(`Scenario ${manifest.id} must define a map viewBox and regions`);
        }

        const regionIds = new Set();
        map.regions.forEach(region => {
            if (!region || typeof region.id !== 'string' || !region.id || regionIds.has(region.id) ||
                typeof region.path !== 'string' || !region.path.trim() || !nations[region.nation_code]) {
                throw new Error(`Scenario ${manifest.id} has an invalid map region: ${region?.id || 'unknown'}`);
            }
            regionIds.add(region.id);
            const validAnchor = map.coordinateSystem === 'WGS84'
                ? isFiniteCoordinatePair(region.marker_anchor) && signedDistance(geometry(region.path), region.marker_anchor, region.fill_rule) > 0
                : contains(region.path, region.marker_anchor, region.fill_rule);
            if (region.marker_anchor !== undefined && !validAnchor) {
                throw new Error(`Scenario ${manifest.id} region ${region.id} has an anchor outside its territory`);
            }
        });

        if (manifest.regionAliases !== undefined) {
            if (!manifest.regionAliases || Array.isArray(manifest.regionAliases) || typeof manifest.regionAliases !== 'object') {
                throw new Error(`Scenario ${manifest.id} regionAliases must be an object`);
            }
            Object.entries(manifest.regionAliases).forEach(([alias, regionId]) => {
                if (!alias.trim() || typeof regionId !== 'string' || !regionIds.has(regionId)) {
                    throw new Error(`Scenario ${manifest.id} has an invalid region alias: ${alias}`);
                }
            });
        }

        const cities = readRequiredJson('cities');
        if (map.coordinateSystem === 'WGS84') {
            const byId = new Map(map.regions.map(region => [region.id,region]));
            for (const region of map.regions) {
                if (!isFiniteCoordinatePair(region.geographic_anchor) || !Array.isArray(region.neighbors) ||
                    region.neighbors.some(id => id===region.id || !byId.has(id) || !byId.get(id).neighbors?.includes(region.id))) {
                    throw new Error(`Scenario ${manifest.id} has invalid geographic topology at ${region.id}`);
                }
            }
        }
        if (!Array.isArray(cities)) throw new Error(`Scenario ${manifest.id} cities must be an array`);
        const cityIds = new Set();
        const cityPlaces = new Set();
        const regionById = new Map(map.regions.map(region => [region.id, region]));
        const capitalsByNation = new Map();
        cities.forEach(city => {
            if (!city || typeof city.id !== 'string' || !city.id || cityIds.has(city.id) ||
                typeof city.name !== 'string' || !city.name.trim() || !nations[city.nation_code] || !isFiniteCoordinatePair(city.coords)) {
                throw new Error(`Scenario ${manifest.id} has invalid city data: ${city?.id || 'unknown'}`);
            }
            const [x, y] = city.coords;
            const region = regionById.get(city.region_id);
            const geographicCity = map.coordinateSystem === 'WGS84' && city.geographic === true &&
                Number.isFinite(city.longitude) && Number.isFinite(city.latitude) &&
                city.longitude >= -180 && city.longitude <= 180 && city.latitude >= -90 && city.latitude <= 90 &&
                Math.abs(city.coords[0] - (city.longitude + 180) * 4) < 0.0001 &&
                Math.abs(city.coords[1] - (90 - city.latitude) * 4) < 0.0001 &&
                Number.isFinite(city.coastal_offset_degrees) && city.coastal_offset_degrees <= 0.5;
            if (map.coordinateSystem === 'WGS84' && !geographicCity) {
                throw new Error(`Scenario ${manifest.id} city ${city.id} has inconsistent geographic coordinates`);
            }
            if (!region || (!geographicCity && !contains(region.path, city.coords, region.fill_rule))) {
                throw new Error(`Scenario ${manifest.id} city ${city.id} must lie inside its declared map region`);
            }
            if (city.nation_code !== region.nation_code) {
                throw new Error(`Scenario ${manifest.id} city ${city.id} has a different controller from its region`);
            }
            const placeKey = `${city.region_id}:${city.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`;
            if (cityPlaces.has(placeKey)) throw new Error(`Scenario ${manifest.id} has duplicate city ${city.name}`);
            cityPlaces.add(placeKey);
            if (x < viewBox[0] || x > viewBox[0] + viewBox[2] || y < viewBox[1] || y > viewBox[1] + viewBox[3]) {
                throw new Error(`Scenario ${manifest.id} city ${city.id} is outside its map viewBox`);
            }
            if (city.label_min_zoom !== undefined && (!Number.isFinite(city.label_min_zoom) || city.label_min_zoom < 0 || city.label_min_zoom > 24)) {
                throw new Error(`Scenario ${manifest.id} city ${city.id} has invalid label_min_zoom`);
            }
            if (city.type === 'capital' || city.is_capital) {
                const capitals = capitalsByNation.get(city.nation_code) || [];
                capitals.push(city);
                capitalsByNation.set(city.nation_code, capitals);
            }
            cityIds.add(city.id);
        });
        Object.entries(nations).forEach(([code, nation]) => {
            const capitals = capitalsByNation.get(code) || [];
            if(nation.is_territory_group && nation.playable===false && capitals.length===0)return;
            if (capitals.length !== 1) {
                throw new Error(`Scenario ${manifest.id} nation ${code} must have exactly one capital marker`);
            }
            const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const declared = normalize(nation.capital);
            const mapped = normalize(capitals[0].name);
            if (!declared.includes(mapped) && !mapped.includes(declared)) {
                throw new Error(`Scenario ${manifest.id} nation ${code} capital does not match its city marker`);
            }
        });

        const catalog = manifest.unitCatalog;
        if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object' || Object.keys(catalog).length === 0) {
            throw new Error(`Scenario ${manifest.id} must define a non-empty unitCatalog`);
        }
        Object.entries(catalog).forEach(([type, unit]) => {
            if (!/^[a-z][a-z0-9_-]*$/.test(type) || !unit || typeof unit.label !== 'string' || !unit.label.trim() ||
                (unit.manpower !== undefined && (!Number.isFinite(unit.manpower) || unit.manpower <= 0)) ||
                (unit.treasury !== undefined && (!Number.isFinite(unit.treasury) || unit.treasury < 0))) {
                throw new Error(`Scenario ${manifest.id} has an invalid unit catalog entry: ${type}`);
            }
            if (unit.landSpeed !== undefined && (!Number.isFinite(unit.landSpeed) || unit.landSpeed < 0 || unit.landSpeed > 100)) {
                throw new Error(`Scenario ${manifest.id} has invalid landSpeed for ${type}`);
            }
            if (unit.landKmPerDay !== undefined && (!Number.isFinite(unit.landKmPerDay) || unit.landKmPerDay <= 0 || unit.landKmPerDay > 1000)) {
                throw new Error(`Scenario ${manifest.id} has invalid landKmPerDay for ${type}`);
            }
        });
        if (manifest.initialNationState !== undefined) {
            const allowed = { stability: 100, warSupport: 100, manpower: 1e9, treasury: 1e9, politicalPower: 1e9 };
            if (!manifest.initialNationState || Array.isArray(manifest.initialNationState) || typeof manifest.initialNationState !== 'object') {
                throw new Error(`Scenario ${manifest.id} has invalid initialNationState`);
            }
            for (const [code, state] of Object.entries(manifest.initialNationState)) {
                if (!Object.hasOwn(nations, code) || !state || Array.isArray(state) || typeof state !== 'object' ||
                    Object.entries(state).some(([field, value]) => !Object.hasOwn(allowed, field) ||
                        !Number.isFinite(value) || value < 0 || value > allowed[field])) {
                    throw new Error(`Scenario ${manifest.id} has invalid initial state for ${code}`);
                }
            }
        }
        if(manifest.initialWars!==undefined && (!Array.isArray(manifest.initialWars) || manifest.initialWars.some(pair=>
            !Array.isArray(pair) || pair.length!==2 || pair[0]===pair[1] || pair.some(code=>!Object.hasOwn(nations,code))))) {
            throw new Error(`Scenario ${manifest.id} has invalid initialWars`);
        }
    }

    getDefaultScenario() {
        const preferred = Array.from(this.scenarios.values()).find(scenario => scenario.isDefault);
        const fallback = preferred || this.scenarios.values().next().value;
        if (!fallback) throw new Error('No scenario manifests are installed');
        return fallback;
    }

    getScenario(scenarioId) {
        if (!scenarioId) return this.getDefaultScenario();
        const scenario = this.scenarios.get(scenarioId);
        if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
        return scenario;
    }

    getSaveScenario(state) {
        if (!state.scenarioId || state.scenarioId === 'ww2-1935') {
            throw new Error('This save uses the removed WWII illustrated map. Start a new geographic campaign.');
        }
        const id = state.scenarioId;
        const archiveId = `${id}-sectors-v1`;
        if ((!state.scenarioVersion || state.scenarioVersion === '1.0.0') && this.scenarios.has(archiveId)) {
            return this.getScenario(archiveId);
        }
        return this.getScenario(id);
    }

    listScenarios() {
        return Array.from(this.scenarios.values())
            .filter(scenario => !scenario.hidden)
            .map(({ id, name, era, version, description, worldContext, startDates, defaultStartDate, isDefault }) => ({
                id, name, era, version, description, worldContext, startDates: startDates || [],
                defaultStartDate: defaultStartDate || startDates?.[0], isDefault: Boolean(isDefault)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    resolveAsset(scenario, assetName, optional = false) {
        const relativePath = scenario.assets?.[assetName];
        if (!relativePath) {
            if (optional) return null;
            throw new Error(`Scenario ${scenario.id} does not define a ${assetName} asset`);
        }

        const resolvedPath = path.resolve(dataDirectory, relativePath);
        if (resolvedPath !== dataDirectory && !resolvedPath.startsWith(`${dataDirectory}${path.sep}`)) {
            throw new Error(`Scenario ${scenario.id} has an unsafe ${assetName} asset path`);
        }
        return resolvedPath;
    }

    loadJson(scenarioId, assetName, fallback) {
        const scenario = this.getScenario(scenarioId);
        const assetPath = this.resolveAsset(scenario, assetName, true);
        if (!assetPath) return fallback;
        if (!fs.existsSync(assetPath)) {
            throw new Error(`Scenario ${scenario.id} is missing ${assetName} asset: ${assetPath}`);
        }
        const stat = fs.statSync(assetPath);
        const cached = this.assetCache.get(assetPath);
        if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) return cached.data;
        const data = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
        this.assetCache.set(assetPath, { data, mtime: stat.mtimeMs, size: stat.size });
        return data;
    }

    getNations(scenarioId) {
        return this.loadJson(scenarioId, 'nations', {});
    }

    getMap(scenarioId) {
        return this.loadJson(scenarioId, 'map', { regions: [] });
    }

    getCities(scenarioId) {
        return this.loadJson(scenarioId, 'cities', []);
    }

    getRegionMetadata(scenarioId) {
        return this.loadJson(scenarioId, 'regionMetadata', {});
    }

    getRoadmaps(scenarioId) {
        return this.loadJson(scenarioId, 'roadmaps', {});
    }
}

module.exports = ScenarioService;
