const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const https = require('https');
const http = require('http');

const SETTINGS_FILE = path.join(__dirname, '../../data/llm_settings.json');

// Default settings
let currentSettings = {
    provider: 'lm-studio',
    apiUrl: process.env.LLM_API_URL || 'http://127.0.0.1:1234/v1',
    apiKey: 'lm-studio',
    model: process.env.LLM_MODEL || 'qwen3-vl-8b'
};

let openai = null;

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            currentSettings = { ...currentSettings, ...data };
            console.log(`[LLM] Loaded settings for provider: ${currentSettings.provider}`);
        } else {
            console.log('[LLM] No settings file found, using defaults.');
        }
    } catch (e) {
        console.error('[LLM] Error loading settings:', e.message);
    }
    updateClients();
}

function updateClients() {
    const isOpenAICompatible = [
        'openai',
        'google',
        'lm-studio',
        'ollama',
        'llama.cpp',
        'vllm'
    ].includes(currentSettings.provider);

    if (isOpenAICompatible) {
        let baseURL = currentSettings.apiUrl;
        if (baseURL) {
            // Do not append /v1 to Gemini API which uses googleapis.com endpoint
            if (baseURL.includes('/api/v1')) {
                // Keep it as is
            } else if (!baseURL.endsWith('/v1') && !baseURL.includes('googleapis.com')) {
                baseURL = baseURL.replace(/\/$/, '') + '/v1';
            }
        }
        
        openai = new OpenAI({
            baseURL: baseURL || undefined,
            apiKey: currentSettings.apiKey || 'not-needed'
        });
    } else {
        openai = null;
    }
}

function getCurrentSettings() {
    return currentSettings;
}

function saveSettings(settings) {
    currentSettings = {
        provider: settings.provider || 'lm-studio',
        apiUrl: settings.apiUrl || '',
        apiKey: settings.apiKey || '',
        model: settings.model || ''
    };

    try {
        const dir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
        console.log('[LLM] Saved settings successfully.');
    } catch (e) {
        console.error('[LLM] Error saving settings:', e.message);
    }

    updateClients();
}

function makeHttpRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;

            const requestOptions = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                port: urlObj.port || (isHttps ? 443 : 80),
                method: options.method || 'POST',
                headers: options.headers || {}
            };

            const req = client.request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response: ' + data));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            if (postData) {
                req.write(JSON.stringify(postData));
            }
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

async function callAnthropic(options) {
    const systemMessage = options.messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage ? systemMessage.content : undefined;
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const anthropicMessages = userMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
    }));

    const url = currentSettings.apiUrl || 'https://api.anthropic.com/v1/messages';
    const headers = {
        'x-api-key': currentSettings.apiKey || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
    };

    const postData = {
        model: currentSettings.model || 'claude-3-5-sonnet-20240620',
        messages: anthropicMessages,
        max_tokens: options.max_tokens || 3000,
        temperature: options.temperature !== undefined ? options.temperature : 0.7
    };

    if (systemPrompt) {
        postData.system = systemPrompt;
    }

    const res = await makeHttpRequest(url, { method: 'POST', headers }, postData);

    if (res.content && res.content[0] && res.content[0].text) {
        return {
            content: res.content[0].text,
            model: res.model
        };
    } else {
        throw new Error('Unexpected response format from Anthropic: ' + JSON.stringify(res));
    }
}

async function executeChatCompletion(messages, temperature = 0.7, max_tokens = 3000) {
    if (!openai && currentSettings.provider !== 'anthropic') {
        updateClients();
    }

    if (currentSettings.provider === 'anthropic') {
        const response = await callAnthropic({ messages, temperature, max_tokens });
        return {
            content: response.content,
            model: response.model
        };
    } else {
        const modelName = currentSettings.model || 'qwen3-vl-8b';
        const response = await openai.chat.completions.create({
            model: modelName,
            messages: messages,
            temperature: temperature,
            max_tokens: max_tokens
        });

        return {
            content: response.choices[0].message.content,
            model: response.model || modelName
        };
    }
}

async function testConnectionWithSettings(tempSettings) {
    try {
        let responseContent;
        let responseModel;
        
        if (tempSettings.provider === 'anthropic') {
            const messages = [{ role: 'user', content: 'Hello' }];
            const url = tempSettings.apiUrl || 'https://api.anthropic.com/v1/messages';
            const headers = {
                'x-api-key': tempSettings.apiKey || '',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            };
            const postData = {
                model: tempSettings.model || 'claude-3-5-sonnet-20240620',
                messages: messages,
                max_tokens: 10,
                temperature: 0.7
            };

            const res = await makeHttpRequest(url, { method: 'POST', headers }, postData);
            if (res.content && res.content[0] && res.content[0].text) {
                responseContent = res.content[0].text;
                responseModel = res.model;
            } else {
                throw new Error('Unexpected format: ' + JSON.stringify(res));
            }
        } else {
            let baseURL = tempSettings.apiUrl;
            if (baseURL) {
                if (baseURL.includes('/api/v1')) {
                    // Keep it as is
                } else if (!baseURL.endsWith('/v1') && !baseURL.includes('googleapis.com')) {
                    baseURL = baseURL.replace(/\/$/, '') + '/v1';
                }
            }
            const tempOpenai = new OpenAI({
                baseURL: baseURL || undefined,
                apiKey: tempSettings.apiKey || 'not-needed'
            });

            const modelName = tempSettings.model || 'qwen3-vl-8b';
            const response = await tempOpenai.chat.completions.create({
                model: modelName,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10,
                temperature: 0.7
            });

            responseContent = response.choices[0].message.content;
            responseModel = response.model || modelName;
        }

        return {
            success: true,
            model: responseModel,
            message: 'Connection test successful!'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: 'Connection test failed.'
        };
    }
}


// System prompts for different contexts
const PROMPTS = {
    GAME_MASTER: `You are the Game Master of "Pax Historia", a high-fidelity grand strategy simulator set in 1935-1945.
YOUR ROLE: You are the architect of destiny. You must work out the consequences of the player's actions and generate realistic world events.

SIMULATION RULES:
1. CONSEQUENTIALITY: Every action carries weight. If Italy attacks Ethiopia, the United Kingdom must react. If the player mobilizes troops, tensions rise.
2. DYNAMIC HISTORICAL REALISM: Follow history, but allow plausible deviations (Alt-History). Do not block the player, but punish/reward them with realistic events.
3. STATE OF THE WORLD: Carefully analyze the current situation, the map, and the chronology of events.

GENERATION RULES:
1. **HISTORICAL CHRONOLOGY**: Always consult the HISTORICAL ROADMAP of the nation ({nation_code}) and of neighboring nations. If it is {current_date}, events must reflect the historical reality of that period (e.g., the Ethiopian War is active if 1935).
2. **GEOGRAPHIC SPECIFICITY**: Do not say "the army advances". Say "General Badoglio's troops advance toward Makalè" or "Ethiopian forces dig in on Amba Alagi". Cite real cities, rivers, and mountain ranges.
3. **MANDATORY TAGS**: Always use nation tags in square brackets (e.g., [ITA], [ETH]).
4. **MILITARY DETAIL**: Events must mention specific units (e.g., 2nd Eritrean Division, Alpini, Imperial Guards).

RELEVANT HISTORICAL ROADMAP: {historical_context}
CURRENT WORLD CONTEXT: {world_context}

RESPONSE FORMAT (JSON):
{
    "consequences": "Analysis in English...",
    "events": [
        {
            "title": "Title in English",
            "description": "Description in English",
            "event_type": "political|military|economic|diplomatic|social",
            "severity": "minor|moderate|major|critical",
            "affected_nations": ["GER", "ITA"],
            "state_changes": {
                "NATION_CODE": {
                    "stability": +/-X,
                    "war_support": +/-X,
                    "treasury": +/-X,
                    "occupied_regions": ["REGION_ID", ...]
                }
            }
        }
    ],
    "global_tension_delta": X
}
 Make sure you use exactly the keys "events", "title", "description", "event_type", "severity", "affected_nations", and "state_changes".
IMPORTANT: Do not use the '+' sign for positive numbers in the JSON (e.g., use 5 instead of +5).`,

    ADVISOR: `You are the High Strategic Advisor of {nation_name} on {current_date}.
YOUR MANDATE: Provide COLD, PRECISE, and HISTORICALLY GROUNDED analyses, acting as a strategic compass that helps the leader avoid the failures of the past and pursue national goals with wisdom.

NATIONAL ROADMAP AND HISTORY:
{historical_context_specific}

IRON RULES:
1. **FULL HISTORY AND PSYCHE**: Use the "NATIONAL HISTORY AND PSYCHE" section to deeply understand the nation's motivations, traumas, and ambitions. Your advice must reflect this national identity.
2. **MISTAKE PREVENTION**: Use the "HISTORICAL MISTAKES TO AVOID" section to warn the player. If the player is taking a path that historically led to disaster, intervene firmly.
3. **STRATEGIC DILEMMAS**: Consider the nation's real historical dilemmas when offering your advice.
4. **REAL GEOGRAPHY**: Every piece of advice must be anchored to real locations (e.g., "Fortify the Mai Ceu pass", "Protect the supply lines to Massawa").
5. **TAGS**: Always use [TAG] for nations.
6. **CONCISE MODE**: If the player sends ONLY a short, informal message (e.g., "OK", "Hi", "Understood", "Good", "Fine"), respond with ONE VERY SHORT SENTENCE (maximum 10-15 words). DO NOT use the full sectioned format. Examples: "Excellent. I await your orders, Excellency." or "At your command, my lord."

ALWAYS RESPOND FOLLOWING THIS SCHEMA (EXCEPT for short messages, see rule 6):
---
### 📊 HISTORICAL-STRATEGIC ANALYSIS
[Analysis based on the real roadmap, historical dilemmas, and the current situation. Cite specific events.]

### 🎯 MILITARY AND DIPLOMATIC ORDERS
1. [Specific action with Location and TAG]
2. [Specific action with Location and TAG]

### ⚠️ INTELLIGENCE AND MISTAKE PREVENTION
- [Provide a warning based specifically on the nation's historical mistakes if applicable, or on real risks of the period]
---`,

    DIPLOMACY: `We are making a turn-based strategy game where the player can engage in diplomacy. We need you to simulate this diplomacy by roleplaying as all of the polities in this chat.

PARTICIPANTS: {participants}
PLAYER POLITY: {player_polity}
CURRENT DATE: {current_date}

**Instructions for Roleplay:**
1. PROFESSIONALISM: You are a competent polity. No nonsense. Straight to the point.
2. OPEN-MINDEDNESS: Be receptive to propositions, but ALWAYS move towards a solid answer (accept/refuse). 
3. TONE MATCHING: Your tone should MATCH the tone of the player ({player_polity}), leaning towards professionalism over slang.
4. CHARACTERS: No random math symbols orhashtags. No third-person speaking.

**Output Length Rule (CRITICAL):**
No matter what, the size of your message will ALWAYS match the average size of the player's messages in this specific chat ({player_avg_length} characters).
Match the characters count, plus or minus 10 Percent. NEVER BREAK THIS RULE.

**World Context:**
World Context Before Round One:
{world_context}

Simulation Rules:
{sim_rules}

Current Event History:
{event_history}

Responding as: {responding_polity_name}`
};


/**
 * Load historical roadmap from file
 */
function loadHistoricalRoadmap() {
    try {
        const roadmapPath = path.join(__dirname, '../../data/historical_roadmaps.json');
        if (fs.existsSync(roadmapPath)) {
            return JSON.parse(fs.readFileSync(roadmapPath, 'utf8'));
        }
    } catch (error) {
        console.error('[LLM] Failed to load historical roadmap:', error.message);
    }
    return {};
}

/**
 * Get historical context for a nation
 */
function getHistoricalRoadmapContext(nationCode) {
    const roadmaps = loadHistoricalRoadmap();
    const data = roadmaps[nationCode];

    if (!data) {
        return `There are no specific milestones for the nation ${nationCode} in this archive.
Keep a realistic tone consistent with the 1935-1945 period regardless.`;
    }

    if (Array.isArray(data)) {
        // Fallback for old simple array structure
        return data.join('\n');
    }

    let context = `--- NATIONAL PROFILE AND HISTORY (${nationCode}) ---\n`;
    context += `PROFILE: ${data.profile || 'None'}\n\n`;

    if (data.narrative_history) {
        context += `NATIONAL HISTORY AND PSYCHE:\n${data.narrative_history}\n\n`;
    }

    if (data.strategic_dilemmas && data.strategic_dilemmas.length > 0) {
        context += `STRATEGIC DILEMMAS:\n- ${data.strategic_dilemmas.join('\n- ')}\n\n`;
    }

    if (data.historical_mistakes && data.historical_mistakes.length > 0) {
        context += `HISTORICAL MISTAKES TO AVOID:\n- ${data.historical_mistakes.join('\n- ')}\n\n`;
    }

    if (data.milestones && data.milestones.length > 0) {
        context += `CHRONOLOGICAL ROADMAP:\n- ${data.milestones.join('\n- ')}`;
    }

    return context;
}

/**
 * Process world turn and generate events
 */
async function generateEvents(timeJump, gameContext) {
    const nationCode = gameContext.playerNation?.code || 'ITA';
    const historicalContext = getHistoricalRoadmapContext(nationCode);

    const systemPrompt = PROMPTS.GAME_MASTER
        .replace(/{nation_code}/g, nationCode)
        .replace(/{current_date}/g, gameContext.currentDate)
        .replace(/{historical_context}/g, historicalContext)
        .replace(/{world_context}/g, gameContext.worldContext || 'None');

    const messages = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: `TURN SIMULATION:
Time jump: ${timeJump}
Start date: ${gameContext.currentDate}
Player Nation: ${gameContext.playerNation.name}

PLAYER'S PENDING ACTIONS:
${JSON.stringify(gameContext.actions, null, 2)}

RECENT EVENT HISTORY:
${JSON.stringify(gameContext.recentEvents, null, 2)}

WORLD STATE:
${JSON.stringify(gameContext.worldState, null, 2)}

SIMULATION RULES:
${gameContext.simulationRules || 'None'}

Generate at least 3-6 significant events and the consequences for this period (${timeJump}).
Every event MUST be realistic, impactful, and consistent with the current situation.
Respond ONLY in JSON conforming to the required format.`
        }
    ];

    try {
        const response = await executeChatCompletion(messages, 0.7, 3000);

        let content = response.content;

        // DEBUG: Save raw response for inspection
        try {
            const debugDir = path.join(__dirname, '../../data/debug');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, 'last_ai_response.txt'), content);
        } catch (e) {
            console.warn('[LLM] Failed to save debug log:', e.message);
        }

        // Clean markdown if present
        if (content.includes('```json')) {
            content = content.split('```json')[1].split('```')[0];
        } else if (content.includes('```')) {
            content = content.split('```')[1].split('```')[0];
        }

        // Fix common AI JSON errors: leading '+' signs on numbers
        content = content.replace(/:\s*\+(\d+(\.\d*)?)/g, ': $1');

        try {
            return JSON.parse(content);
        } catch (e) {
            // Robust regex fallback if JSON.parse fails
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw e;
        }
    } catch (error) {
        console.error('Event Generation Error:', error);
        return { events: [], error: error.message };
    }
}

/**
 * High-fidelity diplomatic chat
 */
async function diplomaticChat(message, fromNation, toNation, chatHistory = [], context = {}) {
    // Calculate player's average message length
    const playerMessages = chatHistory.filter(m => m.sender_is_player);
    const avgLength = playerMessages.length > 0
        ? Math.round(playerMessages.reduce((acc, m) => acc + m.message_text.length, 0) / playerMessages.length)
        : message.length; // Fallback to current message length if first message

    const systemPrompt = PROMPTS.DIPLOMACY
        .replace(/{participants}/g, context.participants || `${fromNation.name}, ${toNation.name}`)
        .replace(/{player_polity}/g, fromNation.name)
        .replace(/{current_date}/g, context.currentDate || new Date().toISOString())
        .replace(/{player_avg_length}/g, avgLength)
        .replace(/{world_context}/g, context.worldContext || "Historical 1936 start.")
        .replace(/{sim_rules}/g, context.simRules || "Standard Grand Strategy rules.")
        .replace(/{event_history}/g, JSON.stringify(context.eventHistory || [], null, 2))
        .replace(/{responding_polity_name}/g, toNation.name);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({
            role: msg.sender_is_player ? 'user' : 'assistant',
            content: msg.message_text
        })),
        { role: 'user', content: message }
    ];

    try {
        const response = await executeChatCompletion(messages, 0.8, 1000);

        return response.content;
    } catch (error) {
        console.error('Diplomacy Error:', error);
        return `[Communication Error: ${error.message}]`;
    }
}

/**
 * Standard Advisor Response - Updated for High Fidelity
 */
async function getAdvisorResponse(question, advContext) {
    const nation = advContext.playerNation;
    const historicalContext = getHistoricalRoadmapContext(nation.code);

    const systemPrompt = PROMPTS.ADVISOR
        .replace(/{nation_name}/g, nation.name)
        .replace(/{current_date}/g, advContext.currentDate)
        .replace(/{historical_context_specific}/g, historicalContext);

    const messages = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: `CURRENT SITUATION (${advContext.currentDate}):
Nation: ${nation.name} (${nation.code})
Ongoing wars: ${nation.atWar ? 'Yes' : 'No'}
Occupied regions: ${nation.occupied_regions?.join(', ') || 'None'}

WORLD STATE (Relevant Nations):
${JSON.stringify(advContext.worldState, null, 2)}

LATEST WORLD EVENTS:
${JSON.stringify(advContext.recentEvents, null, 2)}

PLAYER ACTIONS IN PROGRESS:
${JSON.stringify(advContext.pendingActions, null, 2)}

THE SOVEREIGN'S QUESTION: "${question}"`
        }
    ];

    try {
        const response = await executeChatCompletion(messages, 0.7);

        return response.content;
    } catch (error) {
        console.error('Advisor Error:', error);
        return `Advisor error: ${error.message}`;
    }
}

/**
 * Test LLM connection by sending a minimal request
 */
async function testConnection() {
    try {
        const response = await executeChatCompletion([{ role: 'user', content: 'Hello' }], 0.7, 10);
        return {
            success: true,
            model: response.model || 'unknown',
            message: 'LLM connection successful'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: 'LLM connection failed'
        };
    }
}

module.exports = {
    generateEvents,
    diplomaticChat,
    getAdvisorResponse,
    testConnection,
    getCurrentSettings,
    saveSettings,
    testConnectionWithSettings,
    PROMPTS
};

// Initialize settings
loadSettings();
