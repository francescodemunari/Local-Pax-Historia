const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { providers, normalizeEndpoint, resolveSettings, discoverModels, completionOptions } = require('../backend/services/ai-providers');

async function run() {
    assert(providers.length >= 19);
    assert.equal(normalizeEndpoint('google', 'https://generativelanguage.googleapis.com/v1beta/openai/'), 'https://generativelanguage.googleapis.com/v1beta/openai');
    assert.equal(normalizeEndpoint('anthropic', 'https://api.anthropic.com/v1/messages'), 'https://api.anthropic.com/v1');
    assert.equal(normalizeEndpoint('custom', 'https://example.com/custom/api'), 'https://example.com/custom/api');
    const saved = { provider: 'openai', apiUrl: 'https://api.openai.com/v1', apiKey: 'fixture-secret' };
    assert.equal(resolveSettings({ ...saved, apiKey: '' }, saved).apiKey, 'fixture-secret');
    assert.equal(resolveSettings({ provider: 'groq' }, saved).apiKey, '');
    assert.equal(resolveSettings({ provider: 'openai', apiUrl: 'https://example.com/v1' }, saved).apiKey, '');
    assert.equal(resolveSettings({ ...saved, clearApiKey: true }, saved).apiKey, '');
    assert.throws(() => normalizeEndpoint('custom', 'file:///etc/passwd'));
    assert.throws(() => normalizeEndpoint('custom', 'https://secret@example.com/v1'));
    const options = completionOptions({provider:'openai', model:'gpt-5'},[],.7,100);
    assert.equal(options.max_completion_tokens,100); assert.equal(options.temperature,undefined);

    const requests = [];
    const server = http.createServer((req, res) => {
        requests.push({ url:req.url, headers:req.headers });
        res.setHeader('content-type','application/json');
        if (req.url.startsWith('/anthropic/models')) {
            res.end(JSON.stringify(req.url.includes('after_id') ? { data:[{id:'second',display_name:'Second'}],has_more:false } : { data:[{id:'first'}],has_more:true,last_id:'first' }));
        } else if (req.url === '/google/models') {
            res.end(JSON.stringify({data:[{id:'models/gemini-flash-latest'},{id:'models/gemini-flash-image'},{id:'models/veo-preview'},{id:'models/gemini-live'},{id:'models/lyria-realtime'}]}));
        } else if (req.url === '/bad/models') {
            res.writeHead(401); res.end('{}');
        } else {
            res.end(JSON.stringify({data:[{id:'chat-b'},{id:'text-embedding-3-small'},{id:'chat-a'},{id:'chat-a'}]}));
        }
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.deepEqual((await discoverModels({provider:'custom',apiUrl:base,apiKey:''})).map(m=>m.id),['chat-a','chat-b']);
        assert.equal(requests[0].headers.authorization,undefined);
        const models=await discoverModels({provider:'anthropic',apiUrl:base+'/anthropic',apiKey:'test-only'});
        assert.equal(models.length,2); assert.equal(requests[1].headers['x-api-key'],'test-only');
        assert.match(requests[2].url,/after_id=first/);
        assert.deepEqual((await discoverModels({provider:'google',apiUrl:base+'/google',apiKey:'fixture-key'})).map(m=>m.id),['models/gemini-flash-latest']);
        await assert.rejects(discoverModels({provider:'custom',apiUrl:base+'/bad',apiKey:''}),/HTTP 401/);
        await assert.rejects(discoverModels({provider:'groq',apiUrl:base,apiKey:''}),/API key/);
        console.log('✓ Provider defaults, model discovery, pagination, failures, and key isolation passed');
    } finally { await new Promise(resolve=>server.close(resolve)); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
