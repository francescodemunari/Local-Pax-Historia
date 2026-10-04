# Military operation contract

Updated 4 October 2026.

4 October additions: optional report `losses` references real formations and records strength/organization or explicit destruction. Optional `enemy_captures` declares connected player provinces lost to the campaign target, after all stationed player formations retreat or are destroyed. Identity, value bounds, topology and actual effects are checked by the same disposable execution preview used during commit. The AI decides the outcome.

Dated diplomacy is merged with campaign reports during execution. Peace closes an offensive and suppresses missing-report requirements for the settled campaign. Real battles before settlement remain executable; battles after it fail. The old standing action cannot restart an ended war. New wars require a new pending player order, and annexed governments cannot negotiate new wars or alliances.

The AI decides outcomes, resistance, losses, timing, missions and surrender. The engine verifies identities and executable changes, then commits the turn atomically. It does not generate victories to fill missing output.

## Preferred response

Each action resolution can contain one `operation` with its target, fronts, `formations` and `reports`. Formations describe only new troops; existing troops are referenced by saved `unit_id`. A standing campaign uses its recorded `source_action_id`, even without a new pending action.

Proceeding invasion/annexation operations require `target_nation_code`. `nation-references.js` canonicalizes exact codes, current saved names, local names and declared aliases without fuzzy matching. A missing target may use an exact saved campaign/source identity, an action-linked start/war declaration, a single foreign controller in its actual movement destinations, or a uniquely named country. When an order names several countries and movement stays on friendly land, a single named country bordering all informative ready fronts can identify the theatre. A support mission or unrelated current war alone cannot identify a new campaign. Explicit invalid identities, self-targets, annexed targets and conflicting linked targets fail; metadata recovery never invents formations, routes or outcomes.

Known identities and unambiguous static saved/order/front references normalize before strategic timeline selection. Proposed effects can identify a missing target only after selection; an excluded future war declaration cannot select a current campaign target. Invalid future-only proposals can be excluded with the rest of their future effects; the compiler strictly validates the retained set. This keeps target names and codes consistent without spending another model request on recoverable metadata.

```json
{
  "action_id": "PENDING_ACTION_ID",
  "summary": "Border fighting continues.",
  "operation": {
    "kind": "invasion",
    "status": "proceed",
    "target_nation_code": "TARGET_CODE",
    "reason": "Ground forces advance with reconnaissance support.",
    "fronts": [
      {"id":"north", "name":"Northern front", "status":"ready", "region_id":"CONTROLLED_PROVINCE"}
    ],
    "formations": [
      {"formation_ref":"north_ground", "name":"Northern division", "unit_type":"infantry", "region_id":"CONTROLLED_PROVINCE"},
      {"formation_ref":"wing", "name":"Reconnaissance wing", "unit_type":"air", "region_id":"CONTROLLED_PROVINCE"}
    ],
    "reports": [{
      "action":"battle", "title":"Border fighting", "report":"Model-authored account of both sides, reasons, losses and remaining objectives.",
      "outcome":"advance", "day_offset":12, "severity":"moderate", "front_ids":["north"],
      "movements":[{"formation_ref":"north_ground", "region_id":"CONNECTED_DESTINATION"}],
      "support":[{"formation_ref":"wing", "region_id":"CONNECTED_DESTINATION", "mission":"Reconnaissance"}]
    }]
  }
}
```

IDs above are illustrative placeholders. The model must use the real action and province IDs from context. New `formation_ref` values must be unique within the response. Permanent unit IDs are assigned by the engine. Turn-local aliases do not survive into subsequent turns; saved unit IDs are supplied in context. If a reply repeats an exact existing ID in `formations` or uses it in a `formation_ref` field, the engine reuses that unit. Such declarations cannot recruit duplicates, relocate troops or change unit types; incompatible types and conflicting identities remain errors. No identity is guessed from names.

The compiler derives campaign starts, action links, player ownership and campaign identity. It does not infer destinations, troop numbers, battle outcomes or missing air participation. A blocked operation needs a reason and empty effects. A held-front battle can identify its front with `front_ids`; alternatively the front can supply `hold_reason`. Requested aircraft need actual support assignments or an explicit explanation of nonparticipation.

## Compatibility and execution

Flat `unit_changes` and `campaign_orders` remain accepted for older model responses and standalone orders. An operation cannot duplicate its nested effects in those arrays. Legacy source-action/type/region selectors resolve only when unambiguous. A declared formation reference supplied in a `unit_id` field is accepted only when it exactly identifies one new formation and does not collide with a saved ID; invented IDs are never guessed from names.

The same formation resolver is used by validation and execution. Actual applied recruits provide a temporary reference-to-unit binding to the campaign executor. Map cards use the accepted battle report plus a factual summary of applied movements, missions and captures. Narrative-only player campaign events remain suppressed.

## Validation and repair

1. Normalize omitted/null empty proposal lists and select next-event developments through the earliest significant date, including nested reports. Exclude later predictions and identify future-only queued actions before validating effects.
2. Compile the retained nested operations into the execution format, collect operation errors and check independent world developments. Missing empty formations/reports arrays can be supplied when the other array is present. Structural blockers can prevent dependent checks; malformed executable effects are not applied.
3. If those dependencies permit (coverage omissions alone do not prevent preview), preview state changes, recruitment and campaign execution on a disposable copy. This checks the same identities, routes, dates and explicit settlement declarations used during commit. Surrender has no capital-control or full-occupation prerequisite.
4. Make at most one corrective model request for actual unresolved effects or missing outcomes. Corrections of order resolutions and military effects can omit `events`; the parser requires an `action_resolutions` array instead. Original world events, diplomacy and consequences are preserved by the engine within the selected interval. World/schema failures request a complete corrected response. Timing selection itself does not consume a model repair.
5. Revalidate the correction. Invalid effects leave the saved date and pending orders unchanged. Missing front outcomes or air participation are tracked separately: next-event mode permits incomplete progress, while fixed-duration turns request one correction and then retain any remaining omissions as pending updates. A wholly omitted order with no attributable effects remains in the pending queue after correction. The existing missing-report fallback can record an unresolved hold with no movement or conquest.

This is a bounded correction workflow, not an unrestricted agent loop. Structural checks cannot prove the truth of every sentence or historical judgment. World geometry, arbitrary new sovereign states, naval transport and character capture are not added by this contract.

Verification: `node scripts/test_operation_plans.js` uses mocked completions and real scenario geography for both turn modes. It exercises the reported multi-front/air failure, preserves unrelated news and timing, verifies actual captures/support, and repairs an impossible route. Browser and live-provider verification are intentionally left to the player.

## Strategic importance and dated movement

Routine reports default to `moderate`, including successful province captures. A decisive battle or lasting campaign turning point can supply `severity:"major"` or `"critical"` with a nonempty `significance_reason`. Missing significance metadata simply leaves the report moderate; it does not reject the turn. An actual `annex` report is critical. The model owns this strategic judgment, while executable effects still need route and surrender verification. Next-event mode searches 365 days and retains routine progress before the earliest milestone or important world event.

A ground formation can move in several reports on strictly increasing dates. Each move starts from its preceding destination; its route must fit the days since its last move or dated recruitment. Duplicate movements on the same date, impossible routes and teleportation remain errors. An ordinary standalone transfer cannot also be combined with campaign movement for that formation in the same turn. Reports resolve chronologically, with surrender following movements on the same date. `node scripts/test_strategic_skip.js` covers exact saved-ID reuse in the actual three-month reply, long-campaign surrender, earlier world milestones, and temporal route feasibility across generic era fixtures.

## Surrender is an AI decision

An `annex` report with `surrendered:true`, a substantive report and a date within the turn applies the AI's declared settlement. There is no requirement to capture the capital or occupy every province first. Those were gameplay assumptions, rather than world-integrity checks, and could reject an otherwise executable turn. The engine transfers the target's remaining land and clears its forces, wars, alliances and active diplomacy, without relocating the player's units from prose.

An annexation objective can continue without a settlement report. Front progress is recorded for both invasion and annexation objectives. A player order demanding capitulation, or a captured capital, cannot create an automatic surrender. Real campaign identities, user pauses, explicit surrender declarations and valid dates still apply. `node scripts/test_ai_surrender.js` replays the actual failed reply in next-event and fixed-duration modes with one mocked completion, plus unfinished objectives and settlements across generic era fixtures.

Surrender day offsets accept numeric strings consistently with battle dates. An omitted offset uses the selected turn's final day; an out-of-window or invalid date remains an execution error.


## Progress is not an effect

`operation-progress.js` records `reported`, `held`, `blocked` or `awaiting_report` for each known front. Only explicit reports establish held/blocked outcomes. A front with no report remains unchanged and active; it does not receive an invented combat event. `resolution_notes` are generated by the engine, returned separately from events and saved as campaign `pending_updates`. The UI provides a compact notice and persistent status in Actions. Model-supplied diagnostics are discarded before computing these fields.

Front progress uses saved unit IDs after the first turn so a unit is not forgotten when it leaves its original province. Declared fronts persist across partial replies. Standing campaign recruitment is authorized by an active, unpaused source order; it does not authorize unrelated disbanding. The model receives pending work on later turns, but the engine never forces a successful outcome.

Run `node scripts/test_operation_progress.js` for the actual repeated-omission fixture and geography-independent progress checks. No actual user action IDs are stored in the fixture.


Follow-up continuity checks: the previously unreported southern formation now has an end-to-end test advancing on the next turn without a repeated player order, with its air mission and capture applied and its pending note cleared. Explicitly revised player orders can replace the active front list using `front_scope: "replace"` and `scope_reason`; a standing model reply without a new order cannot silently narrow it. The original order remains recorded, while `current_order` supplies the revised scope on later turns. Unambiguous front identity/name/location updates are merged to avoid duplicate theatre records.

## Temporal boundary — 3 October 2026

An overlong model timeline is a set of proposals. `next-event.js` selects only developments through the stopping day: later event state patches, military reports, surrender, dated formations/unit changes and diplomacy cannot apply early. Due mobilisation and an actual campaign start remain executable. An operation summary is limited to retained reports or a factual continuation notice. Future-only queued orders remain pending, including explicitly dated resolutions with otherwise undated linked effects.

Fronts with later battles carry standing intent without an artificial held battle or a missing-update event card. Actual later outcomes are generated again from the next saved world; predictions are discarded. Private engine bookkeeping tracks this selection and cannot be forged in model JSON. Front IDs and adjectival theatre names are accepted for coverage matching; geography, ownership and unit identity still require actual executable records.

`node scripts/test_timeline_selection.js` replays the actual overlong reply, validates one-generation stops before/between battles, subsequent southern ground/air participation, sparse standing-operation output, and future-only civilian/military orders. An invented unit in a retained current battle still rejects persistence. These are execution tests, not a guarantee of historical accuracy or good battle pacing from every model.
