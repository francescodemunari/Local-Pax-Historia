const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const express = require('../backend/node_modules/express');
const Engine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');

async function run() {
    const engine = new Engine(), originalGenerate = llm.generateEvents, originalError = console.error;
    const broadcasts = [];
    const app = express();
    app.use(express.json());
    app.locals.broadcast = message => broadcasts.push(JSON.parse(JSON.stringify(message)));
    app.use('/api/game', require('../backend/routes/game'));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/game`;
    const request = async (route, body, method = 'POST') => {
        const response = await fetch(base + route, {
            method, headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await response.text();
        return { status: response.status, data: JSON.parse(text), text };
    };
    let saveId, generationCalls = 0, releaseTurn, advancing;
    try {
        const created = await request('/new', { nationCode: 'ITA', scenarioId: 'ww2-geographic' });
        assert.equal(created.status, 200);
        saveId = created.data.save_id;
        const order = await engine.processPlayerAction(saveId, 'Organise an international cultural festival.');
        llm.generateEvents = async () => {
            generationCalls++;
            return {
                events: [
                    { title: 'Earlier administrative decision', description: 'An independent decision takes effect.',
                        game_date: '1936-01-10', event_type: 'political', severity: 'minor', affected_nations: ['ITA'],
                        state_changes: { ITA: { ruling_party: 'Earlier administration' } } },
                    { title: 'Simultaneous leader appointment', description: 'A new leader is appointed the same day.',
                        game_date: '1936-01-10', event_type: 'political', severity: 'minor', affected_nations: ['ITA'],
                        state_changes: { ITA: { leader_name: 'Earlier leader' } } },
                    { title: 'Later festival opens', description: 'The cultural festival takes place.',
                        game_date: '1936-03-01', event_type: 'social', severity: 'minor', affected_nations: ['ITA'], action_id: order.id }
                ],
                action_resolutions: [{ action_id: order.id, summary: 'The festival has opened successfully.' }],
                campaign_orders: [], diplomatic_changes: [], unit_changes: []
            };
        };
        const full = await request('/advance', { saveId, timeJump: '3_months' });
        assert.equal(full.status, 200);
        assert.equal(full.data.new_date, '1936-04-01');
        const selected = full.data.events.find(event => event.title === 'Earlier administrative decision');
        assert.equal(selected.can_resume, true);
        assert.equal(selected.resume_revision, full.data.revision);
        const before = fs.readFileSync(engine.getSavePath(saveId), 'utf8');
        assert(before.includes('"_eventReplay"'), 'The endpoint has a persisted replay checkpoint to use');
        const loaded = await request(`/load/${saveId}`, undefined, 'GET');
        assert.equal(loaded.status, 200);
        assert.equal(loaded.data.events.find(event => event.id === selected.id).can_resume, true);
        assert(!loaded.text.includes('_eventReplay'), 'Public load responses must not serialize private replay data');

        broadcasts.length = 0;
        // Expected negative requests are checked below; keep their server-side
        // stack traces out of the test output and restore logging in finally.
        console.error = () => {};
        for (const body of [
            { saveId, eventId: selected.id },
            { saveId, eventId: selected.id, revision: String(selected.resume_revision) },
            { saveId, eventId: '', revision: selected.resume_revision },
            { saveId, eventId: selected.id, revision: 0 }
        ]) {
            const malformed = await request('/resume-event', body);
            assert.equal(malformed.status, 400);
            assert.equal(malformed.data.code, 'INVALID_EVENT_CONTINUATION');
            assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), before);
        }
        const stale = await request('/resume-event', { saveId, eventId: selected.id, revision: selected.resume_revision - 1 });
        assert.equal(stale.status, 409);
        assert.equal(stale.data.code, 'SAVE_CONFLICT');
        const unavailable = await request('/resume-event', { saveId, eventId: 'missing_event', revision: selected.resume_revision });
        assert.equal(unavailable.status, 409);
        assert.equal(unavailable.data.code, 'EVENT_CONTINUATION_UNAVAILABLE');
        assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), before);
        assert.equal(broadcasts.length, 0, 'Failed selections must not broadcast a completed turn');

        const resumed = await request('/resume-event', { saveId, eventId: selected.id, revision: selected.resume_revision });
        assert.equal(resumed.status, 200);
        assert.equal(generationCalls, 1, 'The HTTP continuation must not request another inference');
        assert.equal(resumed.data.new_date, '1936-01-10');
        assert.equal(resumed.data.state.currentDate, '1936-01-10');
        assert.equal(resumed.data.resumed_from_event, selected.id);
        assert.equal(resumed.data.state.nations.ITA.ruling_party, 'Earlier administration');
        assert.equal(resumed.data.state.nations.ITA.leader_name, 'Earlier leader', 'All simultaneous effects apply through the selected date');
        assert.equal(resumed.data.state.actions[0].status, 'pending');
        assert(!Object.hasOwn(resumed.data.state.actions[0], 'ai_response'));
        assert(resumed.data.events.every(event => event.game_date <= '1936-01-10'));
        assert(!resumed.text.includes('_eventReplay'));
        assert.equal(broadcasts.length, 1);
        assert.equal(broadcasts[0].type, 'time_advance_complete');
        assert.equal(broadcasts[0].saveId, saveId);
        assert.deepEqual(broadcasts[0].data, resumed.data, 'Broadcast and HTTP result describe the same authoritative world');
        assert(!JSON.stringify(broadcasts).includes('_eventReplay'));
        const persisted = await engine.loadGame(saveId);
        assert.equal(persisted.currentDate, '1936-01-10');
        assert.equal(persisted.revision, resumed.data.revision);
        const resumedBytes = fs.readFileSync(engine.getSavePath(saveId), 'utf8');
        const reused = await request('/resume-event', { saveId, eventId: selected.id, revision: selected.resume_revision });
        assert.equal(reused.status, 409);
        assert.equal(reused.data.code, 'SAVE_CONFLICT');
        assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), resumedBytes);
        assert.equal(broadcasts.length, 1, 'A stale second click cannot replay or rebroadcast the turn');

        let started;
        const startedPromise = new Promise(resolve => { started = resolve; });
        const held = new Promise(resolve => { releaseTurn = resolve; });
        llm.generateEvents = async (_jump, context) => {
            generationCalls++;
            started();
            await held;
            return { events: [], unit_changes: [], campaign_orders: [], diplomatic_changes: [],
                action_resolutions: context.actions.map(action => ({ action_id: action.id, summary: 'The order resolves in the following interval.' })) };
        };
        advancing = request('/advance', { saveId, timeJump: '1_week' });
        await startedPromise;
        const locked = await request('/resume-event', { saveId, eventId: selected.id, revision: resumed.data.revision });
        assert.equal(locked.status, 409);
        assert.equal(locked.data.code, 'TURN_IN_PROGRESS');
        assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), resumedBytes, 'A locked continuation cannot change the pending turn');
        assert.equal(broadcasts.filter(message => message.type === 'time_advance_complete').length, 1);
        releaseTurn();
        const advanced = await advancing;
        assert.equal(advanced.status, 200);
        assert.equal(advanced.data.new_date, '1936-01-17');
        assert.equal(generationCalls, 2, 'Only actual time advances call the mocked model');
    } finally {
        if (releaseTurn) releaseTurn();
        if (advancing) await advancing;
        llm.generateEvents = originalGenerate;
        console.error = originalError;
        if (saveId) await engine.deleteSave(saveId);
        await new Promise(resolve => server.close(resolve));
    }
    console.log('Event continuation HTTP: authoritative replay/broadcast, private checkpoint omission, malformed400, stale/unavailable409 and turnlock409 passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
