const {mentionedNations} = require('./nation-mentions');
const normalize = value => typeof value === 'string'
    ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '';
const array = value => Array.isArray(value) ? value : [];
const missing = value => value == null || typeof value === 'string' && !value.trim();

// Codes and explicitly supplied names are identities, not approximate matches.
// Never repair a misspelling by selecting the nearest country.
function resolveNationReference(value, catalog) {
    const key = normalize(value);
    if (!key) return {error:'Missing nation reference.'};
    const codes = array(catalog).filter(n => normalize(n.code) === key);
    const matches = codes.length ? codes : array(catalog).filter(n =>
        [n.name, n.name_local, ...array(n.aliases)].some(name => normalize(name) === key));
    const ids = [...new Set(matches.map(n => n.code))];
    return ids.length === 1 ? {code:ids[0]} : {error:ids.length
        ? `Ambiguous nation reference "${String(value).slice(0,120)}". Use its exact scenario code.`
        : `Unknown nation reference "${String(value).slice(0,120)}". Use a code or name from the scenario nation catalog.`};
}

function inferOperationTarget(operation, actionId, result, context) {
    const catalog = array(context.nationCatalog), player = context.playerNation?.code;
    const foreign = code => code && code !== player && catalog.some(n => n.code === code && !n.annexed_by);
    const bound = array(context.campaigns).filter(c => actionId && c.source_action_id === actionId || operation.campaign_id && c.id === operation.campaign_id);
    const starts = array(result.campaign_orders).filter(c => actionId && c.action === 'start' && c.action_id === actionId);
    const declarations = array(result.diplomatic_changes).filter(d => actionId && d.action === 'declare_war' && d.action_id === actionId && d.nation_code === player);
    const linked = [...new Set([...bound.map(c => c.target), ...starts.map(c => c.target_nation_code),
        ...declarations.map(d => d.target_nation_code)].filter(foreign))];
    if (linked.length > 1) return {error:'The linked campaigns or war declarations identify multiple targets. Supply an explicit target_nation_code.',
        scope:declarations.length ? 'turn' : 'military'};

    // Actual province controllers supply evidence; IDs and narrative reports
    // do not. A support mission alone cannot start a new war.
    const regions = new Map(array(context.mapRegions).map(r => [r.id,r.controller]));
    for (const region of array(context.recruitment?.controlledRegions)) {
        regions.set(region.id,player);
        for (const neighbor of array(region.adjacent_foreign_regions))
            if (!regions.has(neighbor.id)) regions.set(neighbor.id,neighbor.controller || neighbor.nation_code);
    }
    const reports = [...array(operation.reports), ...array(result.campaign_orders).filter(c => actionId &&
        (c.action_id === actionId || [actionId,`campaign_${actionId}`].includes(c.campaign_id)))];
    const destinations = [...new Set(reports.flatMap(report => array(report.movements))
        .map(move => regions.get(move?.region_id)).filter(foreign))];
    if (destinations.length > 1) return {error:'The battle destinations identify multiple foreign countries. Supply an explicit target_nation_code.'};

    const order = actionId && array(context.actions).find(a => a.id === actionId);
    const nations = Object.fromEntries(catalog.map(n => [n.code,n]));
    const named = mentionedNations(order ? [order] : [],nations).filter(foreign);
    // A battle can begin entirely inside already occupied territory. Match
    // explicitly named countries against actual neighbours of controlled front
    // staging provinces, rather than guessing from the world's current enemies.
    const staging = new Set(array(operation.fronts).filter(f => f?.status === 'ready').map(f => f.region_id));
    const neighbors = array(context.recruitment?.controlledRegions).filter(r => staging.has(r.id))
        .map(r => new Set(array(r.adjacent_foreign_regions).map(n => regions.get(n.id)).filter(code => named.includes(code))))
        .filter(codes => codes.size);
    const theatre = neighbors.length ? named.filter(code => neighbors.every(codes => codes.has(code))) : [];
    const evidence = [...new Set([...linked,...destinations,...(theatre.length === 1 ? theatre : [])])];
    if (evidence.length > 1) return {error:'The linked operation and mapped battle/front evidence have conflicting targets. Supply consistent target identities.',
        scope:declarations.length ? 'turn' : 'military'};
    if (linked.length) return {code:linked[0]};
    if (destinations.length) return {code:destinations[0]};
    if (theatre.length === 1) return {code:theatre[0]};
    return named.length === 1 ? {code:named[0]} : {error:named.length
        ? 'The order names several foreign countries. Supply the intended target_nation_code.'
        : 'No saved campaign, mapped battle destination or uniquely named country identifies the target. Supply target_nation_code.'};
}

function normalizeNationReferences(result, context, {strict=true}={}) {
    const catalog = array(context.nationCatalog), issues = [];
    let scope = 'military';
    const fail = (label,message,issueScope='military') => {
        issues.push(`${label}: ${message}`);
        if (issueScope !== 'military') scope = 'turn';
    };
    const field = (record,key,label,issueScope,validateUnknown=true) => {
        if (!record || missing(record[key])) return;
        const resolved = resolveNationReference(record[key],catalog);
        if (resolved.code) record[key] = resolved.code;
        else if (catalog.length && validateUnknown) fail(label,resolved.error,issueScope);
    };
    for (const change of array(result.unit_changes)) field(change,'nation_code','Formation nation');
    for (const change of array(result.diplomatic_changes)) {
        // Standalone invalid diplomatic proposals retain the executor's existing
        // reject/ignore policy. Conflicting operation-linked identities below
        // require a whole-turn correction instead of changing only the battle.
        field(change,'nation_code','Diplomatic nation','turn',false);
        field(change,'target_nation_code','Diplomatic target','turn',false);
    }
    for (const change of array(result.campaign_orders)) field(change,'target_nation_code','Campaign target');
    for (const resolution of array(result.action_resolutions)) {
        const op = resolution?.operation;
        if (!op || typeof op !== 'object') continue;
        const label = `Operation ${resolution.action_id}`;
        field(op,'target_nation_code',label);
        if (op.status === 'blocked' || !['invasion','annexation'].includes(op.kind)) continue;
        if (!strict) {
            // Static saved/order/front evidence may identify the operation for
            // timeline filtering. Proposed effects (especially future war
            // declarations) cannot supply a target before their date is selected.
            if (missing(op.target_nation_code)) {
                const inferred = inferOperationTarget({...op,reports:[]},resolution.action_id,{},context);
                if (inferred.code) op.target_nation_code = inferred.code;
            }
            continue;
        }
        if (missing(op.target_nation_code)) {
            const inferred = inferOperationTarget(op,resolution.action_id,result,context);
            if (inferred.code) op.target_nation_code = inferred.code;
            else fail(label,inferred.error,inferred.scope);
        }
        const target = catalog.find(n => n.code === op.target_nation_code);
        if (op.target_nation_code === context.playerNation?.code || target?.annexed_by)
            fail(label,'A campaign needs an independent foreign nation as its target.');
        const bound = array(context.campaigns).filter(c => resolution.action_id && c.source_action_id === resolution.action_id || op.campaign_id && c.id === op.campaign_id);
        if (bound.some(c => c.target !== op.target_nation_code))
            fail(label,'The target conflicts with the saved campaign identity. Use a new pending order for another campaign.');
        const starts = array(result.campaign_orders).filter(c => resolution.action_id && c.action === 'start' && c.action_id === resolution.action_id);
        for (const start of starts) {
            if (missing(start.target_nation_code)) start.target_nation_code = op.target_nation_code;
            else if (start.target_nation_code !== op.target_nation_code) fail(label,'The operation and campaign start have conflicting targets.');
        }
        if (array(result.diplomatic_changes).some(d => resolution.action_id && d.action === 'declare_war' && d.action_id === resolution.action_id &&
            d.nation_code === context.playerNation?.code && d.target_nation_code !== op.target_nation_code))
            fail(label,'The operation and its war declaration have conflicting targets.','turn');
    }
    for (const start of array(result.campaign_orders).filter(c => strict && c.action === 'start' && missing(c.target_nation_code))) {
        const inferred = inferOperationTarget({},start.action_id,result,context);
        if (inferred.code) start.target_nation_code = inferred.code;
        else fail(`Campaign ${start.action_id}`,inferred.error,inferred.scope);
    }
    // Before timeline selection, canonicalize known identities without rejecting
    // effects that may later be excluded. Infer missing identities only from the
    // retained effect set or static evidence, so future declarations cannot
    // select a current war.
    if (strict && issues.length) {
        const error = new Error([...new Set(issues)].join('\n'));
        error.issues = [...new Set(issues)]; error.scope = scope; throw error;
    }
    return result;
}
module.exports = {resolveNationReference,inferOperationTarget,normalizeNationReferences};
