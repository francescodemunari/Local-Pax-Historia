# Persistent diplomacy and event reporting

Updated 11 October 2026. Event importance is evaluated for the player nation separately from global severity. The model proposes the chronology and a consequential stopping point; the engine applies only outcomes through the earliest supported national milestone or a bounded progress checkpoint. Global Major news can remain visible without interrupting the player. See [AI reliability](AI_RELIABILITY.md#player-specific-milestones--11-october-2026).

After a successful turn, events appear sequentially with manual Next and Finish controls. The map focuses an applied formation region, validated event coordinates, or an affected country capital as a labeled fallback. Events without a usable location do not invent coordinates. History remains available after playback. Save, turn and revision IDs prevent duplicate or older REST/WebSocket playback; leaving a campaign cancels playback. Responses and map/history loads that belong to a superseded world cannot restore its later date after an event choice.

4 October 2026: diplomacy proposals can carry `day_offset`; they execute alongside campaign reports in chronological order and retain the actual treaty date. Peace cancels that offensive and clears its support missions without transferring land. No combat against that government applies after peace without a fresh war order. Annexed governments cannot enter new diplomatic wars/alliances. Declared formation destruction and enemy captures are revealed during their battle card, with final state restored on finishing playback.

The Game Master can propose `declare_war`, `make_peace`, `form_alliance`, and `end_alliance`, linked to a pending player action. Each accepted proposal updates both countries and produces an engine confirmation event. Unknown countries, self-targets, unrelated orders, duplicates, and attempts to form an alliance during a bilateral war are ignored.

War ends the bilateral alliance, if any. Peace with one country leaves other wars intact. Alliances do not automatically grant military access or bring countries into other wars. Agreement terms, reparations, trade, automatic defensive obligations, and treaty-driven territorial transfer are not implemented. The prompt requires counterpart acceptance for peace and alliance formation; the engine cannot independently establish diplomatic intent from prose.

Current war opponents and allies are included in later model context and displayed in the nation popup. Old saves without an allies list behave as having none.

AI event text and enums are normalized before persistence. A model cannot assign itself the engine source label or supply forged applied-effect records. The event panel distinguishes national milestones from world news and shows applied changes without technical source badges. REST responses and saved events share the same IDs, timestamps, and applied effects. If a nonempty model event list contains no usable events, the turn is rejected without saving. An intentionally empty list remains valid.

Automated coverage: `npm run test:diplomacy`, `npm run test:contract`, and the existing engine/API checks from `backend/`. Final manual and live-provider testing remains with the user.

Campaign advance and annexation cards are built from validated AI reports and carry exact route/capture data for playback. Each event reveals its units and territories; the server has already committed the complete turn atomically. Finishing playback or leaving the campaign restores the final projection. **Play from this event** instead replaces that saved turn with its outcomes through the selected date and returns control to the player. It is available only for earlier events in the latest unchanged turn, includes all same-day effects, preserves future-only orders and makes no new AI request. A new saved order/message or other mutation invalidates the choice. See [event continuation](EVENT_CONTINUATION.md). Annexed governments are removed from new diplomatic invitations; archived conversations are retained.


## UI and time advancement — 17 September 2026

Chat lists, country selection and message headers use the dated flag catalog; generic conversation titles identify their participants. Missing leaders no longer produce empty parentheses. Known bracketed nation codes are expanded in advisor, chat and event text. Diplomatic replies are no longer constrained to the player's exact character count; substantive requests invite a position, terms and conditions with current scenario/state context.

Next important event performs one simulation with a maximum 365-day horizon. It targets the earliest actual consequential development for the player nation, explained strategic campaign turning point or verified surrender/annexation. Routine fighting and province captures remain visible, dated progress within the skip. A battle's major/critical classification needs `significance_reason` explaining its lasting campaign consequence; surrender is critical by default. If no covered milestone is supplied, the engine pauses at adjudicated campaign progress within 90 days, or ordinary news/a quiet checkpoint within 30 days. The search ceiling alone never authorizes skipping an unreported year.

World events can provide `player_impact:{nation_code,importance,reason}`; that explicit assessment takes precedence over global severity and affected-country mentions. Major/Critical needs an explained actual consequence for this player, while explicit Minor/Moderate or invalid assessments do not fall back to global importance. Older events without this field can qualify when directly affecting the player and carrying explained Major/Critical world importance. An unrelated Rhineland development remains news for Italy unless the saved situation supports an immediate consequential Italian decision.

The model selects a referenced dated event/report with `next_event_stop:{event_ref,day_offset,reason}` after accounting for active orders. The engine checks that choice against actual player milestones, calculates elapsed_days (1–365), includes earlier progress and excludes later effects without another model request. Future-only orders remain pending, while standing campaigns retain unfinished fronts. Later predictions are reconsidered next turn rather than stored as fixed outcomes. Only the actual stopping duration is used for movement and recruitment. Significance, outcomes and historical plausibility remain model judgments. Preparatory rumours or a looming crisis should not be reported as a completed major development.

Surrender is an explicit AI-adjudicated political/military outcome and remains a critical stopping milestone. It can occur before capital capture or complete occupation; the engine applies the declared settlement to the remaining territory and closes the surrendered nation's diplomacy. An annexation objective can remain unfinished, and neither the player's demand nor capital capture itself forces capitulation. Settlement events do not move formations from prose; only actual movement reports change their positions.


## Compact chats and dated events — 17 September 2026

Recent conversations show a two-line excerpt; the full response remains in the chat. Model events can provide game_date strictly after the previous date and up to the new date. Missing/invalid dates receive deterministic estimates spread through the interval. Engine advances use accumulated travel/combat time; deployment precedes movement. Playback and saved history are sorted by date and the playback card shows the event date. A one-day skip necessarily places all events on that day. Estimated dates are presentation scheduling, not researched historical dates.


## Saved world changes — 17 September 2026

Game Master event.state_changes supports name, name_local, leader_name, leader_title, ideology, government_type, ruling_party, add_cities and capital_city_id per existing nation. Cities require stable IDs, names and controlled province IDs; supplied SVG coordinates must lie inside the province. A city without coordinates is marked approximate. Capitals require a mapped controlled city. An occupied capital ceases to display as a functioning capital; dialogue is instructed to say no controlled capital is designated rather than invent a replacement seat. Nation endpoints, map search/colors/cities, player labels and world summaries consume saved overlays. Political profile changes do not alter immutable scenario assets. Unknown profile fields are hidden rather than presenting unconfigured data. Diplomatic prose remains model-generated, not a guaranteed factual parser.

## Verification — 11 October 2026

`scripts/test_player_milestones.js` covers national/global importance and explicit stopping references across the public eras. `scripts/test_event_continuation.js` and `scripts/test_event_continuation_ui.js` cover the real saved date/world, simultaneous effects, future civilian orders, replay/reload, long intervals, stale/conflicting selection and playback reset. They use CLI mocks and code checks; browser and live-provider walkthroughs remain with the player.
