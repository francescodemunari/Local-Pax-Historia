const fs = require('fs');
const path = require('path');

const NATIONS_PATH = path.join(__dirname, '../../data/nations_v2.json');
const LEADERS_TEXT_PATH = path.join(__dirname, '../../country_leaders.txt');

// Predefined leaders for major powers and well-known nations
const LEADER_SEEDS = {
    'ITA': { name: 'Benito Mussolini', title: 'Il Duce' },
    'GER': { name: 'Adolf Hitler', title: 'Führer' },
    'SOV': { name: 'Iosif Stalin', title: 'General Secretary' },
    'ENG': { name: 'Stanley Baldwin', title: 'Prime Minister' },
    'FRA': { name: 'Albert Lebrun', title: 'President' },
    'USA': { name: 'Franklin D. Roosevelt', title: 'President' },
    'JAP': { name: 'Hirohito', title: 'Emperor' },
    'CHI': { name: 'Chiang Kai-shek', title: 'Generalissimo' },
    'ETH': { name: 'Haile Selassie I', title: 'Emperor' },
    'AUS': { name: 'Kurt Schuschnigg', title: 'Chancellor' },
    'HUN': { name: 'Miklós Horthy', title: 'Regent' },
    'POL': { name: 'Ignacy Mościcki', title: 'President' },
    'ESP': { name: 'Manuel Azaña', title: 'President' },
    'SPR': { name: 'Manuel Azaña', title: 'President' },
    'TUR': { name: 'Mustafa Kemal Atatürk', title: 'President' },
    'GRE': { name: 'George II', title: 'King' },
    'YUG': { name: 'Peter II', title: 'King' },
    'ROM': { name: 'Carol II', title: 'King' },
    'BUL': { name: 'Boris III', title: 'Tsar' },
    'BEL': { name: 'Leopold III', title: 'King' },
    'HOL': { name: 'Wilhelmina', title: 'Queen' },
    'NOR': { name: 'Haakon VII', title: 'King' },
    'SWE': { name: 'Gustav V', title: 'King' },
    'DEN': { name: 'Christian X', title: 'King' },
    'FIN': { name: 'Kyösti Kallio', title: 'President' },
    'BRA': { name: 'Getúlio Vargas', title: 'President' },
    'MEX': { name: 'Lázaro Cárdenas', title: 'President' },
    'CAN': { name: 'W. L. Mackenzie King', title: 'Prime Minister' },
    'AST': { name: 'Joseph Lyons', title: 'Prime Minister' },
    'NZL': { name: 'Michael Joseph Savage', title: 'Prime Minister' },
    'SAF': { name: 'J. B. M. Hertzog', title: 'Prime Minister' },
    'RAJ': { name: 'Victor Hope', title: 'Viceroy' }
};

async function mergeLeaders() {
    console.log('Starting leader data merge...');

    if (!fs.existsSync(NATIONS_PATH)) {
        console.error('Nations file not found:', NATIONS_PATH);
        return;
    }

    const nations = JSON.parse(fs.readFileSync(NATIONS_PATH, 'utf8'));

    // Parse country_leaders.txt (Tag,Nation,Note)
    if (fs.existsSync(LEADERS_TEXT_PATH)) {
        const text = fs.readFileSync(LEADERS_TEXT_PATH, 'utf8');
        const lines = text.split('\n');

        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const tag = parts[0].trim();
                const fullName = parts[1].trim();
                const note = parts[2] ? parts[2].trim() : '';

                if (nations[tag]) {
                    // Update name if missing or generic
                    if (nations[tag].name === 'Unknown' || nations[tag].name === nations[tag].code) {
                        nations[tag].name = fullName;
                    }

                    // Apply seed if available
                    if (LEADER_SEEDS[tag]) {
                        nations[tag].leader_name = LEADER_SEEDS[tag].name;
                        nations[tag].leader_title = LEADER_SEEDS[tag].title;
                    } else if (nations[tag].leader_name === 'Unknown Leader') {
                        // Fallback title based on note
                        if (note.includes('Kingdom')) {
                            nations[tag].leader_title = 'King';
                        } else if (note.includes('Republic')) {
                            nations[tag].leader_title = 'President';
                        } else {
                            nations[tag].leader_title = 'Leader';
                        }
                    }
                }
            }
        });
    }

    // Write back
    fs.writeFileSync(NATIONS_PATH, JSON.stringify(nations, null, 2));
    console.log('Leader data merge complete!');
}

mergeLeaders();
