const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fields=new Map();let card;
const unit={id:'u1',unit_type:'air',region_id:'b',nation_code:'ITA'};
const app={currentGame:{saveId:'test'},unitManager:{units:[unit],displayUnits(){}},nationManager:{displayNationLabels(){}},closeAllPanels(){}};
const map={currentRegions:[{id:'a',nation_code:'ITA'},{id:'b',nation_code:'ITA'},{id:'c',nation_code:'ITA'}],
 applyNationColorsToAllSVG(regions){this.currentRegions=regions;},focusEvent:()=>'',showEventRoute(){},clearEventRoute(){}};
const document={getElementById(id){if(id==='turn-playback')return card;if(id==='game-container')return{append(value){card=value;}};return{classList:{add(){}}};},
 createElement(){return{setAttribute(){},remove(){card=null;},querySelector(selector){if(!fields.has(selector))fields.set(selector,{});return fields.get(selector);}};}};
const context={document,app,gameMap:map,structuredClone,setTimeout(){throw new Error('Manual playback must not auto-advance');}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/turn-playback'),'utf8')+'\nthis.playback=turnPlayback;',context);
(async()=>{
 const events=[{title:'Deployment',description:'Air formation deployed',applied_unit_change:{action:'recruit',unit:{...unit,region_id:'a'}}},
 {title:'Movement',description:'Formation moved',applied_unit_change:{action:'move',unit},applied_state_changes:[{nation_code:'ITA',occupied_regions:['b']}]}];
 const finished=context.playback.play(events,'test',{initial_units:[],territory_changes:[{region_id:'b',previous_controller:'ETH'},{region_id:'c',previous_controller:'ETH'}]});
 assert.equal(context.playback.index,0);assert.equal(app.unitManager.units[0].region_id,'a');
 assert.equal(map.currentRegions[1].nation_code,'ETH');
 context.playback.next();assert.equal(app.unitManager.units[0].region_id,'b');assert.equal(map.currentRegions[1].nation_code,'ITA');
 assert.equal(map.currentRegions[2].nation_code,'ETH');
 context.playback.stop();await finished;assert.equal(map.currentRegions[2].nation_code,'ITA','Finish must restore every committed change');assert.equal(card,null);
 app.unitManager.units=[];map.currentRegions[1].nation_code='ETH';
 const defeat=context.playback.play([{title:'Enemy counterattack',description:'The wing is lost and the province changes hands.',applied_unit_changes:[{action:'destroyed',unit}],campaign_effect:{target_nation_code:'ETH',lost_regions:['b']}}],'test',
  {initial_units:[unit],territory_changes:[{region_id:'b',previous_controller:'ITA'}]});
 assert.equal(app.unitManager.units.length,0,'A destroyed formation disappears during its battle card');
 assert.equal(map.currentRegions[1].nation_code,'ETH','Enemy gains are revealed in the same event');
 context.playback.stop();await defeat;
 app.formatDate=value=>value;
 const checkpoint=context.playback.play([{title:'Front report',description:'Verified progress.'}],'test',
  {next_event_checkpoint:true,new_date:'1936-02-15'});
 assert.equal(fields.get('.playback-stop').hidden,false,'A checkpoint remains visible while reviewing its events');
 assert.match(fields.get('.playback-stop').textContent,/1936-02-15/);
 assert.equal(context.playback.queue.length,1,'Checkpoint status must not create an extra event card');
 context.playback.stop();await checkpoint;
 console.log('✓ Manual playback, event-specific positions/control and finish restoration passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Compact ownership responses must not discard anchors or force full province painting.
const mapContext={};vm.createContext(mapContext);
vm.runInContext(fs.readFileSync(require.resolve('../frontend/js/map'),'utf8')+'\nthis.map=gameMap;',mapContext);
const actualMap=mapContext.map;let redraws=0;
actualMap.tileLayer={redraw(){redraws++;}};
actualMap.applyNationColorsToAllSVG([{id:'a',name:'Staging',nation_code:'ITA',marker_anchor:[20,30],geographic_anchor:true}]);
actualMap.applyNationColorsToAllSVG([{id:'a',name:'Staging',nation_code:'ETH'}]);
assert.equal(actualMap.currentRegions[0].marker_anchor[0],20);
assert.equal(actualMap.currentRegions[0].geographic_anchor,true);
actualMap.applyNationColorsToAllSVG([{id:'a',name:'Staging',nation_code:'ETH'}]);
assert.equal(redraws,2,'Unchanged ownership must not redraw tiles');
console.log('✓ Compact ownership refresh preserves map anchors and skips unchanged tiles');


const routeLayers=new Set();let animation;
mapContext.L={polyline:(points,options)=>({points,options,addTo(){routeLayers.add(this);return this;}}),divIcon:x=>x,marker:(point,options)=>({point,options,addTo(){routeLayers.add(this);return this;},setLatLng(p){this.point=p;}})};
mapContext.app={unitManager:{unitIcons:{infantry:'ground',air:'air'}}};
mapContext.performance={now:()=>0};mapContext.requestAnimationFrame=fn=>{animation=fn;return 1;};mapContext.cancelAnimationFrame=()=>{animation=null;};
actualMap.map={getCenter:()=>({lng:0}),removeLayer:layer=>routeLayers.delete(layer)};
actualMap.currentRegions=[{id:'n',marker_anchor:[10,10]},{id:'s',marker_anchor:[20,20]},{id:'target',marker_anchor:[30,30]}];
actualMap.showEventRoutes([{unit:{unit_type:'infantry'},route:{region_ids:['n','target']}},{unit:{unit_type:'infantry'},route:{region_ids:['s','target']}}],[{unit_type:'air',region_id:'n',mission:{target_region_id:'target'}}]);
assert.equal(routeLayers.size,6,'Every ground front and air mission must have a route and traveller');
animation(2200);assert.equal(routeLayers.size,3,'Travellers disappear after reaching their destination/base');
actualMap.clearEventRoute();assert.equal(routeLayers.size,0);
console.log('All ground fronts and air support animate and clean up together');
