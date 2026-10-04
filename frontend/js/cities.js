/**
 * City Manager
 * Handles visualization of cities and capitals on the map.
 * Capitals display golden star markers (★) and progressively appear as the map zooms in.
 */

class CityManager {
    constructor(map) {
        this.map = map;
        this.cities = [];
        this.cityMarkers = [];
        this.citiesVisible = true;
        this.map.on('moveend', () => {
            cancelAnimationFrame(this.visibilityFrame);
            this.visibilityFrame=requestAnimationFrame(()=>this.updateVisibility(this.map.getZoom()));
        });

        // Create a dedicated pane for cities above nation labels but below units
        if (!this.map.getPane('citiesPane')) {
            const pane = this.map.createPane('citiesPane');
            pane.style.zIndex = 550;
        }
    }

    /**
     * Load cities from API
     */
    async loadCities(saveId = null) {
        try {
            const response = await fetch(`/api/map/cities${saveId ? `?saveId=${encodeURIComponent(saveId)}` : ''}`);
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

        const mapWidth = (gameMap && gameMap.svgWidth) ? gameMap.svgWidth : 1400.16;

        this.cities.forEach(city => {
            let cx = city.coords ? city.coords[0] : null;
            let cy = city.coords ? city.coords[1] : null;

            if (cx === null || cy === null) return;


            // Replicate markers for world wrapping: middle, left (-mapWidth), right (+mapWidth)
            const xOffsets = [0, -mapWidth, mapWidth];

            xOffsets.forEach(xOffset => {
                const icon = L.divIcon({
                className: 'city-marker',
                html: this.createCityHTML(city),
                iconSize: this.getIconSize(city),
                iconAnchor: this.getIconAnchor(city)
                });

                const position = gameMap.svgToLatLng([cx, cy], xOffset);

                const marker = L.marker(position, {
                    icon: icon,
                    pane: 'citiesPane',
                    interactive: true
                });

                // Clean tooltip label without emoji star
                const tooltipLabel = document.createElement('span');
                tooltipLabel.textContent = city.name;
                const isCapital = city.type === 'capital' || city.is_capital;
                const tooltipClass = `city-label ${isCapital ? 'capital-label' : ''}`;

                marker.bindTooltip(tooltipLabel, {
                    permanent: true,
                    direction: 'bottom',
                    className: tooltipClass,
                    offset: [0, 8]
                });

                marker.isCapital = isCapital;
                marker.cityType = city.type || 'major_city';
                marker.cityId = city.id;
                marker.cityData = city;
                marker.labelMinZoom = Number.isFinite(city.label_min_zoom) ? city.label_min_zoom : null;
                marker.on('click', () => {
                    const path = Array.from(gameMap.svgLayer.getElement().querySelectorAll('path'))
                        .find(path => path.regionData?.id === city.region_id);
                    if (path) gameMap.selectSVGRegion(path);
                });
                marker.addTo(this.map);
                this.cityMarkers.push(marker);
            });
        });

        // Apply initial visibility based on zoom level
        this.updateVisibility(this.map.getZoom());
        requestAnimationFrame(() => this.updateVisibility(this.map.getZoom()));
        console.log(`Rendered ${this.cityMarkers.length} city markers.`);
    }

    /**
    * Create HTML for city icon (clean sleek capital marker, no emojis)
    */
    createCityHTML(city) {
        const isCapital = city.type === 'capital' || city.is_capital;
        const safeName = String(city.name || '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
        if (isCapital) {
            return `<div class="city-capital" title="${safeName}"><span class="capital-star">★</span></div>`;
        }
        return `<div class="${this.getCityClass(city)}" title="${safeName}"></div>`;
    }

    getCityClass(city) {
        if (city.type === 'capital' || city.is_capital) return 'city-capital';
        if (city.type === 'fortress') return 'city-fortress';
        return 'city-major';
    }

    getIconSize(city) {
        const size = (city.type === 'capital' || city.is_capital) ? 14 : 8;
        return [size, size];
    }

    getIconAnchor(city) {
        const size = (city.type === 'capital' || city.is_capital) ? 14 : 8;
        return [size / 2, size / 2];
    }

    /**
     * Clear all city markers
     */
    clearMarkers() {
        this.cityMarkers.forEach(marker => this.map.removeLayer(marker));
        this.cityMarkers = [];
    }

    setVisible(visible) {
        this.citiesVisible = Boolean(visible);
        this.updateVisibility(this.map.getZoom());
    }

    /**
     * Update visibility of city labels based on zoom level.
     * Capital icons and names disappear at overview zoom; city names progressively appear
     * as the player zooms in, preventing Europe and Asia from becoming a text wall.
     */
    updateVisibility(zoom) {
        const occupiedLabels = [], occupiedIcons = [];
        const viewport = this.map.getSize();
        this.cityMarkers.forEach(marker => {
            const point = this.map.latLngToContainerPoint(marker.getLatLng());
            const inView = point.x >= -40 && point.y >= -40 && point.x <= viewport.x + 40 && point.y <= viewport.y + 40;
            const collides = (box, boxes) => boxes.some(other => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y);
            const iconBox = { x: point.x - 10, y: point.y - 10, w: 20, h: 20 };
            const markerVisible = this.citiesVisible && inView && zoom >= (marker.isCapital ? 2.25 : 3.25) && !collides(iconBox, occupiedIcons);
            if (markerVisible) occupiedIcons.push(iconBox);
            const labelWidth = Math.max(50, marker.cityData.name.length * 7 + 14);
            const labelBox = { x: point.x - labelWidth / 2, y: point.y + 10, w: labelWidth, h: 24 };
            const labelVisible = markerVisible && zoom >= (marker.isCapital ? Math.max(2.75, marker.labelMinZoom ?? 0) : 4.15) && !collides(labelBox, occupiedLabels);
            if (labelVisible) occupiedLabels.push(labelBox);
            const tooltipElement = marker.getTooltip()?.getElement();
            if (tooltipElement) tooltipElement.style.display = labelVisible ? 'block' : 'none';
            const iconElement = marker.getElement();
            if (iconElement) iconElement.style.display = markerVisible ? '' : 'none';
        });
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityManager;
}
