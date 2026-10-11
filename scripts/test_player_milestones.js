const assert=require('node:assert/strict');
const {isImportantForPlayer}=require('../backend/services/event-importance');
const {validateNextEvent,getTimelineSelection}=require('../backend/services/next-event');

const rhineland={event_ref:'rhineland',title:'Remilitarization of the Rhineland',event_type:'political',
 severity:'major',development_status:'occurred',affected_nations:['GER','FRA','ENG'],
 significance_reason:'German troops enter the demilitarized zone and change the European security balance.'};
assert(!isImportantForPlayer(rhineland,'ITA'),'Globally important news is not automatically an Italian milestone');
assert(isImportantForPlayer(rhineland,'FRA'),'The directly affected player can have a different stopping event');
assert(isImportantForPlayer(rhineland),'Contexts without a player retain global compatibility');
assert(isImportantForPlayer({...rhineland,player_impact:{nation_code:'ITA',importance:'major',
 reason:'Italy must immediately decide whether to enforce its obligations as a Locarno guarantor.'}},'ITA'),
 'An explained consequential national impact can make foreign news relevant');

const domestic={event_ref:'domestic',title:'Ruling coalition collapses',event_type:'political',severity:'major',
 development_status:'occurred',significance_reason:'The collapse removes the national government from office.',affected_nations:['PLAYER']};
assert(isImportantForPlayer(domestic,'PLAYER'));
assert(isImportantForPlayer({...domestic,affected_nations:[],state_changes:{PLAYER:{leader_name:'New leader'}}},'PLAYER'),
 'Explained legacy player-state effects remain eligible');
assert(!isImportantForPlayer({...domestic,severity:'moderate'},'PLAYER'),'A direct mention alone cannot inflate ordinary news');
for(const player_impact of [null,{},
 {nation_code:'OTHER',importance:'major',reason:'Another government falls.'},
 {nation_code:'PLAYER',importance:'major',reason:''},
 {nation_code:'PLAYER',importance:'minor',reason:'No material national consequence.'},
 {nation_code:'PLAYER',importance:'moderate',reason:'The player receives routine diplomatic news.'}]) {
 assert(!isImportantForPlayer({...domestic,player_impact},'PLAYER'),
  'Explicit invalid, foreign or ordinary national assessments must not fall back to the affected list');
}
const nationallyImportant={...domestic,severity:'moderate',significance_reason:undefined,
 player_impact:{nation_code:'PLAYER',importance:'major',reason:'The government loses its parliamentary majority and must choose a new administration.'}};
assert(isImportantForPlayer(nationallyImportant,'PLAYER'),'National importance can exceed global importance');
for(const development_status of ['discussion','proposed','preparatory','unknown'])
 assert(!isImportantForPlayer({...nationallyImportant,development_status},'PLAYER'),'Proposed consequences cannot become national milestones');

for(const year of [1910,1936,2010]) {
 const context={nextImportantEvent:true,currentDate:`${year}-01-01`,playerNation:{code:'PLAYER'}};
 const foreign={...rhineland,event_ref:'foreign',day_offset:10};
 const relevant={...domestic,event_ref:'decision',day_offset:25};
 const later={...domestic,event_ref:'later',day_offset:35,state_changes:{PLAYER:{leader_name:'Future leader'}}};
 const reply={events:[foreign,{severity:'moderate',day_offset:15,affected_nations:['PLAYER']},relevant,later],
  campaign_orders:[{action:'battle',day_offset:20,severity:'moderate'},
   {action:'battle',day_offset:30,severity:'moderate'}],
  unit_changes:[{action:'recruit',day_offset:30,unit_type:'infantry',region_id:'future_province'}],
  diplomatic_changes:[{action:'alliance',day_offset:30,nation_code:'PLAYER',target_nation_code:'OTHER'}],
  next_event_stop:{day_offset:25,event_ref:'decision',reason:'The loss of government requires the player to decide how to form a new administration.'}};
 validateNextEvent(reply,context);
 assert.equal(reply.elapsed_days,25,`${year}: foreign headlines cannot stop before a national milestone`);
 assert.deepEqual(reply.events.map(e=>e.event_ref).filter(Boolean),['foreign','decision']);
 assert.equal(reply.events[0].severity,'major','Global news keeps its importance in the event feed');
 assert.equal(reply.campaign_orders.length,1,'Only already dated campaign progress is applied');
 assert.equal(reply.unit_changes.length,0);assert.equal(reply.diplomatic_changes.length,0);
 const selection=getTimelineSelection(reply);
 assert.equal(selection.stop_reason,'milestone');assert.equal(selection.stop_event_ref,'decision');
 assert.equal(selection.stop_explanation,reply.next_event_stop.reason,'A valid model stop explanation is retained');

 for(const next_event_stop of [
  {day_offset:10,event_ref:'foreign',reason:'This is a globally important headline.'},
  {day_offset:35,event_ref:'later',reason:'A later national event also matters.'},
  {day_offset:25,event_ref:'missing_reference',reason:'No matching event exists.'},
  {day_offset:26,event_ref:'decision',reason:'The redundant day is inconsistent.'}]) {
  const inconsistent={events:[structuredClone(foreign),structuredClone(relevant),structuredClone(later)],next_event_stop};
  validateNextEvent(inconsistent,context);
  assert.equal(inconsistent.elapsed_days,25,'Invalid or late stop proposals use the earliest actual player milestone');
  assert.equal(getTimelineSelection(inconsistent).stop_event_ref,'decision');
 }
 const local={events:[structuredClone(foreign),{...nationallyImportant,day_offset:22}]};
 validateNextEvent(local,context);assert.equal(local.elapsed_days,22);
 assert.equal(getTimelineSelection(local).stop_reason,'milestone','A globally Moderate national turning point stops time');

 const progress={events:[structuredClone(foreign)],campaign_orders:[{action:'battle',day_offset:20,severity:'moderate'}]};
 validateNextEvent(progress,context);assert.equal(progress.elapsed_days,20);
 assert.equal(getTimelineSelection(progress).stop_reason,'campaign_checkpoint',
  'Foreign headlines alone cannot be advertised as the player’s major event');
 const decisive={events:[structuredClone(foreign)],campaign_orders:[{event_ref:'decisive',action:'battle',day_offset:28,
  severity:'major',significance_reason:'The enemy main army is defeated, opening the decisive route to the capital.'}]};
 validateNextEvent(decisive,context);assert.equal(decisive.elapsed_days,28);
 assert.equal(getTimelineSelection(decisive).stop_reason,'milestone','A decisive campaign report remains a national milestone');
}
console.log('Player milestones: all eras, foreign news, national consequences, model stop choices, campaign outcomes and future clipping passed');
