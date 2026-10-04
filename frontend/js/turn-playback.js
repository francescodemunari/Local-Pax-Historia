/* Manual playback projects committed state one event at a time. */
const turnPlayback = {
 stop() {
  gameMap.clearEventRoute?.();
  if(this.finalState && app.currentGame?.saveId===this.saveId) {
   app.unitManager.units=this.finalState.units;app.unitManager.displayUnits();
   gameMap.applyNationColorsToAllSVG(this.finalState.regions);app.nationManager?.displayNationLabels();
  }
  this.finalState=null;document.getElementById('turn-playback')?.remove();
  this.finish?.();this.finish=null;this.queue=[];
 },
 async play(events,saveId,result={}) {
  this.stop();if(!events?.length || app.currentGame?.saveId!==saveId)return;
  this.queue=[...events];this.index=0;this.saveId=saveId;
  this.finalState={units:structuredClone(app.unitManager.units),regions:gameMap.currentRegions.map(r=>({...r}))};
  app.unitManager.units=structuredClone(result.initial_units || this.finalState.units);app.unitManager.displayUnits();
  const previous=new Map((result.territory_changes||[]).map(c=>[c.region_id,c.previous_controller]));
  gameMap.applyNationColorsToAllSVG(this.finalState.regions.map(r=>({...r,nation_code:previous.get(r.id)||r.nation_code})));
  app.nationManager?.displayNationLabels();app.closeAllPanels();document.getElementById('region-popup')?.classList.add('hidden');
  const card=document.createElement('section');card.id='turn-playback';card.setAttribute('aria-label','Turn events');
  card.innerHTML='<span class="playback-count"></span><h2></h2><p class="playback-location"></p><div class="playback-description" aria-live="polite"></div><div class="playback-controls"><button class="btn primary" data-action="next">Next event</button><button class="btn secondary" data-action="skip">Finish playback</button></div>';
  document.getElementById('game-container').append(card);
  card.querySelector('[data-action="next"]').onclick=()=>this.next();card.querySelector('[data-action="skip"]').onclick=()=>this.stop();
  const finished=new Promise(resolve=>{this.finish=resolve;});this.display();await finished;
 },
 next(){this.index++;if(this.index>=this.queue.length)this.stop();else this.display();},
 display(){
  if(app.currentGame?.saveId!==this.saveId){this.stop();return;}
  const event=this.queue[this.index],card=document.getElementById('turn-playback'),change=event.applied_unit_change;
  for(const update of event.applied_unit_changes?.length ? event.applied_unit_changes : change ? [change] : []) {
   if(update.unit){const units=app.unitManager.units.filter(u=>u.id!==update.unit.id);if(!['disband','destroyed'].includes(update.action))units.push(structuredClone(update.unit));app.unitManager.units=units;}
  }
  for(const unit of event.campaign_effect?.support||[])app.unitManager.units=app.unitManager.units.map(u=>u.id===unit.id?structuredClone(unit):u);
  if(event.campaign_effect?.action==='annex')app.unitManager.units=app.unitManager.units.filter(u=>u.nation_code!==event.campaign_effect.target_nation_code);
  app.unitManager.displayUnits();
  const captured=event.campaign_effect?.captured_regions || change?.captured_regions || [];
  const ownership=new Map(captured.map(id=>[id,event.campaign_effect?.nation_code || change?.unit?.nation_code]));
  for(const id of event.campaign_effect?.lost_regions||[])ownership.set(id,event.campaign_effect.target_nation_code);
  for(const effect of event.applied_state_changes||[])for(const id of effect.occupied_regions||[])ownership.set(id,effect.nation_code);
  if(ownership.size){gameMap.applyNationColorsToAllSVG(gameMap.currentRegions.map(r=>ownership.has(r.id)?{...r,nation_code:ownership.get(r.id)}:r));if(event.campaign_effect?.action==='annex')app.nationManager?.displayNationLabels();}
  card.querySelector('.playback-count').textContent=`Event ${this.index+1} of ${this.queue.length}${event.game_date ? " · " + app.formatDate(event.game_date) : ""}`;
  card.querySelector('h2').textContent=typeof countryFlags!=='undefined'?countryFlags.prose(event.title):event.title;card.querySelector('.playback-description').textContent=typeof countryFlags!=='undefined'?countryFlags.prose(event.description):event.description;
  card.querySelector('.playback-location').textContent=gameMap.focusEvent(event)||'No specific location';if(gameMap.showEventRoutes)gameMap.showEventRoutes(event.applied_unit_changes?.length?event.applied_unit_changes:change?[change]:[],event.campaign_effect?.support||[]);else gameMap.showEventRoute?.(change);
  card.querySelector('[data-action="next"]').textContent=this.index===this.queue.length-1?'Done':'Next event';
 }
};
