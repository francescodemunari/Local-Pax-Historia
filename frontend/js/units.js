/**
 * Unit Manager
 * Handles visualization and interaction with military units on the map
 */

class UnitManager {
    constructor(map) {
        this.map = map;
        this.units = [];
        this.saveId = null;
        this.unitMarkers = {};
        this.unitsVisible = true;
        this.unitIcons = {
            infantry: '🪖',
            cavalry: '🐎',
            armor: '🛡️',
            naval: '⚓',
            air: '✈️'
        };

        // Create dedicated pane for units above cities
        if (!this.map.getPane('unitsPane')) {
            const pane = this.map.createPane('unitsPane');
            pane.style.zIndex = 600;  // Above cities (500)
        }
    }

    /**
     * Load units from API
     */
    async loadUnits(saveId) {
        try {
            this.saveId = saveId;
            const url = `/api/units?saveId=${saveId}`;
            console.log(`Fetching units from: ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                console.error(`Status ${response.status}: Failed to load units`);
                throw new Error('Failed to load units');
            }

            this.units = await response.json();
            console.log(`[UnitManager] Loaded ${this.units.length} units for saveId ${saveId}`);
            console.log('[UnitManager] First unit sample:', this.units[0]);

            this.displayUnits();

            return this.units;
        } catch (error) {
            console.error('Error loading units:', error);
            return [];
        }
    }

    /**
     * Display units on map
     */
    displayUnits() {
        // Clear existing markers
        this.clearUnits();

        // Group units by region
        const unitsByRegion = {};
        this.units.forEach(unit => {
            if (!unit.region_id) return;

            if (!unitsByRegion[unit.region_id]) {
                unitsByRegion[unit.region_id] = {
                    units: [],
                    centroid: unit.centroid
                };
            }
            unitsByRegion[unit.region_id].units.push(unit);
        });

        // Create markers for each region with units
        Object.entries(unitsByRegion).forEach(([regionId, data]) => {
            if (data.centroid) {
                this.createUnitMarker(regionId, data.units, data.centroid);
            }
        });
        this.toggleUnits(this.unitsVisible);
    }

    /**
     * Create a marker showing units in a region
     */
    createUnitMarker(regionId, units, centroid) {
        // SVG [x, y] (top-left) -> Leaflet [y, x] (bottom-left)
        // Transform: Lat = Height - y, Lng = x

        // Get scale factor
        let svgX, svgY;

        // Extract raw SVG coordinates first
        if (Array.isArray(centroid)) {
            [svgX, svgY] = centroid;
        } else if (typeof centroid === 'string') {
            try {
                const parsed = JSON.parse(centroid);
                if (parsed && parsed.coordinates && Array.isArray(parsed.coordinates)) {
                    // GeoJSON format [lng, lat]
                    svgX = parsed.coordinates[0];
                    svgY = parsed.coordinates[1];
                } else if (Array.isArray(parsed)) { // If it's a string like "[100, 200]"
                    [svgX, svgY] = parsed;
                } else {
                    console.warn(`Unexpected centroid format for ${regionId}:`, parsed);
                    return;
                }
            } catch (e) {
                console.warn(`Failed to parse centroid for ${regionId}`, e);
                return;
            }
        } else if (centroid && centroid.coordinates) {
            svgX = centroid.coordinates[0];
            svgY = centroid.coordinates[1];
        }

        if (svgX === undefined || svgY === undefined) {
            console.warn(`Invalid centroid for ${regionId}`, centroid);
            return;
        }

        // Get map width for world wrapping
        const mapWidth = (gameMap && gameMap.svgWidth) ? gameMap.svgWidth : 1400.16;

        // The stored centroid is already in SVG coordinates. Offsetting it here
        // made every unit visibly drift away from its selected deployment region.

        // Create HTML for icon
        const iconHtml = this.createIconHTML(units);

        // Replicate markers for world wrapping: middle, left (-mapWidth), right (+mapWidth)
        const xOffsets = [0, -mapWidth, mapWidth];

        if (!this.unitMarkers[regionId]) {
            this.unitMarkers[regionId] = [];
        }

        xOffsets.forEach(xOffset => {
            const icon = L.divIcon({
                className: 'unit-marker',
                html: iconHtml,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            const position = gameMap.svgToLatLng([svgX, svgY], xOffset);

            const marker = L.marker(position, {
                icon: icon,
                interactive: true,
                pane: 'unitsPane'
            });

            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.showUnitsPopup(regionId, units);
            });

            marker.addTo(this.map);
            this.unitMarkers[regionId].push(marker);
        });
        console.log(`Created unit markers for ${regionId} (including world wrap copies).`);
    }

    /**
     * Create HTML for unit icon
     */
    createIconHTML(units) {
        const typeCounts = {};
        units.forEach(unit => {
            typeCounts[unit.unit_type] = (typeCounts[unit.unit_type] || 0) + 1;
        });

        let html = '<div class="unit-icon-stack">';

        // Show the top unit icon or a combined icon
        const icon = Object.keys(typeCounts).map(type=>this.unitIcons[type] || '⚔️').join('');
        const totalCount = units.length;

        html += `<div class="unit-main-icon" style="font-size:${Object.keys(typeCounts).length>1?11:18}px" title="${Object.keys(typeCounts).filter(type=>Object.hasOwn(this.unitIcons,type)).join(', ')}">${icon}</div>`;
        if (totalCount > 1) {
            html += `<div class="unit-count-badge">${totalCount}</div>`;
        }

        html += '</div>';
        return html;
    }

    /**
     * Show popup with unit details
     */
    showUnitsPopup(regionId, units) {
        const region = gameMap.currentRegions?.find(candidate =>
            candidate.id === regionId || candidate.name === regionId
        );
        if (region && typeof app !== 'undefined' && app.handleRegionClick) {
            app.handleRegionClick(region);
            return;
        }

        const unitList = units.map(u => {
            const icon = this.unitIcons[u.unit_type] || '⚔️';
            const name = u.name || u.unit_name || `${u.nation_code || ''} ${u.unit_type || 'Division'}`;
            const strength = u.strength !== undefined ? u.strength : (u.military_strength || 100);
            return `${icon} ${name} (${strength}% str)`;
        }).join('\n');

        if (typeof app !== 'undefined' && app.showToast) {
            app.showToast(`Units in region:\n${unitList}`, 'info');
        } else {
            alert(`Units in region:\n\n${unitList}`);
        }
    }

    /**
     * Clear all unit markers
     */
    clearUnits() {
        Object.values(this.unitMarkers).forEach(item => {
            if (Array.isArray(item)) {
                item.forEach(m => this.map.removeLayer(m));
            } else if (item) {
                this.map.removeLayer(item);
            }
        });
        this.unitMarkers = {};
    }

    /**
     * Toggle unit visibility
     */
    toggleUnits(visible) {
        this.unitsVisible = Boolean(visible);
        Object.values(this.unitMarkers).forEach(item => {
            const markers = Array.isArray(item) ? item : [item];
            markers.forEach(m => {
                if (visible) {
                    m.addTo(this.map);
                } else {
                    this.map.removeLayer(m);
                }
            });
        });
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnitManager;
}
