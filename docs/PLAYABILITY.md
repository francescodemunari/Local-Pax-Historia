# Playability scope

11 October 2026: Important-event skips now target a significant decision for the player nation, with global news retained in the chronology. The model proposes a coherent stopping point and national consequence; the engine clips to supported outcomes or bounded progress. Earlier events in the latest unchanged turn offer [Play from this event](EVENT_CONTINUATION.md), restoring the saved date/world without another inference. [Improve wording](ACTION_WRITING.md) previews a draft rewrite for review and never queues it automatically.

10 October 2026: Routine diplomacy cannot qualify for an important-event stop solely because the model labels it Major. World milestones need a significance explanation; explicit discussion/proposal/preparation remains moderate news. The exact sanctions-debate response now pauses at reported campaign progress, preserving both fronts and air support. See [world milestones](AI_RELIABILITY.md#consequential-world-milestones--10-october-2026).

9 October 2026: Turn generation now negotiates structured output across all 19 provider presets, including local/custom endpoints and Claude. Explicitly unsupported formats fall back automatically and are cached per endpoint/model; authentication failures and outages are not retried as format errors. A bounded decoder recovers closing-bracket mistakes without changing keys, values or reports; ambiguous and truncated replies still cannot commit partial state. The recorded malformed Italy/Ethiopia response now resolves both fronts and air support in one mocked request. See [AI reliability](AI_RELIABILITY.md#malformed-turn-json--9-october-2026).

9 October 2026: Next important event no longer treats a missing milestone as permission to advance a full year. Sparse replies pause at an explicitly labelled progress checkpoint, keep unfinished fronts active and exclude later predictions. The recorded Italy/Ethiopia response now stops on 15 February instead of 31 December. See [AI reliability](AI_RELIABILITY.md#next-event-coverage-checkpoints--9-october-2026).

Updated 11 October 2026. The game is a local AI-adjudicated sandbox. Automated checks establish executable behavior; they cannot certify every model-generated situation or historical judgment. This remains a working prototype with supported flows and explicit limits.

## Supported campaign flow

- Start 1910, 1936 or 2010; select a nation; queue orders, edit suggested drafts and optionally review a wording improvement before applying it.
- Resolve fixed periods or search up to a year for a strategic milestone for the player nation. Explicit `player_impact` takes precedence over global severity; explained directly affected legacy events remain compatible. Routine battles and diplomacy remain progress/news. When no covered milestone is supplied, the engine pauses at a bounded progress checkpoint. Later proposals are excluded from the selected interval and unfinished orders continue.
- Continue from an earlier event in the latest unchanged turn. The saved world is replayed through all effects on that date, without another AI call; later outcomes are discarded and future-only orders remain pending. A subsequent saved mutation invalidates this choice so new work cannot be lost.
- Mobilise formations from orders; use saved IDs on later turns; advance along connected land fronts with real travel time and attach air/naval support to real formations.
- Apply AI-authored strength/organization losses and destruction, including during held battles. Apply enemy counterattacks to connected player-held provinces after stationed formations retreat or are explicitly destroyed. No automatic defenders or combat rolls are added.
- Persist explicit surrender and territorial settlement without inventing a march to the capital. An annexation objective can remain unfinished.
- Apply dated diplomatic effects alongside military reports. Peace ends the offensive, clears outstanding campaign notes and support missions, and leaves territorial control intact. Combat after the settlement is rejected; restarting a war requires a new pending player order. Annexed governments cannot enter new wars or alliances.
- Rename existing nations, change recorded politics/leadership, add mapped cities and relocate capitals. Context includes saved names, formation condition, named neutral countries and their mapped provinces.
- Save/reload state; preserve pending orders and valid partial campaign progress; reject invalid executable effects atomically.
- Resolve country identity from scenario codes, saved names and declared aliases. Recover omitted targets only from unambiguous operation/order/map evidence, including continuing fronts; retain the AI's actual battle decisions.

## Verification

Run `npm test --prefix backend`. Tests use mocked model replies; no browser or live-provider session is required. The suite covers the actual repeated operation failures, timing selection, formation reuse, successive ground movements, both fronts and air support, political changes, scenario geometry, UI playback logic, saves, API errors and concurrent-request protection.

`scripts/test_campaign_lifecycle.js` uses real geography in all three public scenarios for named neutral-country context, dated battle/peace ordering, peace without a battle, war restart rejection, formation condition, ownership counts and save/reload. `scripts/test_battle_losses.js` tests retreat, destruction and connected enemy captures with independent maps for each era; it rejects invented units, invalid condition values, occupied captures and disconnected counterattacks. Playback checks confirm that losses and enemy gains are revealed in their battle card.

The user performs the final browser and live-model walkthrough. Provider connection success does not establish reliable turn adjudication. An omitted order stays pending; the engine cannot force a model to supply a meaningful outcome. Quantitative performance measurements do not replace hardware-specific map testing.

`scripts/test_nation_references.js` checks name/code normalization, ambiguity, saved campaign binding and future-effect exclusion. `scripts/test_target_recovery.js` replays the actual missing-target operation on the WWII map without a corrective inference, adds an explicit consequential Italian treaty obligation for the positive Rhineland-stop case, continues the same operation without another player order, and verifies dated movement, air support and explicit annexation. It also resolves the full reply during a fixed six-month interval. These are mocked execution checks, not a guarantee of historical plausibility.

`scripts/test_player_milestones.js` covers national versus global importance and model-selected stop references across all three eras. `scripts/test_event_continuation.js` and `scripts/test_event_continuation_ui.js` cover authoritative event selection, all same-day effects, future civilian orders, save/reload, long-turn dates, stale/conflicting requests and playback reset. `scripts/test_action_improvement.js` checks read-only rewrites, explicit preview/apply/discard and late-response protection through HTTP and UI logic.

## Remaining limits

Sea transport, naval movement, aircraft rebasing, arbitrary new sovereign states/geometry and character custody remain unsupported. Country provinces use modern administrative geometry clipped to dated borders; historical internal divisions are approximate. Formation strength/organization are abstract condition values, not a complete casualty or logistics simulator. Battle plausibility, prose and pacing depend on the model. Campaign endings remain deferred at the user's request.

See [campaigns](CAMPAIGNS.md), [operation contract](OPERATION_CONTRACT.md), [AI reliability](AI_RELIABILITY.md), [event continuation](EVENT_CONTINUATION.md), [writing orders](ACTION_WRITING.md) and [release readiness](RELEASE_READINESS.md).
