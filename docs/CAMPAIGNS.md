# AI-adjudicated campaigns

Updated 4 October 2026. This replaces the automatic resistance resolver.

Operations use canonical scenario country identities. Missing target metadata can be recovered only from unambiguous saved operation/order/map evidence; names and declared aliases resolve to codes. Countries mentioned as staging areas or possible exile destinations are not automatically enemies. This adapter preserves the model's formations, movements, support and battle decisions; invalid or conflicting identities cannot create a different war. See [operation contract](OPERATION_CONTRACT.md).

4 October update: battles and diplomatic effects share a dated execution order. An accepted peace cancels the offensive campaign, records its ending date/reason and clears support missions and pending notices. A battle before peace can apply; a battle after it cannot. A peace-only resolution needs no invented final battle report. Ending a campaign does not authorize restarting it from its completed source order.

Reports can include `losses:[{unit_id, strength, organization}]` or `destroyed:true`. Values must be numbers from 0 to 100, with real formation references; held battles can also incur losses. The following model context includes surviving formation condition. No deterministic casualty algorithm or automatic defenders are added.

`enemy_captures:["PROVINCE_ID"]` declares target gains. Provinces must currently belong to the player and connect to target-controlled land. Every stationed player formation must retreat or have a declared destruction first. The engine returns `lost_regions`, records actual losses in the battle effects and applies ownership changes atomically. Playback removes destroyed units and shows enemy territory gains at that report. Invalid references, impossible connections and occupied captures enter the normal correction/error path.

The AI decides battle outcomes, time, resistance, losses, air missions and surrender. Active campaigns no longer march automatically. A `battle` campaign order supplies a title, substantive report, outcome, day_offset, movements and support assignments. The engine validates actual units, mapped destinations, connected routes and minimum travel time; it applies positions and intervening captures atomically. No synthetic defenders, fixed combat penalties or per-province event cards are generated. Existing `campaign-defence` formations are removed on the next simulated turn.

A report can move multiple formations across separate fronts. Air support records a mission and target on a real air formation, keeping its home base; it does not capture territory or imply implemented rebasing. Newly recruited units are referenced by source action, staging region and type. Recruitment is silent and formations appear during playback without a recruitment card. Reports remain manually advanced. All ground movement routes and support missions can animate; all report effects update the map together.

The AI decides when the target actually surrenders and supplies an explicit `surrendered:true` report. Capital capture and complete occupation are not prerequisites: a government may capitulate or accept a settlement earlier. The dated annexation transfers all remaining target-controlled provinces, removes the surrendered formations, closes diplomacy and clears its wars/alliances. Units remain at their explicitly reported positions. Capturing a capital does not itself guarantee surrender. No AI decision means no automatic surrender.

`operation.kind:"annexation"` names the objective; it does not force the model to declare that objective achieved in this turn. An unfinished annexation operation can report advances or held fronts and retains its campaign/front progress. Only an explicit `annex` settlement report completes it. Identity, date and movement checks remain execution boundaries; military plausibility and the decision to surrender belong to the AI.

Invalid battle effects abort the turn without saving partial changes. Operation and geographic execution errors enter the single model repair request. A still-invalid corrected response preserves the turn and reports the failure. Existing manual campaign pauses remain binding.

Ordinary fixed-duration turns require two independent outside-world events; next-important-event turns have no such quota. Battle descriptions should cover both sides, supply, terrain, air participation, losses and remaining objectives. Quality and pacing remain model-dependent; mocked tests verify mechanics, not live narrative quality.

The 1936 start retains the ongoing Italy–Ethiopia war and creates no starting formations. Repeated war state is not a new declaration.


18 September follow-up: active campaigns require a battle/held-front report or explicit pause/cancel. Requested air participation requires a mission or an explanation. Battle effects resolve in date order; surrender dates are bounded to the turn. The system response example now includes battle orders and political/city fields, avoiding a conflict with the expanded turn instructions. World summaries use province counts rather than duplicating every major power's province catalog.

## Missing-report recovery — 18 September 2026

A repeated start for an existing target reuses the saved campaign ID, and unambiguous report references are normalized. A missing battle report requests one model repair. If the repaired response still omits an outcome, an explicit unresolved campaign notice is applied with empty movements/support, bounded to the actual elapsed turn. Unsupported military victory prose for that campaign is suppressed. This preserves the standing operation without fabricating resistance, victory or territorial changes. Other structural and geographic validation remains enforced. A successful provider connection test does not validate the full turn schema.

## Front and narrative consistency — 19 September 2026

“Advance”, “push” and “offensive” orders are validated as military orders as well as invasion/attack requests. Explicit cardinal fronts must each appear in the operation resolution, and ready fronts need distinct staging provinces with actual ground formations. An ongoing colonial front may refer to its troops after they have left the original staging territory. If one front advances while another does not, the latter requires a `hold_reason`; blocked/held fronts and unavailable air forces are exposed in the operation constraints event. A battle marked advance or retreat must include real formation movements.

Player-campaign military prose from the ordinary events array is suppressed, preventing an event card from claiming a southern advance without a southern unit. Campaign reports remain the source of applied battles. Independent world events are retained. Campaigns store their original order and latest requested fronts for later turns. Playback draws every movement plus outbound/return support mission routes; support does not relocate the aircraft's base. These are structural consistency checks, not a guarantee that a model will always produce a valid or satisfying turn. Invalid effects still preserve the turn for retry.

Follow-up advance/push/all-forces orders inherit named fronts from the campaign's original order and latest front records. They must account for each front again, including any held/blocked explanation; an explicit “only” order can narrow the operation.

## Battle identity — 20 September 2026

Known source action IDs are accepted as aliases for campaign IDs. Unknown references are rejected for repair, avoiding discarded battles followed by a false missing-report notice. An actual omitted outcome still produces an explicit unresolved notice without invented movement; this notice is minor and cannot trigger next-major-event advancement.

## Historical staging and stationary reports — 21 September 2026

Administrative codes inside province IDs do not identify historical staging territories. Named fronts are checked against the requested area, while readiness requires current player control and a real ground formation. This accepts Italian-controlled Somali fragments derived from modern Ethiopian administrative geometry without allowing recruitment on enemy territory. Recruitment context includes area and adjacent foreign province IDs/controllers.

Advance/retreat movements must change province. Repeated origin/destination reports are rejected during model response repair and again during effect application. A stationary formation needs a held-front report; descriptive conquest cannot substitute for map movement. The same contract applies to fixed-duration and next-important-event turns.


## Unified operation plans — 21 September 2026

Preferred model output nests `formations` and `reports` inside `action_resolutions[].operation`. Each new formation declares `formation_ref`, used by both ground movements and support missions; existing troops use saved `unit_id`. Compilation derives the campaign identity and start without deciding the combat outcome. Nested and flat effects for the same operation cannot be mixed. Legacy flat replies remain supported, but ambiguous legacy formation selectors are rejected instead of selecting the first match.

Ready fronts are matched to resolved formations rather than raw movement strings. An explicit held battle can identify its `front_ids`, avoiding a duplicated explanation in the front record. Ground/support references, front participation and air availability errors are collected together. Before accepting output, the engine previews recruitment, routes, dates and surrender effects on a disposable state. Campaign cards append recorded map effects using actual formation and province names. Combat prose is still model-authored and can require gameplay evaluation.

See [operation contract](OPERATION_CONTRACT.md) for migration and repair boundaries.


## Independent front progress — 21 September 2026

Readiness means a ground formation is present, not that it must move in every interval. Front progress is recorded generically, using declared front identities and actual formation IDs. Next-event turns accept fronts awaiting an outcome immediately. Fixed-duration turns ask for correction once; remaining coverage omissions become saved pending updates rather than fatal errors. Missing movement never implies a fabricated hold, resistance explanation or conquest. An actual blocked/held AI report remains distinct from an unreported outcome.

Saved `front_progress` and `pending_updates` are sent with standing campaigns on later turns, including turns with no new action. Previously declared fronts survive a reply which mentions only one theatre, and saved unit IDs retain continuity after leaving the staging province. The Actions panel displays these statuses. Standing active campaigns can recruit against their source order; this authority does not allow disbanding or movement without the appropriate order and does not apply to manually paused campaigns.


Follow-up continuity checks: the previously unreported southern formation now has an end-to-end test advancing on the next turn without a repeated player order, with its air mission and capture applied and its pending note cleared. Explicitly revised player orders can replace the active front list using `front_scope: "replace"` and `scope_reason`; a standing model reply without a new order cannot silently narrow it. The original order remains recorded, while `current_order` supplies the revised scope on later turns. Unambiguous front identity/name/location updates are merged to avoid duplicate theatre records.

## Whole-order recovery and dated stops — 3 October 2026

An omitted initial order differs from an unreported front in an existing campaign. The engine asks for one correction; if no outcome or attributable effects are supplied, it retains the initial order in Actions with the same ID instead of creating a campaign or marking it complete. The next simulation receives that pending order automatically. Existing campaigns continue to carry their front progress and outstanding air requests. A real blocked resolution completes the order with the model's explanation; invalid executable effects still reject the turn.

Next-event turns derive elapsed time from the earliest strategic milestone or important world development. Routine battles and province captures are moderate and do not stop the search. A decisive battle needs major/critical severity and `significance_reason`; an explicit verified surrender is critical. The search reaches at most 365 days. Inconsistent model arithmetic is normalized before engine notices are dated. Later battles, state changes or other developments are excluded from the selected interval. Due mobilisation can proceed, with later front outcomes awaiting adjudication. This does not require a repair or an invented held battle. Future-only orders remain queued; standing campaigns keep their intent and fronts. Predictions are reconsidered from saved state on later turns. These rules apply to all campaign targets; no Ethiopia-specific fallback battle or conquest is generated.

Ground formations can make multiple successive advances during a longer skip. Reports resolve in chronological order, using the unit's previous destination and the time since its last movement or mobilisation for route validation. Routine fighting is grouped into front reports instead of one event per province. Existing unit IDs repeated as formation declarations are reused without duplication or position/type changes. New turn-local aliases remain unique; invented IDs remain invalid.
