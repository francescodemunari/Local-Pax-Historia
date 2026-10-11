// One bounded replay checkpoint per save. It contains engine-owned data only,
// never a model-supplied checkpoint or a nested history of previous snapshots.
const DAY = 86400000;
const VERSION = 1;

function dateOffset(value, startDate) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) return null;
    return Math.round((date - new Date(startDate + 'T00:00:00Z')) / DAY);
}

function cleanEvent(event) {
    const { can_resume, resume_revision, ...stored } = event;
    return stored;
}

function snapshot(state) {
    const { playerNation, scenario, _eventReplay, ...stored } = state;
    const copy = structuredClone(stored);
    copy.events = (copy.events || []).map(cleanEvent);
    return copy;
}

function attach(state, replay) {
    // loadGame is also a public API response; the private historical world and
    // simulation proposal must not be serialized or sent back as model context.
    Object.defineProperty(state, '_eventReplay', { value: replay, writable: true, configurable: true, enumerable: false });
    return state;
}

function checkpoint(before, result, events, revision) {
    return {
        version: VERSION, revision, before: snapshot(before), result: structuredClone(result),
        events: events.map(event => ({ id: event.id, date: event.game_date, title: event.title, event_type: event.event_type }))
    };
}

function recordExecutionDates(result, unitChanges, availableDays) {
    const hasDate = value => value.game_date || value.date || value.day_offset != null && Number.isInteger(Number(value.day_offset));
    // Legacy civilian summaries may omit their own execution date. Preserve
    // their explicit action link to the final dated development so unrelated
    // earlier player-state changes cannot consume a future-only order.
    for (const resolution of result.action_resolutions || []) if (!resolution.operation && !hasDate(resolution)) {
        const linkedDates = (result.events || []).filter(event => event.action_id === resolution.action_id &&
            dateOffset(event.game_date || event.date, '1970-01-01') !== null)
            .map(event => event.game_date || event.date).sort();
        if (linkedDates.length) resolution.game_date = linkedDates.at(-1);
    }
    for (const change of result.unit_changes || []) {
        const applied = unitChanges.find(candidate => candidate.action === change.action && candidate.action_id === change.action_id &&
            (change.action === 'recruit' ? candidate.formation_ref === change.formation_ref : candidate.unit?.id === change.unit_id));
        if (applied && change.action !== 'recruit') {
            // Use the actual execution date for both displayed effects and
            // replay clipping, including the route's minimum travel time.
            delete change.game_date;
            delete change.date;
            change.day_offset = applied.day_offset ?? applied.route?.required_days ?? 1;
        } else if (applied && !hasDate(change)) change.day_offset = 0;
    }
    for (const order of result.campaign_orders || []) if (!hasDate(order)) {
        order.day_offset = order.action === 'start' ? 0 : availableDays;
    }
    for (const effect of result.diplomatic_changes || []) if (!hasDate(effect)) effect.day_offset = 0;
    return result;
}

function eligible(state, event) {
    const replay = state._eventReplay;
    if (replay?.version !== VERSION || replay.revision !== state.revision || !Array.isArray(replay.events) || !replay.before?.currentDate) return false;
    const recorded = replay.events.find(candidate => candidate.id === event.id && candidate.date === event.game_date);
    const days = recorded && dateOffset(recorded.date, replay.before.currentDate);
    return Boolean(Number.isInteger(days) && days >= 1 && recorded.date < state.currentDate);
}

function decorate(state) {
    for (const event of state.events || []) {
        event.can_resume = eligible(state, event);
        if (event.can_resume) event.resume_revision = state.revision;
        else delete event.resume_revision;
    }
    return state;
}

module.exports = { snapshot, attach, checkpoint, eligible, decorate, cleanEvent, dateOffset, recordExecutionDates };
