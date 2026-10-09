// Provider defaults are shared by settings, model discovery, and inference.
const entries = [
    ['lm-studio', 'LM Studio', 'http://127.0.0.1:1234/v1', false],
    ['ollama', 'Ollama', 'http://127.0.0.1:11434/v1', false],
    ['llama.cpp', 'llama.cpp', 'http://127.0.0.1:8080/v1', false],
    ['vllm', 'vLLM', 'http://127.0.0.1:8000/v1', false],
    ['localai', 'LocalAI', 'http://127.0.0.1:8080/v1', false],
    ['jan', 'Jan', 'http://127.0.0.1:1337/v1', false],
    ['openai', 'OpenAI', 'https://api.openai.com/v1', true],
    ['google', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', true],
    ['anthropic', 'Anthropic Claude', 'https://api.anthropic.com/v1', true],
    ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', true],
    ['groq', 'Groq', 'https://api.groq.com/openai/v1', true],
    ['together', 'Together AI', 'https://api.together.ai/v1', true],
    ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', true],
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com', true],
    ['mistral', 'Mistral AI', 'https://api.mistral.ai/v1', true],
    ['xai', 'xAI', 'https://api.x.ai/v1', true],
    ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', true],
    ['huggingface', 'Hugging Face', 'https://router.huggingface.co/v1', true],
    ['custom', 'Custom OpenAI-compatible endpoint', '', false]
];
const providers = entries.map(([id, name, apiUrl, requiresKey]) => ({ id, name, apiUrl, requiresKey,
    protocol: id === 'anthropic' ? 'anthropic' : 'openai', group: id === 'custom' ? 'Custom' : requiresKey ? 'Cloud' : 'Local' }));

function normalizeEndpoint(provider, supplied) {
    const config = providers.find(item => item.id === provider);
    if (!config) throw new Error('Unknown AI provider');
    let value = String(supplied || config.apiUrl).trim().replace(/\/+$/, '');
    value = value.replace(/\/(chat\/completions|messages|models)$/, '');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Use an HTTP(S) API base URL without credentials, query parameters, or fragments');
    }
    if ((!url.pathname || url.pathname === '/') && config.group === 'Local') value += '/v1';
    return value;
}

function resolveSettings(input, saved = {}) {
    const provider = input.provider || saved.provider || 'lm-studio';
    const apiUrl = normalizeEndpoint(provider, input.apiUrl);
    let sameEndpoint = false;
    try { sameEndpoint = provider === saved.provider && apiUrl === normalizeEndpoint(saved.provider, saved.apiUrl); } catch {}
    // A stored key belongs to this provider AND endpoint. Never forward it to
    // another host simply because the password field was left blank.
    const apiKey = input.clearApiKey ? '' : String(input.apiKey || '').trim() || (sameEndpoint ? saved.apiKey || '' : '');
    return { provider, apiUrl, apiKey, model: String(input.model || '').trim() };
}

async function discoverModels(settings) {
    const config = providers.find(item => item.id === settings.provider);
    if (config.requiresKey && !settings.apiKey) throw new Error('Enter an API key to fetch models for this provider');
    const headers = settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {};
    if (config.protocol === 'anthropic') {
        delete headers.Authorization;
        headers['x-api-key'] = settings.apiKey;
        headers['anthropic-version'] = '2023-06-01';
    }
    const models = [];
    let cursor = '';
    for (let page = 0; page < 20; page++) {
        const suffix = config.protocol === 'anthropic' ? `?limit=100${cursor ? '&after_id=' + encodeURIComponent(cursor) : ''}` : '';
        const response = await fetch(`${settings.apiUrl}/models${suffix}`, { headers, redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`Model discovery returned HTTP ${response.status}. Check the endpoint and key; you can also enter a model ID manually.`);
        const body = await response.json();
        const list = Array.isArray(body) ? body : body.data || body.models;
        if (!Array.isArray(list)) throw new Error('This endpoint did not return a model list. Enter a model ID manually.');
        for (const model of list) {
            const id = model.id || model.name;
            if (typeof id !== 'string' || /embedding|whisper|tts-|dall-e|moderation/i.test(id)) continue;
            if (config.id==='google' && /(?:image|native-audio|tts|live|transcrib|translate|veo|lyria|robotics|computer-use|deep-research|antigravity|\/aqa$)/i.test(id)) continue;
            if (model.type && !['chat', 'language', 'model'].includes(model.type)) continue;
            if (model.capabilities?.completion_chat === false) continue;
            models.push({ id, name: model.display_name || model.name || id });
        }
        if (config.protocol !== 'anthropic' || !body.has_more || !body.last_id || body.last_id === cursor) break;
        cursor = body.last_id;
    }
    return [...new Map(models.map(model => [model.id, model])).values()].sort((a, b) => a.id.localeCompare(b.id));
}
function completionOptions(settings, messages, temperature, maxTokens, {json=false,formatMode}={}) {
    const reasoning = settings.provider === 'openai' && /^(o[1-9](?:-|$)|gpt-[5-9](?:[.-]|$))/.test(settings.model);
    const options = reasoning ? { model: settings.model, messages, max_completion_tokens: maxTokens }
        : { model: settings.model, messages, temperature, max_tokens: maxTokens };
    const output=require('./model-output');
    return {...options,...output.formatFields(formatMode || output.outputModes(settings,json)[0])};
}
module.exports = { providers, normalizeEndpoint, resolveSettings, discoverModels, completionOptions };
