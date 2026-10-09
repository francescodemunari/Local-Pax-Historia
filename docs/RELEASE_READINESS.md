# Release readiness

## 4 October 2026 playability pass

Public/portable packaging: optional map-source caches and editable GeoJSON outputs are ignored (about 195 MiB removed from the checkout). Required JSON/SVG maps, hidden compatibility bundles, flags, portraits and attribution remain shipped. Node 20+ setup and runtime-only dependency installation are documented, and the Windows launcher explains missing Node/dependencies. Provider settings, environment files, saves, debug output and installed dependencies are excluded.

The README recommends `git clone --depth 1` for another PC, avoiding downloads of older repository history. This preserves the current playable snapshot; historical dependency files remain in older commits rather than being removed through a history rewrite.

Verification used a fresh archive of tracked files in an isolated directory: `npm ci --omit=dev` installed 99 packages, and the full `npm test` suite passed with default AI settings and no optional source/GeoJSON caches. No browser or live-model calls were used. The resulting tracked checkout is about 225.5 MiB; map rebuilds need the separately fetched inputs.

Target-identity follow-up: the latest model reply omitted its campaign target while supplying both fronts and reports. Canonical country references and grounded missing-target recovery now handle this metadata gap generically. Regression coverage includes the real response, earlier world-event stopping, standing continuation, settlement, aliases, ambiguity and identity conflicts. No live model or browser check was used.

The complete mocked backend suite passed. New real-map regressions cover neutral named-country context, chronological battle/peace execution, peace without a battle report, save/reload, preserved formation condition, cleared support missions, control counts and rejection of stale-war restarts in all three scenarios. Independent era fixtures cover retreat losses, destruction, connected enemy gains and impossible counterattacks. Manual playback logic is tested through code, with no browser or screenshot checks.

This closes additional campaign lifecycle and map-effect gaps. It does not establish universal correctness for every AI response or implement naval transport, aircraft rebasing, arbitrary new states or character custody. [Playability scope](PLAYABILITY.md) records the supported flow and remaining limits. Final live gameplay remains with the player.

Assessment updated 3 October 2026. Target: a reliable local, single-player historical strategy game with AI-adjudicated orders. This is a working prototype with a scenario framework, not yet a finished campaign experience. Existing uncommitted changes were retained.

## Completed in this pass

- Save revisions reject stale writes from simultaneous requests or delayed diplomacy responses. Rejected requests return HTTP 409 and can be retried after refreshing.
- Resolving a turn prevents competing save mutations and deletion. A delayed request cannot recreate a deleted save.
- Saves replace the previous file through a temporary file and rename; failed replacement preserves the previous file. This is not a backup or a guarantee against every power-loss failure.
- A corrupt save or unavailable scenario no longer prevents listing other saves. The original file is retained, and the server logs the skipped entry.
- Saves record modification time and list newest first.
- Calendar jumps use UTC and clamp month-end/leap-day dates.
- Null AI turn responses fail without advancing the campaign; omitted diplomacy topics work with the client's default null value.
- Unknown API routes and malformed JSON return JSON errors.
- Engine and HTTP regression tests cover these failures without contacting a paid or local model.

## Completed map follow-up

See [Map readiness](MAP_READINESS.md) for current province counts, source limitations and verification. New games use dated CShapes geography and named Natural Earth administrative provinces, compiled adjacency, true city coordinates and geographic label anchors. The illustrated WWII map and its dedicated validation have been removed. Earlier geographic campaigns use hidden compatible assets. In-app browser checks confirmed the three-option menu, 1 January 1910 date and a subdued Rome province selection; automated engine checks cover recruitment, movement and reload.

## Priority 1: complete the simulation contract

Orders update (3 October): new games start without formations. All orders queue without approval ratings; simulation returns outcomes and linked proposals. Missing outcomes request one correction; wholly omitted orders with no attributable effects remain queued while valid developments can apply. Resolved orders leave Actions. Invalid effects reject the turn without saving. Catalog, ownership and movement checks remain; resource gates are removed. See AI_RELIABILITY.md.

| Finding and evidence | Required implementation | Acceptance criteria |
| --- | --- | --- |
| Bilateral declarations of war and peace now persist symmetrically through resolved player orders, with opponent lists in model context and engine-authored confirmation events. Bilateral alliances now persist and current wars/allies appear in the nation panel. Relations, autonomous diplomatic changes, and detailed treaty terms remain incomplete. | Extend validated diplomatic proposals to these remaining outcomes and surface current diplomatic status in the nation UI. | Agreements change both participants consistently and survive reload; invalid proposals cannot alter another relationship. |
| Recruitment and movement to player-controlled regions now persist and produce engine-authored event confirmations. Movement preserves formation identity. | Implement combat losses and retreat; disbanding and deterministic land travel rules are implemented. Land routes and turn duration are now engine-validated; see MOVEMENT.md. Hostile destinations and sea/air transfers are rejected. | Orders produce visible, persistent formation changes; invented IDs and impossible destinations are rejected. |
| New 1910, 1936, and 2010 bundles have independently dated borders and context and qualitative starting briefings. Modern province boundaries approximate historical internal divisions. | Supply date-specific setup or explicitly label starts as alternate setups. Expand historically grounded institutions and context while keeping formations action-driven. | Each offered historical date produces a documented, coherent starting situation. |
| Numerical resources are disabled at the user’s request. | Keep economic capacity and constraints in narrative outcomes. | No hidden treasury, stability or manpower gate prevents an order. |

## Priority 2: reliability and usability

- Validate the complete AI response schema, including event text, dates, enums, and affected nations. Event text, enums, affected nations, identity, and source are now normalized; fully unusable event responses preserve the turn. The event panel separates AI narrative from engine results without numerical resource deltas. Further validation of model proposals and rejected effects remains.
- Improve concurrent-request UX: disable conflicting controls during turns, keep unsent diplomacy drafts, and offer refresh/retry for 409 responses. Current protection intentionally rejects stale work rather than merging it.
- Expose unreadable saves in a recoverable-save view; add backup/export/import with validation and scenario compatibility checks. The current list skips broken files and logs the reason.
- Make scenario version compatibility explicit. Geographic sector saves and earlier 1914 games select compatible hidden bundles. Illustrated-map saves are unsupported after removal of that map. Future incompatible versions still need an explicit migration policy.
- Verify first-run model setup, timeout/retry behavior, offline/reconnect handling, keyboard navigation, and small-window layouts in a browser. Map visual and interaction QA is complete for the tested desktop sizes; full gameplay, accessibility, and live-model QA remain.
- Turn completion now uses a save-scoped, deduplicated playback path for REST and WebSocket responses.

## Priority 3: release packaging

- Windows startup now handles occupied ports without an unhandled WebSocket error. The launcher uses an absolute entry point; stop/restart matches this project's Node command and rechecks process identity instead of killing port owners. Manually started relative-path instances must be closed in their original terminal. A port-conflict regression test verifies the other application stays running.
- Leaflet is now served locally. Optional web fonts use nonblocking loading and system fallbacks; bundle fonts too if identical offline typography is a release requirement.
- Repository cleanup now excludes previously tracked dependencies, environment/provider settings, and debug output while retaining local copies. Removed unused assets, the orphaned converter package, and unused backend dependencies. See `CLEANUP.md`. Existing Git history is unchanged.
- Establish CI for `cd backend && npm ci && npm test`, supported runtime versions, a release version, and reproducible installation instructions.
- New geographic data has documented CShapes CC BY-NC-SA 4.0 attribution and Natural Earth public-domain credits, also linked in the map UI. Commercial distribution requires different rights or a replacement border source.

## Release gate

Campaign objectives, victory/defeat, and forced endings are deferred at the user's request. They are not a release requirement for the current work.

The user will perform the final manual walkthrough and live-provider verification. Development continues with targeted automated regression checks. Suggested user walkthrough: installation, provider configuration, nation selection, orders, diplomacy, multiple turns, territorial/unit changes, save/reload, provider failure and retry. The new eras are playable atlas sandboxes; detailed historical content review remains outstanding.

## Province and provider update

New games use named province shapes and subdued hover outlines. Eighteen provider presets plus custom endpoints support automatic URLs and live model discovery, with keys scoped to provider and endpoint. See AI_PROVIDERS.md and GEOGRAPHIC_MAPS.md. WWI now opens on 1 January 1910 with its own dated geography and prewar context. The illustrated WWII map and dedicated tooling are removed. Startup shares validated geographic assets across routes to avoid repeated parsing.

## Home and rendering update — 15 September 2026

The home library now centers scenario cards and offers a Recent Games tab with resumable campaigns, refresh and empty/error states. Capital icons hide below zoom 2.25; capital names appear from 2.75 with overlap suppression. Display paths use a 0.004-degree simplification tolerance while canonical geometry, adjacency, IDs and anchors remain unchanged. The map API can omit duplicate path strings for the browser. See [performance measurements and limits](MAP_PERFORMANCE.md).

## Cached renderer and reliability follow-up

The visible map now uses cached canvas tiles and spatially indexed province picking, retaining a single hidden geometry reference. Search selection and direct clicks after dragging were checked in the browser; tile wrapping, coordinate origins and ownership color refresh have targeted regression coverage. See [MAP_PERFORMANCE.md](MAP_PERFORMANCE.md).

The automated suite also covers robust event JSON parsing, explicit disbanding and persistent rejected-proposal explanations. See [AI_RELIABILITY.md](AI_RELIABILITY.md). This does not complete combat, historical province research or the user-owned final playtest.

## Actions, briefings, flags and worker rendering

Concrete editable planner drafts replace generic advisor replies. Turn playback focuses located events and offers pause, next and finish controls. Completed orders leave the queue. The header status dot and redundant Actions map search are removed. Initial briefings reach all model contexts. Flags are local and dated; see FLAGS.md for coverage and exceptions. Worker tile rendering and batched nation-label measurement reduce main-thread work. Automated tests and a mock browser campaign cover these changes; live-provider and final campaign checks remain with the user.

## Operational forces and atlas follow-up

Military operation orders can now mobilise the previously untracked forces needed to attempt them, without requiring a separate recruitment order. All public scenarios include naval and era-appropriate air formations; existing troops are reused first. Placement still requires controlled territory. Ground invasions now use persistent campaign orders; only engine-confirmed captures count. Tactical casualties and sea/air transfers remain unsupported.

Greenland is supplied from Natural Earth with 135 province/island components under the Danish realm. Internal boundaries are modern approximations, including in historical scenarios. Existing region IDs remain unchanged. `scripts/complete_geography.py` maintains this supplement, country palettes and display simplification; the main compiler runs it automatically. Major country colours now use curated cartographic choices (not official state colours), with an era-specific Soviet palette.

Unchanged provinces no longer repaint the country base; only occupation colour overlays paint separately. Worker paths are created lazily, coast/base drawing paths are simplified and offscreen nation labels are removed from the active map. These changes reduce drawing and DOM work; actual frame rate depends on hardware.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).


## 17 September 2026 follow-up

Implemented inline draft editing/deletion, save-isolated drafts, diplomatic flags/names, bounded next-important-event advancement, repaired campaign output schema and province-by-province playback. Mocked tests cover missing-front validation, schema repair, turn preservation, two-front routes and annexation. Live model quality, campaign balance and final user playtesting remain open. See CAMPAIGNS.md and DIPLOMACY_AND_EVENTS.md for limitations.


## 17 September 2026 resistance/performance follow-up

Added bounded tile reuse, compact chat previews, the Aden gap supplement, initial Italy–Ethiopia war, contested-province defenders/attrition and event dates within turns. Targeted checks cover cache invalidation/memory, one-month resistance, preserved progress, bilateral war initialization and date bounds. Combat remains an abstract delay/attrition system; final live-model balance and hardware-specific map smoothness need user playtesting.


## Latest changes — 17 September 2026

Automatic combat replaced by AI-adjudicated battle orders, silent recruitment, air missions, generic remaining-province objectives and explicit surrender. Saved profile/city/capital changes and simplified nation/province panels implemented. Camera-release layout/hit-test work reduced; 1910 Arabian coverage added as documented abstraction. Full mocked test suite passed; scenario validation and geometry checks passed after supplementation. No paid/live model requests were made. Player playtest remains necessary for battle narrative quality, pacing, existing-save recovery and actual camera latency. This is not a claim that every historical profile or all forms of geopolitical transformation are complete.


18 September follow-up: active campaigns require a battle/held-front report or explicit pause/cancel. Requested air participation requires a mission or an explanation. Battle effects resolve in date order; surrender dates are bounded to the turn. The system response example now includes battle orders and political/city fields, avoiding a conflict with the expanded turn instructions. World summaries use province counts rather than duplicating every major power's province catalog.

## Campaign recovery and leadership — 18 September 2026

Campaign ID reuse and missing-report recovery have regression coverage. The first incomplete response requests repair; a remaining omitted battle outcome produces an unresolved notice without movement or conquest. Invalid geography and malformed effects still fail atomically. Starting political profiles, saved leadership overrides and portrait upload/removal have engine and HTTP tests. The Arabian supplement now has 48 provinces, and tile cancellation/latest-view scheduling have worker tests. Full backend tests passed with mocked providers; no live AI quality guarantee follows from that result.

Standing verification preference: the user performs browser and screenshot checks. Future development should use code/CLI checks without opening browsers or taking screenshots unless the user changes this preference. Final gameplay, portrait appearance and camera responsiveness remain user checks. See [leadership coverage and image credits](LEADERSHIP_AND_PORTRAITS.md).

## Front consistency and dated leadership — 19 September 2026

Regression coverage now includes north/south advance orders, explicit held-front explanations, requested air support, phantom battle suppression, animation of every ground/support route, detached geometry bounds and retaining capture tiles. The complete mocked backend suite passed; follow-up targeted checks cover the latest additions. There were no live game-provider calls, browser checks or screenshots. Real model narrative quality and map responsiveness remain user checks.

Leadership/portrait imports and dated successions are bundled local data. Coverage and remaining gaps are listed in `data/leadership-coverage.json`; see [leadership rules, sources and limitations](LEADERSHIP_AND_PORTRAITS.md). This is not yet exhaustive historical coverage for every nation and year.

Starting leadership is populated for all 310 playable nation/scenario entries. There are matching portraits for 278 starting entries; the full local catalogue includes 492 people with source/credit records. Political-party details, photographs and future succession coverage remain incomplete. Catalogue checks enforce starting-leader coverage, valid scenario IDs, chronological sourced transitions and local image presence.

## Follow-up regression fixes — 20 September 2026

Label containment works after SVG detachment; nation popups resolve catalogue portraits; routine successions are silent. Battle action-ID aliases and next-event date validation have regression coverage. CLI checks cover image HTTP delivery, geometry containment, campaign identity, silent leadership changes and next-event bounds. No browser/screenshot or live game-model checks were performed. Real AI pacing and visual verification remain player checks.

## Map coverage and next-event resilience — 20 September 2026

The complete mocked backend suite passed after the changes. Scenario validation and CLI coverage tests confirm selectable Moroccan/Kuwaiti gap points, Kuwait's capital, old-save migration and absence of the decorative coastal backdrop in all scenarios. Python checks confirm display splitting preserves holes, IDs and repeatability. Worker tests cover indexed picking; next-event tests cover omitted duration, numeric strings, quiet horizons and invalid bounds. Browser/screenshot checks remain with the player. Live model quality, actual camera latency and exact historical internal boundaries are not certified by these checks.

## Historical front regression — 21 September 2026

The complete backend npm test suite passed with mocked providers. Added a real-map regression for Italian-controlled Somali staging with an ETH source code, actual adjacent enemy destinations, enemy-staging rejection and stationary-advance rejection. Both turn modes share this operation validator. README and campaign/reliability documentation are updated. No live model calls, browser checks or screenshots were used; actual AI narrative quality remains a gameplay check.


## Operation contract refactor — 21 September 2026

The complete `npm test --prefix backend` suite passed after the refactor. New end-to-end mocked tests run both next-important-event and one-month advances on real WWII map geometry. They verify combined diagnostics for invented IDs, absent southern movement and absent air support; one correction then applies both ground fronts and an air mission, preserves independent world news and timing, and records actual map effects. A disconnected destination is caught in execution preview and repaired before persistence. Duplicate references, explicit held-front reports and expiry of turn-local aliases are covered.

No browser, screenshot or live model calls were made. Provider adherence, prose quality, historical combat pacing and visual playback remain player checks. The changes do not implement arbitrary world editing, naval transport, character capture or a new combat simulator.


## Partial-progress regression — 21 September 2026

The complete backend npm suite passed. A sanitized fixture of the actual repeated failure now completes under next-event and one-month modes with the valid northern battle/air mission applied, southern troops unchanged, and a persistent awaiting-outcome record. The full-period test deliberately repeats the omission after repair. Additional checks cover arbitrary targets/fronts, standing air requests, later-turn retention without new orders, permitted standing recruitment, rejection of unauthorized disbanding/paused recruitment, and hard rejection of invented formation references. Frontend syntax checks passed; browser, screenshot and live-model checks were not performed.

## Follow-up continuity verification — 27 September 2026

Campaign tests and action-flow/frontend syntax checks passed after the continuity changes. The real-map regression now continues through a subsequent southern advance without a new player order, then applies a new instruction narrowing the campaign to that front. Save/reload checks confirm that the revised scope persists while the original order remains historical context. A mixed-resolution regression confirms that a standing campaign report cannot hide a newly queued civilian action's outcome. No browser, screenshots or live provider calls were used.

## Turn recovery and context reduction — 3 October 2026

The actual omitted-invasion reply now has regression coverage through the real WWII engine: a military-only correction without `events` is accepted, repeated omission retains the order, accepted world news uses its actual date, and the next turn receives the same queued action. Quiet horizons do not create an event card from a deferred-order notice. Later-effect rejection, safe civilian-order deferral, partial JSON parsing and numeric failure diagnostics are covered as well.

The complete `npm test --prefix backend` suite passed after these changes, using mocked providers. The sampled serialized WWII context is 62% smaller while retaining all supplied province IDs. This is an input-size measurement, not a live performance benchmark. At most one correction remains allowed. API connectivity alone cannot establish reliable battle adjudication, and retaining an omitted order cannot guarantee that the model will resolve it later. Browser, live-provider pacing and final campaign verification remain player checks.

## Next-event timeline selection follow-up — 3 October 2026

Replaced the hard rejection of later developments with engine selection through the first significant date. Added normalization for omitted/null empty proposal arrays and substantive battle replies without an ordinary event list. Reports-only standing operations can omit an empty formations array. Later predictions do not become early captures, surrender or political changes; future-only orders remain pending. In-window identity, ownership, route and surrender checks remain enforced.

The full mocked backend suite and follow-up campaign checks cover the saved day-14/day-25/day-40 response, one-generation resolution, mobilisation on both fronts, actual northern movement before a later southern battle, subsequent southern movement with air support, sparse flat/nested replies, scheduled civilian/military orders and safe rejection of invented current units. Browser and live-model tests were not performed. These results do not certify a finished game: narrative quality, combat pacing, unsupported naval transport/character custody and final player verification remain open.

The state-path review also fixed an undefined profile variable in `GET /api/game/state/:saveId`. The endpoint now uses the effective nation catalogue, including saved name and ruling-party changes. HTTP regression coverage checks both starting leadership and the saved overrides.

## Strategic milestones and formation continuity — 3 October 2026

Next-event skips now search up to 365 days for a real strategic milestone, keeping routine battles and province captures inside the interval. Battle severity defaults to moderate; major/critical turning points need an explicit significance explanation. Verified surrender is critical, and an earlier important world development takes precedence. The UI displays the longer limit and reports quiet-horizon completion. The model remains responsible for historical plausibility and strategic judgment.

Exact saved unit IDs repeated as new formation declarations are normalized to existing forces without duplicate recruitment or attribute changes. Successive campaign movements use increasing report dates, previous destinations and the actual time between stages. Unknown/ambiguous identities, impossible routes, same-date duplicate moves and unverified surrender remain blocked before a save is committed.

`scripts/test_strategic_skip.js` replays the actual three-month roster-repetition reply with one mocked completion and tests a long campaign ending in surrender, an earlier world milestone, and temporal feasibility on generic era maps. Updated next-event and timeline-selection regressions distinguish routine progress from important events. Browser, screenshots, live-model pacing and final gameplay checks remain with the player.

The complete `npm test --prefix backend` suite passed, including campaign, map, provider, persistence and HTTP integration coverage, with mocked model responses.

## Surrender decision boundary — 3 October 2026

Removed the hard capital-control/complete-occupation prerequisite for an explicit AI surrender. This was a gameplay assumption that rejected the latest actual response. Settlement now follows the AI's declared result, transferring remaining territory and ending the campaign without invented troop movement. Annexation objectives can remain unfinished with battle reports and saved front progress. Identity, date, route, explicit settlement declaration and manual-pause boundaries remain.

`scripts/test_ai_surrender.js` replays the actual failed reply with one mocked completion in next-event and fixed-duration modes, retains unfinished annexation objectives, and covers generic settlement cleanup and integrity boundaries. Browser and live-model checks remain with the player; model narrative quality and plausible surrender timing are not guaranteed by structural tests.

The complete mocked backend suite passed. Follow-up campaign tests also cover numeric surrender-date normalization for fixed-duration turns.
