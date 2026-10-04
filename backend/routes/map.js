const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();
const { interiorPoint } = require('../services/map-geometry');
async function resolveScenarioId(req) {
    if (req.query.saveId) {
        const gameState = await engine.loadGame(req.query.saveId);
        return gameState.scenarioId;
    }
    return req.query.scenarioId || null;
}

router.get('/flags', (req,res) => res.json(require('../../data/flags/catalog.json')));

// Get map data (HOI4 States from SVG)
router.get('/geojson', async (req, res) => {
    try {
        const gameState = req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const scenarioId = gameState?.scenarioId || req.query.scenarioId || null;
        const scenario = engine.scenarios.getScenario(scenarioId);
        const map = gameState ? engine.getMapWithControl(gameState) : engine.scenarios.getMap(scenario.id);
        const regions = req.query.compact === '1'
            ? map.regions.map(({ path, ...region }) => region)
            : map.regions;
        res.json({
            ...map, regions,
            scenarioId: scenario.id,
            renderer: scenario.renderer
        });
    } catch (error) {
        console.error('Error loading map data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get map colors for nations
router.get('/colors', async (req, res) => {
    try {
        const state=req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const nations = state ? engine.getEffectiveNations(state) : engine.getNations(await resolveScenarioId(req));

        const cities = state ? engine.getEffectiveCities(state) : engine.scenarios.getCities(await resolveScenarioId(req));

        // Create a map of nation code to color
        const colors = {};
        for (const code in nations) {
            if (nations.hasOwnProperty(code)) {
                const nation = nations[code];
                colors[code] = {
                    color: nation.color,
                    name: nation.name,
                    label_anchor: nation.label_anchor || null,
                    capital: cities.find(city => city.nation_code === code && (city.type === 'capital' || city.is_capital)) || null
                };
            }
        }

        res.json(colors);
    } catch (error) {
        console.error('Error fetching nation colors:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search map features
router.get('/search/:query', async (req, res) => {
    try {
        const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/_/g, ' ');
        const searchTerm = normalize(req.params.query).trim();
        if (searchTerm.length < 2) return res.json([]);
        const gameState = req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const scenarioId = gameState?.scenarioId || req.query.scenarioId || null;
        const nationsData = gameState ? engine.getEffectiveNations(gameState) : engine.getNations(scenarioId);
        const map = gameState ? engine.getMapWithControl(gameState) : engine.scenarios.getMap(scenarioId);
        const results = [];

        // Search nations
        for (const code in nationsData) {
            if (nationsData.hasOwnProperty(code)) {
                const nation = nationsData[code];
                if (normalize(nation.name).includes(searchTerm) ||
                    (nation.name_local && normalize(nation.name_local).includes(searchTerm)) ||
                    normalize(code).includes(searchTerm)) {
                    results.push({
                        type: 'nation',
                        id: code,
                        name: nation.name,
                        detail: nation.capital,
                        color: nation.color,
                        category: 'Nations'
                    });
                }
            }
        }

        for (const city of (gameState ? engine.getEffectiveCities(gameState) : engine.scenarios.getCities(scenarioId))) {
            if (!normalize(city.name).includes(searchTerm) && !normalize(city.id).includes(searchTerm)) continue;
            const region = map.regions.find(region => region.id === city.region_id);
            results.push({ type: 'city', id: city.id, name: city.name, region_id: city.region_id,
                coords: city.coords, detail: nationsData[region.nation_code]?.name,
                color: nationsData[region.nation_code]?.color, category: 'Cities' });
        }
        const matchingProvinces = new Map();
        for (const region of map.regions) {
            if (!normalize(region.name).includes(searchTerm) && !normalize(region.id).includes(searchTerm)) continue;
            const key = normalize(region.name) + ':' + region.nation_code;
            const existing = matchingProvinces.get(key);
            if (!existing || (region.area_km2 || 0) > (existing.area_km2 || 0)) matchingProvinces.set(key, region);
        }
        // One useful result per named province, rather than twenty identical
        // island fragments. Exact region-ID searches still find that fragment.
        for (const region of matchingProvinces.values()) {
            results.push({ type: 'region', id: region.id, name: region.name, region_id: region.id,
                coords: region.marker_anchor || interiorPoint(region.path, region.fill_rule),
                detail: nationsData[region.nation_code]?.name,
                color: nationsData[region.nation_code]?.color, category: 'Regions' });
        }
        results.sort((a, b) => Number(normalize(b.name) === searchTerm) - Number(normalize(a.name) === searchTerm));
        res.json(results.slice(0, 20));
    } catch (error) {
        console.error('Error searching map:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get nation info for map popup
router.get('/nation/:code', async (req, res) => {
    try {
        const state=req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const nations = state ? engine.getEffectiveNations(state) : engine.getNations(await resolveScenarioId(req));
        const nation = nations[req.params.code.toUpperCase()];

        if (!nation) {
            return res.status(404).json({ error: 'Nation not found' });
        }

        res.json(nation);
    } catch (error) {
        console.error('Error fetching nation info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get nation info with game state
router.get('/nation/:code/state/:saveId', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getEffectiveNations(gameState);
        const nation = nations[req.params.code.toUpperCase()];

        if (!nation) {
            return res.status(404).json({ error: 'Nation not found' });
        }

        res.json({
            ...nation,
            capital:engine.getEffectiveCities(gameState).find(c=>c.nation_code===nation.code && c.is_capital)?.name || null,
            controlled_provinces:engine.scenarios.getMap(gameState.scenarioId).regions.filter(r=>engine.getRegionController(gameState,r)===nation.code).length,
            formations:(gameState.units||[]).filter(u=>u.nation_code===nation.code).length
        });
    } catch (error) {
        console.error('Error fetching nation state:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get cities data
router.get('/cities', async (req, res) => {
    try {
        const gameState = req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const scenarioId = gameState?.scenarioId || req.query.scenarioId || null;
        const regions = new Map(engine.scenarios.getMap(scenarioId).regions.map(region => [region.id, region]));
        res.json((gameState ? engine.getEffectiveCities(gameState) : engine.scenarios.getCities(scenarioId)).map(city => ({
            ...city,
            historical_nation_code: city.nation_code,
            nation_code: gameState ? engine.getRegionController(gameState, regions.get(city.region_id)) : city.nation_code
        })));
    } catch (error) {
        console.error('Error fetching cities:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
