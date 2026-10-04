const {resolveFormation}=require('./formation-references');
const militaryOrder = /\b(invad\w*|invas\w*|attack\w*|conquer\w*|annex\w*|advance\w*|offensive\w*|push\w*)\b/i;
function validateOperations(result,context,{allowUnresolved=true,allowIncomplete=false,futureCampaignIds=[]}={}) {
    const issues=[],unresolved=[],notes=[];
    let hardIssues=0;
    const fail=message=>{hardIssues++;issues.push(message);};
    const missing=(message,detail={})=>{notes.push({...detail,message});if(!allowIncomplete)issues.push(message);};
    // These are engine-owned diagnostics, never accepted from model output.
    delete result.front_progress;delete result.resolution_notes;
    const list=(value,name)=>{if(!Array.isArray(value)){fail(`${name} must be an array.`);return [];}return value;};
    if(!Array.isArray(result.campaign_orders)) {
        const error=new Error('Missing required campaign_orders array.');error.scope='military';throw error;
    }
    result.campaign_orders=list(result.campaign_orders,'campaign_orders').filter(o=>{if(!o || typeof o!=='object'){fail('Invalid campaign order.');return false;}return true;});
    result.unit_changes=result.unit_changes===undefined?[]:list(result.unit_changes,'unit_changes').filter(u=>u && typeof u==='object');
    const recruits=result.unit_changes.filter(u=>u.action==='recruit');
    if((result.unit_changes||[]).length>8)fail('At most eight unit changes can be applied per turn; consolidate formations instead of silently dropping them.');
    const existing=context.recruitment?.existingUnits||[];
    const refs=new Set(existing.map(u=>u.id));
    for(const recruit of recruits) {
        if(Array.isArray(context.actions) && !context.actions.some(a=>a.id===recruit.action_id) && !(context.campaigns||[]).some(c=>c.status==='active' && !c.manual_hold && c.source_action_id===recruit.action_id))fail(`Recruitment ${recruit.formation_ref||recruit.name||''} must belong to a pending action or an active standing campaign.`);
        if(recruit.formation_ref!==undefined) {
            if(typeof recruit.formation_ref!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(recruit.formation_ref) || refs.has(recruit.formation_ref))
                fail('New formation_ref values must be unique short identifiers, distinct from existing unit IDs.');
            refs.add(recruit.formation_ref);
        }
        if(Array.isArray(context.recruitment?.validRegionIds) && !context.recruitment.validRegionIds.includes(recruit.region_id))fail(`Recruitment ${recruit.formation_ref||recruit.name||''} needs a controlled province.`);
        if(context.recruitment?.catalog && !context.recruitment.catalog[recruit.unit_type])fail(`Unsupported recruitment unit_type ${recruit.unit_type}.`);
    }
    const ground=unit=>context.recruitment?.catalog?.[unit.unit_type]?.landKmPerDay>0 || context.recruitment?.catalog?.[unit.unit_type]?.landSpeed>0;
    const origins=new Map(),supportUnits=new Map(),positions=new Map(),movementDays=new Map();
    for(const report of result.campaign_orders.filter(r=>r.action==='battle').sort((a,b)=>Number(a.day_offset)-Number(b.day_offset))) {
        if(typeof report.title!=='string' || !report.title.trim())fail('Battle needs a title.');
        if(!['advance','hold','retreat'].includes(report.outcome))fail('Battle outcome must be advance, hold or retreat.');
        if(context.recruitment?.movement?.available_days && (!Number.isInteger(Number(report.day_offset)) || Number(report.day_offset)<1 || Number(report.day_offset)>context.recruitment.movement.available_days))fail(`${report.title||'Battle'}: day_offset must be within the turn.`);
        for(const key of ['movements','support']) {
            const entries=report[key]===undefined?[]:list(report[key],`${report.title||'Battle'}.${key}`);
            report[key]=entries.filter(e=>{if(!e || typeof e!=='object'){fail(`Invalid ${key} assignment.`);return false;}return true;});
            for(const ref of report[key]) {
                const {unit,error}=resolveFormation(ref,existing,recruits);
                if(error){fail(`${report.title||'Battle'} ${key}: ${error}`);continue;}
                if(key==='support')supportUnits.set(ref,unit);
                if(key==='movements') {
                    if(!ground(unit))fail(`${report.title||'Battle'}: air/naval formations must use support, not land movements.`);
                    const day=Number(report.day_offset),previousDay=movementDays.get(unit)??(Number(unit.day_offset)||0);
                    if(day<=previousDay)fail(`${report.title||'Battle'}: successive formation movements need distinct increasing dates after mobilisation.`);
                    origins.set(ref,positions.get(unit)||unit.region_id);
                    positions.set(unit,ref.region_id);movementDays.set(unit,day);
                } else if(unit.unit_type!=='air' && unit.unit_type!=='naval')fail(`${report.title||'Battle'}: support requires an air or naval formation.`);
            }
        }
    }
    const pending=context.actions||[];
    const peacefulTargets=new Set((Array.isArray(result.diplomatic_changes)?result.diplomatic_changes:[])
        .filter(d=>d?.action==='make_peace' && d.nation_code===context.playerNation?.code && pending.some(a=>a.id===d.action_id))
        .map(d=>d.target_nation_code));
    const endingCampaigns=new Set((context.campaigns||[]).filter(c=>peacefulTargets.has(c.target)).map(c=>c.id));
    const resolutions=result.action_resolutions===undefined?[]:list(result.action_resolutions,'action_resolutions').filter(r=>r && typeof r==='object');
    const hasText=value=>typeof value==='string' && value.trim();
    for(const resolution of resolutions)if(resolution.operation)resolution.operation.fronts=resolution.operation.fronts===undefined?[]:list(resolution.operation.fronts,'operation.fronts').filter(f=>f && typeof f==='object');
    for(const resolution of resolutions) {
        const op=resolution.operation;
        if(op?.front_scope!==undefined && !['merge','replace'].includes(op.front_scope))fail('front_scope must be merge or replace.');
        if(op?.front_scope==='replace' && (!pending.some(a=>a.id===resolution.action_id) || !hasText(op.scope_reason)))
            fail('Replacing standing fronts requires a new player order and scope_reason describing its changed instructions.');
    }
    for(const order of pending.filter(a=>militaryOrder.test(a.action_text||''))) {
        const resolution=resolutions.find(r=>r.action_id===order.id),op=resolution?.operation;
        if(!op || !['invasion','annexation','other'].includes(op.kind) || !['proceed','blocked'].includes(op.status) || typeof op.reason!=='string' || !op.reason.trim()) {
            fail(`Order ${order.id} requires an operation resolution with kind, status, reason and every requested front.`);continue;
        }
        if(op.kind==='other' && op.status==='proceed' && (context.campaigns||[]).some(c=>c.status==='active') &&
            /\b(troops|forces|fronts?|army|divisions)\b/i.test(order.action_text))
            fail(`Order ${order.id} concerns an ongoing military campaign. Resolve its fronts and support as an invasion operation, or explain why it is blocked.`);
        if(op.status==='blocked' || op.kind==='other')continue;
        if(!(context.nationCatalog||[]).some(n=>n.code===op.target_nation_code))fail(`Unknown operation target for ${order.id}.`);
        const campaign=(context.campaigns||[]).find(c=>c.target===op.target_nation_code && c.status==='active');
        const operationGap=message=>missing(message,{kind:'planning',action_id:order.id,campaign_id:campaign?.id||`campaign_${order.id}`});
        const continuing=campaign && op.front_scope!=='replace' && /\b(advance\w*|push\w*|all|continue\w*)\b/i.test(order.action_text) && !/\bonly\b/i.test(order.action_text);
        const requestedText=order.action_text+(continuing?' '+(campaign.current_order||campaign.original_order||'')+' '+(campaign.requested_fronts||[]).map(f=>f.name).join(' '):'');
        const start=result.campaign_orders.find(c=>c.action==='start' && c.action_id===order.id && c.target_nation_code===op.target_nation_code);
        if(!campaign && !start)fail(`Order ${order.id} needs a campaign start, not narrative conquest.`);
        if(op.kind==='invasion' && !op.fronts?.length)fail(`Invasion ${order.id} must account for all requested fronts.`);
        // Front names express the operation; IDs are opaque. A dated Somali
        // province can be clipped from today's Ethiopian administrative shape.
        const label=front=>[front.name,typeof front.id==='string'?front.id.replace(/[_-]+/g,' '):''].filter(Boolean).join(' ');
        for(const [name,pattern] of [['Eritrea',/erit(?:rea(?:n)?|re|reia)\b/i],['Somalia',/somal(?:ia(?:n)?|i|iland)?\b/i]]) {
            if(op.kind==='invasion' && pattern.test(requestedText) &&
                !(op.fronts||[]).some(f=>pattern.test(label(f))))
                operationGap(`The requested ${name} front is missing. Include its ground formation and province or a blocked explanation.`);
        }
        for(const direction of ['north','south','east','west']) {
            if(op.kind==='invasion' && new RegExp(`\\b${direction}(?:ern)?\\b`,'i').test(requestedText) &&
                !(op.fronts||[]).some(f=>new RegExp(`\\b${direction}(?:ern)?\\b`,'i').test(label(f))))
                operationGap(`Order ${order.id} requests the ${direction} front. Include a separately named front with a ground formation or a blocked explanation.`);
        }
        const ready=(op.fronts||[]).filter(f=>f.status==='ready');
        if(new Set(ready.map(f=>f.region_id)).size!==ready.length)
            fail(`Order ${order.id} assigns the same staging province to multiple fronts. Use distinct formations and provinces for each front.`);
        for(const front of op.fronts||[]) {
            if(front.status==='blocked' && hasText(front.reason))continue;
            if(Array.isArray(context.recruitment?.validRegionIds) && !context.recruitment.validRegionIds.includes(front.region_id))
                fail(`Front ${front.name} must stage in a currently controlled province. Use controlledRegions; province IDs do not indicate ownership.`);
            const ground=type=>context.recruitment?.catalog?.[type]?.landKmPerDay>0 || context.recruitment?.catalog?.[type]?.landSpeed>0;
            const forces=[...(context.recruitment?.existingUnits||[]),...(result.unit_changes||[]).filter(u=>u.action==='recruit' && u.action_id===order.id)];
            if(front.status!=='ready' || !forces.some(u=>u.region_id===front.region_id && ground(u.unit_type)))operationGap(`Front ${front.name} needs a real ground formation or an explicit blocked explanation.`);
        }
    }
    const active=new Set((context.campaigns||[]).filter(c=>c.status==='active' && !c.manual_hold && !endingCampaigns.has(c.id)).map(c=>c.id));
    const aliases=new Map();
    for(const campaign of context.campaigns||[])if(campaign.source_action_id)aliases.set(campaign.source_action_id,campaign.id);
    for(const order of result.campaign_orders)if(order?.action==='start') {
        const existing=(context.campaigns||[]).find(c=>c.target===order.target_nation_code && !['completed','cancelled'].includes(c.status));
        const id=existing?.id || `campaign_${order.action_id}`;
        aliases.set(`campaign_${order.action_id}`,id);aliases.set(order.action_id,id);
        if(!peacefulTargets.has(order.target_nation_code))active.add(id);else endingCampaigns.add(id);
    }
    for(const order of result.campaign_orders) {
        if(aliases.has(order?.campaign_id))order.campaign_id=aliases.get(order.campaign_id);
        if(order && !order.campaign_id && ['battle','annex','hold','resume','cancel'].includes(order.action) && active.size===1)order.campaign_id=[...active][0];
        if(['battle','annex','hold','resume','cancel'].includes(order?.action) &&
            !active.has(order.campaign_id) && !(context.campaigns||[]).some(c=>c.id===order.campaign_id))
            fail(`Unknown campaign_id ${order.campaign_id}. Use one of: ${[...active,...(context.campaigns||[]).map(c=>c.id)].join(', ')}. A battle must not be silently discarded.`);
    }
    result.front_progress=require('./operation-progress').collectOperationProgress(result,context).filter(p=>!endingCampaigns.has(p.campaign_id));
    for(const progress of result.front_progress.filter(p=>p.status==='awaiting_report')) {
        missing(futureCampaignIds.includes(progress.campaign_id)
            ? `No battle for ${progress.name} falls before this stopping date. Its standing orders remain active and its position is unchanged.`
            : `Front ${progress.name} has no formation movement in the battle reports. No outcome was supplied; its orders remain active and its position is unchanged. Supply a movement or an explicit held/blocked report when available.`,
            {kind:'front',campaign_id:progress.campaign_id,action_id:progress.action_id,front_id:progress.front_id,name:progress.name});
    }
    for(const id of active) {
        const reports=result.campaign_orders.filter(o=>o?.campaign_id===id && ['battle','annex'].includes(o.action));
        const paused=result.campaign_orders.some(o=>o?.campaign_id===id && ['hold','cancel'].includes(o.action));
        if(!reports.length && !paused) {
            const afterStop=futureCampaignIds.includes(id);
            if(!allowUnresolved && !afterStop)fail(`Campaign ${id} needs one battle report with campaign_id exactly ${id}, report, outcome, day_offset, movements and support. Use a held-front report when mobilisation or resistance prevents movement. A start order alone is not a battle result.`);
            // Missing output is not a provider outage and must never fabricate a
            // victory. Keep the standing campaign active for the next turn.
            if(allowUnresolved && !afterStop)unresolved.push({action:'battle',campaign_id:id,title:'Campaign update unavailable',
                report:'The Game Master did not provide a verified battle outcome for this operation. No combat movement or conquest has been applied. The standing operation remains active.',
                outcome:'hold',day_offset:Math.max(1,Math.min(context.recruitment?.movement?.available_days||1,
                    Number.isInteger(result.elapsed_days) && result.elapsed_days>0 ? result.elapsed_days : Infinity)),movements:[],support:[],unresolved:true});
        }
        if(reports.length>4)fail(`Campaign ${id} has too many reports. Consolidate battles into at most three reports plus surrender.`);
        for(const report of reports) {
            if(typeof report.report!=='string' || !report.report.trim())fail(`Campaign ${id} requires a substantive battle or surrender report.`);
            if(report.action==='battle' && ['advance','retreat'].includes(report.outcome) && !report.movements?.length)
                fail(`Campaign ${id}: ${report.outcome} requires actual formation movements. Use hold when no unit changes position.`);
            for(const move of report.movements||[]) {
                const origin=origins.get(move);
                if(['advance','retreat'].includes(report.outcome) && origin && origin===move.region_id)
                    fail(`Campaign ${id}: ${report.outcome} repeats origin ${origin} as destination. Choose a different mapped province from adjacent_foreign_regions, or report hold with no movement. Do not describe conquest when the formation stays in place.`);
            }
        }
    }
    const airOrders=[...pending];
    for(const campaign of context.campaigns||[]) {
        if(campaign.status!=='active' || campaign.manual_hold || pending.some(a=>resolutions.find(r=>r.action_id===a.id)?.operation?.target_nation_code===campaign.target))continue;
        if(ordersStopCampaign(result,campaign.id))continue;
        airOrders.push({id:campaign.source_action_id,action_text:campaign.current_order||campaign.original_order||'',campaign});
    }
    for(const order of airOrders.filter(a=>/\bair\b/i.test(a.action_text||'') && militaryOrder.test(a.action_text||''))) {
        const op=resolutions.find(r=>r.action_id===order.id)?.operation || (order.campaign?{status:'proceed',target_nation_code:order.campaign.target}:null);
        if(op?.status!=='proceed' || peacefulTargets.has(op.target_nation_code))continue;
        const air=(context.recruitment?.existingUnits||[]).filter(u=>u.unit_type==='air');
        const recruited=(result.unit_changes||[]).filter(u=>u.action==='recruit' && u.unit_type==='air' && u.action_id===order.id);
        const campaignId=(context.campaigns||[]).find(c=>c.target===op.target_nation_code && c.status==='active')?.id||`campaign_${order.id}`;
        const assignments=result.campaign_orders.filter(c=>c.campaign_id===campaignId).flatMap(c=>c.support||[]);
        const explained=typeof op.air_support_reason==='string' && op.air_support_reason.trim();
        if(!explained && (!air.length && !recruited.length || air.some(u=>!assignments.some(a=>supportUnits.get(a)===u)) || recruited.some(u=>!assignments.some(a=>supportUnits.get(a)===u))))
            missing(`This operation requests air forces, but has no reported mission or explanation. The request remains outstanding.`,{kind:'air_support',action_id:order.id,campaign_id:(context.campaigns||[]).find(c=>c.target===op.target_nation_code && c.status==='active')?.id||`campaign_${order.id}`});
    }
    if(issues.length) {const all=[...new Set([...issues,...notes.map(n=>n.message)])];const error=new Error(all.join('\n'));error.issues=all;error.scope='military';error.incompleteOnly=hardIssues===0;throw error;}
    result.resolution_notes=notes;
    result.campaign_orders.push(...unresolved);
    return result;
}
function ordersStopCampaign(result,id) {return result.campaign_orders.some(o=>o.campaign_id===id && ['hold','cancel','annex'].includes(o.action));}
module.exports={validateOperations};
