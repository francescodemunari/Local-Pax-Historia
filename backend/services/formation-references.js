// New formation references live for one response only. Exact saved identities
// remain authoritative even when a model puts them in the alias slot.
function resolveFormation(reference, existing, recruits = []) {
    const hasId = typeof reference?.unit_id === 'string' && reference.unit_id.length;
    const hasRef = typeof reference?.formation_ref === 'string' && reference.formation_ref.length;
    if (hasId && hasRef && reference.unit_id !== reference.formation_ref) return {error:'Use either unit_id or formation_ref, not both.'};
    let matches;
    if (hasRef && !hasId) {
        matches = existing.filter(u => u.id === reference.formation_ref);
        if (!matches.length) matches = recruits.filter(u => u.formation_ref === reference.formation_ref);
    }
    else if (hasId) {
        matches = existing.filter(u => u.id === reference.unit_id);
        // Accept an explicitly declared alias in the ID slot, never guess from
        // a name, battle title, geographic direction or a fabricated ID.
        if (!matches.length) matches = recruits.filter(u => u.formation_ref === reference.unit_id);
    } else if (reference?.source_action_id && reference?.unit_type) {
        // Bound recruits also appear in the runtime roster. Count each saved
        // ID once without collapsing distinct, as-yet-uncreated formations.
        const roster=[...existing,...recruits.filter(u=>!u.id || !existing.some(e=>e.id===u.id))];
        matches = roster.filter(u =>
            (u.source_action_id || u.action_id) === reference.source_action_id &&
            u.unit_type === reference.unit_type &&
            (!reference.from_region_id || u.region_id === reference.from_region_id));
    } else return {error:'Supply an existing unit_id or a declared new formation_ref.'};
    if (matches.length !== 1) return {error: matches.length
        ? 'Ambiguous formation reference; give each new formation a unique formation_ref.'
        : `Unknown formation ${reference.unit_id || reference.formation_ref || reference.source_action_id}. Use an existing unit_id or declare and reuse formation_ref.`};
    return {unit:matches[0]};
}
// Some lightweight models repeat the current roster in formations using saved
// IDs. Treat these as declarations of existing forces, never as new recruits or
// instructions to change their type, location or other saved attributes.
function normalizeFormationDeclarations(result, context) {
    const existing = context.recruitment?.existingUnits || [];
    const reuse = formation => {
        const id = formation?.unit_id || formation?.formation_ref;
        const unit = existing.find(u => u.id === id);
        if (!unit) return false;
        const problem = formation.unit_id && formation.formation_ref && formation.unit_id !== formation.formation_ref
            ? 'Conflicting existing formation identifiers.'
            : formation.unit_type && formation.unit_type !== unit.unit_type ? `Existing formation ${id} cannot change unit_type through recruitment.`
            : formation.nation_code && formation.nation_code !== context.playerNation?.code ? `Existing formation ${id} belongs to the player.` : null;
        if (problem) { const error=new Error(problem);error.scope='military';throw error; }
        return true;
    };
    if (Array.isArray(result.unit_changes)) result.unit_changes = result.unit_changes.filter(u => u?.action !== 'recruit' || !reuse(u));
    for (const resolution of result.action_resolutions || []) {
        if (Array.isArray(resolution?.operation?.formations))
            resolution.operation.formations = resolution.operation.formations.filter(f => !reuse(f));
    }
    return result;
}
module.exports={resolveFormation,normalizeFormationDeclarations};
