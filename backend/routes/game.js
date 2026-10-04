const express = require('express');
const router = express.Router();
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

const respondWithGameError = require('../services/http-error');

// Create new game
router.post('/new', async (req, res) => {
    try {
        const { nationCode, startDate, scenarioId } = req.body;

        if (typeof nationCode !== 'string' || !nationCode.trim()) {
            return res.status(400).json({ error: 'nationCode is required' });
        }

        const game = await engine.createGame(
            nationCode.trim().toUpperCase(),
            startDate ?? null,
            scenarioId || null
        );

        res.json(game);
    } catch (error) {
        console.error('Error creating game:', error);
        respondWithGameError(res, error);
    }
});

// List scenario bundles available for new games
router.get('/scenarios', (req, res) => {
    try {
        res.json(engine.scenarios.listScenarios());
    } catch (error) {
        console.error('Error fetching scenarios:', error);
        respondWithGameError(res, error);
    }
});

// Load game
router.get('/load/:saveId', async (req, res) => {
    try {
        const game = await engine.loadGame(req.params.saveId);
        res.json(game);
    } catch (error) {
        console.error('Error loading game:', error);
        respondWithGameError(res, error);
    }
});

// Get all saves
router.get('/saves', async (req, res) => {
    try {
        const saves = await engine.getSaves();
        res.json(saves);
    } catch (error) {
        console.error('Error fetching saves:', error);
        respondWithGameError(res, error);
    }
});

// Delete save
router.delete('/saves/:saveId', async (req, res) => {
    try {
        const deleted = await engine.deleteSave(req.params.saveId);
        if (!deleted) return res.status(404).json({ error: 'Save not found' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting save:', error);
        respondWithGameError(res, error);
    }
});

// Advance time
router.post('/advance', async (req, res) => {
    try {
        const { saveId, timeJump } = req.body;

        if (typeof saveId !== 'string' || typeof timeJump !== 'string') {
            return res.status(400).json({ error: 'saveId and timeJump are required' });
        }

        // Broadcast that time advancement is starting
        if (req.app.locals.broadcast) {
            req.app.locals.broadcast({
                type: 'time_advance_start',
                saveId: saveId,
                timeJump: timeJump
            });
        }

        const result = await engine.advanceTime(saveId, timeJump);

        // Broadcast completion (if websocket is available)
        if (req.app.locals.broadcast) {
            req.app.locals.broadcast({
                type: 'time_advance_complete',
                saveId: saveId,
                data: result
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Error advancing time:', error);
        if (['GAME_MASTER_UNAVAILABLE', 'GAME_MASTER_INVALID_RESPONSE'].includes(error.code)) {
            return res.status(503).json({ error: error.message });
        }
        respondWithGameError(res, error);
    }
});

// Get current game state
router.get('/state/:saveId', async (req, res) => {
    try {
        const context = await engine.getGameContext(req.params.saveId);
        res.json(context);
    } catch (error) {
        console.error('Error fetching game state:', error);
        respondWithGameError(res, error);
    }
});

// Rename save
router.patch('/saves/:saveId', async (req, res) => {
    try {
        const { name } = req.body;

        await engine.renameSave(req.params.saveId, name);

        res.json({ success: true });
    } catch (error) {
        console.error('Error renaming save:', error);
        respondWithGameError(res, error);
    }
});

module.exports = router;
