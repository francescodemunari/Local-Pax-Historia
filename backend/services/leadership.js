const profiles=require('../../data/leadership-profiles.json');
const timeline=require('../../data/leadership-timeline.json');
const portraits=require('../../data/leader-portraits.json');
const politicalKeys=['leader_name','leader_title','head_of_state','ruling_party','ideology','government_type'];

function diverged(saved={}) {
    // Old saves with explicit political patches must also retain their history.
    return saved.leadership_override===true || politicalKeys.some(key=>Object.hasOwn(saved,key));
}
function profileAt(scenario,code,date,saved={}) {
    const base={...(profiles[scenario]?.[code]||{})};
    if(!diverged(saved) && !saved.annexed_by) {
        for(const entry of timeline[scenario]||[])if(entry.nation===code && entry.date<=date)Object.assign(base,entry.profile);
    }
    Object.assign(base,saved);
    const portrait=portraits[base.leader_name];
    // An uploaded/removed portrait applies only to the leader it was saved for.
    if(base.portrait_leader!==base.leader_name || !Object.hasOwn(base,'leader_portrait')) {
        Object.assign(base,{leader_portrait:null,portrait_leader:base.leader_name,portrait_credit:null,portrait_source:null,portrait_license:null,portrait_date:null},portrait||{});
    }
    return base;
}
function transitions(state,from,to) {
    return (timeline[state.scenarioId]||[]).filter(e=>e.date>from && e.date<=to && state.nations[e.nation] &&
        !state.nations[e.nation].annexed_by && !diverged(state.nations[e.nation]));
}
module.exports={profileAt,transitions,diverged};
