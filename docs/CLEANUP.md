# Repository cleanup

Updated 14 September 2026. Removed the illustrated WWII scenario and SVG, dedicated nation/city/region data and roadmaps, fixed label coordinates, converters, and dedicated map validation/browser scripts. General engine, API and movement tests now use geographic maps.

Hidden geographic sector bundles and the earlier 1914 province bundle remain required for existing campaigns. Illustrated-map save files remain untouched but cannot be played in this version.

Dependencies, settings, saves, debug output and generated screenshots are ignored. Maintained source data, compiler, regression scripts and documentation remain tracked. Prior unused styles, converter-package files and dependencies were removed; existing Git history is unchanged.

Install with `cd backend` then `npm ci`. Run `npm test` for regression checks without paid inference. Future readiness and maintenance documentation belongs in this folder.

15 September: retained canonical maps and compatibility bundles while regenerating smaller display-only SVG paths. Added an optimizer script and capital-visibility regression check. No user campaign was deleted or changed during the home/zoom review.
