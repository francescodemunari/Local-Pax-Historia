const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const GameEngine = require('../services/game-engine');

const engine = new GameEngine();

// Helper to load nations
function getNations(scenarioId) {
    return engine.getNations(scenarioId);
}

// Helper to get nations with territory
function getNationsWithTerritory(scenarioId) {
    const nations = getNations(scenarioId);
    const mapData = engine.scenarios.getMap(scenarioId);
    const activeCodes = new Set(mapData.regions.map(r => r.nation_code).filter(Boolean));

    Object.keys(nations).forEach(code => {
        nations[code] = { ...nations[code], has_territory: activeCodes.has(code) };
    });
    return nations;
}

async function resolveScenarioId(req) {
    if (req.query.save_id) return (await engine.loadGame(req.query.save_id)).scenarioId;
    return req.query.scenario_id || null;
}

// Get all nations
router.get('/', async (req, res) => {
    try {
        const state=req.query.save_id ? await engine.loadGame(req.query.save_id) : null;
        const nations = Object.values(state ? engine.getEffectiveNations(state) : getNationsWithTerritory(await resolveScenarioId(req)));
        // Sort: majors first, then alphabetical
        nations.sort((a, b) => {
            if (a.is_major_power && !b.is_major_power) return -1;
            if (!a.is_major_power && b.is_major_power) return 1;
            return a.name.localeCompare(b.name);
        });
        res.json(nations);
    } catch (error) {
        console.error('Error fetching nations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single nation by code
router.get('/code/:code', async (req, res) => {
    try {
        const state=req.query.save_id ? await engine.loadGame(req.query.save_id) : null;
        const nations = state ? engine.getEffectiveNations(state) : getNations(await resolveScenarioId(req));
        const nation = nations[req.params.code.toUpperCase()];

        if (!nation) {
            return res.status(404).json({ error: 'Nation not found' });
        }

        res.json(nation);
    } catch (error) {
        console.error('Error fetching nation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get major powers only
router.get('/filter/major', async (req, res) => {
    try {
        const nations = Object.values(getNations(await resolveScenarioId(req))).filter(n => n.is_major_power);
        res.json(nations);
    } catch (error) {
        console.error('Error fetching major powers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search nations by name / code / leader (used by frontend searchNations + diplomacy filter)
router.get('/search/:query', async (req, res) => {
    try {
        const q = (req.params.query || '').toLowerCase();
        if (!q) return res.json([]);
        const nations = Object.values(getNationsWithTerritory(await resolveScenarioId(req))).filter(n =>
            (n.name && n.name.toLowerCase().includes(q)) ||
            (n.code && n.code.toLowerCase().includes(q)) ||
            (n.leader_name && n.leader_name.toLowerCase().includes(q)) ||
            (n.capital && n.capital.toLowerCase().includes(q))
        );
        res.json(nations);
    } catch (error) {
        console.error('Error searching nations:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/portrait/:saveId', async(req,res)=>{
    try {
        const state=await engine.loadGame(req.params.saveId),{portrait,leader_name}=req.body;
        const nation=engine.getEffectiveNations(state)[state.playerNationCode];
        if(leader_name!==(nation.leader_name||''))return res.status(409).json({error:'Leadership changed. Reopen the nation panel before changing its portrait.'});
        if(portrait!==null && (typeof portrait!=='string' || portrait.length>500000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(portrait)))return res.status(400).json({error:'Use a JPEG portrait smaller than 350 KB.'});
        if(portrait!==null){const bytes=Buffer.from(portrait.split(',')[1],'base64');if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return res.status(400).json({error:'Invalid JPEG image.'});}
        state.nations[state.playerNationCode].leader_portrait=portrait;
        state.nations[state.playerNationCode].portrait_leader=leader_name;
        engine.saveGame(req.params.saveId,state);res.json({success:true});
    } catch(error){require('../services/http-error')(res,error);}
});

module.exports = router;
