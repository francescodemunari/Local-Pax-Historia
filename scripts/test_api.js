const assert = require('node:assert/strict');
const { once } = require('node:events');
const { server, wss } = require('../backend/server');
const GameEngine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');

async function run() {
    const engine = new GameEngine();
    const originals = { generateEvents: llm.generateEvents, diplomaticChat: llm.diplomaticChat };
    let saveId;
    let releaseTurn;
    let turnRequest;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(endpoint, method = 'GET', body) {
        const response = await fetch(base + endpoint, {
            method, headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, data: await response.json() };
    }
    try {
        assert.equal((await request('/missing')).status, 404);
        const malformed = await fetch(base + '/game/new', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken'
        });
        assert.equal(malformed.status, 400);
        assert.equal((await malformed.json()).error, 'Invalid JSON request body');
        const created = await request('/game/new', 'POST', { nationCode: 'ITA', startDate: '1936-01-01', scenarioId: 'ww2-geographic' });
        assert.equal(created.status, 200);
        saveId = created.data.save_id;
        const initialContext=await request(`/game/state/${saveId}`);
        assert.equal(initialContext.status,200,'Current game state must resolve the effective player profile');
        assert.equal(initialContext.data.playerNation.leader_name,'Benito Mussolini');
        const germanProfile=(await request(`/map/nation/GER/state/${saveId}`)).data;
        assert.equal(germanProfile.portrait_leader,germanProfile.leader_name);
        assert.match(germanProfile.leader_portrait,/^\/assets\/leaders\//,'Nation popup must use the portrait catalogue');
        assert.equal((await fetch(base.replace(/\/api$/,'')+germanProfile.leader_portrait)).status,200);
        const portraitEndpoint=`/nations/portrait/${saveId}`;
        assert.equal((await request(portraitEndpoint,'PUT',{portrait:'data:image/svg+xml;base64,AAAA',leader_name:'Benito Mussolini'})).status,400);
        assert.equal((await request(portraitEndpoint,'PUT',{portrait:null,leader_name:'Wrong leader'})).status,409);
        assert.equal((await request(portraitEndpoint,'PUT',{portrait:'data:image/jpeg;base64,/9j/2Q==',leader_name:'Benito Mussolini'})).status,200);
        assert.equal((await request(`/map/nation/ITA/state/${saveId}`)).data.leader_portrait,'data:image/jpeg;base64,/9j/2Q==');
        assert.equal((await request(portraitEndpoint,'PUT',{portrait:null,leader_name:'Benito Mussolini'})).status,200);

        const compact = await request(`/map/geojson?compact=1&saveId=${saveId}`);
        assert.equal(compact.status, 200);
        assert(compact.data.regions.length > 1000);
        assert(compact.data.regions.every(region => !Object.hasOwn(region, 'path') && region.id && region.marker_anchor));
        assert(engine.scenarios.getMap('ww2-geographic').regions.every(region => typeof region.path === 'string'));
        const locations = await request(`/map/search/Istanbul?saveId=${saveId}`);
        const greenland = await request(`/map/search/Greenland?saveId=${saveId}`);
        assert(greenland.data.length >= 5 && greenland.data.length < 20);
        assert.equal(new Set(greenland.data.map(r=>r.name)).size, greenland.data.length, 'Island fragments must not crowd out distinct province results');
        const istanbul = locations.data.find(result => result.type === 'city');
        assert(istanbul.region_id && istanbul.name === 'Istanbul');
        const accentSearch = await request('/map/search/Sao%20Paulo?scenarioId=world-2010');
        assert(accentSearch.data.some(result => result.type === 'city' && result.name === 'São Paulo'));
        const regionSearch = await request('/map/search/Rome?scenarioId=ww2-geographic');
        assert(regionSearch.data.some(result => result.type === 'region' && result.name === 'Rome'));
        const mapState = await engine.loadGame(saveId);
        engine.setRegionController(mapState, istanbul.region_id, 'ITA');
        engine.applyModelStateChanges(mapState,{ITA:{name:'Italian Republic (test)',ruling_party:'Context Test Party'}});
        engine.saveGame(saveId, mapState);
        const changedContext=await request(`/game/state/${saveId}`);
        assert.equal(changedContext.status,200);
        assert.equal(changedContext.data.playerNation.name,'Italian Republic (test)','Saved nation changes reach the current-state endpoint');
        assert.equal(changedContext.data.playerNation.ruling_party,'Context Test Party');
        const occupiedCities = await request(`/map/cities?saveId=${saveId}`);
        assert.equal(occupiedCities.data.find(city => city.id === istanbul.id).nation_code, 'ITA');
        assert.equal(occupiedCities.data.find(city => city.id === istanbul.id).historical_nation_code, 'TUR');
        const dossier = await request(`/regions/${encodeURIComponent(istanbul.region_id)}/stats?saveId=${saveId}`);
        assert(dossier.data.cities.some(city => city.id === istanbul.id));
        const chat = await request('/chat/start', 'POST', { saveId, participantNations: ['ITA', 'GER'], topic: null });
        assert.equal(chat.status, 200, 'Client default topic must be accepted');

        // A delayed diplomacy response must not overwrite a newer order.
        llm.diplomaticChat = async () => {
            await engine.processPlayerAction(saveId, 'Preserve the newer order');
            return 'Acknowledged.';
        };
        const conflicted = await request(`/chat/${chat.data.id}/message`, 'POST', {
            saveId, senderNation: 'ITA', message: 'Discuss trade.'
        });
        assert.equal(conflicted.status, 409);
        assert.equal(conflicted.data.code, 'SAVE_CONFLICT');
        assert.equal((await engine.loadGame(saveId)).actions.at(-1).action_text, 'Preserve the newer order');

        let signalStarted;
        const started = new Promise(resolve => { signalStarted = resolve; });
        const held = new Promise(resolve => { releaseTurn = resolve; });
        llm.generateEvents = async (jump, context) => {
            signalStarted();
            await held;
            return { events: [], unit_changes: [], action_resolutions: context.actions.map(action => ({action_id:action.id,summary:'The order was processed during the interval.'})) };
        };
        turnRequest = request('/game/advance', 'POST', { saveId, timeJump: '1_week' });
        await started;
        assert.equal((await request('/actions', 'POST', { saveId, actionText: 'Conflicting order' })).status, 409);
        assert.equal((await request(`/game/saves/${saveId}`, 'DELETE')).status, 409);
        releaseTurn();
        assert.equal((await turnRequest).status, 200);
        assert.equal((await request('/actions', 'POST', { saveId, actionText: 'Next turn order' })).status, 200);
        console.log('✓ HTTP integration checks passed');
    } finally {
        if (releaseTurn) releaseTurn();
        if (turnRequest) await turnRequest;
        Object.assign(llm, originals);
        if (saveId) await engine.deleteSave(saveId);
        wss.close();
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
