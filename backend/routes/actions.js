const respondWithError = require('../services/http-error');
const express = require('express');
const router = express.Router();
const GameEngine = require('../services/game-engine');
const llmService = require('../services/llm-service');

const engine = new GameEngine();

router.get('/campaigns/:saveId',async(req,res)=>{
    try { const state=await engine.loadGame(req.params.saveId); const nations=engine.getNations(state.scenarioId);
        res.json((state.campaigns||[]).map(c=>({...c,target_name:nations[c.target]?.name||c.target})));
    } catch(error){respondWithError(res,error);}
});
router.post('/campaigns/:saveId/:id',async(req,res)=>{
    try {
        if(!['active','held','cancelled'].includes(req.body.status))return res.status(400).json({error:'Invalid campaign status'});
        const state=await engine.loadGame(req.params.saveId),campaign=(state.campaigns||[]).find(c=>c.id===req.params.id);
        if(!campaign || campaign.status==='completed')return res.status(404).json({error:'Active campaign not found'});
        campaign.status=req.body.status;campaign.manual_hold=req.body.status==='held';engine.saveGame(req.params.saveId,state);res.json(campaign);
    }catch(error){respondWithError(res,error);}
});

// Submit a new action
router.post('/', async (req, res) => {
    try {
        const { saveId, actionText, actionType } = req.body;

        if (typeof saveId !== 'string' || typeof actionText !== 'string' || !actionText.trim()) {
            return res.status(400).json({ error: 'saveId and a non-empty actionText are required' });
        }
        if (actionText.trim().length > 2000) {
            return res.status(400).json({ error: 'actionText must not exceed 2000 characters' });
        }
        if (actionType !== undefined && (typeof actionType !== 'string' || actionType.length > 80)) {
            return res.status(400).json({ error: 'actionType must be a string of at most 80 characters' });
        }

        console.log(`[Actions] Submitting action for save ${saveId}: ${actionText}`);

        // A player may submit an order immediately, but it stays pending until
        // the Game Master adjudicates it during a turn. This is especially
        // important for recruitment: it is an order, never a direct unit API.
        const action = await engine.processPlayerAction(saveId, actionText.trim(), actionType || 'general');

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
        respondWithError(res, error);
    }
});

// Get action brainstorming suggestions (must be before generic save/:saveId)
router.post('/brainstorm', async (req, res) => {
    try {
        const { saveId } = req.body;
        const advContext = await engine.getAdvisorContext(saveId);

        const goal = typeof req.body.goal === 'string' ? req.body.goal.trim().slice(0, 2000) : '';
        const actions = await llmService.planActions(goal, advContext);
        res.json({ actions });
    } catch (error) {
        console.error('Error brainstorming actions:', error);
        respondWithError(res, error);
    }
});

// Get pending actions for a save (must be before generic save/:saveId)
router.get('/save/:saveId/pending', async (req, res) => {
    try {
        console.log(`[Actions] Fetching pending for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations(gameState.scenarioId);

        const pending = (gameState.actions || [])
            .filter(a => a.status === 'pending')
            .map(a => ({
                ...a,
                nation_name: nations[a.nation_code]?.name || 'Unknown'
            }));

        res.json(pending);
    } catch (error) {
        console.error('Error fetching pending actions:', error);
        respondWithError(res, error);
    }
});

// Get actions for current turn (must be before generic save/:saveId)
router.get('/save/:saveId/current', async (req, res) => {
    try {
        console.log(`[Actions] Fetching current for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations(gameState.scenarioId);
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
        respondWithError(res, error);
    }
});

// Get all actions for a save (generic route)
router.get('/save/:saveId', async (req, res) => {
    try {
        console.log(`[Actions] Fetching all for save: ${req.params.saveId}`);
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getNations(gameState.scenarioId);

        const actions = (gameState.actions || []).map(a => ({
            ...a,
            nation_name: nations[a.nation_code]?.name || 'Unknown',
            nation_code: a.nation_code
        }));

        res.json(actions);
    } catch (error) {
        console.error('Error fetching actions:', error);
        respondWithError(res, error);
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
        respondWithError(res, error);
    }
});

module.exports = router;
