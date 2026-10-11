const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { once } = require('node:events');
const llm = require('../backend/services/llm-service');
const writing = require('../backend/services/action-improvement');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function composerFixture() {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) {
            const classes = new Set(id === 'action-improvement' ? ['hidden'] : []);
            nodes.set(id, { value: '', textContent: '', disabled: false, listeners: {},
                classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
                addEventListener(type, handler) { this.listeners[type] = handler; },
                replaceChildren() {}, focus() {}, setSelectionRange() {} });
        }
        return nodes.get(id);
    };
    const notices = [], submissions = [];
    const context = { console, document: { getElementById: node },
        app: { currentGame: { saveId: 'draft-game', currentDate: '1936-01-01' }, showToast: (...args) => notices.push(args) },
        api: { submitAction: async (...args) => { submissions.push(args); return { success: true }; } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/panels/actions-panel.js'), 'utf8') + '\nthis.panel=actionsPanel;', context);
    context.panel.loadPendingActions = () => {};
    context.panel.init();
    context.panel.reset();
    const type = text => { node('action-input').value = text; node('action-input').listeners.input(); };
    return { ...context, node, notices, submissions, type };
}

async function testComposer() {
    const f = composerFixture();
    assert.equal(f.node('btn-improve-action').disabled, true);
    assert.equal(f.node('btn-send-action').disabled, true);
    f.type('attack north and south with land and air');
    f.api.improveAction = async () => ({ action: 'Advance from the north and south using land and air forces.' });
    await f.panel.improveAction();
    assert.equal(f.node('action-input').value, 'attack north and south with land and air', 'A suggestion must preserve the original input');
    assert.equal(f.node('action-improvement').classList.contains('hidden'), false);
    assert.equal(f.submissions.length, 0, 'Writing assistance must never queue an order');
    f.node('action-improvement-input').value = 'Advance from both fronts with land and air forces; protect the supply lines.';
    f.panel.applyImprovement();
    assert.equal(f.node('action-input').value, 'Advance from both fronts with land and air forces; protect the supply lines.');
    assert.equal(f.node('action-improvement').classList.contains('hidden'), true);
    assert.equal(f.submissions.length, 0, 'Applying an edited rewrite still must not queue it');

    const kept = f.node('action-input').value;
    await f.panel.improveAction();
    f.panel.discardImprovement();
    assert.equal(f.node('action-input').value, kept, 'Keep original must not replace the draft');

    let pending = deferred();
    f.api.improveAction = () => pending.promise;
    let task = f.panel.improveAction();
    f.type('A newer order while the assistant is working');
    pending.resolve({ action: 'Stale rewrite' });
    await task;
    assert.equal(f.node('action-input').value, 'A newer order while the assistant is working');
    assert.equal(f.node('action-improvement').classList.contains('hidden'), true);

    const first = deferred(), second = deferred();
    f.api.improveAction = () => first.promise;
    const firstTask = f.panel.improveAction();
    f.type('A different draft for the second request');
    f.api.improveAction = () => second.promise;
    const secondTask = f.panel.improveAction();
    first.resolve({ action: 'First stale rewrite' });
    await firstTask;
    assert.equal(f.node('btn-improve-action').disabled, true, 'An old request finishing must not enable controls for a newer request');
    second.resolve({ action: 'The second rewritten order' });
    await secondTask;
    assert.equal(f.node('action-improvement-input').value, 'The second rewritten order');
    f.app.currentGame.currentDate = '1936-02-01';
    f.panel.applyImprovement();
    assert.equal(f.node('action-input').value, 'A different draft for the second request', 'An existing preview cannot apply after the turn changes');
    assert.equal(f.node('action-improvement').classList.contains('hidden'), true);

    pending = deferred();
    f.api.improveAction = () => pending.promise;
    task = f.panel.improveAction();
    f.app.currentGame = { saveId: 'new-game', currentDate: '1910-01-01' };
    f.panel.reset();
    f.type('The new campaign draft');
    pending.resolve({ action: 'Previous campaign rewrite' });
    await task;
    assert.equal(f.node('action-input').value, 'The new campaign draft');
    assert.equal(f.node('action-improvement').classList.contains('hidden'), true);
    assert.equal(f.node('btn-improve-action').disabled, false);

    pending = deferred();
    task = f.panel.improveAction();
    f.app.currentGame.currentDate = '1910-02-01';
    pending.resolve({ action: 'Stale date rewrite' });
    await task;
    assert.equal(f.node('action-improvement').classList.contains('hidden'), true, 'An old turn reply must not replace the current draft');

    f.api.improveAction = async () => { throw new Error('Mock model unavailable'); };
    await f.panel.improveAction();
    assert.equal(f.node('action-input').value, 'The new campaign draft');
    assert.equal(f.notices.at(-1)[0], 'Mock model unavailable');
    assert.equal(f.node('btn-improve-action').disabled, false);

    const queue = deferred();
    f.api.submitAction = (...args) => { f.submissions.push(args); return queue.promise; };
    task = f.panel.submitAction();
    await f.panel.submitAction();
    assert.equal(f.submissions.length, 1, 'Repeated clicks must not duplicate the queued order');
    f.type('Another draft typed while the previous order queues');
    queue.resolve({ success: true });
    await task;
    assert.equal(f.node('action-input').value, 'Another draft typed while the previous order queues', 'Queue completion must preserve newer input');
    assert.equal(f.node('btn-send-action').disabled, false);

    const oldQueue = deferred();
    f.api.submitAction = () => oldQueue.promise;
    task = f.panel.submitAction();
    f.app.currentGame = { saveId: 'third-game', currentDate: '2010-01-01' };
    f.panel.reset();
    f.type('Preserve this draft in the third campaign');
    oldQueue.resolve({ success: true });
    await task;
    assert.equal(f.node('action-input').value, 'Preserve this draft in the third campaign');
    assert.equal(f.node('btn-send-action').disabled, false);
}

async function testServiceAndRoute() {
    const originalCompletion = llm.executeChatCompletion;
    let content = JSON.stringify({ action: 'Advance from Eritrea and Somalia using land and air forces.' });
    let finishReason = 'stop', captured, calls = 0;
    llm.executeChatCompletion = async (...args) => { calls++; captured = args; return { content, finish_reason: finishReason }; };
    let server, engine, saveId;
    try {
        const original = 'advance from eritrea and somalia land and air';
        const context = { playerNation: { name: 'Italy' }, scenarioId: 'ww2-geographic', currentDate: '1936-01-01' };
        assert.equal(await writing.improveAction(original, context), JSON.parse(content).action);
        assert.match(captured[0][0].content, /Preserve every requested objective/);
        assert.match(captured[0][0].content, /Do not add goals/);
        assert.equal(JSON.parse(captured[0][1].content).draft, original);
        assert.equal(JSON.parse(captured[0][1].content).nation, 'Italy');
        assert.equal(captured[3].json, true, 'Use the shared provider output negotiation');
        const validCalls = calls;
        for (const input of ['', null, 42, 'a'.repeat(2001)]) await assert.rejects(() => writing.improveAction(input), /1–2000/);
        assert.equal(calls, validCalls, 'Invalid inputs must not consume model requests');
        for (const invalid of ['Here is some advice.', '{"action":42}', '{"action":""}', '{"actions":["one","two"]}', JSON.stringify({ action: 'x'.repeat(2001) })]) {
            content = invalid;
            await assert.rejects(() => writing.improveAction(original, context), error => error.code === 'LLM_UNAVAILABLE' && /draft is unchanged/.test(error.message));
        }
        content = JSON.stringify({ action: 'Complete-looking but truncated' });
        finishReason = 'length';
        await assert.rejects(() => writing.improveAction(original, context), /complete order/);
        finishReason = 'stop';
        content = '```json\n{"action":"Consult France on trade."}\n```';
        assert.equal(await writing.improveAction(original, context), 'Consult France on trade.');

        const express = require('../backend/node_modules/express');
        const app = express();
        app.use(express.json());
        app.use('/actions', require('../backend/routes/actions'));
        server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const url = `http://127.0.0.1:${server.address().port}/actions/improve`;
        const request = async body => {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            return { status: response.status, body: await response.json() };
        };
        const GameEngine = require('../backend/services/game-engine');
        engine = new GameEngine();
        saveId = (await engine.createGame('ITA', '1936-01-01', 'ww2-geographic')).save_id;
        const before = fs.readFileSync(engine.getSavePath(saveId), 'utf8');
        content = JSON.stringify({ action: 'Advance from Eritrea and Somalia using land and air forces.' });
        const improved = await request({ saveId, actionText: original });
        assert.equal(improved.status, 200);
        assert.equal(improved.body.action, JSON.parse(content).action);
        assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), before, 'Improving a draft must leave the save byte-for-byte unchanged');
        assert.equal((await engine.loadGame(saveId)).actions.length, 0);
        for (const body of [{}, { saveId, actionText: '' }, { saveId, actionText: 'x'.repeat(2001) }, { saveId: 42, actionText: original }]) {
            assert.equal((await request(body)).status, 400);
        }
        assert.equal((await request({ saveId: '../invalid', actionText: original })).status, 400);
        content = 'bad output';
        assert.equal((await request({ saveId, actionText: original })).status, 503);
        assert.equal(fs.readFileSync(engine.getSavePath(saveId), 'utf8'), before);
    } finally {
        llm.executeChatCompletion = originalCompletion;
        if (server) await new Promise(resolve => server.close(resolve));
        if (saveId) await engine.deleteSave(saveId);
    }
}

(async () => {
    await testComposer();
    await testServiceAndRoute();
    console.log('✓ Editable action rewrites, preserved drafts, request races and read-only API passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
