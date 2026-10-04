# AI response reliability

## Omitted campaign targets — 4 October 2026

The recorded failure supplied a complete operation but omitted `target_nation_code`. Its planned movements were inside territory already controlled by Italy, while the order also mentioned the United Kingdom as an exile destination. Country identity recovery now uses exact saved campaign/source bindings, action-linked starts/declarations, actual movement controllers, or uniquely named countries. For a multi-country order, the intersection of named countries adjacent to its controlled ready fronts can identify one target: Ethiopia borders both supplied staging fronts, while Britain borders only the northern one. This supplies identity metadata without authoring battle outcomes or selecting a target from an unrelated current war.

The shared boundary accepts exact scenario codes, saved names, local names and declared aliases; it rejects unknown explicit operation values, duplicate-name ambiguity, self/annexed targets and conflicting operation/campaign/declaration identities. Known references and static saved/order/front identity evidence normalize before next-event selection. Proposed effects supply missing targets only after their dates are selected, preventing excluded future declarations from starting a current war. An omitted target that remains ambiguous still needs correction. The prompt explicitly requires targets and supplies a hint only where order/context evidence is unambiguous. Contradictions involving a war declaration request a complete correction, since a military-only correction cannot modify diplomacy. Unrelated invalid diplomatic proposals retain the existing executor rejection policy.

`scripts/test_target_recovery.js` uses the sanitized actual response and real geography. In next-event mode it stops for the earlier Rhineland event, then continues from the same saved source with no repeated player order. Fixed six-month mode applies the complete dated reply. Each mocked generation succeeds without correction; both tests verify formations, actual positions, support and explicit settlement. `scripts/test_nation_references.js` covers generic identity and ambiguity boundaries. No live-provider or browser verification was performed.

4 October 2026: pending orders mentioning a neutral country's full/saved name now include its provinces and state context. Country codes and available aliases also resolve, without inferring a war or territorial change. Province control snapshots/counts use fresh one-pass indices, avoiding stale caches during mutation. Surviving formation condition and current missions appear in the next turn's context.

Peace and military reports are previewed and committed in chronological order. A peaceful settlement does not need an unresolved-battle fallback afterward. Offensive restart requires a fresh queued order; surrender closes its missions. Optional AI-authored formation losses and connected enemy captures are executable effects rather than prose-only defeats. Invalid references, condition values, geography and battles after peace still fail atomically.

Military operation orders now authorize appropriate mobilisation as well as explicit recruitment requests. The model should create previously untracked staging forces when necessary, reuse existing formations and use the supplied controlled province names and locations. Public catalogs include naval and era-appropriate air formations. These remain AI proposals validated by the engine; mocked contract tests do not establish live-provider instruction-following reliability. Unsupported combat or transfers must be explained rather than reported as completed conquest.

The planner returns a JSON list of concrete imperative actions. Drafts are editable and never submit automatically. Actions shows pending orders only. Sending queues an order without an approval decision. During simulation, `action_resolutions` contains an action ID and outcome summary; legacy status ratings are ignored. The engine requests one correction for missing outcomes. An order still omitted after correction remains pending if no effects are attributable to it; resolved orders complete. Invalid effects reject the turn without saving. Obstacles belong in narrative events; genuine outcome summaries can become events when no events or linked proposals were supplied. Engine notices about omitted orders appear in Actions instead of becoming event cards.

All model contexts include the scenario briefing and current campaign state. Starting context is background and does not overwrite alternate history.

Updated 15 September 2026.

The event parser accepts a JSON object containing an events array, including fenced output or surrounding commentary. During turn generation, a substantive action/battle/formation reply can omit an empty event list; the adapter supplies it. Empty optional proposal arrays can be omitted or null, and a reports-only standing operation need not repeat an empty formations array. Malformed supplied effects still pass the usual execution checks. The parser scans balanced objects while respecting quoted braces and escapes, and skips a leading thinking block. It does not rewrite event text or repair invalid JSON numbers. Unusable JSON produces a clear error and leaves the saved campaign unchanged.

Formation proposals must reference a real pending player order. There are no approval ratings or numerical resource gates. Invalid formation types, wrong ownership, missing units and invalid movement receive persistent explanation events. Explicit disbanding removes an existing player unit. Narrative troop mentions never create tracked units.

Automated coverage: `npm run test:model-json`, `npm run test:engine`, `npm run test:movement` and `npm run test:disband`, all included in `npm test`. Provider discovery uses mocked endpoints in tests; no paid/live model inference was performed for this update. Final campaign and live-provider verification remain with the user.

Detailed tactical combat, casualties, retreat and sea/air transfers remain unimplemented. Model prose cannot substitute for those mechanics.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).


## Response schema repair — 17 September 2026

Campaign orders are now present in the system JSON schema. Operation resolutions account for campaign starts, annexation proposals and staging fronts. Validation runs before commit; one corrective generation is allowed for invalid JSON, missing campaign/operation fields or missing independent developments. The repair may add one model request to a turn. A second failure preserves the date and orders. Explicitly blocked operations are resolved with a visible explanation. No live provider calls were used for these checks.


## Battle/world contract update — 17 September 2026

The AI now owns strategic battle adjudication; the engine owns schema, unit/province identity, connected routes, travel feasibility and atomic persistence. Campaign reports carry effects directly instead of contradictory parallel victory prose. Air participation is an explicit support mission. Missing/malformed effects are not silently turned into victory. Saved cities/capitals and controlled province lists are provided to diplomatic context. Nation profile and city patches are allowlisted. New sovereign-state creation and arbitrary geometry editing remain unsupported.


18 September follow-up: active campaigns require a battle/held-front report or explicit pause/cancel. Requested air participation requires a mission or an explanation. Battle effects resolve in date order; surrender dates are bounded to the turn. The system response example now includes battle orders and political/city fields, avoiding a conflict with the expanded turn instructions. World summaries use province counts rather than duplicating every major power's province catalog.

## Missing-report recovery — 18 September 2026

A repeated start for an existing target reuses the saved campaign ID, and unambiguous report references are normalized. A missing battle report requests one model repair. If the repaired response still omits an outcome, an explicit unresolved campaign notice is applied with empty movements/support, bounded to the actual elapsed turn. Unsupported military victory prose for that campaign is suppressed. This preserves the standing operation without fabricating resistance, victory or territorial changes. Other structural and geographic validation remains enforced. A successful provider connection test does not validate the full turn schema.

## Follow-up operations — 19 September 2026

The military-order detector now includes advance/push/offensive wording. It validates missing requested cardinal fronts, distinct ground staging positions, actual movements and air assignments/explanations. An active military advance cannot bypass validation by classifying troops/fronts as a generic non-military operation. Incomplete responses receive the existing bounded repair attempt; invalid effects still do not become fictional conquests. Campaign original intent/fronts persist in model context. Ordinary player-campaign military narrative is omitted in favour of effect-backed reports. Scheduled leadership changes are provided to the model, while explicit alternate-history political patches take precedence.

## Campaign references and next-event repair — 20 September 2026

Known source IDs map to actual campaign IDs before report validation; unknown IDs trigger repair instead of being ignored. Next-event selection runs inside the validation loop. The earliest valid strategic milestone determines elapsed_days, including when redundant model arithmetic disagrees. Later developments and effects are excluded, while unresolved reports and routine combat cannot trigger an early stop. The search horizon is now 365 days. Early stops have no minimum independent-world-event quota; ordinary fixed-duration turns retain that requirement. Routine scheduled appointments are silent, while important political developments may still be narrated.

## Missing next-event duration — 20 September 2026

The validation pass collects military and world issues after local timing selection. Numeric strings are normalized. The engine derives elapsed_days from a dated strategic milestone; invalid or unsupported duration metadata uses the bounded search horizon. Developments after the stopping date are excluded, with unfinished work retained. Quiet horizon completion is reported in the UI. Raw replies are logged before validation, including failures, with no provider credentials in that diagnostic file. No live provider calls were used for verification.

## False missing-front rejection — 21 September 2026

A saved model reply supplied a southern Somali front, but the validator incorrectly interpreted its ETH administrative-source ID as the wrong staging territory. IDs are now treated as opaque: current control, formation presence and explicit front names determine validity. Prompts no longer imply that source-code prefixes determine historical borders. The model receives actual foreign neighbours and province areas.

The same reply described an advance with identical origin/destination. This now triggers the existing corrective-generation path before persistence, with an engine guard as well. Other invalid responses can still fail atomically; a successful provider connection does not certify turn consistency. AI adjudication remains constrained to supported structured world edits, not arbitrary geometry or new sovereign-state creation.


## Operation compilation and combined repair — 21 September 2026

The preferred schema gives each operation a single formations/reports collection. A shared resolver links declared `formation_ref` values to actual recruited units, without guessing identities from report titles or north/south labels. New references are unique within the response, never replace permanent engine IDs, and expire after the turn. Exact saved IDs mistakenly repeated in the new-formation list reuse existing troops without applying the declaration's attributes. Duplicate or ambiguous new references and invented saved IDs remain validation errors.

The validation pass combines operation, timing and world-development errors instead of exposing one structural problem per repair. A correction of order resolutions and military effects preserves the original world events, diplomatic proposals and consequences; the engine computes elapsed time from the accepted dated outcomes. Repairs are limited to one request. Timing/world failures require a complete correction. Geographic execution is previewed before acceptance, bringing route failures into that correction path. A still-invalid response preserves the save and pending orders. Missing-report recovery remains explicitly unresolved, with no fabricated victory.

Removed contradictory prompt instructions to duplicate recruitment across formats and to use country tags in prose. Full backend tests passed with mocked providers; live-model correctness is not guaranteed.


## Missing outcomes versus invalid effects — 21 September 2026

The failure reproduced by the latest saved reply was a coverage error: valid northern movement and air support were rejected because a ready southern formation had no report. The shared campaign contract now distinguishes missing progress from invalid state changes. Next-event mode accepts incomplete front coverage; fixed-duration mode attempts one correction, then preserves remaining omissions as explicit pending updates. Hard errors still block commit. When hard errors coexist with omissions, the repair diagnostics include both. Safe execution preview can run despite coverage omissions so a later route error is not hidden behind them.

This policy is generic across campaign targets and front names. It is not a guarantee that the model will resolve every objective on the next turn, and does not generalize permissive recovery to arbitrary malformed civilian/political mutations. Unreported work is visible and retained, not falsely described as completed. `scripts/test_operation_progress.js` includes the sanitized actual failed response and independent fixtures without Ethiopian geography.


Follow-up continuity checks: the previously unreported southern formation now has an end-to-end test advancing on the next turn without a repeated player order, with its air mission and capture applied and its pending note cleared. Explicitly revised player orders can replace the active front list using `front_scope: "replace"` and `scope_reason`; a standing model reply without a new order cannot silently narrow it. The original order remains recorded, while `current_order` supplies the revised scope on later turns. Unambiguous front identity/name/location updates are merged to avoid duplicate theatre records.

## Omitted orders, date arithmetic and prompt size — 3 October 2026

The earlier recorded response had no action resolution or military effects. It supplied a significant event on 14 January 1936 with `elapsed_days:14`, although the start was 1 January. The engine computes the 13-day stop from the event date before creating unresolved campaign notices. Redundant duration metadata cannot override that date. The follow-up timeline selection below replaces rejection of later developments.

The previous parser required `events` even when the repair prompt explicitly prohibited returning it. Partial correction now requires `action_resolutions` and can omit `events`; unrelated leading JSON is skipped. Accepted world events and diplomacy survive an order/military correction. No more than one corrective model request is made.

Every pending military or civilian order is checked for an outcome. A missing operation reason can reuse the model's existing report or summary; the engine does not infer battles from prose. If correction still omits an order with no attributable effects, the order remains pending under the same ID. An engine-owned note is returned to Actions, without a fabricated campaign, formation or event card. The next turn includes the original queued order automatically. Omitted resolutions tied to state changes or linked effects still fail, preventing an applied order from being replayed as pending.

`turn-prompt.js` consolidates instructions and serializes each supplied province once, retaining actual IDs and controlled staging data. Recent events omit route and animation payloads. The WWII regression measured 129,335 → 49,167 context characters, a 62% reduction. This comparison is serialized input size, not token usage or live latency. A smaller prompt does not guarantee that a lightweight model will adjudicate every objective.

`data/debug/last_turn_diagnostics.json` is local and ignored by Git. It contains numeric request counts, initial/correction prompt sizes, provider request durations, remaining processing time, deferred-order count and a failure marker. Failed requests replace stale successful timing records. It contains no credentials or model prose. `last_ai_response.txt` separately retains the most recent model reply, which can be a partial correction.

Verification: `node scripts/test_turn_recovery.js`, `node scripts/test_next_event.js` and the backend suite use mocked providers. Coverage includes the actual omitted-order fixture, successful partial correction, repeated omission, save/reload and next-turn continuity, a quiet horizon without a synthetic event card, authoritative dates, exclusion of later effects and failure diagnostics. No browser, screenshots or live model requests are needed for these checks.

## Timeline selection instead of timing rejection — 3 October 2026

The new failure was a useful military reply with news on day 14, a northern battle on day 25 and a southern battle on day 40. Rejecting it cost two provider requests (about 32 seconds in the local recorded diagnostics), while local processing took 13 milliseconds. This was a protocol problem, not evidence that the provider connection failed.

`next-event.js` projects both nested and flat proposals onto the selected stopping interval before effect validation. Later events and their state changes, battles, surrender, dated diplomacy and dated unit effects are excluded. Day-zero mobilisation is permitted; past events are excluded. Missing or invalid redundant duration metadata cannot cause a timing repair. A bounded undated major event can still use the supplied duration; the quiet search horizon is 365 days.

Due mobilisation and campaign starts can apply before a later battle. Their summaries mention only retained reports or outstanding orders. Fronts whose battles fall after the stop stay active without a fabricated held battle or a Campaign update unavailable card. A queued action whose entire resolution or effects lie later remains pending under the same ID. Explicitly dated resolutions cannot leak their linked undated root effects into the turn. Events implementing player orders should include `action_id` to connect prose and state changes unambiguously.

The engine discards future outcome predictions and adjudicates unfinished work again next turn from the saved state; it does not store a predetermined victory timeline. Timing bookkeeping is private engine state, not a model-controlled permission field. Actual in-window effects still require real identities, controlled recruitment, connected routes, feasible movement and valid surrender. One correction remains available for genuine unresolved effects, and a still-invalid executable turn is not saved.

`scripts/test_timeline_selection.js` replays the sanitized actual response with real WWII geography. It verifies one-generation stops before both battles or between them, both staging fronts, air support, subsequent southern movement without another order, sparse flat/nested standing replies, future civilian/flat military order retention, and atomic rejection of an invented unit in a current battle. Local diagnostics count excluded future events/effects. These mocked checks establish execution behavior, not live battle quality or support for every model.

## Strategic skips and repeated roster declarations — 3 October 2026

The latest three-month reply repeated all three saved unit IDs as new `formation_ref` declarations. Those were exact identities, so rejecting them as duplicate recruits was unnecessary. The compiler now removes such recruitment declarations and the shared resolver accepts those exact IDs in either reference field. It keeps actual positions, types and attributes; incompatible types or conflicting IDs still fail. Short aliases from previous turns and names cannot identify an old formation.

Battle outcome and strategic importance are separate decisions. Routine reports default to moderate. A report needs major/critical severity plus `significance_reason` to represent a decisive turning point; surrender/annexation is critical automatically after effect verification. Missing significance metadata does not request repair. Both skip selection and displayed event severity use the same policy, avoiding routine battles labelled Major. The prompt asks for actual consequential world developments and complete progress through the first milestone, rather than the first province gain.

The horizon is 365 days in one model generation; one correction remains the maximum. Successive ground moves are allowed on increasing dates, with route feasibility checked from each previous destination against the intervening time. Mocked regression coverage replays the actual saved-ID response without correction, continues routine battles through a day-151 surrender, stops earlier for an important world development, and rejects same-date moves or insufficient travel time across generic era maps. Strategic judgment, plausibility and narrative quality still depend on the model. No browser, screenshots or live-provider requests are used for this verification.

## Removing surrender gameplay gates — 3 October 2026

The latest reply explicitly declared surrender on day 120, after two dated front reports. It did not provide a formation movement to the capital. The engine's capital-control/full-occupation prerequisite rejected that outcome. This prerequisite is removed for all campaigns: the AI decides whether military defeat or diplomacy produces capitulation, and its explicit settlement transfers remaining territory. The engine still requires a known campaign, an explicit surrender declaration, a substantive report and a valid date. It does not invent a march to the capital from narration.

`operation.kind:"annexation"` describes the objective rather than a compulsory result. Battle or held-front reports can leave it unfinished, with front progress carried forward. The actual failed reply has a one-generation regression in next-event and fixed-duration modes. Generic tests verify settlements without capital occupation or a mapped capital, preservation of unrelated land/units/wars, diplomatic cleanup, paused campaigns and rejection of malformed surrender declarations. This removes an unnecessary gameplay veto; it cannot establish the historical plausibility of the model's prose.
