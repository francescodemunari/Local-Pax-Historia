// Compile one model-authored operation into the existing execution protocol.
// This adapter supplies identities only; it never invents battles or outcomes.
function compileOperationPlans(result, context) {
    require('./nation-references').normalizeNationReferences(result,context);
    require('./formation-references').normalizeFormationDeclarations(result,context);
    const issues=[];
    const add=message=>issues.push(message);
    const campaigns=Array.isArray(result.campaign_orders)?[...result.campaign_orders]:[];
    const units=Array.isArray(result.unit_changes)?[...result.unit_changes]:[];
    const resolutions=Array.isArray(result.action_resolutions)?structuredClone(result.action_resolutions):[];
    let nested=false;
    for(const resolution of resolutions) {
        const op=resolution?.operation;
        if(!op || (!Object.hasOwn(op,'formations') && !Object.hasOwn(op,'reports')))continue;
        nested=true;
        const label=`Operation ${resolution.action_id}`;
        if(op.formations==null)op.formations=[];
        if(op.reports==null)op.reports=[];
        if(!Array.isArray(op.formations) || !Array.isArray(op.reports)) {add(`${label}: formations and reports must be arrays.`);continue;}
        if(!resolution.action_id || !(context.actions||[]).some(a=>a.id===resolution.action_id) &&
            !(context.campaigns||[]).some(c=>c.source_action_id===resolution.action_id)) {
            add(`${label}: use a pending action ID or the source action ID of a standing campaign.`);continue;
        }
        const existing=(context.campaigns||[]).find(c=>c.target===op.target_nation_code && ['active','held'].includes(c.status));
        const campaignId=existing?.id || `campaign_${resolution.action_id}`;
        if(units.some(u=>u.action_id===resolution.action_id) || campaigns.some(c=>c.action_id===resolution.action_id || c.campaign_id===campaignId || c.campaign_id===resolution.action_id)) {
            add(`${label}: use nested formations/reports OR flat unit_changes/campaign_orders for this operation, not both.`);continue;
        }
        if(op.status==='blocked') {
            if(op.formations.length || op.reports.length)add(`${label}: a blocked operation cannot include recruitment or battle effects.`);
        } else {
            if(!existing && ['invasion','annexation'].includes(op.kind)) {
                if(!(context.nationCatalog||[]).some(n=>n.code===op.target_nation_code) || op.target_nation_code===context.playerNation?.code)
                    add(`${label}: a campaign needs a real foreign target nation.`);
                campaigns.push({action:'start',action_id:resolution.action_id,target_nation_code:op.target_nation_code});
            } else if(!existing && op.reports.length)add(`${label}: battle reports require an invasion or existing campaign.`);
            for(const formation of op.formations) {
                if(!formation || typeof formation!=='object') {add(`${label}: invalid formation.`);continue;}
                if(!formation.formation_ref)add(`${label}: each new formation needs a unique formation_ref.`);
                units.push({...formation,action:'recruit',action_id:resolution.action_id,nation_code:context.playerNation?.code});
            }
            for(const report of op.reports) {
                if(!report || !['battle','annex','hold','resume','cancel'].includes(report.action)) {add(`${label}: report action must be battle, annex, hold, resume or cancel.`);continue;}
                campaigns.push({...report,campaign_id:campaignId});
            }
        }
        delete op.formations;delete op.reports;
    }
    if(issues.length) {const error=new Error(issues.join('\n'));error.issues=issues;error.scope='military';throw error;}
    if(nested) {result.action_resolutions=resolutions;result.unit_changes=units;result.campaign_orders=campaigns;}
    return result;
}
module.exports={compileOperationPlans};
