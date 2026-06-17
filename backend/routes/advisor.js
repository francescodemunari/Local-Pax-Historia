const express = require('express');
const router = express.Router();
const llmService = require('../services/llm-service');
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

// Ask the advisor a question
router.post('/ask', async (req, res) => {
    try {
        const { saveId, question } = req.body;

        if (!saveId || !question) {
            return res.status(400).json({ error: 'saveId and question are required' });
        }

        const advContext = await engine.getAdvisorContext(saveId);
        const response = await llmService.getAdvisorResponse(question, advContext);

        res.json({
            question: question,
            response: response,
            nation: advContext.playerNation.name
        });
    } catch (error) {
        console.error('Error getting advisor response:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get game summary from advisor
router.get('/summary/:saveId', async (req, res) => {
    const { saveId } = req.params;
    try {
        const advContext = await engine.getAdvisorContext(saveId);
        const summaryQuestion = "Provide a strategic summary of the current situation of my nation and the world.";
        const response = await llmService.getAdvisorResponse(summaryQuestion, advContext);

        res.json({
            type: 'summary',
            response: response,
            context: {
                date: advContext.currentDate,
                nation: advContext.playerNation.name,
                turn: advContext.turnNumber || 1
            }
        });
    } catch (error) {
        console.error('Error getting game summary:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get strategic advice
router.post('/strategic', async (req, res) => {
    try {
        const { saveId, focus } = req.body;
        const advContext = await engine.getAdvisorContext(saveId);
        const strategicQuestion = `Provide strategic advice focused on: ${focus || 'general'}.`;
        const response = await llmService.getAdvisorResponse(strategicQuestion, advContext);

        res.json({
            type: 'strategic',
            focus: focus || 'general',
            response: response
        });
    } catch (error) {
        console.error('Error getting strategic advice:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test LLM connection
router.get('/test', async (req, res) => {
    try {
        const result = await llmService.testConnection();
        res.json(result);
    } catch (error) {
        console.error('Error testing LLM:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get quick action suggestions
router.get('/suggestions/:saveId', async (req, res) => {
    try {
        const { saveId } = req.params;
        const advContext = await engine.getAdvisorContext(saveId);

        const response = await llmService.getAdvisorResponse(
            `Suggest 3 immediate actions I could take today. Be concise, one line per action.`,
            advContext
        );

        res.json({
            type: 'quick_suggestions',
            response: response
        });
    } catch (error) {
        console.error('Error getting suggestions:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
