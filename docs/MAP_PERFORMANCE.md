# Map rendering and home library

4 October 2026: backend control snapshots and province counts use a fresh index built from sparse occupation overrides. Context/map responses reuse that snapshot; country summaries count all provinces in one pass. This reduces repeated scans across nations and province lists. No mutable-state cache is retained during captures, and old name-based overrides keep their original precedence. Real-map checks cover all three scenarios; no live frame-rate measurement was taken.

Tile painting now runs in a dedicated worker using OffscreenCanvas and transferable bitmaps where supported. Geometry is sent once; ownership changes update colors before redraw. Unloaded tile results are discarded. Worker failures retain the main-thread canvas fallback. Nation-label measurements batch layout reads before scale writes. Initial geometry parsing and label construction still have a main-thread cost; this is not a cross-device FPS guarantee.

Updated 15 September 2026.

The previous home grid reserved four columns for three scenarios, leaving the content visibly off-center. It now fills a shared centered container, with Scenarios and Recent Games sections. Recent games use real save metadata, most recent first, and can be resumed directly. Refresh, loading, empty and failure states are included; Load Game retains access to the complete save manager.

## Rendering changes

- The browser no longer receives complete path strings twice: `compact=1` omits paths from the map metadata response because the SVG already contains the drawing geometry. The normal API response and backend map assets retain full paths.
- SVG display paths are simplified at 0.004 degrees, roughly half a pixel at maximum zoom. An original path is retained if simplification would exclude its deployment anchor. Canonical geographic polygons, region IDs, adjacency, movement distances and ownership are unchanged.
- Visible geography is painted into cached 256px canvas tiles. Leaflet reuses tiles during panning and scales them during zoom, then draws tiles at the settled zoom. One hidden SVG supplies geometry and coordinates instead of three painted world copies. A spatial index narrows both tile painting and pointer hit testing to nearby shapes. Country recoloring explicitly invalidates the tile cache.
- Hover hit testing runs at most once per animation frame and pauses during dragging and zooming. Only the selected/hovered province uses a small outline overlay. Pointer handlers and cached geometry are released when changing maps. Wrapping and nonzero viewBox origins are supported. High-DPI tile buffers are capped at 2x.
- Capital icons hide below zoom 2.25; labels hide below 2.75. Cities appear later. Viewport and rectangle-overlap checks suppress offscreen and crowded markers, and update after movement ends.

## Measured asset sizes

| Display SVG | Before | After |
| --- | ---: | ---: |
| 1910 | 25,228,639 bytes | 13,372,938 bytes |
| 1914 compatibility | 25,234,601 | 13,373,552 |
| 1936 | 25,561,637 | 13,636,773 |
| 2010 | 25,969,776 | 13,987,723 |

The 1910 map metadata drops from 26,878,026 to 5,205,245 serialized bytes in compact mode. These are asset/payload measurements, not frame-rate claims. Cached canvas tiles now replace the three painted SVG world copies. An inspected 1280px browser viewport used 20 canvas tiles, one hidden vector reference and three single-province selection outlines. Initial geometry parsing remains on the main thread. Tile painting now uses a dedicated worker with OffscreenCanvas and transferable bitmaps where supported, with the existing main-thread fallback. This is not a measured FPS guarantee across hardware.

`scripts/optimize_map_display.py` regenerates display paths from existing canonical bundles without a complete geographic rebuild. The normal compiler applies the same display simplification. `npm test` includes capital visibility and compact-API regression checks. Tile regression checks cover wrapping, nonzero origins, polygon holes, transforms, high-DPI limits and ownership colors. Browser checks confirmed Rome search/selection and direct selection of Benevento after dragging, with no console errors. Final campaign/live-provider testing remains manual.

## Operational forces and atlas follow-up

Military operation orders can now mobilise the previously untracked forces needed to attempt them, without requiring a separate recruitment order. All public scenarios include naval and era-appropriate air formations; existing troops are reused first. Placement still requires controlled territory. Ground invasions now use persistent campaign orders; only engine-confirmed captures count. Tactical casualties and sea/air transfers remain unsupported.

Greenland is supplied from Natural Earth with 135 province/island components under the Danish realm. Internal boundaries are modern approximations, including in historical scenarios. Existing region IDs remain unchanged. `scripts/complete_geography.py` maintains this supplement, country palettes and display simplification; the main compiler runs it automatically. Major country colours now use curated cartographic choices (not official state colours), with an era-specific Soviet palette.

Unchanged provinces no longer repaint the country base; only occupation colour overlays paint separately. Worker paths are created lazily, coast/base drawing paths are simplified and offscreen nation labels are removed from the active map. These changes reduce drawing and DOM work; actual frame rate depends on hardware.

## Persistent campaigns and manual playback — 16 September 2026

Ground invasions now persist across turns, update unit positions and captured provinces together, and support AI-adjudicated surrender and annexation. Playback uses manual Next/Finish with per-event map changes and animated routes. Mixed formation icons and independent world-event validation are implemented. See [campaign rules and limitations](CAMPAIGNS.md).

Worker paint indexing now excludes unchanged province overlays entirely. Main-thread Path2D objects are created lazily for picking or fallback painting. Unchanged ownership skips tile redraw, and turns without territory changes refresh units without reloading all cities and nation labels. Animated event routes are small, temporary Leaflet layers; Next and Finish cancel previous animations. These reduce work but do not establish a hardware-independent FPS guarantee.

Compact ownership refreshes preserve province anchors and geographic paint metadata, preventing event-camera fallback and unnecessary province painting after a turn. Deployment events retain a snapshot of their original staging position even when the campaign subsequently moves the formation.


## Tile revisit cache — 17 September 2026

Panning does not reload the scenario from the server. Leaflet previously discarded offscreen raster tiles, so revisiting them caused repeated painting. A least-recently-used pixel cache now retains up to 32 MiB beyond Leaflet's visible tiles, invalidated on ownership changes and scenario removal. New tiles are requested during panning at a bounded update interval. Completed offscreen worker jobs may populate the cache; obsolete ownership results are discarded. The cache limits retained pixel buffers, not total browser memory. First-time views and zoom levels still require painting; no universal frame-rate claim is made.


## Camera-release update — 17 September 2026

Nation labels now retain their Leaflet layers across panning and recompute scale/visibility only when zoom or label data changes. City visibility is scheduled for the next animation frame. The hidden vector reference keeps fixed SVG dimensions/transform, avoiding geometry relayout when Leaflet rescales the camera. Hover polygon parsing/hit-testing is sent to the tile worker; stale pointer replies are discarded. Click selection retains a synchronous fallback. Raster tiles still load as new areas/zoom levels enter view; this is not a full map reload. No measured frame-time guarantee is claimed. Worker-unavailable fallback remains more expensive.

## Worker queue and deepest zoom — 18 September 2026

Unloaded tile requests are cancelled before painting when still queued. The worker yields between tiles and chooses the most recently requested tile first, allowing navigation and hit-test messages between paint jobs. A paint already running cannot be interrupted. Leaflet uses native tiles through zoom 4 and scales those at zoom 5, trading some maximum-zoom sharpness for less painting. Tile fading is disabled to avoid repeated opacity transitions. These reduce avoidable work; no frame-time measurement or claim of eliminating all navigation pauses is made.

## Detached geometry and retained capture tiles — 19 September 2026

The geometry-only SVG is removed from the Leaflet map after its path bounds are cached. Search, focus and labels use the detached reference and cached bounds. Camera transforms and interaction classes therefore no longer relayout the entire hidden SVG tree. Ownership redraws keep each existing visible canvas until replacement pixels are ready, avoiding a blank map during capture playback. Revision checks discard stale worker results. Tests cover cached bounds, retained canvas identity, replacement clearing and multi-route cleanup. No browser trace or frame-rate measurement was performed; the user will assess remaining navigation latency.

## Detached geometry regression — 20 September 2026

Native SVG isPointInFill can fail on detached geometry. Labels now share canvas Path2D containment with map picking, including polygon holes. This restores scenario-curated anchors and meaningful territory spans without reattaching the heavy SVG or adding pan-end work.

## Modern atlas work reduction — 20 September 2026

`optimise_map_display.py` separates distant island components in non-interactive country fills and border paths. Canvas tile culling can now discard unrelated islands instead of rasterizing one worldwide-bounding path per tile. Nested holes stay attached to their exterior; gameplay province geometry and IDs are unchanged. The optimizer is idempotent and applied to all scenarios by the completion pipeline. Generated SVG markup is slightly larger because component attributes repeat; the optimization targets rasterization work, not download size.

Worker hover/click picking now uses spatial buckets and a reused hit-test context. It no longer copies/reverses the complete atlas or constructs a canvas for every hit request. CLI tests cover selection, holes and display-component repeatability; actual modern-map latency remains a player check.
