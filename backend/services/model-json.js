// Accept JSON surrounded by model commentary without rewriting string content.
function parseModelJSON(content,{requireEvents=true,allowMissingEvents=false}={}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned no event data.');
    const source = content.replace(/^\s*<think>[\s\S]*?<\/think>/i, '');
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
                    if (requireEvents && allowMissingEvents && parsed.events == null &&
                        ['action_resolutions','campaign_orders','unit_changes'].some(key=>Array.isArray(parsed[key]) && parsed[key].length)) parsed.events = [];
                    if (Array.isArray(parsed[requireEvents ? 'events' : 'action_resolutions'])) return parsed;
                } catch {}
                start = end;
                break;
            }
        }
    }
    throw new Error('The model did not return valid event JSON. Your campaign has not advanced; retry the turn or choose another model.');
}
module.exports = { parseModelJSON };
