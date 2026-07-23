const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const nationsPath = path.join(__dirname, '../../data/nations_v2.json');

const mapPath = path.join(__dirname, '../../data/hoi4_map.json');

// Helper to load nations
function getNations() {
    if (fs.existsSync(nationsPath)) {
        return JSON.parse(fs.readFileSync(nationsPath, 'utf-8'));
    }
    return {};
}

// Helper to get nations with territory
function getNationsWithTerritory() {
    const nations = getNations();
    if (fs.existsSync(mapPath)) {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        const activeCodes = new Set(mapData.regions.map(r => r.nation_code).filter(Boolean));

        Object.keys(nations).forEach(code => {
            nations[code].has_territory = activeCodes.has(code);
        });
    }
    return nations;
}

// Get all nations
router.get('/', (req, res) => {
    try {
        const nations = Object.values(getNationsWithTerritory());
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
router.get('/code/:code', (req, res) => {
    try {
        const nations = getNations();
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
router.get('/filter/major', (req, res) => {
    try {
        const nations = Object.values(getNations()).filter(n => n.is_major_power);
        res.json(nations);
    } catch (error) {
        console.error('Error fetching major powers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search nations by name / code / leader (used by frontend searchNations + diplomacy filter)
router.get('/search/:query', (req, res) => {
    try {
        const q = (req.params.query || '').toLowerCase();
        if (!q) return res.json([]);
        const nations = Object.values(getNationsWithTerritory()).filter(n =>
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

module.exports = router;
