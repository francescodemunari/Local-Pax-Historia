# Land movement

Ordinary transfer orders require a continuous route through player-controlled regions. The engine uses compiled geographic adjacency, finds the fastest eligible route, and checks its duration against the actual calendar days advanced. Ordinary transfers allow one move per turn and exclude newly recruited units. Strategic campaigns can advance newly deployed ground formations in the same turn and make successive advances at later report dates. Every subsequent route starts from the previous destination and must fit the intervening time; dated mobilisation also consumes available time. Same-date duplicate moves and mixing an ordinary transfer with campaign movement remain disallowed.

Geographic bundles use great-circle distances between province anchors, with catalog rates of 40 km/day for infantry, 60 for cavalry, and 80 for armor. These are game-balance rates. Shared geographic boundaries define connections; point contacts do not. Disconnected polygons have separate movement regions, preventing island fragments from bridging water.

Scenario catalogs can override these defaults with `landSpeed`, or enable other land unit types. See [scenario extension settings](SCENARIO_EXTENSION.md). Floating-point noise at exact whole-day boundaries is ignored so a four-day route does not incorrectly require five days.

Sea and air transfers are unavailable. Ordinary transfer routes cannot traverse foreign regions, even if the destination is friendly; campaign routes can enter the designated target’s territory. No military-access agreements or occupation by movement are implied. Unsupported routes and insufficient time leave the unit in place and produce a persistent “Movement not applied” event. Reissue the order with sufficient time when appropriate; ordinary transfers have no automatic travel queue. Persistent campaigns retain marching time across turns.

Applied events store the route and required days alongside the source order. Existing unit identity and strength are unchanged by movement. Tactical combat, detailed supply, terrain modifiers, transport capacity, and retreat remain separate work.

Targeted checks: `cd backend && npm run test:movement`. Final campaign and live-model verification belong to the user.

## Formation disbanding

An explicit player order can request disbanding an existing player formation. The model must link the proposal to that pending order and provide its action ID and exact existing unit ID. The engine removes the formation, records a confirmation event and persists the result. Numerical recruitment costs and resource refunds are disabled. A standalone transfer or disbanding can apply only once per formation per turn, and a newly recruited formation cannot also be disbanded that turn. Campaign advances follow the dated-report rules above. Invalid proposals produce an explanation. `npm run test:disband` covers authorization, duplicate prevention, persistence and removal of resource gates.

An invasion, defence, patrol or deployment order now authorizes appropriate mobilisation without separate recruitment wording. The AI can create ground, naval and air formations at controlled staging provinces, subject to era and available preparation time. It must reuse tracked forces first. Campaign orders connect these staging forces to ground advances and conquest. Sea/air travel remains unavailable. Model context includes controlled province names and locations to support staging decisions.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).


## Campaign movement update — 17 September 2026

Hostile movement is now proposed by the AI within a battle report, with real destination/unit IDs and a day offset. Connected route and minimum travel duration are validated; battle resistance/duration/losses are model decisions. No autonomous march or accumulated fixed resistance timer remains. Multiple front movements share one report. Air missions keep their base and store a target/mission, without ground conquest or air rebasing.
