const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const catalog=require('../backend/services/ai-providers');
const output=require('../backend/services/model-output');
const source=fs.readFileSync(require.resolve('../backend/services/llm-service'),'utf8');
const moduleSource=source.slice(source.indexOf('async function callAnthropic('),source.indexOf('async function testConnectionWithSettings('));
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/malformed-turn-brackets.txt'),'utf8');
const expected=require('../backend/services/model-json').parseModelJSON(fixture);
const unsupported=(message,status=400)=>Object.assign(new Error(message),{status});

function transport(provider,send) {
 const sandbox={currentSettings:{provider,apiUrl:'https://fixture.invalid/v1',model:'test-model',apiKey:'fixture-only'},
  providerCatalog:catalog,require:()=>output,
  openai:{chat:{completions:{create:body=>send(body)}}},
  makeHttpRequest:(url,options,body)=>send(body,options,url)};
 vm.createContext(sandbox);vm.runInContext(moduleSource+'\nthis.complete=executeChatCompletion;',sandbox);return sandbox;
}
async function run() {
 for(const {id} of catalog.providers) {
  output.clearCompatibilityCache();
  const sent=[],observed=[];
  const ctx=transport(id,async body=>{
   sent.push(body);
   if(id==='anthropic')return {content:[{type:'thinking',thinking:'Internal'},
    {type:'text',text:'Here is the result.'},{type:'tool_use',name:'submit_turn',input:expected}],stop_reason:'tool_use'};
   return {choices:[{message:{content:fixture},finish_reason:'stop'}]};
  });
  const reply=await ctx.complete([{role:'user',content:'Return the turn JSON.'}],.7,8000,{json:true,onRequest:event=>observed.push(event)});
  assert.deepEqual(require('../backend/services/model-json').parseModelJSON(reply.content),expected,id+' shares the turn decoder');
  assert.equal(sent.length,1);assert.equal(observed.length,1);
  if(id==='anthropic')assert.equal(sent[0].tool_choice.type,'tool');
  else assert.equal(sent[0].response_format.type,id==='lm-studio'?'json_schema':'json_object');
  const prose=transport(id,async body=>{
   assert.equal(body.response_format,undefined);assert.equal(body.tools,undefined);assert.equal(body.tool_choice,undefined);
   return id==='anthropic'?{content:[{type:'thinking',thinking:'Hidden'},{type:'text',text:'Hello'}],stop_reason:'end_turn'}
    :{choices:[{message:{content:[{type:'text',text:'Hello'}]},finish_reason:'stop'}]};
  });
  assert.equal((await prose.complete([{role:'user',content:'Hello'}])).content,'Hello');
 }
 // Every OpenAI-compatible catalogue entry negotiates its actual capability.
 for(const {id} of catalog.providers.filter(p=>p.protocol==='openai')) {
  output.clearCompatibilityCache();let calls=0;const modes=[];
  const ctx=transport(id,async body=>{
   calls++;
   if(body.response_format)throw unsupported('response_format is not supported by this model');
   return {choices:[{message:{content:'{"events":[]}'},finish_reason:'stop'}]};
  });
  await ctx.complete([],0,8000,{json:true,onRequest:e=>modes.push(e)});
  assert.equal(calls,id==='lm-studio'?3:2);
  assert.equal(modes.filter(e=>e.fallback).length,calls-1);
  calls=0;await ctx.complete([],0,8000,{json:true});assert.equal(calls,1,'Cached rejection skips unsupported controls: '+id);
  for(const field of ['model','apiUrl']) {
   calls=0;ctx.currentSettings[field]+='-different';await ctx.complete([],0,8000,{json:true});
   assert.equal(calls,id==='lm-studio'?3:2,'Cache does not cross '+field);
  }
  output.clearCompatibilityCache();calls=0;await ctx.complete([],0,8000,{json:true});assert(calls>1,'Saving settings resets capability negotiation');
 }
 // Unavailable forced tools may still allow automatic tools; tool payload wins
 // over introductory prose. Unsupported tools fall back to ordinary JSON text.
 for(const allowAuto of [true,false]) {
  output.clearCompatibilityCache();const modes=[];
  const ctx=transport('anthropic',async body=>{
   modes.push(body.tool_choice?.type || 'text');
   if(body.tool_choice?.type==='tool')throw unsupported('tool_choice type tool is not supported with this model');
   if(body.tools && !allowAuto)throw unsupported('tools are not supported by this model',422);
   return body.tools?{content:[{type:'text',text:'Submitting'}, {type:'tool_use',name:'submit_turn',input:{events:[]}}],stop_reason:'tool_use'}
    :{content:[{type:'text',text:'{"events":[]}'}],stop_reason:'end_turn'};
  });
  assert.equal((await ctx.complete([],0,8000,{json:true})).content,'{"events":[]}');
  assert.deepEqual(modes,allowAuto?['tool','auto']:['tool','auto','text']);
  modes.length=0;await ctx.complete([],0,8000,{json:true});assert.deepEqual(modes,[allowAuto?'auto':'text']);
 }
 // Neither outage retries nor successful-but-invalid generations are format
 // negotiation. The existing single model-correction budget handles the latter.
 for(const error of [unsupported('response_format unsupported',401),unsupported('response_format unsupported',429),
  unsupported('response_format unsupported',500),unsupported('model not found',404),
  unsupported('Invalid JSON schema: missing required properties'),unsupported('Output failed to match response_format'),
  new Error('Connection timed out')]) {
  output.clearCompatibilityCache();let calls=0;
  const ctx=transport('custom',async()=>{calls++;throw error;});
  await assert.rejects(()=>ctx.complete([],0,8000,{json:true}),e=>e===error);assert.equal(calls,1);
 }
 const modes=[];
 await output.withOutputMode({provider:'custom',model:'other'},{json:true},async mode=>{modes.push(mode);return {content:'bad JSON'};});
 assert.deepEqual(modes,['json']);
 assert(output.unsupportedFormat(unsupported('No endpoints found that support the requested parameters',404),'json'));
 assert(!output.unsupportedFormat(unsupported('No endpoints found for this model',404),'json'));
 output.clearCompatibilityCache();
 await output.withOutputMode({provider:'custom',apiUrl:'https://shared.invalid',model:'same'},{json:true},async mode=>{
  if(mode==='json')throw unsupported('Unknown parameter: response_format');return {content:'{}'};
 });
 await output.withOutputMode({provider:'groq',apiUrl:'https://shared.invalid',model:'same'},{json:true},async mode=>{
  assert.equal(mode,'json','Capability cache must not cross providers');return {content:'{}'};
 });
 for(const response of [
  {content:[{type:'tool_use',name:'delete_save',input:{}}]},
  {content:[{type:'tool_use',name:'submit_turn',input:{events:[]}},{type:'tool_use',name:'submit_turn',input:{events:[]}}]},
  {content:[{type:'tool_use',name:'submit_turn',input:[]}]},
  {content:[],stop_reason:'refusal'}
 ])assert.throws(()=>output.decodeAnthropic(response,{json:true}));
 assert.equal(output.decodeAnthropic({content:[{type:'text',text:'{"events":[]}'}],stop_reason:'max_tokens'}).finish_reason,'length');
 assert.equal(output.decodeOpenAI({choices:[{message:{content:'{"events":[]}'},finish_reason:'length'}]}).finish_reason,'length');
 assert.throws(()=>output.decodeOpenAI({choices:[{message:{refusal:'Declined'},finish_reason:'stop'}]}),/declined/);
 assert.throws(()=>output.decodeOpenAI({choices:[{message:{content:'{}'},finish_reason:'content_filter'}]}),/declined/);
 // Real generation accounting includes negotiation attempts and still permits
 // at most one semantic correction. No settings file or live endpoint is used.
 output.clearCompatibilityCache();
 const ctx=transport('custom',async body=>{
  if(body.response_format)throw unsupported('Unknown parameter: response_format');
  return {choices:[{message:{content:'{"events":[]}'},finish_reason:'stop'}]};
 });
 Object.assign(ctx,{getHistoricalRoadmapContext:()=>'',structuredClone,console,path,__dirname:path.join(__dirname,'../backend/services'),
  fs:{existsSync:()=>true,writeFileSync(){}},require:name=>require(path.join(__dirname,'../backend/services',name))});
 vm.runInContext(source.slice(source.indexOf('async function generateEvents('),source.indexOf('async function diplomaticChat('))+'\nthis.generate=generateEvents;',ctx);
 const turn=await ctx.generate('next_event',{nextImportantEvent:true,currentDate:'1936-01-01',playerNation:{code:'ITA'},actions:[],campaigns:[]});
 assert.equal(turn.error,undefined);assert.equal(turn.generation_info.requests,1);
 assert.equal(turn.generation_info.provider_requests,2);assert.equal(turn.generation_info.format_fallbacks,1);
 // Exercise the raw HTTP adapter too: Anthropic HTTP status must survive into
 // negotiation, with the same fixture credentials and endpoint on both calls.
 const http=require('node:http'),{once}=require('node:events'),wire=[];
 const server=http.createServer((req,res)=>{
  let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{
   const body=JSON.parse(data);wire.push({url:req.url,key:req.headers['x-api-key'],body});
   res.setHeader('content-type','application/json');
   if(body.tool_choice.type==='tool'){res.writeHead(400);res.end(JSON.stringify({error:{message:'tool_choice tool is not supported'}}));}
   else res.end(JSON.stringify({content:[{type:'tool_use',name:'submit_turn',input:{events:[]}}],stop_reason:'tool_use'}));
  });
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const local=transport('anthropic',()=>{throw new Error('Use actual HTTP transport');});
  local.currentSettings.apiUrl=`http://127.0.0.1:${server.address().port}/v1`;
  Object.assign(local,{http,https:require('node:https'),URL});
  vm.runInContext(source.slice(source.indexOf('function makeHttpRequest('),source.indexOf('async function callAnthropic(')),local);
  const reply=await local.complete([{role:'user',content:'Return JSON.'}],.7,8000,{json:true});
  assert.equal(reply.content,'{"events":[]}');assert.equal(wire.length,2);
  assert(wire.every(req=>req.url==='/v1/messages' && req.key==='fixture-only'));
 }finally{await new Promise(resolve=>server.close(resolve));}
 console.log('All 19 providers: structured requests, bounded/cached negotiation, prose isolation, payload decoding, refusals and request accounting passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
