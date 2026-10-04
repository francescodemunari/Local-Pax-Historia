const express = require('express');
const router = express.Router();
const llmService = require('../services/llm-service');

router.get('/providers', (req, res) => res.json(llmService.providers));
router.post('/models', async (req, res) => {
    try {
        if (!req.body?.provider) return res.status(400).json({ error: 'Provider is required' });
        res.json({ models: await llmService.discoverModels(req.body) });
    } catch (error) {
        res.status(400).json({ error: error.name === 'TimeoutError' ? 'Model discovery timed out. Check the server address.' : error.message });
    }
});

// Get current settings
router.get('/settings', (req, res) => {
    try {
        res.json(llmService.getPublicSettings());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings
router.post('/settings', (req, res) => {
    try {
        const newSettings = req.body;
        if (!newSettings || !newSettings.provider) {
            return res.status(400).json({ error: 'Provider is required' });
        }
        llmService.saveSettings(newSettings);
        res.json({ success: true, settings: llmService.getPublicSettings() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test settings
router.post('/test', async (req, res) => {
    try {
        const tempSettings = req.body;
        if (!tempSettings || !tempSettings.provider) {
            return res.status(400).json({ error: 'Provider is required to test connection' });
        }
        const result = await llmService.testConnectionWithSettings(tempSettings);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
