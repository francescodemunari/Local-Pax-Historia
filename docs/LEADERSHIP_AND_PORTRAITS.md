# Leadership and portraits

Updated 20 September 2026.

## Data and coverage

Starting profiles live in `data/leadership-profiles.json`, dated changes in `data/leadership-timeline.json`, and image records in `data/leader-portraits.json`. These are bundled local data: playing and opening a nation panel do not contact Wikimedia or consume model credits. The 2010 German profile uses the scenario's actual `AKA` identifier.

All 311 playable nation/scenario entries now have starting leadership records: 63 for 1910, 75 for 1936, and 173 for 2010. Matching local portraits cover 61, 68, and 149 of those entries respectively. The catalogue contains 492 person records including scheduled successors. Newfoundland in early 1936 uses its collective Commission of Government until Governor Walwyn's recorded arrival on 16 January; a collective administration does not receive an invented personal face.

See `data/leadership-coverage.json` for exact counts and the remaining portrait gaps. A missing photograph uses initials. Political-party and ideology coverage is still partial: unknown values are not guessed. Some imported profiles identify the head of state where no sufficiently dated head-of-government record was available; the role is displayed explicitly.

`node scripts/build_leadership.js` updates missing profiles from dated Wikidata office statements while preserving curated profiles. It imports only terms spanning the start date; uncertain year/month dates use conservative bounds, and automatic succession requires an exact day. Wikipedia titles map the scenario's country names to Wikidata entities. Source entity and revision are retained. Cached API responses are under ignored `data/debug/leadership-import`; requests are paced, batched and stop on persistent rate limits. `--portraits` updates images without importing country terms. The importer is an optional maintenance command, never a server startup step.

The maintenance candidate list in `scripts/leadership-candidates.json` is not runtime data: candidate names only become profiles when dated office statements confirm a national leadership role at the start. Regional/international organisation presidencies are excluded. Manually reviewed exceptions retain their biographical source in the profile. Commons file redirects and ambiguous person names are resolved before selecting licensed portraits. The importer regenerates the distributable credits; `node scripts/build_leader_credits.js` can also rebuild them offline.

## Succession and alternate history

At the recorded date, a historical successor becomes the effective leader and receives their matching catalogue portrait, if available. Routine appointments apply silently when time advances; they do not create playback events. The Game Master can still report a significant death, coup or political crisis. Italy changes from Sidney Sonnino to Luigi Luzzatti on 31 March 1910, then to Giovanni Giolitti on 30 March 1911. Britain includes its 1910 and 1936 royal successions and the Brown–Cameron transition in 2010. Further imported successions cover documented terms within 15 years of each scenario start, when the source office agrees with the starting leader. This is a finite schedule, not a prediction of every possible successor.

Saved changes to leader, party, ideology, government, role or head of state disable the historical schedule for that nation. Annexed states also do not receive scheduled successions. Thus an alternate government is not overwritten by a historical election. Existing saves with explicit political overrides receive the same protection. Countries without a recorded succession retain their current leadership until the Game Master changes it; they do not invent replacements.

Portraits are keyed to a person, not a country. A saved custom portrait is kept for that same leader and ceases to appear after the person changes. The replacement leader receives their own catalogue image or initials. Some historical photographs were taken later than the scenario's start: they depict the correct person, not an exact simulation of their age on that day. Image dates are retained in the catalogue where supplied.

## Portrait controls and rights

Players may upload JPEG, PNG or WebP portraits up to 8 MB. The client decodes and resizes them into a 320 × 400 JPEG; the endpoint accepts bounded JPEG data URLs for the player's current leader only. Images persist in that save. Removing a portrait leaves initials for that leader. Uploading against a stale leader name is rejected.

The image-AI section provides a prompt for an external generator, followed by the normal upload workflow. It does not call an image-generation provider or the configured chat model. Use your own or appropriately licensed images.

Bundled images have individual source/credit/licence records in `data/leader-portraits.json` and a distributable credit list in `frontend/assets/leaders/CREDITS.md`. The importer accepts explicit public-domain, CC0, CC BY or CC BY-SA licences, stores local raster thumbnails, and exposes source and licence links in the nation panel. Files are downloaded unchanged from the credited thumbnail service; display crops use CSS. The original Mussolini asset is credited to Bain News Service / Library of Congress, item 2014717611, with no known restrictions on publication.

## Verification

Code checks cover dated defaults, succession boundaries, old-save political overrides, saved portraits, stale-leader upload rejection, and replacing a predecessor's face. Catalogue checks verify scenario IDs, dated records and local asset presence. Historical source completeness and image composition still require editorial review; a successful import is not a guarantee of exhaustive historical coverage. Browser and screenshot checks remain with the user.

Primary references for the manually entered Italian changes: [Luzzatti government](https://storia.camera.it/governi/i-governo-luzzatti/Ministero%20delle%20poste%20e%20telegrafi), [fourth Giolitti government](https://storia.camera.it/governi/iv-governo-giolitti). [David Cameron's government biography](https://www.gov.uk/government/history/past-prime-ministers/david-cameron) confirms the 11 May 2010 transition.

The saved-game nation-popup endpoint uses the same effective profile and portrait catalogue as the rest of the game. HTTP regression coverage checks a non-Italian leader and that the local image URL is served successfully.

The 1936 Kuwait supplement adds Sheikh Ahmad Al-Jaber Al-Sabah, based on the Kuwaiti government rulers catalogue. No matching portrait is bundled yet; the standard initials fallback applies.
