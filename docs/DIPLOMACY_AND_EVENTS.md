# Persistent diplomacy and event reporting

After a successful turn, events appear sequentially with manual Next and Finish controls. The map focuses an applied formation region, validated event coordinates, or an affected country capital as a labeled fallback. Events without a usable location do not invent coordinates. History remains available after playback. Save and turn IDs prevent duplicate REST/WebSocket playback; leaving a campaign cancels playback.

4 October 2026: diplomacy proposals can carry `day_offset`; they execute alongside campaign reports in chronological order and retain the actual treaty date. Peace cancels that offensive and clears its support missions without transferring land. No combat against that government applies after peace without a fresh war order. Annexed governments cannot enter new diplomatic wars/alliances. Declared formation destruction and enemy captures are revealed during their battle card, with final state restored on finishing playback.

The Game Master can propose `declare_war`, `make_peace`, `form_alliance`, and `end_alliance`, linked to a pending player action. Each accepted proposal updates both countries and produces an engine confirmation event. Unknown countries, self-targets, unrelated orders, duplicates, and attempts to form an alliance during a bilateral war are ignored.

War ends the bilateral alliance, if any. Peace with one country leaves other wars intact. Alliances do not automatically grant military access or bring countries into other wars. Agreement terms, reparations, trade, automatic defensive obligations, and treaty-driven territorial transfer are not implemented. The prompt requires counterpart acceptance for peace and alliance formation; the engine cannot independently establish diplomatic intent from prose.

Current war opponents and allies are included in later model context and displayed in the nation popup. Old saves without an allies list behave as having none.

AI event text and enums are normalized before persistence. A model cannot assign itself the engine source label or supply forged applied-effect records. The event panel labels AI narrative separately from engine results and does not apply numerical resource changes. REST responses and saved events share the same IDs, timestamps, and applied effects. If a nonempty model event list contains no usable events, the turn is rejected without saving. An intentionally empty list remains valid.

Automated coverage: `npm run test:diplomacy`, `npm run test:contract`, and the existing engine/API checks from `backend/`. Final manual and live-provider testing remains with the user.

Campaign advances and annexation are engine-authored. They precede narrative follow-up and carry exact route/capture data for playback. Each event reveals its units and territories; the server has already committed the complete turn atomically. Finishing playback or leaving the campaign restores the final projection. Annexed governments are removed from new diplomatic invitations; archived conversations are retained.


## UI and time advancement — 17 September 2026

Chat lists, country selection and message headers use the dated flag catalog; generic conversation titles identify their participants. Missing leaders no longer produce empty parentheses. Known bracketed nation codes are expanded in advisor, chat and event text. Diplomatic replies are no longer constrained to the player's exact character count; substantive requests invite a position, terms and conditions with current scenario/state context.

Next important event performs one simulation with a maximum 365-day horizon. It stops at the earliest actual major/critical world development, explained strategic campaign turning point or verified surrender/annexation. Routine fighting and province captures remain visible, dated progress within the skip; they cannot force an early stop. A battle's major/critical classification needs `significance_reason` explaining its lasting campaign consequence. Surrender is critical by default. If there is no milestone, the skip reaches the horizon and reports that standing operations continue.

The engine calculates elapsed_days (1–365) from the milestone date, includes earlier progress and excludes later effects without another model request. Future-only orders remain pending, while standing campaigns retain unfinished fronts. Later predictions are reconsidered next turn rather than stored as fixed outcomes. Only the actual stopping duration is used for movement and recruitment. The model judges significance and outcomes; this is not a deterministic historical scheduler. Preparatory rumours or a looming crisis should not be reported as a completed major development.

Surrender is an explicit AI-adjudicated political/military outcome and remains a critical stopping milestone. It can occur before capital capture or complete occupation; the engine applies the declared settlement to the remaining territory and closes the surrendered nation's diplomacy. An annexation objective can remain unfinished, and neither the player's demand nor capital capture itself forces capitulation. Settlement events do not move formations from prose; only actual movement reports change their positions.


## Compact chats and dated events — 17 September 2026

Recent conversations show a two-line excerpt; the full response remains in the chat. Model events can provide game_date strictly after the previous date and up to the new date. Missing/invalid dates receive deterministic estimates spread through the interval. Engine advances use accumulated travel/combat time; deployment precedes movement. Playback and saved history are sorted by date and the playback card shows the event date. A one-day skip necessarily places all events on that day. Estimated dates are presentation scheduling, not researched historical dates.


## Saved world changes — 17 September 2026

Game Master event.state_changes supports name, name_local, leader_name, leader_title, ideology, government_type, ruling_party, add_cities and capital_city_id per existing nation. Cities require stable IDs, names and controlled province IDs; supplied SVG coordinates must lie inside the province. A city without coordinates is marked approximate. Capitals require a mapped controlled city. An occupied capital ceases to display as a functioning capital; dialogue is instructed to say no controlled capital is designated rather than invent a replacement seat. Nation endpoints, map search/colors/cities, player labels and world summaries consume saved overlays. Political profile changes do not alter immutable scenario assets. Unknown profile fields are hidden rather than presenting unconfigured data. Diplomatic prose remains model-generated, not a guaranteed factual parser.
