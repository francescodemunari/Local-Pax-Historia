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
     * Display cities on map
     */
    displayCities() {
        this.clearMarkers();

        const scale = gameMap.scaleFactor || 1.0;
        // Use exact SVG height from GameMap for accurate coordinate mapping
        const mapHeight = (gameMap && gameMap.svgHeight) ? gameMap.svgHeight : 600;

        this.cities.forEach(city => {
            if (!city.coords || !Array.isArray(city.coords) || city.coords.length < 2) {
                console.warn(`Skipping invalid city: ${city.name}`, city);
                return;
            }

            const isCapital = (city.type === 'capital');

            const icon = L.divIcon({
                className: isCapital ? 'city-marker capital-marker' : 'city-marker',
                html: this.createCityHTML(city),
                iconSize: isCapital ? [16, 16] : [12, 12],
                iconAnchor: isCapital ? [8, 8] : [6, 6]
            });

            // Apply Scaling (to match SVG resolution)
            const scaledX = city.coords[0] * scale;
            const scaledY = city.coords[1] * scale;

            // Transform: Lat = SVGHeight - Y, Lng = X
            const position = [mapHeight - scaledY, scaledX];

            const marker = L.marker(position, {
                icon: icon,
                pane: 'citiesPane',
                interactive: true
            });

            // Tooltip: capitals get ★ prefix and special class
            const tooltipLabel = isCapital ? `★ ${city.name}` : city.name;
            const tooltipClass = isCapital ? 'city-label capital-label' : 'city-label';

            marker.bindTooltip(tooltipLabel, {
                permanent: true,
                direction: 'bottom',
                className: tooltipClass,
                offset: [0, isCapital ? 10 : 8]
            });

            marker.isCapital = isCapital;
            marker.addTo(this.map);
            this.cityMarkers.push(marker);
        });

        // Apply initial visibility based on capital status and current zoom
        this.updateVisibility(this.map.getZoom());
        console.log(`Rendered ${this.cityMarkers.length} city markers (capitals always visible).`);
    }

    /**
     * Create HTML for city icon
     */
    createCityHTML(city) {
        if (city.type === 'capital') {
            return `<div class="city-capital" title="${city.name}"><span class="capital-star">★</span></div>`;
        }
        const typeClass = city.type === 'fortress' ? 'city-fortress' : 'city-major';
        return `<div class="${typeClass}" title="${city.name}"></div>`;
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
     * Capitals are ALWAYS visible; non-capitals display labels when zoomed in.
     */
    updateVisibility(zoom) {
        this.cityMarkers.forEach(marker => {
            const isCapital = marker.isCapital;
            const tooltip = marker.getTooltip();
            if (tooltip) {
                const el = tooltip.getElement();
                if (el) {
                    if (isCapital || zoom >= 1.2) {
                        el.style.display = 'block';
                        el.style.opacity = '1';
                    } else {
                        el.style.display = 'none';
                        el.style.opacity = '0';
                    }
                }
            }

            // Also hide non-capital marker dots at low zoom
            const iconEl = marker.getElement();
            if (iconEl && !isCapital) {
                if (zoom >= 1.0) {
                    iconEl.style.display = '';
                } else {
                    iconEl.style.display = 'none';
                }
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityManager;
}
