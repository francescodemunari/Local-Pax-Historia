const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { promise, resolve };
}
async function until(check) {
    for (let index = 0; index < 25; index++) { if (check()) return; await Promise.resolve(); }
    assert.fail('Expected the mocked async loader to reach its request');
}
const configurations = [
    { file: 'units', name: 'UnitManager', method: 'loadUnits', data: 'units', display: 'displayUnits', payload: name => [{ id: name, region_id: name }] },
    { file: 'nations', name: 'NationLabelManager', method: 'loadNationLabels', data: 'nationsData', display: 'displayNationLabels', payload: name => ({ ITA: { name } }) },
    { file: 'cities', name: 'CityManager', method: 'loadCities', data: 'cities', display: 'displayCities', payload: name => [{ id: name, name }] },
    { file: 'map', name: 'GameMap', method: 'loadNationColors', data: 'nationColors', payload: name => ({ ITA: { name } }) }
];
function create(config, app = { currentGame: { saveId: 'A', revision: 7 } }) {
    const queue = [], logs = [];
    const context = { console: { log() {}, error: (...args) => logs.push(args) },
        fetch: () => { const request = deferred(); queue.push(request); return request.promise; } };
    if (app !== undefined) context.app = app;
    const map = { getPane: () => ({}), on() {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve(`../frontend/js/${config.file}.js`), 'utf8') + `\nthis.Manager=${config.name};`, context);
    const manager = new context.Manager(map);
    let renders = 0;
    if (config.display) manager[config.display] = () => { renders++; };
    return { context, manager, queue, logs, renders: () => renders };
}
const response = value => ({ ok: true, json: async () => clone(value) });

async function overlayRaces(config) {
    let f = create(config);
    const old = f.manager[config.method]('A'), fresh = f.manager[config.method]('A');
    f.queue[1].resolve(response(config.payload('newer')));
    await fresh;
    f.queue[0].resolve(response(config.payload('older')));
    await old;
    assert.deepEqual(clone(f.manager[config.data]), config.payload('newer'), `${config.name}: an older same-save refresh cannot overwrite a newer one`);
    if (config.display) assert.equal(f.renders(), 1);

    f = create(config);
    const json = deferred();
    let readingJSON = false;
    const pending = f.manager[config.method]('A');
    f.queue[0].resolve({ ok: true, json: () => { readingJSON = true; return json.promise; } });
    await until(() => readingJSON);
    f.context.app.currentGame = { saveId: 'B' };
    f.manager[config.data] = config.payload('current B');
    json.resolve(config.payload('late A'));
    await pending;
    assert.deepEqual(clone(f.manager[config.data]), config.payload('current B'), `${config.name}: JSON parsing cannot overwrite a new campaign`);
    if (config.display) assert.equal(f.renders(), 0);

    for (const transition of ['new revision', 'same-save reload']) {
        f = create(config);
        const waiting = f.manager[config.method]('A');
        if (transition === 'new revision') f.context.app.currentGame.revision = 8;
        else f.context.app.currentGame = { saveId: 'A', revision: 7 };
        f.manager[config.data] = config.payload('authoritative current world');
        f.queue[0].resolve(response(config.payload('obsolete same-save data')));
        await waiting;
        assert.deepEqual(clone(f.manager[config.data]), config.payload('authoritative current world'), `${config.name}: ${transition} invalidates an outstanding request even without a replacement loader`);
        if (config.display) assert.equal(f.renders(), 0);
    }

    f = create(config);
    const leaving = f.manager[config.method]('A');
    f.context.app.currentGame = null;
    f.manager[config.data] = config.payload('preserved');
    f.queue[0].resolve(response(config.payload('after quit')));
    await leaving;
    assert.deepEqual(clone(f.manager[config.data]), config.payload('preserved'), `${config.name}: quitting invalidates the response`);

    for (const isolatedApp of [undefined, {}]) {
        f = create(config, isolatedApp);
        if (isolatedApp === undefined) delete f.context.app;
        const standalone = f.manager[config.method]('fixture');
        f.queue[0].resolve(response(config.payload('standalone')));
        await standalone;
        assert.deepEqual(clone(f.manager[config.data]), config.payload('standalone'), `${config.name}: isolated callers without currentGame remain supported`);
    }
}

async function fullMapRaces() {
    const config = configurations[3];
    let f = create(config);
    f.manager.loadNationColors = async () => ({});
    const rendered = [];
    f.manager.renderSVGMap = (data, isCurrent) => { assert.equal(isCurrent(), true); rendered.push(data.id); };
    const old = f.manager.asyncLoadMapData('A');
    await until(() => f.queue.length === 1);
    const fresh = f.manager.asyncLoadMapData('A');
    await until(() => f.queue.length === 2);
    f.queue[1].resolve(response({ id: 'new geometry' }));
    await fresh;
    f.queue[0].resolve(response({ id: 'stale geometry' }));
    await old;
    assert.deepEqual(rendered, ['new geometry']);

    f = create(config);
    f.manager.loadNationColors = async () => ({});
    let renderCount = 0;
    f.manager.renderSVGMap = () => { renderCount++; };
    const switched = f.manager.asyncLoadMapData('A');
    await until(() => f.queue.length === 1);
    f.context.app.currentGame = { saveId: 'B' };
    f.queue[0].resolve(response({ id: 'old campaign geometry' }));
    await switched;
    assert.equal(renderCount, 0, 'Map metadata from a previous save cannot render');

    for (const transition of ['new revision', 'same-save reload']) {
        f = create(config);
        f.manager.loadNationColors = async () => ({});
        let rendered = false;
        f.manager.renderSVGMap = () => { rendered = true; };
        const waiting = f.manager.asyncLoadMapData('A');
        await until(() => f.queue.length === 1);
        if (transition === 'new revision') f.context.app.currentGame.revision = 8;
        else f.context.app.currentGame = { saveId: 'A', revision: 7 };
        f.queue[0].resolve(response({ id: 'obsolete geometry' }));
        await waiting;
        assert.equal(rendered, false, `${transition} invalidates the pending geometry before rendering`);
    }

    f = create(config);
    f.context.document = { getElementById: () => ({ classList: { toggle() {} } }) };
    f.context.L = { layerGroup: () => ({ addTo() { return this; } }) };
    f.context.DOMParser = class { constructor() { throw new Error('A stale SVG must not even be parsed'); } };
    f.manager.map = { off() {}, removeLayer() {} };
    f.manager.clearSVGOverlays = () => {};
    let current = true;
    const svg = f.manager.renderSVGMap({ scenarioId: 'old', coordinateSystem: 'WGS84', renderer: { svgUrl: '/old.svg' } }, () => current);
    current = false;
    f.manager.currentScenarioId = 'new';
    f.queue[0].resolve({ text: async () => '<svg/>' });
    await svg;
    assert.equal(f.manager.currentScenarioId, 'new');
    assert.equal(f.logs.length, 0, 'A cancelled SVG completion must leave the active map untouched');
}

(async () => {
    for (const config of configurations) await overlayRaces(config);
    await fullMapRaces();
    console.log('✓ Map overlay and geometry loaders reject stale save/request completions and support isolated callers');
})().catch(error => { console.error(error); process.exitCode = 1; });
