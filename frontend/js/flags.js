const countryFlags = {
    name(code) { return typeof gameMap !== 'undefined' ? gameMap.nationColors?.[code]?.name || code : code; },
    prose(value) {
        return String(value ?? '').replace(/\[([A-Z]{2,4}(?:\s*,\s*[A-Z]{2,4})*)\]/g, (match,codes) => {
            const parts=codes.split(/\s*,\s*/);
            return parts.every(code=>this.name(code)!==code) ? parts.map(code=>this.name(code)).join(', ') : match;
        });
    },
    data: {scenarios:{},flags:{}},
    async load() {
        try { const response=await fetch('/api/map/flags'); if(response.ok)this.data=await response.json(); }
        catch(error) { console.warn('Flag catalog unavailable:',error.message); }
    },
    resolve(code, scenarioId, date) {
        const key=(scenarioId||'').replace(/-sectors-v1$/,'').replace('ww1-1914','ww1-1910');
        const country=this.data.scenarios[key]?.[code];
        if(!country)return null;
        const bound=(value,end=false)=>{ if(!value)return end?'9999-12-31':'0000-01-01'; const clean=String(value).replace(/[?~]/g,''); return clean.length===4?`${clean}-${end?'12-31':'01-01'}`:clean.length===7?`${clean}-${end?'31':'01'}`:clean; };
        const matches=country.variants.map(id=>({id,...this.data.flags[id]})).filter(flag=>flag.periods?.some(p=>date>=bound(p.start) && date<=bound(p.end,true)));
        matches.sort((a,b)=>Math.max(...b.periods.map(p=>Number(String(p.start||'0').slice(0,4))))-Math.max(...a.periods.map(p=>Number(String(p.start||'0').slice(0,4)))));
        return matches[0] || this.data.flags[country.initial];
    },
    paint(element, code, scenarioId, date) {
        if(!element)return;
        element.replaceChildren(); element.style.backgroundColor='transparent'; element.classList.add('country-flag');
        const flag=this.resolve(code,scenarioId,date);
        if(!flag){element.textContent=code;element.title='No verified flag available for this country and period';return;}
        const img=document.createElement('img');img.src=flag.file;img.alt=flag.name;img.loading='lazy';img.decoding='async';
        element.title=flag.name; element.append(img);
    }
};
