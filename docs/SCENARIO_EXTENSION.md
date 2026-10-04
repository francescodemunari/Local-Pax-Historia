# Scenario extension

Unit catalog entries require a label; retired manpower/treasury cost fields are optional and validated only when present. Naval and air types can be created as staging formations with `landSpeed: 0`. In 1910 the bundled air type is a reconnaissance flight. The supplementary geography compiler maintains these public catalogs alongside Greenland and country colours. Operation orders may mobilise forces without separate recruitment wording.

Maintain substantive manifest `worldContext` and `simulationRules`, plus world and national briefings in `data/scenario-briefings.json`. The compiler preserves the shared world briefing. All model flows receive the actual player nation, capital and current campaign context. The menu exposes the starting situation. Leaders, institutions and starting diplomatic state still need broader research. See FLAGS.md for dated assets and coverage.

The menu includes Before the Great War (1910), geographic WWII (1936), and Multipolar World (2010). The three geographic bundles are atlas sandboxes with dated geography and era context; detailed historical economies and leadership still need research. See [geographic architecture](GEOGRAPHIC_MAPS.md) for the source pipeline. The engine supports these scenario-specific settings:

- `defaultStartDate`: one of `startDates`; used by the API and selection UI. When omitted, the first date is selected. Invalid calendar dates are rejected.
- `initialNationState`: optional map of nation codes to numeric starting `stability`, `warSupport`, `manpower`, `treasury`, and `politicalPower`. Stability and war support range from 0–100; other values range from 0–1 billion. These legacy numeric overrides remain readable for compatibility but no longer govern simulation or recruitment. Do not use them for new content. Formations still start empty.
- `unitCatalog.<type>.landSpeed`: optional SVG units per day from 0–100. Zero disables land travel. Without this field infantry defaults to 2 and armor to 4; other types cannot move over land. A scenario can define cavalry or other era-specific units without changing movement code.

`unitCatalog.<type>.landKmPerDay` optionally supplies a positive speed up to 1,000 km/day for geographic maps. Movement then uses great-circle distances between anchors. Bundled rates are balance values, not historical travel estimates.

Each bundle still needs its own map, nations, cities, historical context, optional regional metadata, and renderer. Use `data/scenarios/templates/manifest.example.json` as a starting point. Restart after manifest changes. JSON asset reads reuse parsed data while file size and modification time remain unchanged, keeping movement graphs reusable; save-specific occupations do not modify baseline assets.

The automated contract test uses an in-memory 1914 fixture to verify date selection, resource overrides, custom movement, and save isolation. This fixture is independent of the installed 1910 bundle. Geographic engine and browser tests additionally cover all three new scenarios, including recruitment, movement, reload, exact city projection, and label coverage.

Further content work: era-specific maps and labels, historical institutions and leaders, curated land connections, unit icons, and research-backed prompts. Campaign objectives and forced endings remain deferred. The final manual/live-model walkthrough belongs to the user.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).


## Runtime overlays — 17 September 2026

Saved nation profile fields and added cities overlay immutable scenario assets. Explicit non-playable is_territory_group entries may omit a capital marker; used only for documented incomplete historical sovereignty such as the 1910 Arabian gap. Do not use this exception for ordinary countries. Geographic gaps are supplemented reproducibly, not dynamically drawn by the model.
