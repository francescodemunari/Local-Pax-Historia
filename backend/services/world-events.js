function validateWorldEvents(result, context) {
 // An early stop must not invent extra world news merely to meet a quota.
 if(context.nextImportantEvent)return result;
 const known=new Set((context.nationCatalog||[]).map(n=>n.code));
 if(known.size<4)return result;
 const excluded=new Set([context.playerNation.code,...(context.worldState?.[context.playerNation.code]?.war_with||[]),...(context.campaigns||[]).map(c=>c.target),
  ...(Array.isArray(result.campaign_orders)?result.campaign_orders:[]).map(c=>c?.target_nation_code)]);
 const independent=(result.events||[]).filter(e=>Array.isArray(e?.affected_nations) && e.affected_nations.length &&
  e.affected_nations.every(code=>known.has(code) && !excluded.has(code)));
 if(independent.length<2)throw new Error('The model omitted independent world developments. Retry the turn; at least two events outside your campaign are required.');
 return result;
}
module.exports={validateWorldEvents};
