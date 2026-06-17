const router = require('express').Router();
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

// Get all events for a save
router.get('/save/:saveId', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const limit = parseInt(req.query.limit) || 50;

        const events = (gameState.events || [])
            .sort((a, b) => new Date(b.game_date) - new Date(a.game_date) || new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);

        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get events for specific turn
router.get('/save/:saveId/turn/:turnNumber', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const turnNumber = parseInt(req.params.turnNumber);

        const events = (gameState.events || [])
            .filter(e => e.turn_number === turnNumber)
            .sort((a, b) => (b.severity === 'critical' ? 3 : b.severity === 'major' ? 2 : 1) - (a.severity === 'critical' ? 3 : a.severity === 'major' ? 2 : 1));

        res.json(events);
    } catch (error) {
        console.error('Error fetching turn events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get events by type
router.get('/save/:saveId/type/:type', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const type = req.params.type;

        const events = (gameState.events || [])
            .filter(e => e.event_type === type)
            .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))
            .slice(0, 50);

        res.json(events);
    } catch (error) {
        console.error('Error fetching events by type:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get events affecting a specific nation
router.get('/save/:saveId/nation/:nationCode', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const nationCode = req.params.nationCode.toUpperCase();

        const events = (gameState.events || [])
            .filter(e => e.affected_nations && e.affected_nations.includes(nationCode))
            .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))
            .slice(0, 50);

        res.json(events);
    } catch (error) {
        console.error('Error fetching nation events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get critical/major events only
router.get('/save/:saveId/important', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const events = (gameState.events || [])
            .filter(e => ['major', 'critical'].includes(e.severity))
            .sort((a, b) => new Date(b.game_date) - new Date(a.game_date))
            .slice(0, 30);

        res.json(events);
    } catch (error) {
        console.error('Error fetching important events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single event
router.get('/:id', async (req, res) => {
    try {
        const { saveId } = req.query;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        const event = (gameState.events || []).find(e => e.id === req.params.id);

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json(event);
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get event statistics for a save
router.get('/save/:saveId/stats', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const statsMap = {};

        (gameState.events || []).forEach(e => {
            const key = `${e.event_type}_${e.severity}`;
            if (!statsMap[key]) {
                statsMap[key] = { event_type: e.event_type, severity: e.severity, count: 0 };
            }
            statsMap[key].count++;
        });

        res.json(Object.values(statsMap));
    } catch (error) {
        console.error('Error fetching event stats:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
