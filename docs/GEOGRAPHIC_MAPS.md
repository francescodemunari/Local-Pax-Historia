# Geographic map architecture

New games default to **World War II — Geographic Map**, dated 1 January 1936. **Before the Great War — 1910** starts on 1 January 1910, and **Multipolar World — 2010** starts on 1 January 2010. These are playable atlas sandboxes with era-specific prompts and unit catalogs, not fully researched economic or leadership simulations. The illustrated WWII scenario has been removed; its saves, including saves without a scenario ID, are unsupported.

## Source data and licensing

Borders and dated national capitals come from [CShapes 2.0, ETH Zürich](https://icr.ethz.ch/data/cshapes/), using the Gleditsch–Ward date intervals. Attribution: Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann, and Kristian Skrede Gleditsch (2022), “Mapping The International System, 1886–2017: The CShapes 2.0 Dataset,” Journal of Conflict Resolution 66(1), 144–61. The data and adapted geographic outputs are **CC BY-NC-SA 4.0**: [licence](https://creativecommons.org/licenses/by-nc-sa/4.0/). These bundles must not be treated as unrestricted commercial map assets.

Province boundaries, city coordinate refinements and the neutral land background use [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), public-domain data. Files are pinned to repository commit `ca96624a56bd078437bca8184e78163e5039ad19`. All input hashes and download URLs are in `data/geography/sources.lock.json`. Source downloads are local build caches excluded from Git; fetch them once before rebuilding, then cached verified inputs support offline rebuilding. Compiled outputs were adapted on 14 September 2026 by repair, simplification, projection, subdivision, city matching, and explicit control overlays. No warranty of historical completeness is made.

Capital matching preserves the historical name and uses a nearby same-name Natural Earth location when available. The Delhi override follows the [New Delhi Municipal Council history](https://ndmc.gov.in/ndmc/history.aspx) and the [Delhi Assembly historical background](https://delhiassembly.delhi.gov.in/sites/default/files/2023-06/7thassemblywhoswho.pdf): Delhi for 1914 and New Delhi for 1936.

## Reusable layers

1. **Source geography:** WGS84 borders selected by the exact start date. No city coordinates are inferred from the old illustration.
2. **Scenario control:** `data/geography/ownership.json` groups dependent areas under their scenario controllers. Dominions and British India remain separately playable administrations. This is an explicit strategic control model, not a complete model of legal sovereignty. Reference context: [National Army Museum](https://www.nam.ac.uk/explore/commonwealth-and-first-world-war), [National Archives](https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/other-countries/).
3. **Provinces:** Natural Earth 10m admin-1 boundaries are clipped to each dated country polygon. Province names come from that source. Disconnected islands become separate movement regions; coastline differences are assigned to nearby provinces or explicitly named coastal areas. These are modern administrative divisions, so historical internal boundaries remain approximate. Stable source/fragment IDs, interior anchors and shared-border neighbors drive gameplay.
4. **Canonical outputs:** the builder writes editable `geography.geojson`, game-ready map/nation/city JSON, and a build report. Editable GeoJSON is a local build output excluded from Git; runtime JSON, reports and renderer SVGs are shipped.
5. **Display adapter:** SVG is generated from the same geographic data. Equirectangular projection uses `x=(longitude+180)*4`, `y=(90-latitude)*4`. Cities retain those exact projected coordinates, including near generalized coastlines; they are never silently moved inland. Borderless background land has no gameplay ownership. The browser parses this SVG once into a hidden geometry reference and cached canvas tiles; a spatial index handles province picking. See [rendering details](MAP_PERFORMANCE.md).

Continuous country fills sit under the clickable provinces, preventing antialias seams. Internal border strokes are hidden; hovered regions keep their colour with a thin muted outline, and selection uses a subtle gold outline, while administrative outlines and occupation colours remain visible.

The Leaflet UI and save/turn engine remain in place. Replacing working save and AI code would not fix geography. The geographic compiler replaces manual SVG editing while preserving the existing renderer contract. Backend movement uses explicit geographic adjacency and great-circle distances between anchors. Catalog travel rates are game-balance values: 40 km/day infantry, 60 cavalry, and 80 armor.

## Build and check

Install the pinned Python build requirements in `scripts/geography-requirements.txt`. From the repository root run:

```text
node scripts/fetch_geography.js
python scripts/build_geography.py
node scripts/validate_scenarios.js
node scripts/test_geographic_browser.js
```

Python is needed to rebuild assets, not to run the installed game. Add a date/id/name in `data/geography/builds.json` and a control overlay for that year before building another period. Dates outside the source coverage require another source adapter. Update era context and unit catalogs deliberately; copying an old scenario is not enough to produce researched historical content.

A fresh checkout plays without the roughly 195 MiB of source/editable geometry caches. Before running standalone completion/supplement scripts, fetch the locked inputs and rebuild the three public scenarios to regenerate their editable GeoJSON. The current build list does not regenerate archived 1914/sector bundles; their shipped runtime assets remain intact. The older `optimize_map_display.py` helper only processes bundles with local editable geometry and skips missing caches. `optimise_map_display.py` is the current runtime display optimizer used by the completion pipeline.

## Known limits

- CShapes does not cover every microstate or island. Neutral background land fills visual gaps without inventing sovereignty. The build report lists omitted cities whose nearest represented land is too distant.
- Source country names sometimes describe a historical series. Main power labels are normalized; minor administrative names still need editorial review.
- Coastlines are generalized. Small, annotated city-to-region offsets are permitted while true coordinates are retained.
- Numerical resources are disabled; scenario capacity is qualitative. Detailed leaders, economies, conflicts, transport, and combat remain separate work.
- Final campaign/live-model verification belongs to the user; the browser suite checks rendering, label coverage, coordinates, and scenario switching only.

## Existing campaigns

Version 2 uses provinces for new games. Version 1 geographic saves resolve to hidden, archived sector bundles; their region IDs, occupations and formations remain intact. These archives are runtime dependencies and must be shipped. Earlier 1914 geographic campaigns retain their hidden bundle. Illustrated-map save files remain untouched but cannot be played in this version.

## The 1910 opening

CShapes borders are selected for 1 January 1910. The AI context explicitly treats the Italo-Turkish War, Balkan Wars and Sarajevo assassination as future possibilities, not predetermined events. Qing China, Ottoman Libya and independent Morocco are retained. Nigerian and Rhodesian dependencies have British control overlays. The pre-union South African administrations remain separate: the [Union proclamation](https://www.nationalarchives.gov.za/node/7730486) took effect on 31 May 1910. British India uses Calcutta, the contemporary capital, with Kolkata coordinates; see the [1911 description](https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Calcutta). Modern provincial subdivisions still require period-specific research.

## Home and rendering update — 15 September 2026

The home library now centers scenario cards and offers a Recent Games tab with resumable campaigns, refresh and empty/error states. Capital icons hide below zoom 2.25; capital names appear from 2.75 with overlap suppression. Display paths use a 0.004-degree simplification tolerance while canonical geometry, adjacency, IDs and anchors remain unchanged. The map API can omit duplicate path strings for the browser. See [performance measurements and limits](MAP_PERFORMANCE.md).

Greenland supplements the CShapes coverage using the bundled Natural Earth admin-1 geometry. It is mapped within the Danish realm, with historical colonial status and modern autonomy described by [Denmark’s official overview](https://denmark.dk/people-and-culture/greenland). Modern province divisions remain approximate for all dates. The supplementary builder preserves other region IDs and adds disconnected island components without land bridges.

## Completion pipeline — 20 September 2026

Both `build_geography.py` and `complete_geography.py` now finish with Aden, Arabian, Morocco and Kuwait supplements, followed by display optimization for all three scenarios. Standalone updates: `python scripts/supplement_missing_land.py`, then `python scripts/optimise_map_display.py`. Canonical geometry is not simplified by display optimization. The independent gray land backdrop is no longer emitted. See MAP_READINESS.md for historical limitations and source references.
