const assert=require('node:assert/strict');
const {validateNextEvent}=require('../backend/services/next-event');
const context={nextImportantEvent:true,nextEventHorizonDays:90,currentDate:'1936-01-01',playerNation:{code:'ITA'}};
const dated={events:[{severity:'major',game_date:'1936-01-12',affected_nations:['FRA']}],campaign_orders:[]};
validateNextEvent(dated,context);assert.equal(dated.elapsed_days,11,'Recover omitted duration from an actual dated event');
const inconsistent={...dated,elapsed_days:30};validateNextEvent(inconsistent,context);assert.equal(inconsistent.elapsed_days,11,'Dated outcomes override redundant model arithmetic');
const overrun={...dated,events:[...dated.events,{game_date:'1936-01-20',severity:'minor'}]};
validateNextEvent(overrun,context);assert.equal(overrun.events.length,1,'Later proposals are excluded without rejecting the valid earlier event');
validateNextEvent({elapsed_days:90,events:[],campaign_orders:[]},context);
const unverifiedStop={elapsed_days:5,events:[],campaign_orders:[{action:'battle',day_offset:5,unresolved:true}]};
validateNextEvent(unverifiedStop,context);assert.equal(unverifiedStop.elapsed_days,90,'An unresolved notice cannot force an early stop');
const battle={events:[],campaign_orders:[{action:'battle',day_offset:8}]};
validateNextEvent(battle,context);assert.equal(battle.elapsed_days,90,'An ordinary battle does not stop a strategic skip');
const invalidDuration={elapsed_days:91,events:[]};validateNextEvent(invalidDuration,context);assert.equal(invalidDuration.elapsed_days,90,'Invalid redundant duration uses the bounded horizon');
console.log('Next-event dates, omitted duration, quiet horizon and unresolved reports passed');

const quiet={events:[{severity:'minor',game_date:'1936-02-02'}],campaign_orders:[]};
validateNextEvent(quiet,context);assert.equal(quiet.elapsed_days,90,'Ordinary-turn schema without elapsed_days uses a quiet horizon');
const numeric={elapsed_days:'8',events:[],campaign_orders:[{action:'battle',day_offset:'8',severity:'major',significance_reason:'The enemy main army is defeated, changing the course of the war.'}]};
validateNextEvent(numeric,context);assert.equal(numeric.elapsed_days,8);assert.equal(numeric.campaign_orders[0].day_offset,8);

const {validateTurn}=require('../backend/services/turn-validation');
const unreported={events:[{severity:'major',game_date:'1936-01-14',affected_nations:['FRA']}],elapsed_days:14,campaign_orders:[]};
const standing={...context,actions:[],campaigns:[{id:'standing',source_action_id:'old_order',target:'ETH',status:'active'}],
 recruitment:{existingUnits:[],movement:{available_days:90}}};
validateTurn(unreported,standing,{allowUnresolved:true,allowIncomplete:true});
assert.equal(unreported.elapsed_days,13);
assert.equal(unreported.campaign_orders.find(o=>o.unresolved).day_offset,13,'An engine notice uses the normalized stopping day');
validateNextEvent(unreported,standing);

for(const nested of [false,true]) {
 const reports=[{action:'battle',day_offset:8,severity:'major'},
  {action:'battle',day_offset:25,severity:'moderate'},
  {action:'annex',day_offset:150,surrendered:true},
  {action:'battle',day_offset:170,severity:'critical',significance_reason:'A later decisive outcome.'}];
 const reply={events:[],...(nested?{action_resolutions:[{action_id:'order',operation:{reports}}]}:{campaign_orders:reports})};
 validateNextEvent(reply,{...context,nextEventHorizonDays:365});
 assert.equal(reply.elapsed_days,150,'Surrender beyond 90 days is a milestone; routine victories are not');
 assert.equal((nested?reply.action_resolutions[0].operation.reports:reply.campaign_orders).length,3,'Future effects are excluded');
}
const worldFirst={events:[{severity:'major',game_date:'1936-01-20',affected_nations:['ENG']}],
 campaign_orders:[{action:'battle',day_offset:8},{action:'annex',day_offset:150}]};
validateNextEvent(worldFirst,{...context,nextEventHorizonDays:365});
assert.equal(worldFirst.elapsed_days,19,'An earlier important world development stops before the surrender');
assert.equal(worldFirst.campaign_orders.length,1,'Routine battle progress before the stop is retained');
const turningPoint={events:[],campaign_orders:[{action:'battle',day_offset:8},
 {action:'battle',day_offset:60,severity:'major',significance_reason:'The siege breaks the enemy defence of its capital, transforming the campaign.'}]};
validateNextEvent(turningPoint,context);assert.equal(turningPoint.elapsed_days,60,'An explained strategic turning point can stop the skip');
const quietYear={events:[],campaign_orders:[{action:'battle',day_offset:8}]};
validateNextEvent(quietYear,{...context,nextEventHorizonDays:undefined});assert.equal(quietYear.elapsed_days,365);
console.log('Routine progress, explained turning points, surrender, earlier world milestones and a one-year horizon passed');
