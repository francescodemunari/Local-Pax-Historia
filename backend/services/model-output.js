// Output-format negotiation is scoped to one provider/endpoint/model. It never
// changes credentials or retries failed generations, rate limits or outages.
const compatibility = new Map();
const CACHE_MS = 10 * 60 * 1000;
const TOOL_NAME = 'submit_turn';
const turnSchema = {
    type: 'object',
    properties: Object.fromEntries(['events','action_resolutions','unit_changes','campaign_orders','diplomatic_changes']
        .map(key => [key, {type:'array',items:{type:'object',additionalProperties:true}}])),
    additionalProperties: true
};

function outputModes(settings, json) {
    if (!json) return ['text'];
    if (settings.provider === 'anthropic') return ['tool', 'tool_auto', 'text'];
    if (settings.provider === 'lm-studio') return ['schema', 'json', 'text'];
    return ['json', 'text'];
}

function formatFields(mode) {
    if (mode === 'json') return {response_format:{type:'json_object'}};
    if (mode === 'schema') return {response_format:{type:'json_schema',json_schema:{name:'game_turn',schema:turnSchema}}};
    if (mode === 'tool' || mode === 'tool_auto') return {
        tools:[{name:TOOL_NAME,description:'Return the complete game turn JSON described in the prompt. This submits data only; it executes no action.',input_schema:turnSchema}],
        tool_choice: mode === 'tool' ? {type:'tool',name:TOOL_NAME} : {type:'auto'}
    };
    return {};
}

function unsupportedFormat(error, mode) {
    if (mode === 'text' || ![400,404,422,501].includes(Number(error?.status))) return false;
    const detail = [error.message,error.param,error.code,JSON.stringify(error.error || '')].join(' ');
    if (Number(error.status)===404 && !mode.startsWith('tool') &&
        /no endpoints (?:found )?that support (?:the )?requested parameters/i.test(detail)) return true;
    const field = mode.startsWith('tool') ? /tool_choice|tools?\b|input_schema|function.call/i
        : /response_format|json_object|json_schema|structured.outputs?|guided_json/i;
    const rejected = /not support|does not support|unsupported|unknown (?:field|parameter|argument)|unrecognized|unrecognised|not (?:allowed|permitted|available|implemented)|unexpected (?:field|parameter|argument|keyword)|extra inputs|only .{0,60}support|must be .{0,40}(?:json_schema|text)|no endpoints .{0,40}support/i;
    return field.test(detail) && rejected.test(detail);
}

async function withOutputMode(settings, {json=false,onRequest}={}, send) {
    const modes=outputModes(settings,json);
    const key=JSON.stringify([settings.provider,String(settings.apiUrl || '').replace(/\/+$/,''),settings.model]);
    const cached=compatibility.get(key);
    const first=json && cached?.expires>Date.now() ? Math.max(0,modes.indexOf(cached.mode)) : 0;
    for (let index=first;index<modes.length;index++) {
        const mode=modes[index];
        onRequest?.({mode,fallback:index>first});
        try {
            const response=await send(mode);
            return {...response,output_mode:mode};
        } catch (error) {
            if (!unsupportedFormat(error,mode) || index===modes.length-1) throw error;
            // Remember only explicit capability rejections, never bad content.
            if(compatibility.size>=128)compatibility.delete(compatibility.keys().next().value);
            compatibility.set(key,{mode:modes[index+1],expires:Date.now()+CACHE_MS});
        }
    }
}

function responseError(message) {
    const error=new Error(message);error.code='MODEL_RESPONSE_INVALID';return error;
}

function decodeOpenAI(response, model) {
    const choice=response?.choices?.[0],message=choice?.message;
    if (!message) throw responseError('The provider returned no completion message.');
    if (message.refusal || choice.finish_reason==='content_filter')
        throw responseError('The model declined this turn. No game changes were applied.');
    if (message.tool_calls?.length) throw responseError('The provider returned an unexpected tool call instead of turn data.');
    const content=typeof message.content==='string' ? message.content : Array.isArray(message.content)
        ? message.content.filter(part=>part.type==='text' && typeof part.text==='string').map(part=>part.text).join('\n') : '';
    return {content,model:response.model || model,finish_reason:choice.finish_reason};
}

function decodeAnthropic(response, {json=false}={}) {
    const blocks=Array.isArray(response?.content) ? response.content : [];
    if(response?.stop_reason==='refusal' || blocks.some(b=>b.type==='refusal'))
        throw responseError('The model declined this turn. No game changes were applied.');
    const calls=blocks.filter(b=>b.type==='tool_use');
    let content;
    if(calls.length) {
        if(!json || calls.length!==1 || calls[0].name!==TOOL_NAME || !calls[0].input ||
            typeof calls[0].input!=='object' || Array.isArray(calls[0].input))
            throw responseError('The provider returned an unexpected or incomplete turn submission.');
        content=JSON.stringify(calls[0].input);
    } else content=blocks.filter(b=>b.type==='text' && typeof b.text==='string').map(b=>b.text).join('\n');
    return {content,model:response?.model,finish_reason:response?.stop_reason==='max_tokens' ? 'length' : response?.stop_reason};
}

module.exports={outputModes,formatFields,unsupportedFormat,withOutputMode,decodeOpenAI,decodeAnthropic,
    clearCompatibilityCache:()=>compatibility.clear()};
