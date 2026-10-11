const assert = require('node:assert/strict');
const fs = require('node:fs');
const Engine = require('../backend/services/game-engine');
const llm = require('../backend/services/llm-service');
const fixture = require('./fixtures/timeline-overrun.json');

async function run() {
    const engine = new Engine(), originalGenerate = llm.generateEvents;
    let calls = 0;
    const create = async () => {
        const game = await engine.createGame('ITA', undefined, 'ww2-geographic');
        await engine.processPlayerAction(game.save_id, 'Invade Ethiopia from Eritrea and Somalia using land and air forces.');
        await engine.processPlayerAction(game.save_id, 'Appoint the future civilian administration.');
        return game;
    };
    llm.generateEvents = async (jump, context) => {
        calls++;
        const reply = structuredClone(fixture);
        reply.action_resolutions[0].action_id = context.actions[0].id;
        reply.action_resolutions.push({ action_id: context.actions[1].id, day_offset: 60, summary: 'A later civilian administration is appointed.' });
        reply.events.push(
            { title: 'Local administrative reform', description: 'A limited reform takes effect.', game_date: '1936-01-26',
                event_type: 'political', severity: 'moderate', affected_nations: ['ITA'], state_changes: { ITA: { ruling_party: 'Early administration' } } },
            { title: 'Simultaneous appointment', description: 'The same day brings an appointment.', game_date: '1936-01-26',
                event_type: 'political', severity: 'minor', affected_nations: ['ITA'], state_changes: { ITA: { leader_name: 'Early leader' } } },
            { title: 'Later administration', description: 'The administration changes later.', game_date: '1936-03-01',
                event_type: 'political', severity: 'moderate', affected_nations: ['ITA'], action_id: context.actions[1].id,
                state_changes: { ITA: { leader_name: 'Future leader', ruling_party: 'Future party' } } }
        );
        require('../backend/services/operation-plan').compileOperationPlans(reply, context);
        require('../backend/services/operation-contract').validateOperations(reply, context, { allowIncomplete: true, allowUnresolved: false });
        context.previewMilitaryResult(reply);
        return reply;
    };
    const saves = [];
    try {
        const game = await create(); saves.push(game.save_id);
        const full = await engine.advanceTime(game.save_id, '3_months');
        const original = await engine.loadGame(game.save_id);
        assert.equal(original.currentDate, '1936-04-01');
        assert.equal(original.nations.ITA.leader_name, 'Future leader');
        const selected = full.events.find(event => event.title === 'The Advance from Eritrea');
        assert.equal(selected.can_resume, true);
        assert.equal(selected.resume_revision, original.revision);
        assert(!JSON.stringify(original).includes('_eventReplay'), 'The checkpoint and discarded future world stay private');
        assert(fs.readFileSync(engine.getSavePath(game.save_id), 'utf8').includes('"_eventReplay"'), 'Continuation survives a backend restart');
        const resumed = await new Engine().resumeFromEvent(game.save_id, selected.id, selected.resume_revision);
        const state = await engine.loadGame(game.save_id);
        assert.equal(calls, 1, 'Selecting an event never calls the model');
        assert.equal(resumed.new_date, '1936-01-26');
        assert.equal(resumed.resumed_from_event, selected.id);
        assert.equal(state.currentDate, '1936-01-26');
        assert.equal(state.turnNumber, original.turnNumber, 'The replay replaces the latest turn instead of creating a fictitious extra turn');
        assert.equal(state.nations.ITA.ruling_party, 'Early administration');
        assert.equal(state.nations.ITA.leader_name, 'Early leader', 'All simultaneous effects are applied together');
        assert.equal(state.units.find(u => u.name === '1st Italian Northern Army').region_id, 'g531_aETH-3110_f8');
        assert.equal(state.units.find(u => u.name === '1st Italian Southern Army').region_id, 'g5200_aETH-3134_f0', 'Later southern movement is discarded');
        assert.equal(state.units.find(u => u.unit_type === 'air').mission.target_region_id, 'g531_aETH-3110_f8');
        assert.equal(state.campaigns[0].status, 'active');
        assert(state.campaigns[0].pending_updates.some(note => note.kind === 'front'), 'Unfinished fronts remain standing orders');
        assert.equal(state.actions[1].status, 'pending', 'Future civilian orders are preserved');
        assert(!state.events.some(event => event.game_date > state.currentDate));
        assert(state.events.some(event => event.id === selected.id), 'The chosen event identity survives replay');
        assert.equal(state.events.find(event => event.id === selected.id).can_resume, false, 'The current date is already playable');
        assert(!JSON.stringify(resumed).includes('_eventReplay'));
        const stored = JSON.parse(fs.readFileSync(engine.getSavePath(game.save_id), 'utf8'));
        assert(!stored._eventReplay.before._eventReplay, 'One checkpoint cannot recursively retain older checkpoints');
        assert(!stored.events.some(event => Object.hasOwn(event, 'can_resume')), 'Eligibility is derived from the live revision');

        const earlier = state.events.find(event => event.can_resume);
        assert(earlier, 'Remaining earlier events in the clipped turn can still be selected');
        const beforeSecond = fs.readFileSync(engine.getSavePath(game.save_id), 'utf8');
        await assert.rejects(() => engine.resumeFromEvent(game.save_id, selected.id, original.revision), error => error.code === 'SAVE_CONFLICT');
        await assert.rejects(() => engine.resumeFromEvent(game.save_id, 'nonexistent_event', state.revision), error => error.code === 'EVENT_CONTINUATION_UNAVAILABLE');
        assert.equal(fs.readFileSync(engine.getSavePath(game.save_id), 'utf8'), beforeSecond, 'Stale and invalid selection leave the save byte-for-byte unchanged');
        await engine.processPlayerAction(game.save_id, 'A newly written order after playback.');
        const modified = await engine.loadGame(game.save_id);
        assert(modified.events.every(event => !event.can_resume));
        const afterOrder = fs.readFileSync(engine.getSavePath(game.save_id), 'utf8');
        await assert.rejects(() => engine.resumeFromEvent(game.save_id, earlier.id, modified.revision), error => error.code === 'EVENT_CONTINUATION_UNAVAILABLE');
        assert.equal(fs.readFileSync(engine.getSavePath(game.save_id), 'utf8'), afterOrder, 'New orders cannot be discarded by an old continuation');

        const beforeBattleGame = await create(); saves.push(beforeBattleGame.save_id);
        const complete = await engine.advanceTime(beforeBattleGame.save_id, '3_months');
        const discussion = complete.events.find(event => event.title.includes('League of Nations'));
        const early = await engine.resumeFromEvent(beforeBattleGame.save_id, discussion.id, discussion.resume_revision);
        assert.equal(early.new_date, '1936-01-15');
        assert.equal(early.state.units.length, 3, 'Mobilised forces exist before the first battle');
        assert(!early.events.some(event => event.campaign_effect));
        assert(!early.state.units.find(u => u.unit_type === 'air').mission, 'Later air missions are not applied early');
        assert.equal(early.state.campaigns[0].status, 'active');

        const corruptGame = await create(); saves.push(corruptGame.save_id);
        const validTurn = await engine.advanceTime(corruptGame.save_id, '3_months');
        const choice = validTurn.events.find(event => event.title === 'The Advance from Eritrea');
        const corruptPath = engine.getSavePath(corruptGame.save_id);
        const corrupt = JSON.parse(fs.readFileSync(corruptPath, 'utf8'));
        corrupt._eventReplay.result.campaign_orders.find(order => order.action === 'battle').movements[0].region_id = 'not_a_mapped_province';
        fs.writeFileSync(corruptPath, JSON.stringify(corrupt));
        const corruptBytes = fs.readFileSync(corruptPath, 'utf8');
        await assert.rejects(() => engine.resumeFromEvent(corruptGame.save_id, choice.id, choice.resume_revision));
        assert.equal(fs.readFileSync(corruptPath, 'utf8'), corruptBytes, 'Invalid replay data fails before any persistence');

        const lockedGame = await create(); saves.push(lockedGame.save_id);
        const lockedTurn = await engine.advanceTime(lockedGame.save_id, '3_months');
        const lockedChoice = lockedTurn.events.find(event => event.title === 'The Advance from Eritrea');
        const originalLoad = engine.loadGame;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        engine.loadGame = async saveId => { await gate; return originalLoad.call(engine, saveId); };
        const resolving = engine.resumeFromEvent(lockedGame.save_id, lockedChoice.id, lockedChoice.resume_revision);
        try {
            await assert.rejects(() => new Engine().resumeFromEvent(lockedGame.save_id, lockedChoice.id, lockedChoice.resume_revision), error => error.code === 'TURN_IN_PROGRESS');
            await assert.rejects(() => new Engine().advanceTime(lockedGame.save_id, '1_month'), error => error.code === 'TURN_IN_PROGRESS');
            await assert.rejects(() => new Engine().deleteSave(lockedGame.save_id), error => error.code === 'TURN_IN_PROGRESS');
        } finally {
            engine.loadGame = originalLoad;
            release();
        }
        await resolving;
        const afterLock = await engine.loadGame(lockedGame.save_id);
        const olderChoice = afterLock.events.find(event => event.can_resume);
        const originalSave = engine.saveGame, conflictPath = engine.getSavePath(lockedGame.save_id);
        let concurrentBytes;
        engine.saveGame = function(saveId, state, options) {
            const latest = JSON.parse(fs.readFileSync(conflictPath, 'utf8'));
            latest.revision++;
            latest.name = 'Concurrent writer';
            concurrentBytes = JSON.stringify(latest);
            fs.writeFileSync(conflictPath, concurrentBytes);
            return originalSave.call(this, saveId, state, options);
        };
        try {
            await assert.rejects(() => engine.resumeFromEvent(lockedGame.save_id, olderChoice.id, olderChoice.resume_revision), error => error.code === 'SAVE_CONFLICT');
            assert.equal(fs.readFileSync(conflictPath, 'utf8'), concurrentBytes, 'A concurrent disk writer is never overwritten by replay');
        } finally { engine.saveGame = originalSave; }
        assert.equal(calls, 4, 'All continuations use recorded proposals only');

        for (const longTurn of [false, true]) {
            const civilian = await engine.createGame('ITA', undefined, 'ww2-geographic'); saves.push(civilian.save_id);
            const order = await engine.processPlayerAction(civilian.save_id, 'Organise an international cultural festival.');
            const choiceDate = longTurn ? '1937-06-01' : '1936-01-10';
            const futureDate = longTurn ? '1937-10-01' : '1936-03-01';
            llm.generateEvents = async () => {
                calls++;
                return {
                    events: [
                        { title: 'Earlier development', description: 'A separate administrative decision takes effect.',
                            game_date: choiceDate, event_type: 'political', severity: 'minor', affected_nations: ['ITA'],
                            state_changes: { ITA: { ruling_party: 'Independent earlier decision' } } },
                        { title: 'International cultural festival opens', description: 'The planned festival takes place later.',
                            game_date: futureDate, event_type: 'social', severity: 'minor', affected_nations: ['ITA'], action_id: order.id }
                    ],
                    action_resolutions: [{ action_id: order.id, summary: 'The international cultural festival has opened successfully.' }],
                    campaign_orders: [], unit_changes: [], diplomatic_changes: []
                };
            };
            const beforeCalls = calls;
            const fullCivilian = await engine.advanceTime(civilian.save_id, longTurn ? '24_months' : '3_months');
            const fullState = await engine.loadGame(civilian.save_id);
            assert.equal(fullState.actions[0].status, 'completed');
            assert(fullState.actions[0].ai_response.includes('opened successfully'));
            assert.equal(fullState.events.find(event => event.title.includes('festival')).action_id, order.id, 'Canonical event keeps its order link');
            const replayData = JSON.parse(fs.readFileSync(engine.getSavePath(civilian.save_id), 'utf8'))._eventReplay;
            assert.equal(replayData.result.action_resolutions[0].game_date, futureDate, 'An undated civilian summary retains its explicitly linked future event date');
            const decision = fullCivilian.events.find(event => event.title === 'Earlier development');
            assert.equal(decision.can_resume, true);
            if (longTurn) assert(require('../backend/services/event-continuation').dateOffset(choiceDate, '1936-01-01') > 365, 'The selected event actually falls beyond the public day-jump limit');
            const replayed = await engine.resumeFromEvent(civilian.save_id, decision.id, decision.resume_revision);
            assert.equal(calls, beforeCalls + 1, 'Civilian and long-turn continuations never call the model');
            assert.equal(replayed.new_date, choiceDate);
            assert.equal(replayed.state.currentDate, choiceDate);
            assert.equal(replayed.state.nations.ITA.ruling_party, 'Independent earlier decision');
            assert.equal(replayed.state.actions[0].status, 'pending', 'The only future order link is action_id; unrelated current state changes cannot consume it');
            assert(!Object.hasOwn(replayed.state.actions[0], 'ai_response'), 'The discarded future completion is absent from authoritative state');
            assert(!replayed.events.some(event => event.title.includes('festival')));
            assert(!replayed.state.events.some(event => event.game_date > choiceDate));
            assert.equal(replayed.processed_actions, 0);
            assert.equal(replayed.action_resolutions[0].deferred, true);
            assert.throws(() => engine.normalizeTimeJump('517_days'), error => error.code === 'INVALID_TIME_JUMP', 'Trusted replay does not weaken public jump limits');
        }

        // Explicit schedules must use the same date in the event feed and in
        // the recorded proposal; a route minimum is not the appointed date.
        for (const operation of ['move', 'disband']) {
            const scheduled = await engine.createGame('ITA', undefined, 'ww2-geographic'); saves.push(scheduled.save_id);
            const regions = engine.scenarios.getMap('ww2-geographic').regions;
            const origin = regions.find(region => region.nation_code === 'ITA' && region.name === 'Rome' && region.area_km2 > 100);
            const destination = regions.find(region => region.nation_code === 'ITA' && region.name === 'Milan' && region.area_km2 > 100);
            const seed = await engine.loadGame(scheduled.save_id);
            engine.applyModelUnitChanges(seed, [{ action: 'recruit', action_id: 'existing_formation', nation_code: 'ITA',
                unit_type: 'infantry', name: 'Scheduled formation', region_id: origin.id }], new Set(['existing_formation']));
            engine.saveGame(scheduled.save_id, seed);
            const unit = seed.units[0];
            const order = await engine.processPlayerAction(scheduled.save_id,
                operation === 'move' ? `Move ${unit.name} to Milan on 26 January.` : `Disband ${unit.name} on 26 January.`);
            llm.generateEvents = async () => {
                calls++;
                return {
                    events: [{ title: 'Earlier unrelated decision', description: 'An unrelated domestic decision takes effect.',
                        game_date: '1936-01-21', event_type: 'political', severity: 'minor', affected_nations: ['ITA'] }],
                    action_resolutions: [{ action_id: order.id, summary: operation === 'move'
                        ? 'The formation transfers to Milan on its scheduled date.' : 'The formation is disbanded on its scheduled date.' }],
                    campaign_orders: [], diplomatic_changes: [],
                    unit_changes: [{ action: operation, action_id: order.id, nation_code: 'ITA', unit_id: unit.id,
                        ...(operation === 'move' ? { region_id: destination.id, day_offset: 25 } : { game_date: '1936-01-26' }) }]
                };
            };
            const beforeCalls = calls;
            const fullScheduled = await engine.advanceTime(scheduled.save_id, '3_months');
            const execution = fullScheduled.events.find(event => event.applied_unit_change?.action === operation);
            assert(execution, 'A scheduled unit effect has an event');
            if (operation === 'move') assert(execution.applied_unit_change.route.required_days < 25,
                'This regression actually distinguishes the shorter route minimum from the scheduled execution date');
            assert.equal(execution.game_date, '1936-01-26', `${operation}: display date respects the explicit effect schedule`);
            assert.equal(execution.can_resume, true);

            const onExecution = await engine.resumeFromEvent(scheduled.save_id, execution.id, execution.resume_revision);
            assert.equal(onExecution.new_date, '1936-01-26');
            assert.equal(onExecution.state.actions[0].status, 'completed');
            assert(onExecution.state.events.some(event => event.id === execution.id && event.game_date === '1936-01-26'),
                'Selecting the actual execution event retains that event and its identity');
            if (operation === 'move') {
                assert.equal(onExecution.state.units.find(candidate => candidate.id === unit.id).region_id, destination.id);
            } else assert.equal(onExecution.state.units.length, 0);

            const earlierNews = onExecution.state.events.find(event => event.title === 'Earlier unrelated decision');
            assert.equal(earlierNews.can_resume, true);
            const beforeExecution = await engine.resumeFromEvent(scheduled.save_id, earlierNews.id, earlierNews.resume_revision);
            assert.equal(beforeExecution.new_date, '1936-01-21');
            assert.equal(beforeExecution.state.units.length, 1);
            assert.equal(beforeExecution.state.units[0].id, unit.id, 'Replaying never replaces an existing formation identity');
            assert.equal(beforeExecution.state.units[0].region_id, origin.id, 'A later move or disband cannot apply before its execution event');
            assert.equal(beforeExecution.state.actions[0].status, 'pending', 'The scheduled future unit order remains pending');
            assert.equal(beforeExecution.processed_actions, 0);
            assert(!beforeExecution.state.events.some(event => event.applied_unit_change?.action === operation));
            assert.equal(calls, beforeCalls + 1, 'Both scheduled-effect continuations use the recorded proposal without inference');
        }

        const fallbackGame = await engine.createGame('ITA', undefined, 'ww2-geographic'); saves.push(fallbackGame.save_id);
        const firstOutcome = await engine.processPlayerAction(fallbackGame.save_id, 'Organise a domestic cultural exhibition.');
        const laterOutcome = await engine.processPlayerAction(fallbackGame.save_id, 'Organise a separate international cultural festival.');
        llm.generateEvents = async () => {
            calls++;
            return {
                events: [], unit_changes: [], campaign_orders: [], diplomatic_changes: [],
                action_resolutions: [
                    { action_id: firstOutcome.id, summary: 'The domestic cultural exhibition opens.' },
                    { action_id: laterOutcome.id, summary: 'The international cultural festival opens later.' }
                ]
            };
        };
        const beforeFallbackCalls = calls;
        const fallbackTurn = await engine.advanceTime(fallbackGame.save_id, '3_months');
        assert.equal(fallbackTurn.events.length, 2);
        assert.deepEqual(fallbackTurn.events.map(event => event.action_id), [firstOutcome.id, laterOutcome.id],
            'Engine-generated outcome events retain their order links even when no model events were returned');
        const firstFallbackEvent = fallbackTurn.events[0];
        assert.equal(firstFallbackEvent.can_resume, true);
        assert(firstFallbackEvent.game_date < fallbackTurn.events[1].game_date);
        const fallbackReplay = await engine.resumeFromEvent(fallbackGame.save_id, firstFallbackEvent.id, firstFallbackEvent.resume_revision);
        assert.equal(fallbackReplay.new_date, firstFallbackEvent.game_date);
        assert.equal(fallbackReplay.state.actions.find(action => action.id === firstOutcome.id).status, 'completed');
        const deferredFallback = fallbackReplay.state.actions.find(action => action.id === laterOutcome.id);
        assert.equal(deferredFallback.status, 'pending', 'A later fallback outcome cannot consume its order at the earlier outcome date');
        assert(!Object.hasOwn(deferredFallback, 'ai_response'));
        assert.equal(fallbackReplay.processed_actions, 1);
        assert.equal(fallbackReplay.events.length, 1);
        assert.equal(fallbackReplay.events[0].id, firstFallbackEvent.id);
        assert.equal(calls, beforeFallbackCalls + 1, 'Fallback outcome continuation never calls the model');

        for (const calendarField of ['game_date', 'date']) {
            const peaceGame = await engine.createGame('ITA', undefined, 'ww2-geographic'); saves.push(peaceGame.save_id);
            const peaceOrder = await engine.processPlayerAction(peaceGame.save_id, 'Sign the accepted peace agreement with Ethiopia on 26 January.');
            llm.generateEvents = async () => {
                calls++;
                return {
                    events: [{ title: 'Earlier diplomatic briefing', description: 'Officials receive an unrelated diplomatic briefing.',
                        game_date: '1936-01-21', event_type: 'diplomatic', severity: 'minor', affected_nations: ['ITA'] }],
                    action_resolutions: [{ action_id: peaceOrder.id, summary: 'The accepted peace agreement takes effect on 26 January.' }],
                    unit_changes: [], campaign_orders: [],
                    diplomatic_changes: [{ action: 'make_peace', action_id: peaceOrder.id, nation_code: 'ITA', target_nation_code: 'ETH',
                        [calendarField]: '1936-01-26' }]
                };
            };
            const beforePeaceCalls = calls;
            const fullPeace = await engine.advanceTime(peaceGame.save_id, '3_months');
            const peaceEvent = fullPeace.events.find(event => event.applied_diplomatic_change?.action === 'make_peace');
            assert(peaceEvent);
            assert.equal(peaceEvent.game_date, '1936-01-26', `${calendarField}: diplomacy executes on its supplied calendar date`);
            assert.equal(peaceEvent.can_resume, true);
            const onPeaceDate = await engine.resumeFromEvent(peaceGame.save_id, peaceEvent.id, peaceEvent.resume_revision);
            assert.equal(onPeaceDate.new_date, '1936-01-26');
            assert(!onPeaceDate.state.nations.ITA.warWith.includes('ETH'));
            assert(!onPeaceDate.state.nations.ETH.warWith.includes('ITA'));
            assert.equal(onPeaceDate.state.actions[0].status, 'completed');
            assert(onPeaceDate.state.events.some(event => event.id === peaceEvent.id && event.game_date === '1936-01-26'),
                'The selected dated peace event remains present after replay');
            const earlierBriefing = onPeaceDate.state.events.find(event => event.title === 'Earlier diplomatic briefing');
            const beforePeace = await engine.resumeFromEvent(peaceGame.save_id, earlierBriefing.id, earlierBriefing.resume_revision);
            assert.equal(beforePeace.new_date, '1936-01-21');
            assert(beforePeace.state.nations.ITA.warWith.includes('ETH'), 'Future peace cannot end the war before its dated agreement');
            assert(beforePeace.state.nations.ETH.warWith.includes('ITA'));
            assert.equal(beforePeace.state.actions[0].status, 'pending');
            assert.equal(beforePeace.processed_actions, 0);
            assert(!beforePeace.events.some(event => event.applied_diplomatic_change));
            assert.equal(calls, beforePeaceCalls + 1, 'Calendar-date diplomatic continuations require no model calls');
        }
    } finally {
        llm.generateEvents = originalGenerate;
        for (const saveId of saves) await engine.deleteSave(saveId);
    }
    console.log('Event continuation: authoritative date/world replay, simultaneous effects, both fronts/air, pending orders, reload, private bounded checkpoints and atomic rejection passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
