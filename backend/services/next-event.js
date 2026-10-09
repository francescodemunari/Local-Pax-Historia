const DAY = 86400000;
const NEXT_EVENT_HORIZON = 365;
const QUIET_CHECKPOINT_DAYS = 30;
const PROGRESS_CHECKPOINT_LIMIT = 90;
const {isImportantCampaignReport}=require('./event-importance');
// Selection bookkeeping is engine-owned and cannot be supplied by the model.
const selections = new WeakMap();
const array = value => Array.isArray(value) ? value : [];

function number(value) {
    return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
}

function dateOffset(value, start) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) return null;
    return Math.round((date - start) / DAY);
}

function offset(value, start) {
    const dated = dateOffset(value?.game_date || value?.date, start);
    if (dated !== null) return dated;
    const days = number(value?.day_offset);
    if (Number.isInteger(days)) return days;
    return null;
}

function getTimelineSelection(result) {
    return selections.get(result) || {futureCampaignIds:[], deferredActionIds:[], future_events:0, future_effects:0};
}

function campaignCoverageLimit(context, resolutions, flat, start, until, horizon) {
    const scopes=[];
    const add=(id,source,target,reports=[])=>{
        let scope=scopes.find(s => id && s.refs.has(id) || source && s.refs.has(source) || target && s.target===target);
        if(!scope){scope={target,refs:new Set(),reports:[]};scopes.push(scope);}
        for(const ref of [id,source,source && `campaign_${source}`])if(ref)scope.refs.add(ref);
        scope.reports.push(...reports);
    };
    for(const c of array(context.campaigns))if(c.status==='active' && !c.manual_hold)add(c.id,c.source_action_id,c.target);
    for(const r of resolutions) {
        const op=r?.operation;
        if(['invasion','annexation'].includes(op?.kind) && op.status==='proceed' &&
            (offset(r,start)??0)<=until && (offset(op,start)??0)<=until)
            add(op.campaign_id,r.action_id,op.target_nation_code,array(op.reports));
    }
    for(const r of flat)if(r?.action==='start' && (offset(r,start)??0)<=until)add(r.campaign_id,r.action_id,r.target_nation_code);
    return Math.min(horizon,...scopes.map(scope=>{
        const linked=flat.filter(r=>scope.refs.has(r?.campaign_id) || scope.refs.has(r?.action_id) ||
            scope.target && r?.target_nation_code===scope.target ||
            scopes.length===1 && !r?.campaign_id && !r?.action_id && !r?.target_nation_code);
        const dates=[...scope.reports,...linked].filter(r=>!r?.unresolved && ['battle','annex','hold','cancel'].includes(r?.action))
            .map(r=>offset(r,start)).filter(d=>Number.isInteger(d) && d>=1 && d<=until);
        return Math.max(0,...dates)+QUIET_CHECKPOINT_DAYS;
    }));
}

function validateNextEvent(result, context) {
    if (!context.nextImportantEvent) return result;
    const horizon = Number.isInteger(context.nextEventHorizonDays) && context.nextEventHorizonDays > 0 ? context.nextEventHorizonDays : NEXT_EVENT_HORIZON;
    const start = new Date(context.currentDate);
    const resolutions = array(result.action_resolutions);
    const flat = array(result.campaign_orders);
    const nested = resolutions.flatMap(r => array(r?.operation?.reports));
    const targets = new Set([
        ...array(context.campaigns).map(c => c.target),
        ...flat.map(o => o?.target_nation_code),
        ...resolutions.map(r => r?.operation?.target_nation_code)
    ].filter(Boolean));
    const significant = array(result.events).filter(e => ['major','critical'].includes(e?.severity) &&
        !(e.event_type === 'military' && targets.size && array(e.affected_nations).some(c => c === context.playerNation?.code || targets.has(c))));
    const milestones = [...flat,...nested].filter(isImportantCampaignReport);
    const important = [...significant,...milestones];
    const supplied = number(result.elapsed_days);
    // Legacy undated milestones use the model's explicit elapsed duration.
    // Anchor them before clipping, so a checkpoint cannot pull their effects
    // forward merely because their calendar date was omitted.
    if(Number.isInteger(supplied) && supplied>=1 && supplied<=horizon)
        for(const event of important)if(offset(event,start)===null)event.day_offset=supplied;
    const unanchoredMilestones=new Set(important.filter(event=>offset(event,start)===null));
    const days = important.map(e => offset(e, start)).filter(d => Number.isInteger(d) && d >= 1 && d <= horizon);
    const milestone = days.length ? Math.min(...days) : null;
    const reportDays = [...flat,...nested].filter(r => !r?.unresolved && ['battle','annex','hold','cancel'].includes(r?.action))
        .map(r => offset(r,start)).filter(d => Number.isInteger(d) && d >= 1 && d <= horizon);
    const coverageLimit=campaignCoverageLimit(context,resolutions,flat,start,milestone??horizon,horizon);
    // A search ceiling is not evidence that the intervening year was simulated.
    // Keep real milestones, but do not leave an active offensive unadjudicated
    // for months just because an unrelated distant world event was supplied.
    const coveredMilestone = milestone !== null && milestone<=coverageLimit;
    const progressDays = reportDays.filter(d => d <= Math.min(horizon,PROGRESS_CHECKPOINT_LIMIT,milestone ?? horizon,coverageLimit));
    const ordinaryDays = array(result.events).map(e => offset(e,start))
        .filter(d => Number.isInteger(d) && d >= 1 && d <= Math.min(horizon,QUIET_CHECKPOINT_DAYS));
    let stopReason;
    if (coveredMilestone) {result.elapsed_days=milestone;stopReason='milestone';}
    else if (progressDays.length) {result.elapsed_days=Math.max(...progressDays);stopReason='campaign_checkpoint';}
    else {result.elapsed_days=ordinaryDays.length ? Math.max(...ordinaryDays) : Math.min(horizon,QUIET_CHECKPOINT_DAYS);stopReason='simulation_checkpoint';}
    const stop = result.elapsed_days;
    const previous = selections.get(result);
    const selection = previous?.start_date === context.currentDate ? previous
        : {start_date:context.currentDate,futureCampaignIds:[], deferredActionIds:[], future_events:0, future_effects:0};
    selection.stop_reason=stopReason;
    selection.stop_day=stop;
    const futureCampaigns = new Set(selection.futureCampaignIds);
    const futureActions = new Set(selection.deferredActionIds);
    const engineDeferred = new Set(previous?.start_date === context.currentDate ? array(result.deferred_action_ids) : []);
    const candidateActions = new Set();
    const pendingIds = new Set(array(context.actions).map(a => a.id));
    const outOfWindow = (value, allowStart = true) => {
        const day = offset(value, start);
        return unanchoredMilestones.has(value) || Number.isInteger(day) && (day > stop || day < (allowStart ? 0 : 1));
    };
    const noteCampaign = (id, actionId, target) => {
        const existing = array(context.campaigns).find(c => c.id === id || c.source_action_id === id || c.target === target);
        futureCampaigns.add(existing?.id || id || `campaign_${actionId}`);
        if (actionId) candidateActions.add(actionId);
    };
    if (Array.isArray(result.events)) result.events = result.events.filter(event => {
        if (!outOfWindow(event, false)) {
            const day=offset(event,start);
            if(Number.isInteger(day))event.game_date=new Date(+start+day*DAY).toISOString().slice(0,10);
            return true;
        }
        selection.future_events++;
        if (event.action_id) candidateActions.add(event.action_id);
        // Legacy political events lack action links. Preserve a civilian order
        // when its only player-state effects lie outside the selected interval.
        if (event.state_changes?.[context.playerNation?.code])
            for (const r of resolutions.filter(r => !r.operation)) candidateActions.add(r.action_id);
        return false;
    });
    for (const key of ['campaign_orders','unit_changes','diplomatic_changes']) {
        if (!Array.isArray(result[key])) continue;
        result[key] = result[key].filter(effect => {
            if (!outOfWindow(effect, !['battle','annex'].includes(effect?.action))) {
                const day = offset(effect, start);
                if (effect?.day_offset !== undefined || Number.isInteger(day) && ['battle','annex'].includes(effect?.action)) effect.day_offset = day;
                return true;
            }
            selection.future_effects++;
            if (effect.action_id) candidateActions.add(effect.action_id);
            if (key === 'campaign_orders') noteCampaign(effect.campaign_id, effect.action_id, effect.target_nation_code);
            return false;
        });
    }
    for (const resolution of resolutions) {
        const op = resolution?.operation;
        if (outOfWindow(resolution) || op && outOfWindow(op)) {
            candidateActions.add(resolution.action_id);
            futureActions.add(resolution.action_id);
            continue;
        }
        if (!op) continue;
        let removed = 0;
        for (const key of ['formations','reports']) {
            if (!Array.isArray(op[key])) continue;
            op[key] = op[key].filter(effect => {
                if (!outOfWindow(effect, key !== 'reports' || !['battle','annex'].includes(effect?.action))) {
                    const day = offset(effect, start);
                    if (effect?.day_offset !== undefined || Number.isInteger(day) && key === 'reports') effect.day_offset = day;
                    return true;
                }
                removed++;
                selection.future_effects++;
                noteCampaign(null, resolution.action_id, op.target_nation_code);
                return false;
            });
        }
        // A compiled legacy operation also needs its summary limited to the
        // actual reports retained for this interval.
        const campaign = array(context.campaigns).find(c => c.target === op.target_nation_code);
        const campaignId = campaign?.id || `campaign_${resolution.action_id}`;
        if (removed || futureCampaigns.has(campaignId)) {
            const reports = [...array(op.reports),...array(result.campaign_orders).filter(o =>
                ['battle','annex'].includes(o.action) && [campaignId,resolution.action_id].includes(o.campaign_id) && !o.unresolved)];
            const summary = reports.map(r => r.report).filter(r => typeof r === 'string' && r.trim()).join('\n').slice(0,1200);
            if (op.status === 'proceed') {
                resolution.summary = summary || 'The operation remains active. No battle outcome falls within this interval; standing orders continue.';
                op.reason = resolution.summary;
            }
        }
    }
    const hasCurrentEffects = id => ['unit_changes','diplomatic_changes','campaign_orders'].some(key => array(result[key]).some(e =>
        e?.action_id === id || [id,`campaign_${id}`].includes(e?.campaign_id))) ||
        array(result.events).some(e => e?.action_id === id || e?.state_changes?.[context.playerNation?.code]) ||
        resolutions.some(r => r?.action_id === id && r.operation?.status === 'proceed' &&
            (Object.hasOwn(r.operation,'formations') && Object.hasOwn(r.operation,'reports') &&
                ['invasion','annexation'].includes(r.operation.kind) && r.operation.target_nation_code ||
                array(context.campaigns).some(c => c.target === r.operation.target_nation_code && c.status === 'active') ||
                array(r.operation.formations).length || array(r.operation.reports).length));
    for (const id of candidateActions) if (pendingIds.has(id) && !hasCurrentEffects(id)) futureActions.add(id);
    // Explicit future resolutions are deferred with all their linked effects,
    // preventing a scheduled order from taking effect through an undated root.
    if (futureActions.size) {
        for (const key of ['unit_changes','diplomatic_changes','campaign_orders']) if (Array.isArray(result[key]))
            result[key] = result[key].filter(e => !futureActions.has(e?.action_id) && ![...futureActions].some(id => [id,`campaign_${id}`].includes(e?.campaign_id)));
        if (Array.isArray(result.events)) result.events = result.events.filter(e => !futureActions.has(e?.action_id));
        result.action_resolutions = resolutions.filter(r => !futureActions.has(r?.action_id) || engineDeferred.has(r?.action_id));
    }
    selection.futureCampaignIds = [...futureCampaigns];
    selection.deferredActionIds = [...futureActions].filter(id => pendingIds.has(id));
    selections.set(result, selection);
    return result;
}

module.exports = {validateNextEvent,getTimelineSelection,NEXT_EVENT_HORIZON};
