const military=/\b(invad\w*|invas\w*|attack\w*|conquer\w*|annex\w*|advance\w*|offensive\w*|push\w*)\b/i;
const text=value=>typeof value==='string' && value.trim();
const record=value=>value && typeof value==='object' && !Array.isArray(value);

function prepareActionOutcomes(result,context,{allowDeferred=false,timelineDeferred=[]}={}) {
    // A model cannot mark its own ignored orders deferred or completed.
    result.deferred_action_ids=[];
    const resolutions=Array.isArray(result.action_resolutions)?result.action_resolutions:[];
    const issues=[];
    for(const action of context.actions||[]) {
        const resolution=resolutions.find(r=>r?.action_id===action.id),op=resolution?.operation;
        // Descriptive metadata may reuse model-authored text; never derive a
        // battle, destination, surrender or political decision from prose.
        if(record(op) && !text(op.reason)) {
            const report=(Array.isArray(op.reports)?op.reports:[]).find(r=>text(r?.report));
            if(report || text(resolution.summary))op.reason=(report?.report||resolution.summary).slice(0,1200);
        }
        const needsOperation=military.test(action.action_text||'');
        const complete=resolution && (needsOperation
            ? record(op) && ['invasion','annexation','other'].includes(op.kind) && ['proceed','blocked'].includes(op.status) && text(op.reason)
            : text(resolution.summary));
        if(complete && !timelineDeferred.includes(action.id))continue;
        const linked=[...(Array.isArray(result.unit_changes)?result.unit_changes:[]),...(Array.isArray(result.diplomatic_changes)?result.diplomatic_changes:[]),...(Array.isArray(result.campaign_orders)?result.campaign_orders:[])];
        const hasEffects=linked.some(e=>e?.action_id===action.id || [action.id,`campaign_${action.id}`].includes(e?.campaign_id)) ||
            (Array.isArray(op?.formations) && op.formations.length) || (Array.isArray(op?.reports) && op.reports.length) ||
            (result.events||[]).some(e=>record(e?.state_changes?.[context.playerNation?.code]));
        if((allowDeferred || timelineDeferred.includes(action.id)) && !hasEffects) {
            result.deferred_action_ids.push(action.id);
            const replacement={action_id:action.id,summary:timelineDeferred.includes(action.id)
                ? 'This order falls after the current stopping date. It remains pending for the next turn.'
                : 'No outcome was supplied for this order. It remains pending for the next turn.'};
            if(resolution)resolutions[resolutions.indexOf(resolution)]=replacement;else resolutions.push(replacement);
        } else issues.push(`Missing outcome for pending order ${action.id}: ${action.action_text}. Return its action_resolutions entry${needsOperation?' with operation kind, status, reason, fronts, formations and reports':''}. Never replace this order with unrelated news.`);
    }
    result.action_resolutions=resolutions;
    if(issues.length){const error=new Error(issues.join('\n'));error.issues=issues;error.scope='military';throw error;}
}
module.exports={prepareActionOutcomes};
