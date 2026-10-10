const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {resolveNationReference, normalizeNationReferences} = require('../backend/services/nation-references');
const {validateNextEvent, getTimelineSelection} = require('../backend/services/next-event');

const catalog = [
    {code:'ITA',name:'Italy',name_local:'Italia'},
    {code:'ETH',name:'Ethiopia',aliases:['Abyssinia']},
    {code:'GBR',name:'United Kingdom',aliases:['Britain']},
    {code:'FRA',name:'France'},
    {code:'CO1',name:'Congo',aliases:['Shared alias']},
    {code:'CO2',name:'Congo',aliases:['Shared alias']}
];
const context = (overrides = {}) => ({
    playerNation:{code:'ITA'}, nationCatalog:structuredClone(catalog),
    actions:[{id:'order',action_text:'Invade Ethiopia from Eritrea and Somalia. Prevent escape to United Kingdom.'}],
    campaigns:[], currentDate:'1936-01-01',
    mapRegions:[
        {id:'north',controller:'ITA'}, {id:'south',controller:'ITA'},
        {id:'ethiopia_north',controller:'ETH'}, {id:'ethiopia_south',controller:'ETH'},
        {id:'france',controller:'FRA'}, {id:'britain',controller:'GBR'}
    ],
    recruitment:{controlledRegions:[{id:'north',adjacent_foreign_regions:[{id:'border',controller:'ETH'}]}]},
    ...overrides
});
const operation = (overrides = {}) => ({
    kind:'invasion', status:'proceed', reason:'The coordinated campaign proceeds.',
    formations:[{formation_ref:'northern',unit_type:'infantry',region_id:'north'}],
    reports:[{action:'battle',title:'Northern offensive',report:'The campaign remains contested.',
        outcome:'advance',day_offset:10,movements:[{formation_ref:'northern',region_id:'ethiopia_north'}]}],
    ...overrides
});
const result = (op = operation(), overrides = {}) => ({
    action_resolutions:[{action_id:'order',summary:'The campaign proceeds.',operation:op}],
    events:[],unit_changes:[],campaign_orders:[],diplomatic_changes:[], ...overrides
});
const target = response => response.action_resolutions[0].operation.target_nation_code;

assert.deepEqual(resolveNationReference(' eth ',catalog),{code:'ETH'});
assert.deepEqual(resolveNationReference('ethiopia',catalog),{code:'ETH'});
assert.deepEqual(resolveNationReference('Abyssinia',catalog),{code:'ETH'});
assert.deepEqual(resolveNationReference('Italia',catalog),{code:'ITA'});
assert.deepEqual(resolveNationReference('CO1',catalog),{code:'CO1'},'An exact scenario code disambiguates duplicate names');
assert.match(resolveNationReference('Congo',catalog).error,/Ambiguous/);
assert.match(resolveNationReference('Shared alias',catalog).error,/Ambiguous/);
assert.match(resolveNationReference('Ethopia',catalog).error,/Unknown/,'No fuzzy spelling repair');

const missing = result();
const evidenceBefore = structuredClone(missing.action_resolutions[0].operation);
assert.equal(normalizeNationReferences(missing,context()),missing);
assert.equal(target(missing),'ETH','Mapped battle destinations distinguish the campaign target from the UK mentioned in the same order');
const {target_nation_code,...evidenceAfter} = missing.action_resolutions[0].operation;
assert.deepEqual(evidenceAfter,evidenceBefore,'Target recovery cannot author battle outcomes, movement or formations');
const once = structuredClone(missing);
normalizeNationReferences(missing,context());
assert.deepEqual(missing,once,'Normalization is idempotent');

const named = result(operation({target_nation_code:'Abyssinia'}));
normalizeNationReferences(named,context());
assert.equal(target(named),'ETH');
const renamedCatalog = structuredClone(catalog);
renamedCatalog.find(n=>n.code==='ETH').name='Highland Confederation';
const renamed = result(operation({target_nation_code:'Highland Confederation'}));
normalizeNationReferences(renamed,context({nationCatalog:renamedCatalog}));
assert.equal(target(renamed),'ETH','Saved nation names resolve against this game rather than historical defaults');

const namedOrder = result(operation({reports:[]}));
normalizeNationReferences(namedOrder,context({actions:[{id:'order',action_text:'Invade Abyssinia.'}]}));
assert.equal(target(namedOrder),'ETH','One uniquely named country can supply missing metadata');
const ambiguousOrder = result(operation({reports:[]}));
assert.throws(()=>normalizeNationReferences(ambiguousOrder,context()),/several foreign countries/);
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'Ethopia'})),context()),/Unknown nation reference/,
    'An invalid explicit target cannot be replaced with a valid movement-derived target');
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'Italy'})),context()),/independent foreign/);
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'ETH'})),context({nationCatalog:catalog.map(n=>
    n.code==='ETH'?{...n,annexed_by:'ITA'}:{...n})})),/independent foreign/);

const blocked = result(operation({status:'blocked',reason:'No offensive was ordered.',formations:[],reports:[]}));
normalizeNationReferences(blocked,context());
assert.equal(target(blocked),undefined,'A blocked operation does not need an invented target');
const supportOnly = result(operation({reports:[{action:'battle',outcome:'hold',day_offset:10,movements:[],
    support:[{formation_ref:'air',region_id:'ethiopia_north',mission:'Reconnaissance'}]}]}));
assert.throws(()=>normalizeNationReferences(supportOnly,context()),/several foreign countries/,
    'An air support destination alone cannot bind a missing invasion target');
const twoCountries = result(operation({reports:[{action:'battle',movements:[
    {formation_ref:'one',region_id:'ethiopia_north'}, {formation_ref:'two',region_id:'france'}]}]}));
assert.throws(()=>normalizeNationReferences(twoCountries,context()),/multiple foreign countries/);
const adjacent = result(operation({reports:[{action:'battle',movements:[{formation_ref:'one',region_id:'border'}]}]}));
normalizeNationReferences(adjacent,context({mapRegions:[]}));
assert.equal(target(adjacent),'ETH','Current adjacent-province controllers also provide target evidence');

const theatreContext = context({recruitment:{controlledRegions:[
    {id:'north',adjacent_foreign_regions:[{id:'ethiopia_north',controller:'ETH'},{id:'britain',controller:'GBR'}]},
    {id:'south',adjacent_foreign_regions:[{id:'ethiopia_south',controller:'ETH'}]}
]}});
const theatreOperation = operation({fronts:[{id:'northern',status:'ready',region_id:'north'},
    {id:'southern',status:'ready',region_id:'south'}],reports:[{action:'battle',outcome:'advance',day_offset:10,
    movements:[{formation_ref:'northern',region_id:'north'},{formation_ref:'southern',region_id:'south'}]}]});
const theatre = result(structuredClone(theatreOperation));
normalizeNationReferences(theatre,theatreContext);
assert.equal(target(theatre),'ETH','Both controlled fronts border Ethiopia; the UK mentioned in the order borders only one');
const ambiguousTheatreContext = context({recruitment:{controlledRegions:[
    {id:'north',adjacent_foreign_regions:[{id:'ethiopia_north',controller:'ETH'},{id:'britain',controller:'GBR'}]},
    {id:'south',adjacent_foreign_regions:[{id:'ethiopia_south',controller:'ETH'},{id:'britain',controller:'GBR'}]}
]}});
assert.throws(()=>normalizeNationReferences(result(structuredClone(theatreOperation)),ambiguousTheatreContext),/several foreign countries/,
    'A shared border with both named nations remains ambiguous');
const conflictingTheatreContext = context({recruitment:{controlledRegions:[
    {id:'north',adjacent_foreign_regions:[{id:'ethiopia_north',controller:'ETH'}]},
    {id:'south',adjacent_foreign_regions:[{id:'britain',controller:'GBR'}]}
]}});
assert.throws(()=>normalizeNationReferences(result(structuredClone(theatreOperation)),conflictingTheatreContext),/several foreign countries/,
    'Disjoint front neighbors cannot be resolved by choosing one front');

const savedContext = context({actions:[],campaigns:[{id:'saved',source_action_id:'order',target:'ETH',status:'active'}]});
const saved = result(operation({reports:[]}));
normalizeNationReferences(saved,savedContext);
assert.equal(target(saved),'ETH','The exact saved campaign source identifies a continuing operation');
const byCampaign = result(operation({campaign_id:'saved',reports:[]}),{action_resolutions:[
    {action_id:'new_order',operation:operation({campaign_id:'saved',reports:[]})}]});
normalizeNationReferences(byCampaign,savedContext);
assert.equal(target(byCampaign),'ETH');
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'FRA'})),savedContext),/saved campaign identity/);
const missingActionId = result(operation({reports:[]}));
delete missingActionId.action_resolutions[0].action_id;
assert.throws(()=>normalizeNationReferences(missingActionId,context({actions:[],campaigns:[
    {id:'unbound_saved',target:'ETH',status:'active'}]})),/No saved campaign/,
    'Missing action IDs cannot match saved campaigns whose source_action_id is also missing');
assert.throws(()=>normalizeNationReferences(result(operation({reports:[]})),context({
    actions:[{id:'order',action_text:'Begin our next military operation.'}],
    campaigns:[{id:'unrelated',source_action_id:'another_order',target:'ETH',status:'active'}],
    worldState:{ITA:{war_with:['ETH']}}
})),/No saved campaign/,'A lone existing enemy or unrelated campaign cannot decide a new order target');

const declared = result(operation({reports:[]}),{diplomatic_changes:[
    {action:'declare_war',action_id:'order',nation_code:'Italia',target_nation_code:'Ethiopia'}]});
normalizeNationReferences(declared,context());
assert.equal(target(declared),'ETH');
assert.equal(declared.diplomatic_changes[0].nation_code,'ITA');
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'ETH'}),{diplomatic_changes:[
    {action:'declare_war',action_id:'order',nation_code:'Italy',target_nation_code:'United Kingdom'}]}),context()),/war declaration have conflicting targets/,
    'A same-order war declaration must agree with the explicit operation target');
const unrelatedDeclaration = result(operation({reports:[]}),{diplomatic_changes:[
    {action:'declare_war',action_id:'other',nation_code:'ITA',target_nation_code:'ETH'}]});
assert.throws(()=>normalizeNationReferences(unrelatedDeclaration,context()),/several foreign countries/);
const flatStart = result(operation({reports:[]}),{campaign_orders:[{action:'start',action_id:'order',target_nation_code:'eth'}]});
normalizeNationReferences(flatStart,context());
assert.equal(target(flatStart),'ETH');
assert.equal(flatStart.campaign_orders[0].target_nation_code,'ETH');
assert.throws(()=>normalizeNationReferences(result(operation({target_nation_code:'ETH'}),{
    campaign_orders:[{action:'start',action_id:'order',target_nation_code:'FRA'}]}),context()),/conflicting targets/);

const future = result(operation({target_nation_code:'UNSUPPORTED',day_offset:10}),{events:[
    {title:'Strategic treaty',description:'An independent major treaty.',game_date:'1936-01-06',severity:'major',significance_reason:'The signed treaty creates a lasting security settlement.',affected_nations:['FRA']}]});
const futureContext = context({nextImportantEvent:true,nextEventHorizonDays:365});
normalizeNationReferences(future,futureContext,{strict:false});
validateNextEvent(future,futureContext);
normalizeNationReferences(future,futureContext);
assert.equal(future.elapsed_days,5);
assert.equal(future.action_resolutions.length,0,'Invalid future-only proposals are excluded before strict validation');
assert.deepEqual(getTimelineSelection(future).deferredActionIds,['order']);

const futureDeclaration = result(operation({formations:[],fronts:[],reports:[
    {action:'battle',outcome:'hold',day_offset:3,movements:[]}]}),{events:[
    {title:'Strategic treaty',description:'An independent major treaty.',game_date:'1936-01-06',severity:'major',significance_reason:'The signed treaty creates a lasting security settlement.',affected_nations:['FRA']}],
    diplomatic_changes:[{action:'declare_war',action_id:'order',nation_code:'ITA',target_nation_code:'GBR',day_offset:20}]});
normalizeNationReferences(futureDeclaration,futureContext,{strict:false});
validateNextEvent(futureDeclaration,futureContext);
assert.equal(futureDeclaration.diplomatic_changes.length,0,'Future declarations are excluded from this stopping date');
assert.throws(()=>normalizeNationReferences(futureDeclaration,futureContext),/several foreign countries/,
    'An excluded future declaration cannot permanently supply a missing target for an earlier battle');

for (const scenarioId of ['ww1-1910','ww2-geographic','world-2010']) {
    const nations = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/scenarios',scenarioId,'nations.json'),'utf8'));
    const actualCatalog = Object.entries(nations).map(([code,nation])=>({code,...nation}));
    for (const [code,nation] of Object.entries(nations).filter(([code,nation])=>
        ['ITA','ETH','ENG','FRA'].includes(code) || /german/i.test(nation.name))) {
        assert.deepEqual(resolveNationReference(` ${code.toLowerCase()} `,actualCatalog),{code},`${scenarioId}: case-normalized scenario code`);
        assert.deepEqual(resolveNationReference(nation.name,actualCatalog),{code},`${scenarioId}: actual catalog name`);
        if (nation.name_local) assert.deepEqual(resolveNationReference(nation.name_local,actualCatalog),{code},`${scenarioId}: local name`);
    }
    const uk = actualCatalog.find(n=>n.name==='United Kingdom');
    assert.equal(uk.code,'ENG','Historical and modern catalogs use their saved codes, not assumed ISO codes');
    assert.match(resolveNationReference('GBR',actualCatalog).error,/Unknown/,'An absent generic country code is never guessed');
    const actual = result(operation({target_nation_code:'Ethiopia'}));
    normalizeNationReferences(actual,context({nationCatalog:actualCatalog}));
    assert.equal(target(actual),'ETH');
    const german = actualCatalog.find(n=>/german/i.test(n.name));
    if (scenarioId==='world-2010') {
        assert.equal(german.code,'AKA','The modern scenario has a different saved German identity');
        assert.match(resolveNationReference('GER',actualCatalog).error,/Unknown/);
    }
    const renamedActual = actualCatalog.map(n=>n.code===german.code?{...n,name:'New German Republic',name_local:'Neue Deutsche Republik'}:n);
    const renamedOperation = result(operation({target_nation_code:'Neue Deutsche Republik',reports:[]}));
    normalizeNationReferences(renamedOperation,context({nationCatalog:renamedActual}));
    assert.equal(target(renamedOperation),german.code,`${scenarioId}: saved leadership/nation renaming keeps the original identity`);
}

console.log('Nation references: actual catalogs in all scenarios, canonical identities, grounded front intersections, missing targets, standing campaigns, conflicts, ambiguity and future exclusion passed');
