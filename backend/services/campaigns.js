const {findLandRoute,SPEED}=require('./movement');
const {resolveFormation}=require('./formation-references');
const {campaignSeverity}=require('./event-importance');

// The model adjudicates battles. The engine validates IDs, connected routes,
// available travel time and atomic state changes; it never rolls combat outcomes.
function resolveCampaigns(engine,state,orders,pendingIds,availableDays,alreadyMoved=[],recruitBindings=[],diplomacy=[],diplomaticIds=pendingIds) {
 const scenario=engine.scenarios.getScenario(state.scenarioId);
 const regions=engine.scenarios.getMap(state.scenarioId).regions;
 const lookup=new Map(regions.map(r=>[r.id,r]));
 const player=state.playerNationCode,effects=[],standaloneMoved=new Set(alreadyMoved),lastMovement=new Map();
 const dateAt=day=>Number.isFinite(Date.parse(state.currentDate))?new Date(Date.parse(state.currentDate)+day*86400000).toISOString().slice(0,10):state.currentDate;
 const recruits=recruitBindings.filter(c=>c.action==='recruit').map(c=>({...c.unit,formation_ref:c.formation_ref}));
 for(const change of recruitBindings.filter(c=>c.action==='recruit'))lastMovement.set(change.unit.id,Number(change.day_offset)||0);
 const resolve=ref=>{
  const {unit,error}=resolveFormation(ref,state.units,recruits);
  if(error)throw new Error(error);
  return state.units.find(u=>u.id===unit.id);
 };
 state.campaigns ||= [];
 // Remove only synthetic formations from the retired automatic defence resolver.
 state.units=state.units.filter(u=>u.source!=='campaign-defence');
 const diplomaticActions=new Set(['declare_war','make_peace','form_alliance','end_alliance']);
 const ordered=[...(Array.isArray(orders)?orders:[]).slice(0,24),...(Array.isArray(diplomacy)?diplomacy:[]).slice(0,20)].filter(o=>o && typeof o==='object');
 const orderDay=o=>o.action==='start'?0:Number(o.day_offset ?? (diplomaticActions.has(o.action)?0:availableDays));
 ordered.sort((a,b)=>(a.action==='start'?0:1)-(b.action==='start'?0:1) ||
  orderDay(a)-orderDay(b) || (diplomaticActions.has(a.action)?0:1)-(diplomaticActions.has(b.action)?0:1) || (a.action==='annex'?1:0)-(b.action==='annex'?1:0));
 for(const order of ordered) {
  if(!order || typeof order!=='object')continue;
  if(diplomaticActions.has(order.action)) {
   const day=orderDay(order);
   if(!Number.isInteger(day) || day<0 || day>availableDays)throw new Error('Diplomatic effect date lies outside the turn.');
   const gameDate=dateAt(day);
   engine.applyModelDiplomaticChanges(state,[order],diplomaticIds,{gameDate});
   continue;
  }
  let campaign=state.campaigns.find(c=>c.id===order.campaign_id);
  if(order.action==='start' && pendingIds.has(order.action_id) && state.nations[order.target_nation_code] && !state.nations[order.target_nation_code].annexed_by && order.target_nation_code!==player) {
   campaign=state.campaigns.find(c=>c.target===order.target_nation_code && !['completed','cancelled'].includes(c.status));
   if(!campaign && !diplomaticIds.has(order.action_id))throw new Error('Starting a new war after a campaign ends requires a new pending player order.');
   if(campaign?.manual_hold)continue;
   if(!campaign){campaign={id:`campaign_${order.action_id}`,source_action_id:order.action_id,target:order.target_nation_code,status:'active',
    original_order:state.actions?.find(a=>a.id===order.action_id)?.action_text||''};state.campaigns.push(campaign);}
   campaign.status='active';
  }
  if(!campaign) {
   if(['start','battle','annex'].includes(order.action))throw new Error('Campaign effect needs an authorized order and an independent mapped target.');
   continue;
  }
  const target=campaign.target;
  if(['hold','resume','cancel'].includes(order.action)) {
   if(campaign.manual_hold && order.action==='resume')continue;
   campaign.status={hold:'held',resume:'active',cancel:'cancelled'}[order.action];continue;
  }
  if(campaign.status!=='active') {
   if(campaign.manual_hold)continue;
   if(['battle','annex'].includes(order.action))throw new Error('A battle or surrender cannot apply to a paused or ended campaign.');
   continue;
  }
  if(order.action==='start') {
   if(state.nations[target].annexed_by)throw new Error('An annexed nation cannot start a new war.');
   for(const [a,b] of [[player,target],[target,player]]) {
    state.nations[a].warWith=[...new Set([...(state.nations[a].warWith||[]),b])];state.nations[a].atWar=true;
    state.nations[a].allies=(state.nations[a].allies||[]).filter(c=>c!==b);
   }
  }
  if(order.action==='battle') {
   if(state.nations[target].annexed_by || !(state.nations[player].warWith||[]).includes(target))throw new Error('Battle effects require an existing war with an independent target.');
   if(!order.title?.trim() || !order.report?.trim() || !['advance','hold','retreat'].includes(order.outcome))throw new Error('Battle needs a title, report and advance/hold/retreat outcome.');
   if(['advance','retreat'].includes(order.outcome) && !order.movements?.length)throw new Error('An advance or retreat needs a real formation movement; use hold if no units move.');
   const day=Number(order.day_offset);
   if(!Number.isInteger(day)||day<1||day>availableDays)throw new Error('Battle date lies outside the turn.');
   const changes=[],captured=new Set();
   for(const move of (order.movements||[])) {
    const unit=resolve(move);
    if(!unit || unit.nation_code!==player || standaloneMoved.has(unit.id))throw new Error('Battle references an unavailable formation.');
    const previousDay=lastMovement.get(unit.id)||0;
    if(day<=previousDay)throw new Error('Successive formation movements need distinct increasing battle dates.');
    const spec=scenario.unitCatalog[unit.unit_type],destination=lookup.get(move.region_id);
    if(!destination)throw new Error('Battle destination is not a mapped province.');
    if(['advance','retreat'].includes(order.outcome) && destination.id===unit.region_id)throw new Error('A battle advance or retreat must change province; use a held-front report for stationary troops.');
    const ground=spec?.landSpeed>0 || spec?.landKmPerDay>0;
    if(!ground)throw new Error('Air and naval formations must use support assignments, not land capture.');
    const allowed=r=>order.outcome==='advance'?[player,target].includes(engine.getRegionController(state,r)):engine.getRegionController(state,r)===player;
    const route=findLandRoute(regions,unit.region_id,destination.id,unit.unit_type,allowed,spec.landSpeed??SPEED[unit.unit_type],spec.landKmPerDay);
    if(!route || route.required_days>day-previousDay)throw new Error('Battle movement has no feasible connected route within the time since its previous movement or mobilisation.');
    if(order.outcome==='hold' && destination.id!==unit.region_id)throw new Error('A held front cannot advance.');
    const previous_region_id=unit.region_id;
    for(const id of route.region_ids)if(engine.getRegionController(state,lookup.get(id))===target){engine.setRegionController(state,id,player);captured.add(id);}
    unit.region_id=destination.id;unit.centroid=[...destination.marker_anchor];unit.last_order_id=campaign.source_action_id;
    for(const key of ['strength','organization'])if(Number.isFinite(move[key]))unit[key]=Math.max(0,Math.min(100,move[key]));
    changes.push({action:'advance',unit:structuredClone(unit),previous_region_id,route,captured_regions:[...captured]});lastMovement.set(unit.id,day);
   }
   const support=[];
   for(const assignment of order.support||[]) {
    const unit=resolve(assignment);
    if(!unit || unit.nation_code!==player || !lookup.has(assignment.region_id) || !assignment.mission?.trim())throw new Error('Support assignment needs a real formation, mapped target and mission.');
    if(!['air','naval'].includes(unit.unit_type))throw new Error('Support assignment requires an air or naval formation.');
    unit.mission={target_region_id:assignment.region_id,description:assignment.mission.slice(0,500),campaign_id:campaign.id};support.push(structuredClone(unit));
   }
   const losses=[],lost=[];
   if(order.losses!==undefined && !Array.isArray(order.losses))throw new Error('Battle losses must be an array of real formation references.');
   const affected=new Set();
   for(const loss of order.losses||[]) {
    const unit=resolve(loss);
    if(!unit || unit.nation_code!==player || affected.has(unit.id))throw new Error('Battle losses need distinct available player formations.');
    affected.add(unit.id);
    if(loss.destroyed!==undefined && typeof loss.destroyed!=='boolean')throw new Error('Formation destruction must be an explicit boolean.');
    const before=structuredClone(unit);
    for(const key of ['strength','organization'])if(loss[key]!==undefined) {
     if(!Number.isFinite(loss[key]) || loss[key]<0 || loss[key]>100)throw new Error('Battle strength and organization must be numbers from 0 to 100.');
     unit[key]=loss[key];
    }
    if(loss.destroyed===true)state.units=state.units.filter(u=>u.id!==unit.id);
    else if(loss.strength===undefined && loss.organization===undefined)throw new Error('A loss record needs strength, organization or explicit destruction.');
    const change={action:loss.destroyed?'destroyed':'loss',unit:structuredClone(unit),previous_unit:before};
    losses.push(change);changes.push(change);
   }
   if(order.enemy_captures!==undefined && !Array.isArray(order.enemy_captures))throw new Error('Enemy captures must be mapped province IDs.');
   const remaining=new Set(order.enemy_captures||[]);
   for(const id of remaining) {
    if(!lookup.has(id) || engine.getRegionController(state,lookup.get(id))!==player)throw new Error('Enemy capture needs a currently player-controlled mapped province.');
    if(state.units.some(u=>u.nation_code===player && u.region_id===id))throw new Error('Retreat or adjudicate the loss of all stationed player formations before an enemy capture.');
   }
   while(remaining.size) {
    let changed=false;
    for(const id of [...remaining]) {
     const region=lookup.get(id);
     const adjacent=region.neighbors || [...require('./movement').landGraph(regions).get(id).neighbors];
     if(!adjacent.some(n=>lookup.has(n) && engine.getRegionController(state,lookup.get(n))===target))continue;
     engine.setRegionController(state,id,target);remaining.delete(id);lost.push(id);changed=true;
    }
    if(!changed)throw new Error('Enemy captures need a connected land front, not a teleport into isolated territory.');
   }
   const appliedSummary=[...changes.filter(c=>c.route).map(c=>`${c.unit.name}: ${lookup.get(c.previous_region_id)?.name||'Origin'} → ${lookup.get(c.unit.region_id)?.name||'Destination'}.`),
    ...support.map(u=>`${u.name}: ${u.mission.description} at ${lookup.get(u.mission.target_region_id)?.name||'target province'}.`),
    ...(captured.size?[`${captured.size} province${captured.size===1?'':'s'} captured.`]:[]),
    ...losses.map(c=>`${c.unit.name}: ${c.action==='destroyed'?'formation destroyed':`strength ${c.unit.strength??'unreported'}, organization ${c.unit.organization??'unreported'}`}.`),
    ...(lost.length?[`${lost.length} province${lost.length===1?'':'s'} lost to ${state.nations[target].name||target}.`]:[])].join('\n');
   const reason=order.report.slice(0,10000)+(appliedSummary?`\n\nRecorded map effects:\n${appliedSummary}`:'');
   effects.push({action:'battle',severity:campaignSeverity(order),significance_reason:order.significance_reason,unresolved:order.unresolved===true,title:order.title.slice(0,200),reason,day_offset:day,campaign_id:campaign.id,target_nation_code:target,nation_code:player,region_id:order.region_id||lost.at(-1)||changes.at(-1)?.unit.region_id,changes,support,captured_regions:[...captured],lost_regions:lost});
  }
  if(order.action==='annex') {
   const designated=state.nations[target].capital_city_id;
   const capital=[...engine.scenarios.getCities(state.scenarioId),...(state.addedCities||[])].find(c=>c.nation_code===target && (designated?c.id===designated:c.is_capital));
   const day=Number(order.day_offset ?? availableDays);
   if(!Number.isInteger(day)||day<1||day>availableDays)throw new Error('Surrender date lies outside the turn.');
   if(order.surrendered!==true || !order.report?.trim())throw new Error('Annexation requires an explicit AI-adjudicated surrender report.');
   // Surrender is the Game Master's political/military decision. It can occur
   // before capital capture or complete occupation. Apply the declared settlement
   // to territory; do not invent troop movements from its narrative.
   state.units=state.units.filter(u=>u.nation_code!==target);
   const captured=regions.filter(r=>engine.getRegionController(state,r)===target).map(r=>r.id);
   captured.forEach(id=>engine.setRegionController(state,id,player));
   state.nations[target].annexed_by=player;
   for(const [a,b] of [[player,target],[target,player]]) {state.nations[a].warWith=(state.nations[a].warWith||[]).filter(c=>c!==b);state.nations[a].atWar=state.nations[a].warWith.length>0;}
   for(const nation of Object.values(state.nations)) {
    nation.warWith=(nation.warWith||[]).filter(code=>code!==target);nation.atWar=nation.warWith.length>0;
    nation.allies=(nation.allies||[]).filter(code=>code!==target);
   }
   state.nations[target].warWith=[];state.nations[target].allies=[];state.nations[target].atWar=false;
   for(const chat of state.chats||[])if(chat.participant_nations?.includes(target))chat.is_active=false;
   campaign.status='completed';effects.push({title:order.title,reason:order.report,day_offset:day,action:'annex',severity:campaignSeverity(order),campaign_id:campaign.id,target_nation_code:target,region_id:capital?.region_id,captured_regions:captured,nation_code:player});
   campaign.ended_on=dateAt(day);
   campaign.end_reason='Surrender and annexation';campaign.pending_updates=[];
   for(const unit of state.units)if(unit.mission?.campaign_id===campaign.id)delete unit.mission;

  }
 }
 return effects;
}
module.exports={resolveCampaigns};
