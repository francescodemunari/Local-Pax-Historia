const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Resolve named countries for context, never infer a declaration or conquest.
function mentionedNations(orders, nations) {
    const texts = (orders || []).map(order => ` ${normalize(order.action_text || order.text)} `);
    return Object.entries(nations).filter(([code, nation]) => {
        const names = [code, nation.name, nation.name_local, ...(Array.isArray(nation.aliases) ? nation.aliases : [])];
        for (const name of [...names]) if (name) names.push(String(name)
            .replace(/^(?:kingdom|republic|empire|federation|commonwealth|state|sultanate|sheikhdom) of (?:the )?/i, '')
            .replace(/ (?:empire|republic|federation)$/i, ''));
        return names.map(normalize).some(name => name.length >= 3 && texts.some(text => text.includes(` ${name} `)));
    }).map(([code]) => code);
}
module.exports = {mentionedNations};
