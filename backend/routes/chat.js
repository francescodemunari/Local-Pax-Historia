const respondWithError = require('../services/http-error');
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const llmService = require('../services/llm-service');
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

// Start a new diplomatic chat
router.post('/start', async (req, res) => {
    try {
        const { saveId, participantNations, topic } = req.body;

        if (typeof saveId !== 'string' || !Array.isArray(participantNations) || participantNations.length < 2) {
            return res.status(400).json({ error: 'saveId and participantNations are required' });
        }

        const gameState = await engine.loadGame(saveId);
        const nations = engine.getEffectiveNations(gameState);
        const participants = [...new Set(participantNations.map(code => String(code || '').toUpperCase()))];
        if (participants.length !== participantNations.length || !participants.includes(gameState.playerNationCode) ||
            participants.some(code => !nations[code] || gameState.nations[code]?.annexed_by)) {
            return res.status(400).json({ error: 'participantNations must be unique, valid nations and include the player nation' });
        }
        if (topic != null && (typeof topic !== 'string' || topic.length > 160)) {
            return res.status(400).json({ error: 'topic must be a string of at most 160 characters' });
        }
        const chatType = participants.length > 2 ? 'conference' : 'bilateral';

        const newChat = {
            id: `chat_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            save_id: saveId,
            participant_nations: participants,
            chat_type: chatType,
            topic: topic || 'Diplomacy',
            is_active: true,
            created_at: new Date().toISOString(),
            messages: []
        };

        if (!gameState.chats) gameState.chats = [];
        gameState.chats.push(newChat);

        engine.saveGame(saveId, gameState);

        res.json(newChat);
    } catch (error) {
        console.error('Error starting diplomatic chat:', error);
        respondWithError(res, error);
    }
});

// Send a message in a diplomatic chat
router.post('/:chatId/message', async (req, res) => {
    try {
        const { saveId, message, senderNation, isPlayer } = req.body;
        const chatId = req.params.chatId;

        if (typeof saveId !== 'string' || typeof message !== 'string' || !message.trim() || typeof senderNation !== 'string') {
            return res.status(400).json({ error: 'saveId, message and senderNation are required' });
        }
        if (message.trim().length > 4000) {
            return res.status(400).json({ error: 'message must not exceed 4000 characters' });
        }

        const gameState = await engine.loadGame(saveId);
        const chat = gameState.chats.find(c => c.id === chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        if (!chat.is_active) {
            return res.status(409).json({ error: 'Chat is closed' });
        }
        if (senderNation.toUpperCase() !== gameState.playerNationCode || !chat.participant_nations.includes(gameState.playerNationCode)) {
            return res.status(403).json({ error: 'Messages can only be sent by the player nation in this chat' });
        }

        // Save player message
        const playerMsg = {
            id: `message_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            sender_nation: senderNation.toUpperCase(),
            sender_is_player: isPlayer !== false,
            message_text: message.trim(),
            game_date: gameState.currentDate,
            created_at: new Date().toISOString()
        };

        chat.messages.push(playerMsg);

        // Find the nations to respond (other than the sender)
        const otherNations = chat.participant_nations.filter(n => n !== senderNation.toUpperCase());

        if (otherNations.length === 0) {
            engine.saveGame(saveId, gameState);
            return res.json({ success: true, responses: [] });
        }

        const nations = engine.getEffectiveNations(gameState);
        const responses = [];

        // Get responses from each AI nation
        for (const nationCode of otherNations) {
            const targetNation = nations[nationCode];
            if (!targetNation) continue;

            // Get AI response
            const aiResponse = await llmService.diplomaticChat(
                message.trim(),
                gameState.playerNation,
                targetNation,
                chat.messages,
                {
                    currentDate: gameState.currentDate,
                    participants: chat.participant_nations.map(c => nations[c]?.name || c).join(', '),
                    worldContext: engine.getScenarioBriefing(gameState) + "\nUse only saved cities/capital and territorial control below. If capital is null, say no controlled capital is designated; never invent a replacement seat. Diplomacy cannot commit a relocation or annexation; those require simulation.\nCURRENT STATE: " + JSON.stringify(engine.buildWorldStateSummary(gameState)),
                    simRules: gameState.simulation_rules || "Standard simulation logic.",
                    eventHistory: (gameState.events || []).slice(-20)
                }
            );

            const aiMsg = {
                id: `message_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                sender_nation: nationCode,
                sender_is_player: false,
                message_text: aiResponse,
                game_date: gameState.currentDate,
                created_at: new Date().toISOString()
            };

            chat.messages.push(aiMsg);

            responses.push({
                nation: nationCode,
                nation_name: targetNation.name,
                leader: targetNation.leader_name,
                message: aiResponse
            });
        }

        engine.saveGame(saveId, gameState);

        // Broadcast to connected clients (via wss in app.locals)
        if (req.app.locals.broadcast) {
            req.app.locals.broadcast({
                type: 'diplomatic_message',
                chatId: chatId,
                responses: responses
            });
        }

        res.json({ success: true, responses });
    } catch (error) {
        console.error('Error processing diplomatic message:', error);
        respondWithError(res, error);
    }
});

// Get all chats for a save
router.get('/save/:saveId', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const chats = (gameState.chats || []).filter(c => c.is_active).map(c => {
            return {
                ...c,
                message_count: c.messages.length,
                last_message: c.messages.length > 0 ? c.messages[c.messages.length - 1].message_text : null
            };
        });
        res.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        respondWithError(res, error);
    }
});

// Get messages for a chat
router.get('/:chatId/messages', async (req, res) => {
    try {
        const { saveId } = req.query;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        const chat = (gameState.chats || []).find(c => c.id === req.params.chatId);

        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        const nations = engine.getEffectiveNations(gameState);
        const enrichedMessages = chat.messages.map(m => {
            const nation = nations[m.sender_nation];
            return {
                ...m,
                sender_name: nation ? nation.name : m.sender_nation,
                leader_name: nation ? nation.leader_name : 'Unknown',
                leader_title: nation ? nation.leader_title : 'Leader'
            };
        });

        res.json(enrichedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        respondWithError(res, error);
    }
});

// Close a diplomatic chat
router.post('/:chatId/close', async (req, res) => {
    try {
        const { saveId } = req.body;
        if (!saveId) return res.status(400).json({ error: 'saveId is required' });

        const gameState = await engine.loadGame(saveId);
        const chat = (gameState.chats || []).find(c => c.id === req.params.chatId);

        if (chat) {
            chat.is_active = false;
            engine.saveGame(saveId, gameState);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error closing chat:', error);
        respondWithError(res, error);
    }
});

// Get available nations for chat (excluding player)
router.get('/available/:saveId', async (req, res) => {
    try {
        const gameState = await engine.loadGame(req.params.saveId);
        const nations = engine.getEffectiveNations(gameState);
        const playerNationCode = gameState.playerNationCode;

        const available = Object.values(nations)
            .filter(n => n.code !== playerNationCode && !gameState.nations[n.code]?.annexed_by)
            .map(n => ({
                code: n.code,
                name: n.name,
                leader_name: n.leader_name,
                leader_title: n.leader_title,
                ideology: n.ideology,
                color: n.color,
                is_major_power: n.is_major_power
            }))
            .sort((a, b) => (b.is_major_power - a.is_major_power) || a.name.localeCompare(b.name));

        res.json(available);
    } catch (error) {
        console.error('Error fetching available nations:', error);
        respondWithError(res, error);
    }
});

module.exports = router;
