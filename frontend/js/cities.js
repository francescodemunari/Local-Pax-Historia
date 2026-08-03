/**
 * City Manager
 * Handles visualization of cities and capitals on the map.
 * Capitals display golden star markers (★) and are always visible.
 */

class CityManager {
    constructor(map) {
        this.map = map;
        this.cities = [];
        this.cityMarkers = [];

        // Create a dedicated pane for cities above nation labels but below units
        if (!this.map.getPane('citiesPane')) {
            const pane = this.map.createPane('citiesPane');
            pane.style.zIndex = 550;
        }
    }

    /**
     * Load cities from API
     */
    async loadCities() {
        try {
            const response = await fetch('/api/map/cities');
            if (!response.ok) throw new Error('Failed to fetch cities');
            this.cities = await response.json();
            console.log(`Loaded ${this.cities.length} cities`);
            this.displayCities();
        } catch (error) {
            console.error('Error loading cities:', error);
        }
    }

    /**
     * Display cities on map (with 3-copy world wrapping replication)
     */
    displayCities() {
        this.clearMarkers();

        const scale = gameMap.scaleFactor || 1.0;
        const mapHeight = (gameMap && gameMap.svgHeight) ? gameMap.svgHeight : 600;
        const mapWidth = (gameMap && gameMap.svgWidth) ? gameMap.svgWidth : 1400.16;

        // ONLY keep capital cities as requested
        const capitalCities = this.cities.filter(city => city.type === 'capital' || city.is_capital);

        capitalCities.forEach(city => {
            let cx = city.coords ? city.coords[0] : null;
            let cy = city.coords ? city.coords[1] : null;

            // Dynamically query native SVG path getBBox() for sub-pixel accuracy
            const targetRegionId = city.region_id || city.id;
            const svgPath = document.querySelector(`.map-svg-overlay path[id="${targetRegionId}"]`);
            if (svgPath) {
                try {
                    const bbox = svgPath.getBBox();
                    if (bbox && bbox.width > 0 && bbox.height > 0) {
                        cx = bbox.x + bbox.width / 2;
                        cy = bbox.y + bbox.height / 2;
                    }
                } catch (e) {}
            }

            if (cx === null || cy === null) return;

            const scaledX = cx * scale;
            const scaledY = cy * scale;
            const baseLat = mapHeight - scaledY;

            // Replicate markers for world wrapping: middle, left (-mapWidth), right (+mapWidth)
            const xOffsets = [0, -mapWidth, mapWidth];

            xOffsets.forEach(xOffset => {
                const icon = L.divIcon({
                    className: 'city-marker capital-marker',
                    html: this.createCityHTML(city),
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });

                const position = [baseLat, scaledX + xOffset];

                const marker = L.marker(position, {
                    icon: icon,
                    pane: 'citiesPane',
                    interactive: true
                });

                // Clean tooltip label without emoji star
                const tooltipLabel = city.name;
                const tooltipClass = 'city-label capital-label';

                marker.bindTooltip(tooltipLabel, {
                    permanent: true,
                    direction: 'bottom',
                    className: tooltipClass,
                    offset: [0, 8]
                });

                marker.isCapital = true;
                marker.cityId = city.id;
                marker.addTo(this.map);
                this.cityMarkers.push(marker);
            });
        });

        // Apply initial visibility based on zoom level
        this.updateVisibility(this.map.getZoom());
        console.log(`Rendered ${this.cityMarkers.length} capital city markers.`);
    }

    /**
     * Create HTML for city icon (clean sleek capital marker, no emojis)
     */
    createCityHTML(city) {
        return `<div class="city-capital" title="${city.name}"></div>`;
    }

    /**
     * Clear all city markers
     */
    clearMarkers() {
        this.cityMarkers.forEach(marker => this.map.removeLayer(marker));
        this.cityMarkers = [];
    }

    /**
     * Update visibility of city labels based on zoom level.
     * Hides all city labels and markers when zoomed out (zoom < 1.4) to keep the map clean.
     */
    updateVisibility(zoom) {
        const visible = zoom >= 1.4;

        this.cityMarkers.forEach(marker => {
            const tooltip = marker.getTooltip();
            if (tooltip) {
                const el = tooltip.getElement();
                if (el) {
                    el.style.display = visible ? 'block' : 'none';
                    el.style.opacity = visible ? '1' : '0';
                }
            }

            const iconEl = marker.getElement();
            if (iconEl) {
                iconEl.style.display = visible ? '' : 'none';
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityManager;
}
