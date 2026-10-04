# Map readiness

Updated 14 September 2026. New games use named Natural Earth admin-1 province geometry clipped to dated CShapes borders. The rectangular sector grid is gone. Hover preserves country colour with a thin muted outline; selection adds a restrained gold outline.

| Scenario | Province fragments | Administrations | Cities |
| --- | ---: | ---: | ---: |
| ww1-1910 | 14,285 | 63 | 81 |
| ww2-geographic | 15,267 | 74 | 94 |
| world-2010 | 16,689 | 173 | 539 |

Counts include disconnected islands and coastal fragments, not just unique province names. City coordinates retain their true projection; coastal associations are annotated instead of moving cities inland. Eight optional 2010 city markers remain omitted where source coverage is too distant. Nation labels use geographic anchors and zoom-dependent visibility.

Historical internal divisions are approximate because the province source is modern. Numerical resources are disabled; scenario briefings describe qualitative constraints. See [geographic architecture](GEOGRAPHIC_MAPS.md) for sources, dated control overlays, rebuilding and licensing.

Older geographic sector saves and 1914 campaigns retain hidden compatible bundles. The illustrated WWII map, dedicated data and map-specific tests have been removed; its saves are unsupported.

Run `cd backend` then `npm test` for scenario integrity, recruitment, movement and save compatibility. `npm run test:geographic-browser` is a separate browser suite. The settings UI has been inspected for endpoint filling, missing credentials, discovery failure and selection from a local mock model list. Province rendering was inspected in the in-app browser. Final campaign and live-model verification remain with the user.

## Home and rendering update — 15 September 2026

The home library now centers scenario cards and offers a Recent Games tab with resumable campaigns, refresh and empty/error states. Capital icons hide below zoom 2.25; capital names appear from 2.75 with overlap suppression. Display paths use a 0.004-degree simplification tolerance while canonical geometry, adjacency, IDs and anchors remain unchanged. The map API can omit duplicate path strings for the browser. See [performance measurements and limits](MAP_PERFORMANCE.md).

## Cached renderer and reliability follow-up

The visible map now uses cached canvas tiles and spatially indexed province picking, retaining a single hidden geometry reference. Search selection and direct clicks after dragging were checked in the browser; tile wrapping, coordinate origins and ownership color refresh have targeted regression coverage. See [MAP_PERFORMANCE.md](MAP_PERFORMANCE.md).

The automated suite also covers robust event JSON parsing, explicit disbanding and persistent rejected-proposal explanations. See [AI_RELIABILITY.md](AI_RELIABILITY.md). This does not complete combat, historical province research or the user-owned final playtest.

## Operational forces and atlas follow-up

Military operation orders can now mobilise the previously untracked forces needed to attempt them, without requiring a separate recruitment order. All public scenarios include naval and era-appropriate air formations; existing troops are reused first. Placement still requires controlled territory. Ground invasions now use persistent campaign orders; only engine-confirmed captures count. Tactical casualties and sea/air transfers remain unsupported.

Greenland is supplied from Natural Earth with 135 province/island components under the Danish realm. Internal boundaries are modern approximations, including in historical scenarios. Existing region IDs remain unchanged. `scripts/complete_geography.py` maintains this supplement, country palettes and display simplification; the main compiler runs it automatically. Major country colours now use curated cartographic choices (not official state colours), with an era-specific Soviet palette.

Unchanged provinces no longer repaint the country base; only occupation colour overlays paint separately. Worker paths are created lazily, coast/base drawing paths are simplified and offscreen nation labels are removed from the active map. These changes reduce drawing and DOM work; actual frame rate depends on hardware.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).


## 17 September 2026 campaign playback

Advances now expose every connected province step, with its own unit snapshot, route segment and captured control. Tests cover Eritrean and Somali staging fronts separately. This changes campaign resolution/playback, not the underlying province geometry or historical accuracy.


## Aden Protectorate gap — 17 September 2026

CShapes omits the southern Arabian land around Hadhramaut in the WWII bundle. scripts/supplement_aden.py clips Natural Earth Yemen admin-1 polygons against existing dated territories and fills the uncovered mainland with six British-controlled provinces, retaining existing IDs. It runs after complete_geography.py. Kingdom of Yemen replaces the anachronistic Arab Republic label. The supplement uses approximate modern internal boundaries; it does not claim exact historic protectorate subdivision borders.

British protection is supported by the contemporary [19 May 1936 Hansard protectorates list](https://hansard.parliament.uk/Commons/1936-05-19/debates/2284dbbe-0d0b-4d09-b93a-fdcddaf60953/ProtectoratesAndMandatedTerritories). The [National Archives guidance](https://cdn.nationalarchives.gov.uk/documents/migrated-archives-guidance.pdf) distinguishes Aden's pre-1937 Indian administration from its later Crown Colony status. The game groups the protected territory under Britain, consistent with other imperial control abstractions.


## 1910 Arabia coverage — 17 September 2026

48 omitted Arabian land fragments are now selectable Natural Earth admin-1 based provinces under the non-playable `ARA` local-administration group. This is explicitly a coverage abstraction, not a reconstruction of the actual 1910 emirates, tribal authority or protectorate boundaries. Existing dated sovereignty is preserved by geometric subtraction. These are not uninhabited/unclaimed tiles. Model-resolved territorial settlements can change their controllers using real region IDs. `supplement_arabia.py` is reproducible and integrated with the completion script. Curating individual historical administrations remains outstanding.

## Northern Arabian coverage — 18 September 2026

The reproducible 1910 supplement now contains 48 provinces. Its source coverage adds Iraq, Jordan, Kuwait, Qatar and Bahrain to Saudi Arabia, Yemen, Oman and the UAE, subtracting existing scenario geometry before adding fragments. This closes additional northern/Gulf gaps while preserving existing dated territory. The local-administration grouping remains an explicit approximation.

## Camera and battle playback — 19 September 2026

The hidden province SVG is detached after bounds are cached, removing its geometry from camera-related layout. Ownership changes retain visible tile canvases until replacement pixels arrive. Battle playback draws every ground route and air mission, with air sorties returning to their recorded base. Code/worker tests pass; actual drag-release and event-camera responsiveness remain the player's verification. No new boundary-accuracy claim follows from these rendering changes.

## Labels — 20 September 2026

Fixed detached polygon containment used by nation-label anchors, interior points and territory sizing. The performance improvement remains in place. Code tests verify interior points and holes; visual label placement remains a user check.

## Coverage and coastlines — 20 September 2026

Removed the independent gray Natural Earth backdrop from all three SVGs: its coastline differed from dated CShapes geometry, creating decorative, non-selectable strips. Country/province geometry remains authoritative. This does not claim every omitted island or historical boundary has been reconstructed.

`supplement_missing_land.py` subtracts existing territory from Natural Earth admin-1 polygons before adding ten 1910 Moroccan fragments and eight 1936 Kuwaiti fragments. Existing IDs and sovereignty remain intact. Morocco's added areas are grouped under Morocco before the formal 1912 protectorates; local occupation and influence are not separately simulated. Kuwait is represented as a sheikhdom under British protection with its own administration. Its modern provincial subdivisions and the Kuwait/Saudi neutral-zone boundary are approximations. The added Kuwaiti capital lies within its mapped province. Sources: [Spain's defence library on the 1912 protectorate](https://bibliotecavirtual.defensa.gob.es/BVMDefensa/es/consulta_aut/registro.do?id=328515), [Kuwait government history](https://e.gov.kw/sites/kgoenglish/Pages/Visitors/AboutKuwait/GoverningBodyOverView.aspx), [Kuwaiti rulers](https://e.gov.kw/sites/kgoEnglish/Pages/Visitors/AboutKuwait/GoverningBodyKuwaitGoverners.aspx).
