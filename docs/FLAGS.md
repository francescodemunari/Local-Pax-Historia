# Country flags

Updated 15 September 2026. Nation selection and in-game country details use local SVG flags resolved by scenario, country and campaign date. Known dated variants are selected when available; otherwise the initial scenario flag remains. This is not a regime-change simulation: changing a country's government in prose does not automatically change its identity or flag.

Starting coverage: 62 of 63 countries in 1910, 73 of 74 in 1936, and all 173 in 2010. Bhutan has no verified pre-1949 asset in this bundle and displays its country code. Missing flags are never replaced with invented historical designs.

The primary source is [Fredrik Niemelä's flags collection](https://github.com/niemela/flags), pinned in `data/flags/source-revision.txt`. The selected metadata, periods and source links are in `data/flags/catalog.json`. Metadata uses CC BY-SA 4.0; source code uses MIT. Individual flag images retain their original licenses, generally public domain or Creative Commons; retain the source attribution and review individual rights before redistribution. See `data/flags/LICENSE.txt`.

Seven additional Wikimedia Commons files fill source gaps. Their original URLs, authors and license metadata are retained in `data/flags/commons-metadata.json` and the catalog. These cover historical Mexico, Hungary, Iceland, Morocco, Venezuela and Afghanistan. Images are served locally; gameplay does not request them from an external host.

Selection exceptions are explicit: the United Kingdom uses the Union Flag, not its civil air ensign; Natal and Transvaal use the imperial British flag at the 1910 start. Austria-Hungary uses its joint civil ensign as a representative symbol, since it had no universal single national flag. Netherlands, Ireland and Panama use their established designs even where the dataset's period starts with a later legal adoption. These choices are representational limits, not claims of exhaustive vexillological accuracy.

Rebuild from `backend/` with `npm run build:flags`. The builder downloads the pinned source index when its ignored cache is absent; the completion script adds verified Commons assets and regenerates coverage. Adding a scenario requires matching its own country codes and start date, reviewing chosen variants and their provenance, and running `npm run test:actions-flow` to check asset references and representative dates.

## Kuwait supplement — 20 September 2026

The 1936 Sheikhdom of Kuwait uses the bundled `KW_1915.svg`, based on [Jaume Ollé's historical flag](https://commons.wikimedia.org/wiki/File:Flag_of_Kuwait_(1915–1956).svg), under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Later SVG contributors are credited on its source page. The original SVG is stored locally unchanged. The completion script preserves its mapping and subsequent flag variants.
