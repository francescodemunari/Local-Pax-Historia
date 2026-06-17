const express = require('express');
const router = express.Router();
const GameEngine = require('../services/game-engine');
const llmService = require('../services/llm-service');

const engine = new GameEngine();

// Submit a new action
router.post('/', async (req, res) => {
    try {
        const { saveId, actionText, actionType } = req.body;

        if (!saveId || !actionText) {
            return res.status(400).json({ error: 'saveId and actionText are required' });
        }

        console.log(`[Actions] Submitting action for save ${saveId}: ${actionText}`);

        // Process action immediately (no AI gatekeeping as per user request)
        const action = await engine.processPlayerAction(saveId, actionText, actionType || 'general');

        // Broadcast action to connected clients
        if (req.app.locals.broadcast) {
            req.app.locals.broadcast({
                type: 'new_action',
                data: action
            });
        }

        res.json({
            success: true,
            action: action,
            validation: { feasible: true, reason: 'Action accepted by the high command' }
        });
    } catch (error) {
        console.error('Error processing action:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get action brainstorming suggestions (must be before generic save/:saveId)
router.post('/brainstorm', async (req, res) => {
    try {
        const { saveId } = req.body;
        const advContext = await engine.getAdvisorContext(saveId);

        const suggestion = await llmService.getAdvisorResponse(
            `Suggest 5 possible strategic actions I could take right now.
             Consider the geopolitical situation, my position, and my objectives.
             For each action, briefly explain why it could be advantageous.`,
            advContext
        );

        res.json({ suggestions: suggestion });
    } catch (error) {
        console.error('Error brainstorming actions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get pending actions for a save (must be before generic save/:saveId)
router.get('/save/:saveId/pending', async (req, res) => {
    try {
        console.log(`[Actions] Fetching pending for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations();

        const pending = (gameState.actions || [])
            .filter(a => a.status === 'pending')
            .map(a => ({
                ...a,
                nation_name: nations[a.nation_code]?.name || 'Unknown'
            }));

        res.json(pending);
    } catch (error) {
        console.error('Error fetching pending actions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get actions for current turn (must be before generic save/:saveId)
router.get('/save/:saveId/current', async (req, res) => {
    try {
        console.log(`[Actions] Fetching current for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations();
        const turnNumber = gameState.turnNumber;

        const currentActions = (gameState.actions || [])
            .filter(a => a.turn_number === turnNumber)
            .map(a => ({
                ...a,
                nation_name: nations[a.nation_code]?.name || 'Unknown'
            }));

        res.json(currentActions);
    } catch (error) {
        console.error('Error fetching current turn actions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all actions for a save (generic route)
router.get('/save/:saveId', async (req, res) => {
    try {
        console.log(`[Actions] Fetching all for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations();

        const actions = (gameState.actions || []).map(a => ({
            ...a,
            nation_name: nations[a.nation_code]?.name || 'Unknown',
            nation_code: a.nation_code
        }));

        res.json(actions);
    } catch (error) {
        console.error('Error fetching actions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete an action (only if pending)
router.delete('/:id', async (req, res) => {
    try {
        const { saveId } = req.body;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        const actionIndex = (gameState.actions || []).findIndex(a => a.id === req.params.id && a.status === 'pending');

        if (actionIndex === -1) {
            return res.status(404).json({ error: 'Action not found or already processed' });
        }

        const deleted = gameState.actions.splice(actionIndex, 1)[0];
        engine.saveGame(saveId, gameState);

        res.json({ success: true, deleted });
    } catch (error) {
        console.error('Error deleting action:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
