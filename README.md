# Pax Historia — Local Grand Strategy

9 October 2026: Turn generation now negotiates structured output across all 19 provider presets, including local/custom endpoints and Claude. Explicitly unsupported formats fall back automatically and are cached per endpoint/model; authentication failures and outages are not retried as format errors. A bounded decoder recovers closing-bracket mistakes without changing keys, values or reports; ambiguous and truncated replies still cannot commit partial state. The recorded malformed Italy/Ethiopia response now resolves both fronts and air support in one mocked request. See [AI reliability](docs/AI_RELIABILITY.md#malformed-turn-json--9-october-2026).

9 October 2026: Next important event no longer treats a missing milestone as permission to advance a full year. Sparse replies pause at an explicitly labelled progress checkpoint, keep unfinished fronts active and exclude later predictions. The recorded Italy/Ethiopia response now stops on 15 February instead of 31 December. See [AI reliability](docs/AI_RELIABILITY.md#next-event-coverage-checkpoints--9-october-2026).

A local historical strategy sandbox with AI-generated events, diplomacy and advice. Choose **Before the Great War — 1910**, **World War II — Geographic Map (1936)**, or **Multipolar World — 2010**. WWI now starts on **1 January 1910**, giving you several years to shape events before a possible war. WWII remains the default, starting on 1 January 1936.

Current supported gameplay, verification and remaining limits are listed in [playability scope](docs/PLAYABILITY.md).

Country references now accept exact scenario codes, saved names and declared aliases. An omitted campaign target can be recovered from its saved operation, linked war order or unambiguous mapped front/battle evidence; other countries mentioned in an order do not automatically become targets. Unknown or conflicting identities still require correction. The recorded missing-target reply has a regression covering a strategic world-event stop, continued operations and annexation, with one model generation per turn.

4 October 2026: named neutral countries supply their provinces and political situation to turn context. Dated battles and diplomatic effects execute chronologically. Peace closes the offensive and clears its support missions; a completed order cannot restart the war. Annexed governments cannot enter new wars or alliances. Battle reports can persist formation condition losses, destruction and connected enemy territorial gains. Playback removes destroyed formations and reveals enemy gains during the corresponding report. Province control snapshots and country counts use one-pass indexing. The complete mocked backend suite passed; no browser or live-model tests were performed.

## Features and limits

The centered home library has **Scenarios** and **Recent Games** tabs. Recent campaigns show their nation, scenario, date and turn with a Resume action; the full Load Game manager remains available.

- Geographic country borders, real city coordinates and named provinces. Hover retains country colour with a thin muted outline; no rectangular grid. Capital icons and names disappear at overview zoom and nearby labels are suppressed to prevent overlaps.
- Eighteen local/cloud AI provider presets plus a custom OpenAI-compatible endpoint. Automatic URL filling, fetched model choices and manual model IDs.
- Editable AI-generated action drafts, queued orders, diplomacy and strategic advice. Turn events play one by one with camera focus and manual next/finish controls.
- Order-driven recruitment and disbanding, controlled-land movement, bilateral war, peace and alliances. New games start without tracked troops; resolved player orders create them.
- Persistent saves, territorial control, formation identity and protection against conflicting turn updates.

This is a playable prototype. Province shapes use **modern Natural Earth administrative boundaries clipped to dated country borders**, so historical internal divisions remain approximate. Numerical resource mechanics are disabled; capacity and constraints are described in events. Detailed historical economies and leaders need research. Ground campaigns resolve connected land movement and territorial control. Detailed tactical combat and sea/air transfers are not implemented. Campaign endings are deferred.

## Run locally

Install Node.js 20 or newer, then run:

```text
cd backend
npm ci
```

On Windows, launch `server.bat` from the project root. Alternatively run `node server.js` from `backend/`. Open [the game](http://localhost:3000).

For a lightweight setup on another PC, use a shallow clone to skip older repository history and install only gameplay dependencies:

```text
git clone --depth 1 https://github.com/francescodemunari/Local-Pax-Historia.git
cd Local-Pax-Historia/backend
npm ci --omit=dev
```

Then launch `server.bat` from the project root. The playable maps, flags and portraits are included; Python and map downloads are unnecessary for playing. AI keys/settings, `.env`, saves and debug output stay local and are ignored by Git. Configure your own AI provider after starting. To transfer an existing campaign, copy its `data/saves` file privately; saves are not uploaded to this public repository.

Only one backend can use port 3000. If it is occupied, use the already-running game or close its original server window before restarting. Startup reports conflicts without killing another application.

Optional defaults: copy `backend/.env.example` to `backend/.env`. `PORT` controls the backend port; `LLM_API_URL` and `LLM_MODEL` supply initial model defaults. Saved AI settings take precedence.

## Configure AI

Open **AI Settings**, select a provider, enter its key if required, and click **Fetch Models**. Choose a chat model or type its exact ID. **Test Connection** makes a small inference request; **Save Settings** applies the configuration immediately.

Local presets: LM Studio, Ollama, llama.cpp, vLLM, LocalAI and Jan. Cloud presets: OpenAI, Gemini, Claude, OpenRouter, Groq, Together AI, Fireworks AI, DeepSeek, Mistral AI, xAI, Cerebras and Hugging Face. Custom endpoints must implement the OpenAI-compatible chat API.

Local servers must be running with a model available. Cloud model access depends on your account. Discovery does not guarantee reliable game-event generation. Saved secrets are reused only for the same provider and endpoint. See [AI provider details](docs/AI_PROVIDERS.md).

## Maps and existing saves

New campaigns use provinces. Older geographic sector saves load archived assets; existing 1914 campaigns retain their original date and map. These compatibility bundles are hidden from new-game selection.

The **illustrated WWII legacy map has been removed**, along with its dedicated data, converters and label coordinates. Its save files remain untouched but are no longer playable in this version; use an older checkout if needed. They are never silently converted to another map.

See [Geographic maps](docs/GEOGRAPHIC_MAPS.md) for sources, historical limits and rebuilding. Credits are also linked inside the game.

Optional map-source downloads and editable `geography.geojson` build outputs are excluded from Git, saving about 195 MiB. Game-ready province data and renderer maps remain included, including old-save compatibility bundles.

## Development

```text
cd backend
npm test
```

Tests cover providers, startup conflicts, scenario switching, scenario assets, geometry, saves, formation changes, diplomacy and HTTP behavior using mock AI responses. Final campaign and live-provider walkthroughs remain manual.

Rebuild geography with `npm run fetch:geography` and `npm run build:geography`; install `scripts/geography-requirements.txt` first. Python is needed for rebuilding, not normal gameplay. `npm run test:geographic-browser` is a separate browser regression suite.

```text
backend/                 API, game engine and provider adapters
frontend/                Game UI, map renderer and compiled SVG maps
data/geography/          Pinned sources, dated builds and control overlays
data/scenarios/          Versioned manifests and runtime assets
data/saves/              Local campaigns (ignored)
scripts/                 Compiler and regression checks
docs/                    Readiness and maintenance documents
```

Start extensions with `data/scenarios/templates/manifest.example.json`. Each scenario needs its own date, map, nations, cities, renderer, context and unit catalog. See [scenario extension](docs/SCENARIO_EXTENSION.md), [map readiness](docs/MAP_READINESS.md), [release readiness](docs/RELEASE_READINESS.md) and [cleanup notes](docs/CLEANUP.md). Docs and maintained scripts belong in version control; generated output, dependencies and local settings/saves are ignored.

## Sources and licensing

This personal project is separate from the original Pax Historia product. Geographic bundles adapt [CShapes 2.0](https://icr.ethz.ch/data/cshapes/) under **CC BY-NC-SA 4.0**, including its noncommercial restriction. Natural Earth inputs are public domain. See [source attribution](docs/GEOGRAPHIC_MAPS.md#source-data-and-licensing) before redistribution.

Map display optimization uses simplified drawing paths, compact map responses and delegated pointer events. Gameplay geometry and save region IDs are unchanged. See [performance notes](docs/MAP_PERFORMANCE.md).

### Latest reliability and rendering changes

Geography now uses cached canvas tiles with spatially indexed province selection, reducing map painting during navigation. Ownership updates invalidate the tiles; region IDs and saved campaigns are unchanged. See [map performance](docs/MAP_PERFORMANCE.md).

Malformed AI event JSON leaves the turn unadvanced with a retry explanation. Invalid recruitment/movement/disband proposals produce persistent explanations. Explicit disband orders remove the selected existing formation. See [AI reliability](docs/AI_RELIABILITY.md) and [formation rules](docs/MOVEMENT.md).

Planning returns concrete orders to edit before sending. Completed orders leave the Actions queue; outcomes and obstacles appear in events without approval ratings. Each scenario supplies a starting briefing to simulation, planning, advice and diplomacy. Numerical stability, war support, treasury and recruitment costs no longer govern turns.

Tile painting runs in a background worker where supported, with a canvas fallback. Country flags use local dated assets; see [flag coverage and licenses](docs/FLAGS.md). Bhutan has no verified pre-1949 asset and displays its country code. Restart the backend and reload the browser after this update.

## Operational forces and atlas follow-up

Military operation orders can now mobilise the previously untracked forces needed to attempt them, without requiring a separate recruitment order. All public scenarios include naval and era-appropriate air formations; existing troops are reused first. Placement still requires controlled territory. Ground invasions now use persistent campaign orders; only engine-confirmed captures count. Tactical casualties and sea/air transfers remain unsupported.

Greenland is supplied from Natural Earth with 135 province/island components under the Danish realm. Internal boundaries are modern approximations, including in historical scenarios. Existing region IDs remain unchanged. `scripts/complete_geography.py` maintains this supplement, country palettes and display simplification; the main compiler runs it automatically. Major country colours now use curated cartographic choices (not official state colours), with an era-specific Soviet palette.

Unchanged provinces no longer repaint the country base; only occupation colour overlays paint separately. Worker paths are created lazily, coast/base drawing paths are simplified and offscreen nation labels are removed from the active map. These changes reduce drawing and DOM work; actual frame rate depends on hardware.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](docs/CAMPAIGNS.md).

Compact ownership refreshes preserve province anchors and geographic paint metadata, preventing event-camera fallback and unnecessary province painting after a turn. Deployment events retain a snapshot of their original staging position even when the campaign subsequently moves the formation.


### Diplomacy, orders and campaign reliability — 17 September 2026

Diplomatic chats show dated flags and country names. Suggested actions are editable in place with Queue/Delete controls and are cleared on game changes. Next important event searches up to 365 days for a strategic milestone, such as surrender, a decisive campaign turning point or an important world development. Routine battles and province captures progress within the skip. Campaign movement is revealed province by province. The live response schema includes campaign orders, with one repair attempt for incomplete operations; failed responses preserve queued orders. See [campaign rules](docs/CAMPAIGNS.md) and [AI reliability](docs/AI_RELIABILITY.md).


### Map caching and contested campaigns — 17 September 2026

Map tiles now retain a 32 MiB cache for revisited areas and begin painting newly exposed tiles while panning. Recent chat previews occupy at most two lines. The WWII Aden Protectorate geography gap is filled with British-controlled provinces. Italy and Ethiopia begin the 1936 scenario already at war. Contested provinces mobilise defenders and require combat/supply time; attackers suffer abstract attrition. Playback shows dates within the turn and sorts events chronologically. See [campaign limitations](docs/CAMPAIGNS.md) and [map performance](docs/MAP_PERFORMANCE.md).


## AI campaign and world-state update — 17 September 2026

Combat now uses AI-authored battle reports and structured movement/support effects, replacing automatic defenders and fixed resistance timers. Recruitment no longer adds event cards. Connected captures and explicit surrender update the saved map; air missions are attached to actual formations. See [campaign rules](docs/CAMPAIGNS.md).

Nation names, leaders, ideology, ruling party and capital relocations can be persisted by the Game Master. New named cities must belong to mapped controlled provinces; omitted coordinates use an explicitly approximate province anchor. Map cities, nation panels and diplomatic context share these saved records. The always-visible player flag opens real province/formation counts and relations; unrecorded historical profile fields are hidden. Empty province logistics/details and Defend were removed.

Camera release no longer rebuilds nation labels after every pan; hidden SVG geometry remains fixed in size and hover hit-testing runs in the map worker. The 1910 Arabian gap now has 48 selectable approximate provinces grouped as local administrations, not an invented empty wilderness or a claim of exact historical sovereignty. Existing saves gain this group on load. Run `python scripts/supplement_arabia.py` to rebuild it.

Limitations: historical leaders are not fully curated, Arabian political boundaries remain approximate, air rebasing/sea transport are not implemented, and arbitrary new sovereign states or geometry creation are not yet supported. Live AI pacing and camera responsiveness still need player verification.


18 September follow-up: active campaigns require a battle/held-front report or explicit pause/cancel. Requested air participation requires a mission or an explanation. Battle effects resolve in date order; surrender dates are bounded to the turn. The system response example now includes battle orders and political/city fields, avoiding a conflict with the expanded turn instructions. World summaries use province counts rather than duplicating every major power's province catalog.

## Campaign recovery, leadership and map updates — 18 September 2026

Repeated campaign starts now reuse the existing campaign identity. Missing battle reports get one repair attempt; if still absent, the turn records an explicit unresolved update with no invented combat movement or conquest. Other invalid effects still fail validation. This addresses the campaign-report error without requiring a provider change.

The player button uses a larger flag. The nation panel displays recorded leadership, head of state, ruling party and ideology, with starting leadership records for all 310 playable nation/scenario entries across the three eras. Matching local portraits cover 278 starting entries, with additional images for scheduled successors. Players can upload or remove a portrait for their current leader; an image prompt helps import externally generated portraits. See [leadership and portrait coverage](docs/LEADERSHIP_AND_PORTRAITS.md).

The map worker cancels obsolete queued tiles and prioritizes the latest view. The deepest zoom reuses enlarged cached tiles instead of rendering another full resolution level; tile opacity fading is disabled. Arabian coverage now includes northern and Gulf gaps. Historical boundaries remain approximate. Browser performance and final gameplay verification are left to the player.

## Map, battle consistency and leadership — 19 September 2026

The hidden SVG reference is now detached from Leaflet after geometry bounds are cached. Captures replace tile pixels when ready instead of removing the visible map first. All ground routes and air-support missions in a battle can animate during manual playback; air units return visually to their base.

Follow-up “advance” orders now receive the same front/air checks as attacks. Each requested front needs a real formation, movement or a visible held/blocked explanation. Campaigns retain their original order and latest front information. Narrative-only player battle events are omitted; actual campaign reports carry the map effects. Outcomes remain AI-adjudicated, with no forced victories or automatic defenders.

Starting leadership covers all playable nations in all three eras; 278 starting entries have credited local portraits. A reusable dated importer, 492-person portrait catalogue and coverage report document sources and remaining image/political-detail gaps. Recorded successions update the leader and matching portrait unless the saved campaign has changed that nation's politics. See [leadership and portraits](docs/LEADERSHIP_AND_PORTRAITS.md). Browser checks and final gameplay verification remain with the player.

## Label, portrait and campaign follow-up — 20 September 2026

Detached map geometry now uses canvas polygon containment for label anchors and territory sizing, preserving the faster map without forcing labels onto capitals. The nation popup resolves catalogue portraits and dated profiles. Routine historical government changes apply silently.

Battle references using a known source action ID are normalized to their campaign ID; unknown references request repair rather than silently dropping a battle. Next-event dates follow the earliest strategic milestone or major world development. The engine calculates elapsed duration and selects effects through that day. Later predictions are excluded and unfinished orders continue. The bounded search is 365 days, with no artificial world-event quota for an early stop. Unresolved campaign notices and routine fighting are not counted as major events.

## Coastlines, Kuwait and next-event resilience — 20 September 2026

All three maps now use their mapped country boundaries as the visible coastline. The separate Natural Earth background caused the non-selectable dark strips and is removed. Ten selectable province fragments fill the 1910 Moroccan gaps; eight supply the missing 1936 Sheikhdom of Kuwait, with Kuwait City, recorded leadership and a credited historical flag. Existing saves acquire the added state on load. These supplements preserve existing province IDs and use approximate modern internal boundaries, not exact historical subdivisions.

Rendering splits distant islands into independent components while keeping polygon holes intact. Worker picking reuses a canvas and searches a spatial index instead of scanning every province, reducing work particularly on the modern atlas. No browser performance measurements were taken.

Next-event validation accepts numeric strings and derives omitted duration from significant dated outcomes or a bounded progress checkpoint. Missing milestone metadata never authorizes a full-horizon jump. Unknown operations and invalid movements still require repair. Failed model replies are retained in the local diagnostic file, so it no longer shows an unrelated previous success.

## Historical front validation — 21 September 2026

Fixed a false “Somalia front is missing” rejection: province IDs encode administrative source geometry, not historical sovereignty. A valid Italian-controlled Somali staging province may contain an Ethiopian source code. Front validation now uses the explicit front name, current control and actual ground formations. The model receives province areas and adjacent foreign provinces with their current controllers to choose meaningful staging and destinations.

An advance or retreat that repeats its origin as its destination is rejected inside the response-repair loop, with a second defensive check before applying battle effects. Stationary troops require a held-front report. The AI still decides battle outcomes; these checks do not fabricate victories or guarantee valid output from every model.


## Unified military operations — 21 September 2026

The Game Master now describes each operation's fronts, new formations and battle reports together. New formations declare stable turn-local references shared by their movements and air missions; the engine assigns permanent unit IDs. Existing saves and the older flat response format remain supported.

Validation collects operation issues together and checks next-event timing and world coverage in the same pass. When only military output is invalid, the single repair request replaces the military section while the engine preserves world events, diplomacy and elapsed time. Routes and battle effects are previewed on a disposable state before accepting the model response. Battle cards include a factual list of the movements, support missions and captures actually applied.

Both turn modes have mocked end-to-end coverage for the reported invented-unit/missing-front/missing-air failure, alongside route repair. The complete backend test suite passed. No browser or live model calls were used. See [operation contract](docs/OPERATION_CONTRACT.md) for the schema and remaining limits.


## Partial campaign progress — 21 September 2026

A ready front no longer has to move merely because another front has a battle. Next-important-event turns can stop at the first theatre's event while other orders remain active. Fixed-duration turns request one correction for missing outcomes; if only those omissions remain, verified effects apply and the unreported work carries forward. Invalid identities, geography and effects still prevent committing the turn.

Active campaigns in Actions show each front's reported, held, blocked or awaiting-outcome status. Unreported work is saved and supplied to subsequent turns, without a fabricated battle, hold reason or extra event card. Standing active campaigns may mobilise missing formations without another player order; paused campaigns cannot. The full automated suite passed, including a regression fixture from the actual failed response in both time-skip modes. No browser or live-provider checks were used.

Follow-up turns retain outstanding fronts without resubmitting the order. New player instructions can explicitly narrow an operation; ordinary partial reports cannot silently discard its other fronts. Regression coverage includes a previously unreported front advancing and capturing territory on the following turn.

Follow-up verification (27 September 2026) also covers persisted scope changes and mixed standing-campaign/new-action resolutions. A campaign report appearing first in the model response no longer prevents a later pending action from being processed.

## Turn recovery and smaller model context — 3 October 2026

Turn instructions now use one operation format, a single province table and recent event summaries without playback geometry. The sampled WWII context fell from 129,335 to 49,167 serialized characters (62%); this measures input size, not live model latency. Pending orders and saved unfinished campaigns remain explicit priorities.

Next-event duration follows the earliest actual strategic milestone date. For example, 14 January is 13 elapsed days after 1 January, regardless of a model's redundant day count. Partial corrections can omit `events`, matching the repair instructions. After one correction, a wholly omitted order with no attributable effects stays pending and returns automatically in the next turn's context. Invalid current routes and identities still reject the turn. Later predictions are excluded from the selected interval. No conquest is invented to fill missing output.

Regression checks replay the actual omitted-order response, accept a valid partial correction, retain omitted orders through save/reload, and cover short checkpoints without extra event cards. Local numeric diagnostics record request count, prompt sizes, provider wait time and processing time for successful and failed generations in `data/debug/last_turn_diagnostics.json`. See [AI reliability](docs/AI_RELIABILITY.md) and [operation contract](docs/OPERATION_CONTRACT.md). Browser and live-provider verification remain with the player.

Next-event follow-up: the engine now selects a timeline through the first significant event instead of asking the model to remove later developments. Later battles, surrender, diplomacy, formation changes and dated state patches cannot apply early. Mobilisation already due can proceed, and unfinished fronts remain standing orders; future-only queued actions stay pending. Later battle predictions are reconsidered next turn from the saved world rather than stored as predetermined victories. The actual day-14 news/day-25 north/day-40 south reply has a one-generation regression, including subsequent southern movement and air support without another player order. Missing empty proposal arrays and battle replies without an ordinary event list no longer require a model correction.

The current-state API also resolves the effective player profile correctly, including saved nation-name and ruling-party changes; an undefined variable previously broke that endpoint. HTTP checks cover starting leadership and those saved changes.

Strategic skip and force continuity (3 October 2026): ordinary battle reports are moderate events. Explained major/critical campaign turning points, verified surrender and important world events qualify as strategic milestones; incomplete responses now use the bounded checkpoints described above. The search extends to one year in a single generation, with no added model request. Ground formations can make successive dated advances; each route starts at the last destination and must fit the time between reports. Exact saved IDs repeated in a formations list or supplied as `formation_ref` reuse existing troops without changing their attributes or creating duplicates. Unknown and ambiguous identities still fail safely. The actual three-month roster-repetition reply and long-campaign milestones have mocked regression coverage in `scripts/test_strategic_skip.js`. Final live gameplay verification remains with the player.

Surrender follows the Game Master's explicit decision, without a mandatory capital-capture or complete-occupation rule. The dated settlement transfers remaining territory and ends the campaign; it does not invent troop movements. An `annexation` operation describes an objective and can remain unfinished. The actual failed surrender reply now resolves in one mocked generation; `scripts/test_ai_surrender.js` also covers unfinished objectives and generic settlements. Historical plausibility remains the model's responsibility.
