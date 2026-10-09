// Recover closing-delimiter mistakes only. Never invent/drop a key or value,
// finish truncated output, or evaluate model text as JavaScript.
const ROOT_FIELDS = new Set(['events','action_resolutions','campaign_orders','unit_changes','diplomatic_changes','elapsed_days','consequences']);

function tokenize(source) {
    if (source.length > 256000) return null;
    const tokens=[];
    const pattern=/\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,])/y;
    let pos=0;
    while(pos<source.length) {
        pattern.lastIndex=pos;
        const match=pattern.exec(source);
        if(!match)return source.slice(pos).trim() ? null : tokens;
        tokens.push(match[1]);pos=pattern.lastIndex;
    }
    return tokens;
}

function consume(stack,token) {
    const next=stack.map(frame=>({...frame})),top=next.at(-1);
    if(!top)return null;
    if(top.phase==='key' || top.phase==='keyOrEnd') {
        if(token==='}' && top.phase==='keyOrEnd'){next.pop();return next;}
        if(!token.startsWith('"'))return null;
        const key=JSON.parse(token);
        if(top.keys.includes(key) || next.length>2 && ROOT_FIELDS.has(key))return null;
        top.keys=[...top.keys,key];top.phase='colon';return next;
    }
    if(top.phase==='colon') {
        if(token!==':')return null;
        top.phase='value';return next;
    }
    if(top.phase==='commaOrEnd') {
        if(token===top.close){next.pop();return next;}
        if(token!==',')return null;
        top.phase=top.close==='}'?'key':'value';return next;
    }
    if(top.phase==='valueOrEnd' && token===']'){next.pop();return next;}
    if(top.phase!=='value' && top.phase!=='valueOrEnd')return null;
    if(top.close===null && token!=='{')return null;
    if(['}',']',',',':'].includes(token))return null;
    top.phase=top.close===null?'done':'commaOrEnd';
    if(token==='{')next.push({close:'}',phase:'keyOrEnd',keys:[]});
    if(token==='[')next.push({close:']',phase:'valueOrEnd'});
    return next.length<=64 ? next : null;
}

function repairBrackets(source) {
    const tokens=tokenize(source);
    if(!tokens || tokens[0]!=='{' || tokens.at(-1)!=='}')return null;
    const queues=Array.from({length:5},()=>[]);
    queues[0].push({i:0,stack:[{close:null,phase:'value'}],edits:[]});
    let visits=0;
    for(let cost=0;cost<queues.length;cost++) {
        const candidates=new Map(),seen=new Set();
        for(const state of queues[cost]) {
            let {i,stack}=state;
            while(i<tokens.length) {
                if(++visits>50000)return null;
                const token=tokens[i],top=stack.at(-1);
                if(cost<4 && (token==='}' || token===']')) {
                    const enqueue=(index,frames,edit)=>{
                        const edits=[...state.edits,edit];
                        const key=JSON.stringify(edits);
                        if(!seen.has(key)){seen.add(key);queues[cost+1].push({i:index,stack:frames,edits});}
                    };
                    // Deletion keeps all non-delimiter tokens at the same level.
                    enqueue(i+1,stack,{at:i,remove:true});
                    // Insert only a missing inner close before a mismatched
                    // close. Never close the root or append at end-of-input.
                    if(stack.length>2 && top.close && top.close!==token) {
                        const closed=consume(stack,top.close);
                        if(closed)enqueue(i,closed,{at:i,insert:top.close});
                    }
                }
                const next=consume(stack,token);
                if(!next)break;
                stack=next;i++;
            }
            if(i!==tokens.length || stack.length!==1 || stack[0].phase!=='done')continue;
            const insertions=new Map(),removed=new Set();
            for(const edit of state.edits) {
                if(edit.remove)removed.add(edit.at);
                else insertions.set(edit.at,(insertions.get(edit.at)||'')+edit.insert);
            }
            const repaired=tokens.map((token,index)=>(insertions.get(index)||'')+(removed.has(index)?'':token)).join('');
            try {
                const parsed=JSON.parse(repaired);
                candidates.set(JSON.stringify(parsed),parsed);
            } catch {}
        }
        // Equally small repairs with different meanings must go back to the AI.
        if(candidates.size)return candidates.size===1 ? [...candidates.values()][0] : null;
    }
    return null;
}

module.exports={repairBrackets};
