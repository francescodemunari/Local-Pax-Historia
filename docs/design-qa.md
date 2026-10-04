# UI verification

Operational-forces follow-up: a separate mock 1936 campaign showed a three-formation marker with infantry, air and naval entries in its popup. Greenland rendered on the map and appeared in region search. Zooming restored nearby country labels while offscreen labels were excluded from active Leaflet layers. No browser warning/error logs were recorded. Follow-up API coverage verifies distinct Greenland province results instead of repeated island fragments. The full automated suite and targeted search/label checks passed; no live model was used.

Final mock check: all 18 visible map tiles reported worker rendering. Pausing the first Rome event and advancing manually showed the second Paris event while remaining paused; Finish removed playback. No browser warning/error logs were recorded. Temporary preview files and the owned mock save were removed afterward. The full `npm test` suite passed.

15 September actions update: a mock-provider browser campaign verified editable planner suggestions, editing and sending an order, sequential Rome/Paris/Naples events with camera movement, and an empty Actions queue after completion. The header status dot was absent. Flag images appeared in nation selection; a wrong British civil air ensign was caught and corrected in the catalog with a regression assertion. No paid or live model was contacted. Full campaign verification remains with the user.

Updated 14 September 2026. The start menu exposes scenario cards and the nation screen retains a scenario selector. Current starts are 1910, 1936 and 2010; the illustrated WWII option is removed. Scenario switching clears nation selection and rejects stale network responses.

AI Settings was inspected in the in-app browser: provider groups are visible, Groq fills its endpoint, missing keys show useful guidance, unavailable local servers show an error, and a local mock model list can be fetched and selected into the model field. Settings were cancelled after inspection, leaving the saved provider unchanged.

Province rendering was inspected in temporary 1914 and 1910 campaigns. The final menu showed three options, and the nation screen and in-game calendar showed 1 January 1910. Searching for the Rome region focused its detailed province boundary with a thin gold outline and unchanged green fill. Country fills remain continuous with no rectangular grid. Hover and selection use thin outlines rather than yellow fill. Historical provinces use modern administrative geometry and remain approximate. Final campaign/live-model walkthroughs are manual; the earlier visual review does not certify every map location or every provider.

## Home library and zoom checks — 15 September 2026

The final home screen was inspected at 1280×720 and 390×844. Three scenario cards fill the centered desktop row and stack on the narrow screen without horizontal overflow. Scenarios and Recent Games switch correctly; a real existing campaign was resumed without issuing orders or advancing time. No new campaign save was created for this check.

At overview zoom, DOM inspection found zero visible capital icons and zero visible capital labels. Zooming in showed icons first, then names. Dragging moved the map, and clicking afterward opened the Ancona province dossier. Browser warning/error logs were empty. These observations verify interactions, not a quantified frame-rate improvement. See MAP_PERFORMANCE.md for measured payload reductions.

## Canvas tile follow-up — 15 September 2026

At 1280×720 the 1910 map rendered with one hidden SVG reference and cached canvas tiles. Rome search selected a thin province outline; dragging and clicking selected Benevento correctly. The inspected viewport used 20 canvas tiles and three one-path selection overlays. No browser error/warning logs were recorded. These checks demonstrate rendering and interaction, not a hardware-independent frame-rate measurement.

The region Advisor Report action now closes the dossier and prepares an editable, region-specific question. It no longer announces an advice request when none was sent. The player submits the draft explicitly.

World overview and horizontal wrap were also checked after tiles settled; capital markers and labels were hidden at overview zoom. Newly exposed tiles paint after dragging stops, so a fast long pan can briefly show unloaded areas. The temporary preview server was stopped after inspection.

## Campaign playback check — 16 September 2026

An isolated 1936 Italy save with mocked model responses was checked in the browser. Deployment stayed on Event 1 until Next was pressed; the camera focused on Southern Red Sea in Eritrea. Successive deployment steps showed infantry, air and naval icons in a mixed stack. The advance step placed infantry at Addis Ababa, coloured four captured provinces and displayed a dashed route, while air/naval formations remained at staging. Independent French and German events followed. Actions pause/resume changed the campaign between held and active.

The check exposed and fixed two integration bugs: compact ownership refreshes lost geographic anchors/paint metadata, and deployment records referenced units later mutated by campaign movement. Regression checks cover both. The full backend npm test suite passed. This uses mocked outcomes, not a live provider or a measured frame-rate benchmark; final campaign balance and live-AI playtesting remain with the user.

The subsequent surrender step transferred the remaining Ethiopian territory, removed its nation label and retained infantry at Addis Ababa. No browser errors were recorded in the final preview. The temporary save and preview server were removed.

## Diplomacy and draft regression check — 17 September 2026

A mocked 1910 Italy browser fixture showed historical Italian and French flags in message headers and flags throughout the country picker and conversation list. Bracketed [ITA] rendered as Italy. Suggested actions were edited in their own textareas, queued once with the edited text, and deleted individually. Loading a second save with the same nation/scenario cleared all previous suggestions. No browser errors were recorded. The temporary preview and saves were removed.

The full backend npm test suite passed, including the actual generation prompt's single repair attempt, failed-turn order preservation, a bounded next-event date, and independent northern/southern campaign routes. Province-step assertions require shared borders. These checks use mocked AI responses; they do not establish live-model prose quality or universal interpretation of arbitrary front names.

## Cached map, resistance and dated playback — 17 September 2026

The isolated mocked WWII browser preview showed a two-line recent-chat excerpt and the former southern Arabian gap coloured as British-controlled territory. Playback displayed deployment/defender mobilisation on 2 January and a world development on 12 January while the turn header showed 1 February. Defenders remained represented as units and the one-month campaign did not seize the capital. Map tiles settled after camera movement with no browser errors; a return pan retained visible buffered tiles. Cache reuse, eviction and ownership invalidation were verified separately by unit tests, not a frame-rate benchmark.

The full npm test suite passed after updating the diplomacy fixture for the already-active Italy–Ethiopia war. An additional geometry assertion checks that the former Hadhramaut gap contains a British-controlled province. Preview server, script and test save were removed. Live-provider balance and final user playtesting remain outstanding.


## 17 September 2026 follow-up

Browser checked on temporary port 3013: player flag button visible on map; nation panel shows capital Rome, 278 controlled provinces, 0 formations and Ethiopia by name. Unconfigured leader/ideology cards hidden. Province Details/Logistics and Defend removed. UI verified without advancing time or calling a live model. Automated battle fixtures cover real movement/capture, air missions, silent deployment, atomic rejection, surrender and persisted name/city/capital changes. Camera changes require user hardware playtest; no frame-time benchmark claimed.
