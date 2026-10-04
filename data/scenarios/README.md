# Scenario bundles

Each scenario is a versioned manifest under this directory. A save records its
`scenarioId` and `scenarioVersion`, allowing World War I, Cold War, or modern
scenarios to coexist without changing WWII data.

## Manifest contract

Every manifest requires a lower-case `id`, semantic `version`, `name`, `era`,
one or more ISO `startDates`, and assets for `nations` and `map`. Exactly one installed
manifest must set `isDefault` to `true`.

Asset paths are relative to `data/` and are constrained to that directory.
Required assets are `nations`, `map`, and `cities`; optional assets are
`regionMetadata` and `roadmaps`. The renderer must be an
`svg-overlay` with a root-relative SVG URL inside `frontend/`.

The map must include a valid `viewBox`, unique region ids, an SVG path and an
existing nation code for every region. Every nation needs exactly one matching
capital marker. Cities need unique ids, a valid nation code and `[x, y]`
coordinates inside their declared `region_id` shape. A city must share the baseline controller of that region; duplicate named places in one region are rejected. Optional `marker_anchor` values must lie inside their region and are used for formation placement. Every initial unit needs an existing
nation, a catalogued type, and an actual map `region_id`. The engine derives
its deployment point from that region; a supplied `centroid` is optional and
kept only as authoring metadata.

`regionAliases` is optional. Use it to migrate legacy city or theatre names in
existing saves to a current map `region_id`; aliases are checked against the
scenario map when the manifest is validated.

## Adding WWI or a modern era

1. Start with `templates/manifest.example.json` into a new uniquely named manifest.
2. Give it its own nation, map, city, roadmap, and optional metadata files under
   `data/`; do not alter WWII assets to make the new scenario work.
3. Put the scenario SVG in `frontend/` and set `renderer.svgUrl` to it.
4. Define an era-appropriate `unitCatalog`. New games start without tracked formations; the Game Master proposes recruitment through player actions. Do not add a starting roster.
5. Give the scenario an era-specific `worldContext` and `simulationRules`; these
   are passed to the Game Master instead of WWII assumptions.
6. Run `cd backend && npm test` before starting the server.

Do not reuse a save across scenario IDs. Retain an asset bundle when releasing a
new scenario version so existing saves remain loadable.

Public starts are 1910, 1936 and 2010. Hidden geographic bundles preserve earlier 1914 and sector saves. The illustrated WWII map is removed and its saves are unsupported. Restart the backend after adding or rebuilding scenarios.
