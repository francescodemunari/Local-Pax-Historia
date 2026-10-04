const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const elements = new Map();
    const document = {
        addEventListener() {},
        querySelectorAll: () => [],
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { dataset: {}, value: '', textContent: '', disabled: false });
            return elements.get(id);
        }
    };
    const requests = [];
    const api = { getNations: id => new Promise((resolve, reject) => requests.push({ id, resolve, reject })) };
    const context = vm.createContext({ document, api, console });
    const app = vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js/app.js'), 'utf8') + '\napp;', context);
    app.scenarios = [{ id: 'old' }, { id: 'new' }];
    // Rendering is checked in the browser; isolate delayed network responses here.
    for (const method of ['renderScenarioCards', 'renderNationGrid', 'updateScenarioDetails', 'updateScenarioFilters']) app[method] = () => {};
    const oldRequest = app.selectScenario('old');
    const newRequest = app.selectScenario('new');
    assert.equal(document.getElementById('btn-new-game').disabled, true);
    requests[1].resolve([{ code: 'NEW' }]);
    await newRequest;
    requests[0].resolve([{ code: 'OLD' }]);
    await oldRequest;
    assert.equal(app.selectedScenarioId, 'new');
    assert.equal(app.loadedNationScenarioId, 'new');
    assert.equal(app.nations[0].code, 'NEW', 'A slower previous scenario must not replace the chosen nation list');
    assert.equal(document.getElementById('btn-new-game').disabled, false);

    const failed = app.selectScenario('old');
    requests[2].reject(new Error('offline'));
    await failed;
    assert.equal(app.nations.length, 0);
    assert.equal(app.loadedNationScenarioId, null);
    assert.equal(document.getElementById('btn-new-game').disabled, true);
    assert.match(document.getElementById('scenario-load-status').textContent, /retry/);
    const retry = app.selectScenario('old');
    requests[3].resolve([{ code: 'OLD' }]);
    await retry;
    assert.equal(app.loadedNationScenarioId, 'old');
    assert.equal(document.getElementById('btn-new-game').disabled, false);
    app.isCreatingGame = true;
    await app.selectScenario('new');
    assert.equal(app.selectedScenarioId, 'old', 'Scenario cannot change while creating its save');
    console.log('✓ Scenario switching, stale responses, failure recovery, and creation guard passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
