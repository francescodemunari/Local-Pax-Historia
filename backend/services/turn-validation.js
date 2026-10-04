const {compileOperationPlans}=require('./operation-plan');
const {validateOperations}=require('./operation-contract');
const {validateNextEvent,getTimelineSelection}=require('./next-event');
const {validateWorldEvents}=require('./world-events');

function validateTurn(result,context,options={}) {
    if(!result || typeof result!=='object' || Array.isArray(result) || !Array.isArray(result.events)) {
        const error=new Error('Turn response must be an object with an events array.');error.scope='turn';throw error;
    }
    const failures=[];
    const check=(scope,fn)=>{try {fn();return true;}catch(error){failures.push({scope:error.scope||scope,issues:error.issues||[error.message],incompleteOnly:error.incompleteOnly===true});return false;}};
    // Missing optional arrays mean no proposals; malformed supplied arrays still
    // fail their effect checks. Select the timeline before validating future work.
    for(const key of ['campaign_orders','unit_changes','diplomatic_changes','action_resolutions'])if(result[key]==null)result[key]=[];
    require('./nation-references').normalizeNationReferences(result,context,{strict:false});
    const timing=check('turn',()=>validateNextEvent(result,context));
    const selection=getTimelineSelection(result);
    check('military',()=>require('./action-outcomes').prepareActionOutcomes(result,context,{allowDeferred:options.allowUnresolved===true,timelineDeferred:selection.deferredActionIds}));
    const actionContext={...context,actions:(context.actions||[]).filter(a=>!result.deferred_action_ids?.includes(a.id))};
    const compiled=check('military',()=>compileOperationPlans(result,actionContext));
    const military=compiled && check('military',()=>validateOperations(result,actionContext,{...options,futureCampaignIds:selection.futureCampaignIds}));
    check('world',()=>validateWorldEvents(result,context));
    // The same execution code previews routes and effects on a disposable state.
    // Never spend another model request just to discover a post-repair map error.
    if(compiled && (military || failures.filter(f=>f.scope==='military').every(f=>f.incompleteOnly)) && timing && context.previewMilitaryResult)
        check('military',()=>context.previewMilitaryResult(result));
    if(failures.length) {
        const issues=[...new Set(failures.flatMap(f=>f.issues))];
        const error=new Error(issues.map((issue,index)=>`${index+1}. ${issue}`).join('\n'));
        error.issues=issues;error.scope=failures.every(f=>f.scope==='military')?'military':'turn';throw error;
    }
    result.resolution_notes=[...(result.resolution_notes||[]),...(result.deferred_action_ids||[]).map(action_id=>({kind:'order',action_id,message:selection.deferredActionIds.includes(action_id)?'The order falls after this stopping date and remains pending.':'No outcome was supplied. The order remains pending.'}))];
    return result;
}

function mergeMilitaryRepair(original,correction) {
    if(!correction || !Array.isArray(correction.action_resolutions))throw new Error('Military repair must include action_resolutions.');
    const result=structuredClone(original);
    // Keep unrelated action summaries, world developments, diplomacy and time.
    const replaced=new Set(correction.action_resolutions.map(r=>r.action_id));
    result.action_resolutions=[...(original.action_resolutions||[]).filter(r=>!r.operation && !replaced.has(r.action_id)),...correction.action_resolutions];
    result.unit_changes=correction.unit_changes||[];
    result.campaign_orders=correction.campaign_orders||[];
    return result;
}
module.exports={validateTurn,mergeMilitaryRepair};
