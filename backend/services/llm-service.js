const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const ScenarioService = require('./scenario-service');
const providerCatalog = require('./ai-providers');

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
const scenarios = new ScenarioService();

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
    const isOpenAICompatible = providerCatalog.providers.some(provider => provider.id === currentSettings.provider && provider.protocol === 'openai');
    if (isOpenAICompatible) {
        const baseURL = providerCatalog.normalizeEndpoint(currentSettings.provider, currentSettings.apiUrl);
        openai = new OpenAI({
            baseURL: baseURL || undefined,
            apiKey: currentSettings.apiKey || 'not-needed', timeout: 120000, maxRetries: 0
        });
    } else {
        openai = null;
    }
}

function getCurrentSettings() {
    return currentSettings;
}

function getPublicSettings() {
    const { apiKey, ...safeSettings } = currentSettings;
    return { ...safeSettings, apiKey: '', hasApiKey: Boolean(apiKey) };
}

function saveSettings(settings) {
    const next = providerCatalog.resolveSettings(settings, currentSettings);
    if (!next.model) throw new Error('Select or enter a model ID');
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE + '.tmp', JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(SETTINGS_FILE + '.tmp', SETTINGS_FILE);
    currentSettings = next;
    require('./model-output').clearCompatibilityCache();
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
                        const error=new Error(`HTTP ${res.statusCode}: ${data}`);
                        error.status=res.statusCode;
                        try {error.error=JSON.parse(data).error;} catch {}
                        reject(error);
                    }
                });
            });

            req.setTimeout(120000, () => req.destroy(new Error('Provider request timed out')));
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

async function callAnthropic(options, settings = currentSettings) {
    const systemMessage = options.messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage ? systemMessage.content : undefined;
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const anthropicMessages = userMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
    }));

    const url = providerCatalog.normalizeEndpoint('anthropic', settings.apiUrl) + '/messages';
    const headers = {
        'x-api-key': settings.apiKey || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
    };

    const postData = {
        model: settings.model || 'claude-3-5-sonnet-20240620',
        messages: anthropicMessages,
        max_tokens: options.max_tokens || 3000,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        ...require('./model-output').formatFields(options.formatMode)
    };

    if (systemPrompt) {
        postData.system = systemPrompt;
    }

    const res = await makeHttpRequest(url, { method: 'POST', headers }, postData);

    return require('./model-output').decodeAnthropic(res,{json:options.json});
}

async function executeChatCompletion(messages, temperature = 0.7, max_tokens = 3000, outputOptions = {}) {
    if (!openai && currentSettings.provider !== 'anthropic') {
        updateClients();
    }

    const output=require('./model-output'),settings={...currentSettings},client=openai;
    return output.withOutputMode(settings,outputOptions,async formatMode=>{
        if(settings.provider==='anthropic')
            return callAnthropic({messages,temperature,max_tokens,json:outputOptions.json,formatMode},settings);
        const response=await client.chat.completions.create(providerCatalog.completionOptions(settings,messages,temperature,max_tokens,{...outputOptions,formatMode}));
        return output.decodeOpenAI(response,settings.model);
    });
}

async function testConnectionWithSettings(tempSettings) {
    try {
        tempSettings = providerCatalog.resolveSettings(tempSettings, currentSettings);
        if (!tempSettings.model) throw new Error('Select or enter a model ID');
        let responseContent;
        let responseModel;
        
        if (tempSettings.provider === 'anthropic') {
            const messages = [{ role: 'user', content: 'Hello' }];
            const url = tempSettings.apiUrl + '/messages';
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
            const baseURL = tempSettings.apiUrl;
            const tempOpenai = new OpenAI({
                baseURL: baseURL || undefined,
                apiKey: tempSettings.apiKey || 'not-needed', timeout: 20000, maxRetries: 0
            });

            const modelName = tempSettings.model || 'qwen3-vl-8b';
            const response = await tempOpenai.chat.completions.create(providerCatalog.completionOptions(tempSettings, [{ role: 'user', content: 'Hello' }], 0.7, 128));

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
    GAME_MASTER: require('./turn-prompt').RULES,

    ADVISOR: `You are the High Strategic Advisor of {nation_name} on {current_date}.
YOUR MANDATE: Provide COLD, PRECISE, and HISTORICALLY GROUNDED analyses, acting as a strategic compass that helps the leader avoid the failures of the past and pursue national goals with wisdom.

NATIONAL ROADMAP AND HISTORY:
{historical_context_specific}

IRON RULES:
1. **FULL HISTORY AND PSYCHE**: Use the "NATIONAL HISTORY AND PSYCHE" section to deeply understand the nation's motivations, traumas, and ambitions. Your advice must reflect this national identity.
2. **MISTAKE PREVENTION**: Use the "HISTORICAL MISTAKES TO AVOID" section to warn the player. If the player is taking a path that historically led to disaster, intervene firmly.
3. **STRATEGIC DILEMMAS**: Consider the nation's real historical dilemmas when offering your advice.
4. **REAL GEOGRAPHY**: Every piece of advice must be anchored to real locations (e.g., "Fortify the Mai Ceu pass", "Protect the supply lines to Massawa").
5. **NAMES**: Use complete nation names in prose, never bracketed internal nation codes.
6. **CONCISE MODE**: If the player sends ONLY a short, informal message (e.g., "OK", "Hi", "Understood", "Good", "Fine"), respond with ONE VERY SHORT SENTENCE (maximum 10-15 words). DO NOT use the full sectioned format. Examples: "Excellent. I await your orders, Excellency." or "At your command, my lord."

ALWAYS RESPOND FOLLOWING THIS SCHEMA (EXCEPT for short messages, see rule 6):
---
### 📊 HISTORICAL-STRATEGIC ANALYSIS
[Analysis based on the real roadmap, historical dilemmas, and the current situation. Cite specific events.]

### 🎯 MILITARY AND DIPLOMATIC ORDERS
1. [Specific action with location and full nation name]
2. [Specific action with location and full nation name]

### ⚠️ INTELLIGENCE AND MISTAKE PREVENTION
- [Provide a warning based specifically on the nation's historical mistakes if applicable, or on real risks of the period]
---`,

    DIPLOMACY: `We are making a turn-based strategy game where the player can engage in diplomacy. We need you to simulate this diplomacy by roleplaying only as {responding_polity_name}, speaking to the other participants.

PARTICIPANTS: {participants}
PLAYER POLITY: {player_polity}
CURRENT DATE: {current_date}

**Instructions for Roleplay:**
1. PROFESSIONALISM: You are a competent polity. No nonsense. Straight to the point.
2. OPEN-MINDEDNESS: Be receptive to propositions, but ALWAYS move towards a solid answer (accept/refuse). 
3. TONE MATCHING: Your tone should MATCH the tone of the player ({player_polity}), leaning towards professionalism over slang.
4. CHARACTERS: No random math symbols orhashtags. No third-person speaking.

**Useful diplomatic replies:**
Use complete nation names, never internal IDs. A greeting can receive a brief greeting and a relevant diplomatic opening. For substantive proposals, give a clear position, your interests, concrete terms or a counterproposal, and any unresolved conditions in 1–3 concise paragraphs. Match the complexity of the request, not its character count. Do not claim a treaty, transfer or military action has taken effect merely because it was discussed. Do not speak for other participants.

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
function loadHistoricalRoadmap(scenarioId) {
    try {
        return scenarios.getRoadmaps(scenarioId);
    } catch (error) {
        console.error('[LLM] Failed to load historical roadmap:', error.message);
    }
    return {};
}

/**
 * Get historical context for a nation
 */
function getHistoricalRoadmapContext(nationCode, scenarioId) {
    const roadmaps = loadHistoricalRoadmap(scenarioId);
    const data = roadmaps[nationCode];
    const scenarioEra = scenarios.getScenario(scenarioId).era || 'configured historical era';

    if (!data) {
        return `There are no specific milestones for the nation ${nationCode} in this archive.
Keep a realistic tone consistent with the ${scenarioEra} scenario period.`;
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
    const nationCode=gameContext.playerNation?.code || 'ITA';
    const historicalContext=getHistoricalRoadmapContext(nationCode,gameContext.scenarioId);
    const messages=require('./turn-prompt').buildTurnMessages(timeJump,gameContext,historicalContext);
    const started=Date.now();
    const diagnostics={requests:0,prompt_characters:messages.reduce((n,m)=>n+m.content.length,0),repair_prompt_characters:0,
        initial_request_ms:0,repair_request_ms:0,json_recoveries:0,truncated_replies:0,provider_requests:0,format_fallbacks:0};
    const complete = async (requestMessages, temperature, phase) => {
        const requestStarted = Date.now();
        diagnostics.requests++;
        try { return await executeChatCompletion(requestMessages, temperature, 8000, {json:true,
            onRequest:({fallback})=>{diagnostics.provider_requests++;if(fallback)diagnostics.format_fallbacks++;}}); }
        finally { diagnostics[phase + '_request_ms'] = Date.now() - requestStarted; }
    };
    const recordDiagnostics = (deferredOrders, failed) => {
        const elapsed = Date.now() - started;
        const info = {...diagnostics,elapsed_ms:elapsed,
            validation_ms:Math.max(0,elapsed-diagnostics.initial_request_ms-diagnostics.repair_request_ms),
            deferred_orders:deferredOrders,failed:Number(failed)};
        try {
            const directory = path.join(__dirname, '../../data/debug');
            if (!fs.existsSync(directory)) fs.mkdirSync(directory, {recursive:true});
            fs.writeFileSync(path.join(directory, 'last_turn_diagnostics.json'), JSON.stringify(info, null, 2));
        } catch {}
        return info;
    };

    try {
        let response = await complete(messages, 0.7, 'initial');
        let parsed, repairBase=null;
        for(let attempt=0;attempt<2;attempt++) {
            try {
                // Retain failed replies too; otherwise the diagnostic points at
                // an unrelated older successful turn.
                try {
                    const dir=path.join(__dirname,'../../data/debug');
                    if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
                    fs.writeFileSync(path.join(dir,'last_ai_response.txt'),response.content);
                    fs.writeFileSync(path.join(dir,attempt===0?'last_ai_initial_response.txt':'last_ai_repair_response.txt'),response.content);
                    if(attempt===0)fs.writeFileSync(path.join(dir,'last_ai_repair_response.txt'),'');
                }catch{}
                if(response.finish_reason==='length') {
                    diagnostics.truncated_replies++;
                    throw new Error('The model response reached its output limit before completing the turn. Return a complete, concise JSON object with fewer grouped reports.');
                }
                parsed=require('./model-json').parseModelJSON(response.content,{requireEvents:!repairBase,allowMissingEvents:!repairBase});
                if(require('./model-json').wasJSONRecovered(parsed))diagnostics.json_recoveries++;
                if(repairBase)parsed=require('./turn-validation').mergeMilitaryRepair(repairBase,parsed);
                const original=structuredClone(parsed);
                try {require('./turn-validation').validateTurn(parsed,gameContext,{allowUnresolved:attempt===1,allowIncomplete:gameContext.nextImportantEvent || attempt===1});}
                catch(error) {error.original=original;throw error;}
                break;
            } catch(error) {
                if(attempt===1)throw error;
                repairBase=error.scope==='military'?error.original:null;
                const repair=repairBase
                    ? 'Repair the order resolutions and military section only. Return action_resolutions for every pending order and standing operation, and unit_changes/campaign_orders for any standalone orders. Civilian resolutions need action_id and summary, without operation. Prefer nested operation.formations and operation.reports. Do not return or change events, diplomatic_changes, consequences or elapsed_days; they are preserved by the engine. Keep unrelated valid orders. Resolve every issue below together.'
                    : 'Repair the entire JSON response. Preserve valid developments where timing allows, and resolve every issue below together.';
                const correctionMessages=[...messages,{role:'assistant',content:response.content},{role:'user',content:`${repair}\nValidation issues:\n${error.message}\nUse declared formation_ref values for new troops and actual unit_id values for existing troops. Never replace missing movements/support with victory prose.`}];
                diagnostics.repair_prompt_characters=correctionMessages.reduce((n,m)=>n+m.content.length,0);
                response=await complete(correctionMessages,0.3,'repair');
            }
        }

        const selected=require('./next-event').getTimelineSelection(parsed);
        diagnostics.future_events=selected.future_events;diagnostics.future_effects=selected.future_effects;
        parsed.generation_info=recordDiagnostics(parsed.deferred_action_ids?.length||0, false);
        return parsed;

    } catch (error) {
        console.error('Event Generation Error:', error.message);
        return { events: [], error: error.message, generation_info:recordDiagnostics(0, true) };
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
        ...chatHistory.slice(-24).filter((msg,index,history)=>!(index===history.length-1 && msg.sender_is_player && msg.message_text===message)).map(msg => ({
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
        const unavailable = new Error(`Diplomatic model is unavailable: ${error.message}`);
        unavailable.code = 'LLM_UNAVAILABLE';
        throw unavailable;
    }
}

/**
 * Standard Advisor Response - Updated for High Fidelity
 */
async function getAdvisorResponse(question, advContext) {
    const nation = advContext.playerNation;
    const historicalContext = getHistoricalRoadmapContext(nation.code, advContext.scenarioId);

    const systemPrompt = PROMPTS.ADVISOR
        .replace(/{nation_name}/g, nation.name)
        .replace(/{current_date}/g, advContext.currentDate)
        .replace(/{historical_context_specific}/g, historicalContext);

    const messages = [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: `SCENARIO BRIEFING: ${advContext.worldContext || ""}
SIMULATION RULES: ${advContext.simulationRules || ""}
CURRENT SITUATION (${advContext.currentDate}):
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
        const unavailable = new Error(`Advisor model is unavailable: ${error.message}`);
        unavailable.code = 'LLM_UNAVAILABLE';
        throw unavailable;
    }
}

async function planActions(goal, context) {
    const response = await executeChatCompletion([
        { role: 'system', content: 'Draft 3 to 5 concrete orders for the player to issue. Return ONLY JSON: {"actions":["Order text", "Order text"]}. Write each item as a self-contained imperative order, not advice, analysis, an answer, or a question. Match the selected era and nation. Include location, purpose and practical first steps. No invented budgets, stability scores or approval requirements. Do not duplicate pending orders. Suggestions are drafts, never submitted automatically.' },
        { role: 'user', content: JSON.stringify({ goal: goal || 'Suggest useful next steps for my nation.', ...context }) }
    ], 0.7);
    const raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('The planner did not return action drafts. Please try again.'); }
    if (!Array.isArray(parsed.actions) || !parsed.actions.length || parsed.actions.some(a => typeof a !== 'string' || !a.trim() || a.length > 2000)) {
        throw new Error('The planner returned invalid action drafts. Please try again.');
    }
    return [...new Set(parsed.actions.map(a => a.trim()))].slice(0, 5);
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
    planActions,
    diplomaticChat,
    getAdvisorResponse,
    testConnection,
    getCurrentSettings,
    getPublicSettings,
    saveSettings,
    testConnectionWithSettings,
    providers: providerCatalog.providers,
    discoverModels: settings => providerCatalog.discoverModels(providerCatalog.resolveSettings(settings, currentSettings)),
    PROMPTS
};

// Initialize settings
loadSettings();
