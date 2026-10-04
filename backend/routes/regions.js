const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

/**
 * GET /api/regions
 * Get all regions or filter by nation
 */
router.get('/', async (req, res) => {
    try {
        const { nation_code, save_id } = req.query;
        let gameState = null;
        if (save_id) gameState = await engine.loadGame(save_id);
        const scenarioId = gameState?.scenarioId;
        const mapData = gameState ? engine.getMapWithControl(gameState) : engine.scenarios.getMap(scenarioId);
        const metadata = engine.scenarios.getRegionMetadata(scenarioId);

        let regions = mapData.regions.map(r => {
            const meta = metadata[r.name] || metadata[r.id] || {};
            return {
                id: r.id,
                name: r.name,
                ...meta,
                nation_code: r.nation_code || null
            };
        });

        if (nation_code) {
            regions = regions.filter(r => r.nation_code === nation_code.toUpperCase());
        }

        res.json(regions);
    } catch (error) {
        console.error('Error fetching regions:', error);
        res.status(500).json({ error: 'Failed to fetch regions' });
    }
});

/**
 * GET /api/regions/:id
 * Get a specific region by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const gameState = req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const mapData = gameState ? engine.getMapWithControl(gameState) : engine.scenarios.getMap(gameState?.scenarioId);
        const metadata = engine.scenarios.getRegionMetadata(gameState?.scenarioId);

        const region = mapData.regions.find(r => r.id === id || r.name === id);

        if (!region) {
            return res.status(404).json({ error: 'Region not found' });
        }

        const meta = metadata[region.name] || metadata[region.id] || {};

        res.json({
            id: region.id,
            name: region.name,
            ...meta,
            nation_code: region.nation_code || null
        });
    } catch (error) {
        console.error('Error fetching region:', error);
        res.status(500).json({ error: 'Failed to fetch region' });
    }
});

/**
 * GET /api/regions/:id/stats
 * Get detailed stats for a region
 */
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const gameState = req.query.saveId ? await engine.loadGame(req.query.saveId) : null;
        const mapData = gameState ? engine.getMapWithControl(gameState) : engine.scenarios.getMap(gameState?.scenarioId);
        const metadata = engine.scenarios.getRegionMetadata(gameState?.scenarioId);

        const region = mapData.regions.find(r => r.id === id || r.name === id);

        if (!region) {
            return res.status(404).json({ error: 'Region not found' });
        }

        const meta = metadata[region.name] || metadata[region.id] || {};

        const nations = engine.getNations(gameState?.scenarioId);
        const cities = engine.scenarios.getCities(gameState?.scenarioId)
            .filter(city => city.region_id === region.id || city.region_id === region.name)
            .map(city => ({ id: city.id, name: city.name, type: city.type }));

        res.json({
            id: region.id,
            name: region.name,
            nation_code: region.nation_code || null,
            nation_name: nations[region.nation_code]?.name || null,
            terrain: meta.terrain || (region.is_coastal ? 'Coastal' : 'Unknown'),
            infrastructure: Number.isFinite(meta.infrastructure) ? meta.infrastructure : null,
            supply_capacity: Number.isFinite(meta.supply_capacity) ? meta.supply_capacity : null,
            important_cities: Array.isArray(meta.important_cities) ? meta.important_cities : cities.map(city => city.name),
            cities,
            unit_count: (gameState?.units || []).filter(unit => unit.region_id === region.id || unit.region_id === region.name).length
        });
    } catch (error) {
        console.error('Error fetching region stats:', error);
        res.status(500).json({ error: 'Failed to fetch region stats' });
    }
});

module.exports = router;
