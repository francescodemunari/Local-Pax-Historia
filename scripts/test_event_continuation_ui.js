const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
async function until(check, message) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (check()) return;
        await Promise.resolve();
    }
    assert.fail(message);
}

function fixture() {
    const elements = new Map(), sockets = new Map(), notices = [], requests = [];
    const counts = { regions: 0, colors: 0, units: 0, cities: 0, labels: 0, stop: 0, panels: 0, actions: 0, composer: 0 };
    function element(tag = 'div') {
        const classes = new Set();
        let html = '';
        return { tag, children: [], selectors: new Map(), textContent: '', value: '', hidden: false, disabled: false,
            classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
            set innerHTML(value) { html = value; this.children = []; this.selectors.clear(); }, get innerHTML() { return html; },
            setAttribute() {}, addEventListener() {},
            append(...children) { for (const child of children) { this.children.push(child); child.parent = this; if (child.id) elements.set(child.id, child); } },
            appendChild(child) { this.append(child); return child; },
            querySelector(selector) { if (!this.selectors.has(selector)) this.selectors.set(selector, element(selector)); return this.selectors.get(selector); },
            remove() { if (this.id) elements.delete(this.id); if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
            replaceChildren(...children) { this.children = []; this.append(...children); }
        };
    }
    const node = id => {
        if (id === 'turn-playback') return elements.get(id) || null;
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    };
    const document = { getElementById: node, createElement: element, querySelectorAll: () => [], addEventListener() {} };
    const early = { id: 'battle-day-10', game_date: '1936-01-11', title: 'Advance on both fronts', description: 'The army advances with air support.', event_type: 'military', severity: 'moderate', can_resume: true, resume_revision: 7,
        player_impact: { nation_code: 'ITA', importance: 'major', reason: 'Both fronts have crossed the frontier and require fresh orders.' } };
    const late = { id: 'future-settlement', game_date: '1936-03-07', title: 'Later settlement', description: 'A later territorial settlement.', event_type: 'diplomatic', severity: 'major', can_resume: false };
    const past = { id: 'earlier-history', game_date: '1935-12-31', title: 'Previous history', description: 'Already recorded.', event_type: 'political', severity: 'minor' };
    const worlds = {
        italy: { regions: [{ id: 'front', nation_code: 'ITA' }], units: [{ id: 'north', nation_code: 'ITA', unit_type: 'infantry', region_id: 'capital' }], cities: [{ id: 'capital', nation_code: 'ITA' }], colors: { ITA: { name: 'Italy' } } },
        modern: { regions: [{ id: 'modern', nation_code: 'USA' }], units: [{ id: 'modern-air', nation_code: 'USA', unit_type: 'air', region_id: 'modern' }], cities: [], colors: { USA: { name: 'United States' } } }
    };
    const gameMap = { currentRegions: clone(worlds.italy.regions), nationColors: clone(worlds.italy.colors),
        async loadNationColors(saveId) { counts.colors++; this.nationColors = clone(worlds[saveId].colors); },
        applyNationColorsToAllSVG(regions) { this.currentRegions = clone(regions); },
        focusEvent: () => 'Both fronts', showEventRoutes() {}, clearEventRoute() {} };
    const api = { async request(endpoint, options) { requests.push({ endpoint, options }); throw new Error('Set a mock continuation response'); },
        async getRegions(saveId) { counts.regions++; return clone(worlds[saveId].regions); },
        async getEvents() { return clone([late, early, past]); },
        async advanceTime() { throw new Error('Event continuation must never advance time or invoke the AI'); } };
    const actionsPanel = {
        reset() { node('action-input').value = ''; this.updateComposer(); },
        updateComposer() {
            counts.composer++;
            const value=node('action-input').value;
            node('btn-send-action').disabled=!value.trim();
            node('btn-improve-action').disabled=!value.trim();
            node('action-character-count').textContent=`${value.length} / 2000`;
        },
        updatePanelInfo() {}, loadPendingActions() { counts.actions++; }, hide() {}
    };
    const context = { document, api, gameMap, actionsPanel, structuredClone,
        console: { log() {}, error() {}, warn() {} },
        countryFlags: { name: code => ({ ITA: 'Italy', GER: 'Germany' }[code] || code), prose: value => String(value ?? '') },
        diplomacyPanel: { reset() {}, hide() {} }, advisorPanel: { reset() {}, hide() {} },
        wsClient: { on: (name, handler) => sockets.set(name, handler) },
        setTimeout() { throw new Error('Event playback must remain manual'); } };
    vm.createContext(context);
    for (const [file, name] of [['app.js', 'app'], ['panels/events-panel.js', 'eventsPanel'], ['panels/timeline-panel.js', 'timelinePanel'], ['turn-playback.js', 'turnPlayback']]) {
        vm.runInContext(fs.readFileSync(require.resolve(`../frontend/js/${file}`), 'utf8') + `\nthis.${name}Instance=${name};`, context);
    }
    const app = context.appInstance, timeline = context.timelinePanelInstance, events = context.eventsPanelInstance, playback = context.turnPlaybackInstance;
    app.currentGame = { saveId: 'italy', currentDate: '1936-03-07', turnNumber: 4, revision: 7, playerNation: { code: 'ITA', name: 'Italy', leader_name: 'Current leader' } };
    app.formatDate = value => `date:${value}`;
    app.showToast = (...args) => notices.push(args);
    app.closeAllPanels = () => { counts.panels++; };
    app.unitManager = { units: clone(worlds.italy.units), displayUnits() {}, async loadUnits(saveId) { counts.units++; this.units = clone(worlds[saveId].units); } };
    app.nationManager = { displayNationLabels() {}, async loadNationLabels() { counts.labels++; } };
    app.cityManager = { async loadCities(saveId) { counts.cities++; this.cities = clone(worlds[saveId].cities); } };
    const originalStop = playback.stop.bind(playback);
    playback.stop = () => { counts.stop++; originalStop(); };
    app.setupWebSocketHandlers();
    events.events = clone([late, early, past]);
    events.renderEvents();
    node('action-input').value = 'Keep this unsent draft';
    const retained = { ...clone(early), can_resume: false };
    delete retained.resume_revision;
    const response = { resumed_from_event: early.id, turn_number: 4, revision: 8, new_date: '1936-01-11', world_changed: true,
        events: [retained], territory_changes: [], state: { playerNation: { code: 'ITA', name: 'Italy', leader_name: 'Restored leader' }, events: [retained, clone(past)] } };
    function installRestoredWorld() {
        worlds.italy = { regions: [{ id: 'front', nation_code: 'ETH' }], units: [{ id: 'north', nation_code: 'ITA', unit_type: 'infantry', region_id: 'frontier' }, { id: 'south', nation_code: 'ITA', unit_type: 'infantry', region_id: 'southern-frontier' }, { id: 'air', nation_code: 'ITA', unit_type: 'air', region_id: 'airbase' }], cities: [{ id: 'capital', nation_code: 'ETH' }], colors: { ITA: { name: 'Restored Italy' } } };
    }
    function switchSave() {
        app.currentGame = { saveId: 'modern', currentDate: '2010-01-01', turnNumber: 1, playerNation: { code: 'USA', name: 'United States' } };
        gameMap.currentRegions = clone(worlds.modern.regions);
        app.unitManager.units = clone(worlds.modern.units);
        events.events = [{ id: 'modern-history', game_date: '2010-01-01' }];
    }
    return { app, timeline, events, playback, api, node, worlds, early, late, past, response, installRestoredWorld, switchSave, gameMap, counts, requests, notices, sockets };
}

async function eventListContinuationAndDedup() {
    const f = fixture();
    await f.app.refreshAfterTurn({ turn_number: 4, revision: 7, world_changed: true });
    f.timeline.lastPresentedTurn = 'italy:4:7';
    const before = f.counts.regions;
    f.api.request = async (endpoint, options) => { f.requests.push({ endpoint, options }); f.installRestoredWorld(); return clone(f.response); };
    const cards = f.node('events-list').children;
    assert.equal(cards[0].children.length, 0, 'Events without a checkpoint must not offer continuation');
    const controls = cards[1].children.find(child => child.className === 'event-continuation');
    const button = controls.children[0];
    assert.equal(button.textContent, 'Play from this event');
    await button.onclick();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].endpoint, '/game/resume-event');
    assert.equal(f.requests[0].options.method, 'POST');
    assert.deepEqual(clone(f.requests[0].options.body), { saveId: 'italy', eventId: f.early.id, revision: 7 });
    assert.equal(f.app.currentGame.currentDate, '1936-01-11');
    assert.equal(f.app.currentGame.turnNumber, 4);
    assert.equal(f.app.currentGame.revision, 8);
    assert.equal(f.app.currentGame.playerNation.leader_name, 'Restored leader');
    assert.equal(f.app.currentGame.playerNation.name, 'Restored Italy');
    assert.equal(f.node('current-date').textContent, 'date:1936-01-11');
    assert.deepEqual(clone(f.app.unitManager.units), f.worlds.italy.units);
    assert.deepEqual(clone(f.gameMap.currentRegions), f.worlds.italy.regions);
    assert.deepEqual(Array.from(f.events.events, event => event.id), [f.early.id, f.past.id], 'History must replace later outcomes, not append a second timeline');
    assert.equal(f.events.events[0].can_resume, false, 'The retained current-date event uses its new authoritative eligibility');
    assert.equal(f.node('action-input').value, 'Keep this unsent draft');
    assert.equal(f.node('btn-send-action').disabled, false, 'The restored draft remains immediately queueable');
    assert.equal(f.node('btn-improve-action').disabled, false, 'The restored draft remains immediately editable by the writing assistant');
    assert.equal(f.node('action-character-count').textContent, '22 / 2000');
    assert(f.counts.stop > 0);
    assert.equal(f.counts.regions, before + 1, 'A new revision of the same turn must refresh the world');
    const after = clone(f.counts), notificationCount = f.notices.length;
    await f.sockets.get('time_advance_complete')({ saveId: 'italy', data: clone(f.response) });
    await f.timeline.receiveTurn(clone(f.response), 'italy');
    assert.deepEqual(f.counts, after, 'REST and WebSocket delivery must not refresh or stop playback twice');
    assert.equal(f.notices.length, notificationCount);
    await f.app.refreshAfterTurn(clone(f.response));
    assert.deepEqual(f.counts, after, 'The app refresh key also deduplicates the matching revision');
    await f.app.refreshAfterTurn({ ...clone(f.response), revision: 9 });
    assert.equal(f.counts.regions, after.regions + 1, 'The app refresh key includes revision, not only turn number');
}

async function playbackContinuation() {
    const f = fixture();
    const finished = f.playback.play([f.early, f.late], 'italy', { initial_units: [] });
    const card = f.node('turn-playback');
    assert.equal(card.querySelector('[data-action="resume"]').hidden, false);
    f.playback.next();
    assert.equal(card.querySelector('[data-action="resume"]').hidden, true, 'Playback hides continuation when the event is ineligible');
    f.playback.index = 0;
    f.playback.display();
    f.api.request = async (endpoint, options) => { f.requests.push({ endpoint, options }); f.installRestoredWorld(); return clone(f.response); };
    await card.querySelector('[data-action="resume"]').onclick();
    await finished;
    assert.equal(f.node('turn-playback'), null, 'Continuing stops the abandoned playback');
    assert.equal(f.playback.queue.length, 0);
    assert.deepEqual(clone(f.app.unitManager.units), f.worlds.italy.units, 'Stopping playback must not reapply later units over restored state');
    assert.deepEqual(clone(f.gameMap.currentRegions), f.worlds.italy.regions);
    assert.equal(f.requests[0].options.body.eventId, f.early.id);
}

async function staleResponsesAndErrors() {
    let f = fixture(), pending = deferred();
    f.api.request = () => pending.promise;
    let task = f.timeline.resumeFromEvent(f.early);
    f.switchSave();
    pending.resolve(clone(f.response));
    await task;
    assert.equal(f.app.currentGame.currentDate, '2010-01-01');
    assert.equal(f.events.events[0].id, 'modern-history');
    assert.equal(f.app.unitManager.units[0].id, 'modern-air');
    assert.equal(f.counts.regions, 0);
    assert.equal(f.counts.stop, 0);
    assert.equal(f.notices.length, 0, 'A previous save reply must not notify in the new campaign');

    f = fixture();
    pending = deferred();
    f.api.request = async () => clone(f.response);
    f.api.getRegions = () => pending.promise;
    task = f.timeline.resumeFromEvent(f.early);
    await until(() => f.counts.colors > 0, 'Expected the restoration refresh to begin');
    f.switchSave();
    pending.resolve([{ id: 'stale-italian-front', nation_code: 'ITA' }]);
    await task;
    assert.equal(f.app.currentGame.currentDate, '2010-01-01');
    assert.equal(f.gameMap.currentRegions[0].id, 'modern', 'A delayed old-save map refresh must not overwrite the new campaign');
    assert.equal(f.events.events[0].id, 'modern-history');

    f = fixture();
    pending = deferred();
    const noHistory = clone(f.response);
    delete noHistory.state.events;
    f.api.request = async () => noHistory;
    let historyRequested = false;
    f.api.getEvents = () => { historyRequested = true; return pending.promise; };
    task = f.timeline.resumeFromEvent(f.early);
    await until(() => historyRequested, 'Expected a fallback history request');
    f.switchSave();
    pending.resolve([clone(f.early)]);
    await task;
    assert.equal(f.events.events[0].id, 'modern-history', 'A delayed fallback event history must not replace the new save history');

    f = fixture();
    const before = clone({ game: f.app.currentGame, units: f.app.unitManager.units, regions: f.gameMap.currentRegions });
    f.api.request = async () => { throw new Error('This event is stale; campaign unchanged.'); };
    await f.timeline.resumeFromEvent(f.early);
    assert.deepEqual(clone({ game: f.app.currentGame, units: f.app.unitManager.units, regions: f.gameMap.currentRegions }), before);
    assert.equal(f.counts.stop, 0, 'A rejected continuation must not stop the currently playable world');
    assert.equal(f.notices.at(-1)[1], 'error');
    assert.equal(f.timeline.isContinuing, false);
}

async function staleEventHistory() {
    let f=fixture(), pending=deferred();
    f.api.getEvents=()=>pending.promise;
    const oldHistory=f.events.loadEvents();
    f.api.request=async()=>{f.installRestoredWorld();return clone(f.response);};
    await f.timeline.resumeFromEvent(f.early);
    pending.resolve([clone(f.late),clone(f.early),clone(f.past)]);
    await oldHistory;
    assert.deepEqual(Array.from(f.events.events,event=>event.id),[f.early.id,f.past.id], 'A pre-continuation history request cannot restore discarded future events');
    assert.equal(f.events.events[0].can_resume,false);

    f=fixture();
    const first=deferred(),second=deferred();let calls=0;
    f.api.getEvents=()=>++calls===1?first.promise:second.promise;
    const older=f.events.loadEvents(),newer=f.events.loadEvents();
    second.resolve([clone(f.past)]);await newer;
    first.resolve([clone(f.late)]);await older;
    assert.deepEqual(Array.from(f.events.events,event=>event.id),[f.past.id], 'An older same-save load cannot overwrite a newer completed history');

    f=fixture();pending=deferred();f.api.getEvents=()=>pending.promise;
    const beforeReset=f.events.loadEvents();f.events.reset();
    pending.resolve([clone(f.late)]);await beforeReset;
    assert.equal(f.events.events.length,0,'Reset invalidates pending history responses');

    f=fixture();pending=deferred();f.api.getEvents=()=>pending.promise;
    const beforeTurn=f.events.loadEvents();
    f.events.addEvents([{id:'new-turn-event',game_date:'1936-03-08',severity:'minor',title:'New turn',event_type:'political'}]);
    pending.resolve([clone(f.late)]);await beforeTurn;
    assert(f.events.events.some(event=>event.id==='new-turn-event'),'A completed turn invalidates any older history fetch');
}

async function obsoleteTurnResults() {
    let f=fixture();
    f.api.request=async()=>{f.installRestoredWorld();return clone(f.response);};
    await f.timeline.resumeFromEvent(f.early);
    const obsolete={turn_number:4,revision:7,new_date:'1936-03-07',events:[clone(f.late)],world_changed:true};
    const before=clone({game:f.app.currentGame,regions:f.gameMap.currentRegions,units:f.app.unitManager.units,events:f.events.events,counts:f.counts,notices:f.notices});
    await f.timeline.receiveTurn(clone(obsolete),'italy');
    await f.sockets.get('time_advance_complete')({saveId:'italy',data:clone(obsolete)});
    await f.app.refreshAfterTurn(clone(obsolete));
    assert.deepEqual(clone({game:f.app.currentGame,regions:f.gameMap.currentRegions,units:f.app.unitManager.units,events:f.events.events,counts:f.counts,notices:f.notices}),before,'An older revision delivered through REST, WebSocket or direct refresh cannot change the rewound world');
    assert.equal(f.node('turn-playback'),null,'An obsolete result must not start discarded playback');
    await f.timeline.receiveTurn({...clone(obsolete),revision:9,new_date:'1936-01-12',events:[]},'italy');
    assert.equal(f.app.currentGame.revision,9,'A newer revision of the same turn remains acceptable');
    assert.equal(f.app.currentGame.currentDate,'1936-01-12');

    f=fixture();
    const oldRegions=deferred();let requests=0;
    f.api.getRegions=async saveId=>{f.counts.regions++;if(++requests===1)return oldRegions.promise;return clone(f.worlds[saveId].regions);};
    const olderTurn=f.timeline.receiveTurn(clone(obsolete),'italy');
    await until(()=>requests===1,'Expected the normal turn refresh to wait for map data');
    f.api.request=async()=>{f.installRestoredWorld();return clone(f.response);};
    await f.timeline.resumeFromEvent(f.early);
    oldRegions.resolve([{id:'obsolete-final-province',nation_code:'ITA'}]);
    await olderTurn;
    assert.equal(f.app.currentGame.currentDate,'1936-01-11');
    assert.equal(f.app.currentGame.revision,8);
    assert.deepEqual(clone(f.gameMap.currentRegions),f.worlds.italy.regions,'The earlier refresh cannot overwrite restored territory after its delayed response');
    assert.deepEqual(Array.from(f.events.events,event=>event.id),[f.early.id,f.past.id]);
    assert.equal(f.node('turn-playback'),null,'A normal turn awaiting refresh cannot restart playback after continuation supersedes it');

    f=fixture();
    f.api.loadGame=async()=>({playerNation:clone(f.response.state.playerNation),currentDate:'1936-01-11',turnNumber:4,revision:8,events:clone(f.response.state.events)});
    f.app.closeAllModals=()=>{};f.app.startGame=async()=>{};
    await f.app.loadGame('italy');
    assert.equal(f.app.currentGame.revision,8,'Loading a save initializes its authoritative revision before messages are handled');
    await f.timeline.receiveTurn(clone(obsolete),'italy');
    assert.equal(f.app.currentGame.currentDate,'1936-01-11');
    assert.deepEqual(Array.from(f.events.events,event=>event.id),[f.early.id,f.past.id]);
}

function playerNotifications() {
    const f = fixture();
    f.events.events = [];
    const minorImpact = { id: 'foreign-crisis', title: 'Foreign crisis', description: 'World news.', event_type: 'political', severity: 'major', affected_nations: ['ITA', 'GER'], player_impact: { nation_code: 'ITA', importance: 'minor', reason: 'No immediate change to our strategy.' } };
    f.events.addEvents([minorImpact]);
    assert.equal(f.notices.length, 0, 'Global severity alone must not trigger a player-important notification');
    assert.equal(f.events.isImportantForPlayer(minorImpact), false);
    const important = { ...clone(f.early), important_for_player: true };
    f.events.addEvents([important]);
    assert.equal(f.notices.at(-1)[0], '1 important event for your nation');
    const notices = f.notices.length;
    f.events.addEvents([{ ...clone(important), id: 'server-explicit-false', important_for_player: false }]);
    assert.equal(f.notices.length, notices, 'The authoritative false importance flag must override a model label');
    f.events.currentFilter = 'player';
    f.events.renderEvents();
    assert.equal(f.node('events-list').children.length, 1);
}

(async () => {
    await eventListContinuationAndDedup();
    await playbackContinuation();
    await staleResponsesAndErrors();
    await staleEventHistory();
    await obsoleteTurnResults();
    playerNotifications();
    console.log('✓ Event continuation UI, state replacement, revision deduplication, stale responses and player notifications passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
