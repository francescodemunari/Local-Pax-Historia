const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const mapDataPath = path.join(__dirname, '../../data/hoi4_map.json');
const regionMetadataPath = path.join(__dirname, '../../data/region_metadata.json');

function getMapData() {
    if (fs.existsSync(mapDataPath)) {
        return JSON.parse(fs.readFileSync(mapDataPath, 'utf-8'));
    }
    return { regions: [] };
}

function getRegionMetadata() {
    if (fs.existsSync(regionMetadataPath)) {
        return JSON.parse(fs.readFileSync(regionMetadataPath, 'utf-8'));
    }
    return {};
}

/**
 * GET /api/regions
 * Get all regions or filter by nation
 */
router.get('/', async (req, res) => {
    try {
        const { nation_code, save_id } = req.query;
        const mapData = getMapData();
        const metadata = getRegionMetadata();

        // If save_id is provided, we need to load occupations
        let occupations = {};
        if (save_id) {
            try {
                const GameEngine = require('../services/game-engine');
                const engine = new GameEngine();
                const gameState = await engine.loadGame(save_id);

                // Build a map of region -> occupant
                Object.keys(gameState.nations).forEach(code => {
                    const nationState = gameState.nations[code];
                    if (nationState.occupied_regions) {
                        nationState.occupied_regions.forEach(regId => {
                            occupations[regId] = code;
                        });
                    }
                });
            } catch (e) {
                console.warn(`[Regions] Could not load save ${save_id} for occupations:`, e.message);
            }
        }

        let regions = mapData.regions.map(r => {
            const meta = metadata[r.name] || metadata[r.id] || {};
            return {
                id: r.id,
                name: r.name,
                nation_code: occupations[r.id] || occupations[r.name] || r.nation_code || null,
                ...meta
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
        const mapData = getMapData();
        const metadata = getRegionMetadata();

        const region = mapData.regions.find(r => r.id === id || r.name === id);

        if (!region) {
            return res.status(404).json({ error: 'Region not found' });
        }

        const meta = metadata[region.name] || metadata[region.id] || {};

        res.json({
            id: region.id,
            name: region.name,
            nation_code: region.nation_code || null,
            ...meta
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
        const mapData = getMapData();
        const metadata = getRegionMetadata();

        const region = mapData.regions.find(r => r.id === id || r.name === id);

        if (!region) {
            return res.status(404).json({ error: 'Region not found' });
        }

        const meta = metadata[region.name] || metadata[region.id] || {};

        // Mocking some stats for the preview
        res.json({
            id: region.id,
            name: region.name,
            nation_code: region.nation_code || null,
            infrastructure: meta.infrastructure || 5,
            supply_capacity: meta.supply_capacity || 15,
            unit_count: 0
        });
    } catch (error) {
        console.error('Error fetching region stats:', error);
        res.status(500).json({ error: 'Failed to fetch region stats' });
    }
});

module.exports = router;
