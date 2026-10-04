const express = require('express');
const router = express.Router();
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

// Units are projections of the authoritative turn simulation. Players can
// inspect them, but only GameEngine can add a division after the Game Master
// approves an action while resolving a turn.
router.use((req, res, next) => {
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Units are created by the Game Master while resolving turns'
        });
    }
    next();
});

/**
 * GET /api/units
 * Get all units in a save, optionally filtered by nation or region.
 */
router.get('/', async (req, res) => {
    try {
        const { saveId, nation_code, region_id } = req.query;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        let units = gameState.units || [];

        if (nation_code) {
            units = units.filter(unit => unit.nation_code === nation_code.toUpperCase());
        }
        if (region_id) {
            units = units.filter(unit => unit.region_id === region_id);
        }

        res.json(units);
    } catch (error) {
        console.error('Error fetching units:', error);
        res.status(500).json({ error: 'Failed to fetch units' });
    }
});

/**
 * GET /api/units/:id
 * Get one unit from a save.
 */
router.get('/:id', async (req, res) => {
    try {
        const { saveId } = req.query;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        const unit = (gameState.units || []).find(candidate => candidate.id === req.params.id);
        if (!unit) return res.status(404).json({ error: 'Unit not found' });

        res.json(unit);
    } catch (error) {
        console.error('Error fetching unit:', error);
        res.status(500).json({ error: 'Failed to fetch unit' });
    }
});

module.exports = router;
