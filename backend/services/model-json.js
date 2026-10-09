// Accept JSON surrounded by model commentary without rewriting string content.
const recovered = new WeakSet();
function parseModelJSON(content,{requireEvents=true,allowMissingEvents=false}={}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned no event data.');
    const source = content.replace(/^\s*<think>[\s\S]*?<\/think>/i, '');
    const accept = parsed => {
        if (requireEvents && allowMissingEvents && parsed.events == null &&
            ['action_resolutions','campaign_orders','unit_changes'].some(key=>Array.isArray(parsed[key]) && parsed[key].length)) parsed.events = [];
        return Array.isArray(parsed[requireEvents ? 'events' : 'action_resolutions']);
    };
    for (let start = 0; start < source.length; start++) {
        if (source[start] !== '{') continue;
        let depth = 0, quoted = false, escaped = false;
        for (let end = start; end < source.length; end++) {
            const ch = source[end];
            if (quoted) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') quoted = false;
            } else if (ch === '"') quoted = true;
            else if (ch === '{') depth++;
            else if (ch === '}' && --depth === 0) {
                try {
                    const parsed = JSON.parse(source.slice(start, end + 1));
                    if (accept(parsed) && !/^\s*[,\]}:]/.test(source.slice(end+1))) return parsed;
                } catch {}
                start = end;
                break;
            }
        }
        // Do not salvage an inner object from a truncated outer turn.
        if(depth!==0)break;
    }
    const first=source.indexOf('{'),last=source.lastIndexOf('}');
    if(first>=0 && last>first && /^(?:\s*```)?\s*$/.test(source.slice(last+1))) {
        const repaired=require('./json-brackets').repairBrackets(source.slice(first,last+1));
        if(repaired && accept(repaired)){recovered.add(repaired);return repaired;}
    }
    throw new Error('The model did not return valid event JSON. Your campaign has not advanced; retry the turn or choose another model.');
}
module.exports = { parseModelJSON, wasJSONRecovered: result => recovered.has(result) };
