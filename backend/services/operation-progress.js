const {resolveFormation}=require('./formation-references');
const text=value=>typeof value==='string' && value.trim();
const frontKey=front=>front.id || front.front_id || front.name;
const normalize=value=>String(value||'').trim().toLowerCase();
function matchFront(fronts,front) {
    const exact=fronts.find(f=>frontKey(f)===frontKey(front));
    if(exact)return exact;
    const named=fronts.filter(f=>normalize(f.name) && normalize(f.name)===normalize(front.name));
    if(named.length===1)return named[0];
    const located=fronts.filter(f=>f.region_id && f.region_id===front.region_id);
    return located.length===1?located[0]:undefined;
}
function mergeFronts(previous=[],current=[],replace=false) {
    const fronts=replace?[]:[...previous];
    for(const front of current) {
        const match=matchFront(fronts,front),index=fronts.indexOf(match);
        if(index>=0)fronts[index]=front;else fronts.push(front);
    }
    return fronts;
}

// Progress is bookkeeping, not combat adjudication. A front without a report
// has no reported outcome; it has not necessarily fought, held or failed.
function collectOperationProgress(result,context) {
    const updates=[],orders=result.campaign_orders||[],existing=context.recruitment?.existingUnits||[];
    const recruits=(result.unit_changes||[]).filter(u=>u.action==='recruit');
    const operations=(result.action_resolutions||[]).filter(r=>['invasion','annexation'].includes(r.operation?.kind) && r.operation.status==='proceed');
    const tracked=operations.map(r=>({action_id:r.action_id,operation:r.operation,
        campaign:(context.campaigns||[]).find(c=>c.target===r.operation.target_nation_code && c.status==='active')}));
    for(const campaign of context.campaigns||[]) {
        if(campaign.status!=='active' || campaign.manual_hold || tracked.some(t=>t.campaign?.id===campaign.id))continue;
        tracked.push({action_id:campaign.source_action_id,campaign,operation:{fronts:[]}});
    }
    for(const item of tracked) {
        const {operation:op,campaign,action_id}=item;
        const id=campaign?.id||`campaign_${action_id}`;
        if(orders.some(o=>o.campaign_id===id && ['annex','cancel','hold'].includes(o.action)))continue;
        const reports=orders.filter(o=>o.campaign_id===id && o.action==='battle' && !o.unresolved);
        // Previously declared fronts survive a reply which happens to mention
        // only one theatre. Old hold explanations do not become new outcomes.
        const inherited=(campaign?.requested_fronts||[]).map(f=>({...f,hold_reason:undefined,reason:undefined,status:'ready'}));
        const fronts=mergeFronts(inherited,op.fronts||[],op.front_scope==='replace');
        for(const front of fronts) {
            const key=frontKey(front),prior=matchFront(campaign?.front_progress||[],front);
            const ground=u=>context.recruitment?.catalog?.[u.unit_type]?.landKmPerDay>0 || context.recruitment?.catalog?.[u.unit_type]?.landSpeed>0;
            const units=[...existing,...recruits].filter(u=>ground(u) && (prior?.unit_ids?.includes(u.id) || u.region_id===front.region_id));
            const covered=reports.some(r=>(r.movements||[]).some(m=>units.includes(resolveFormation(m,existing,recruits).unit)));
            const held=text(front.hold_reason) || reports.some(r=>r.outcome==='hold' && text(r.report) &&
                (!r.front_ids?.length || r.front_ids.includes(front.id)));
            const blocked=front.status==='blocked' && text(front.reason);
            updates.push({campaign_id:id,action_id,front_id:key,name:front.name||key,
                region_id:front.region_id,unit_ids:units.map(u=>u.id).filter(Boolean),
                formation_refs:units.filter(u=>u.formation_ref).map(u=>u.formation_ref),
                status:blocked?'blocked':covered?'reported':held?'held':'awaiting_report',
                ...(blocked?{reason:front.reason}:text(front.hold_reason)?{reason:front.hold_reason}:{})});
        }
    }
    return updates;
}

function persistOperationProgress(state,result,recruitBindings=[],date=state.currentDate) {
    const current=result.front_progress||[];
    for(const campaign of state.campaigns||[]) {
        if(!['active','held'].includes(campaign.status)){campaign.pending_updates=[];continue;}
        const updates=current.filter(p=>p.campaign_id===campaign.id);
        if(updates.length)campaign.front_progress=updates.map(p=>{
            const ids=[...p.unit_ids,...recruitBindings.filter(c=>c.action==='recruit' && p.formation_refs.includes(c.formation_ref)).map(c=>c.unit.id)];
            const {formation_refs,...saved}=p;
            return {...saved,unit_ids:[...new Set(ids)],updated_on:date};
        });
        const notes=(result.resolution_notes||[]).filter(n=>n.campaign_id===campaign.id);
        campaign.pending_updates=notes;
    }
}
module.exports={collectOperationProgress,persistOperationProgress,frontKey,mergeFronts};
