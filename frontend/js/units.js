/**
 * Unit Manager
 * Handles visualization and interaction with military units on the map
 */

class UnitManager {
    constructor(map) {
        this.map = map;
        this.units = [];
        this.unitMarkers = {};
        this.unitIcons = {
            infantry: '🪖',
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

            if (this.units.length > 0) {
                this.displayUnits();
            } else {
                console.warn('[UnitManager] No units returned from API.');
            }

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
    }

    /**
     * Create a marker showing units in a region
     */
    createUnitMarker(regionId, units, centroid) {
        // SVG [x, y] (top-left) -> Leaflet [y, x] (bottom-left)
        // Transform: Lat = Height - y, Lng = x

        // Get scale factor
        const scale = gameMap.scaleFactor || 1.0;
        const mapHeight = this.map.options.maxBounds ? this.map.options.maxBounds[1][0] : 600;

        // Visual Alignment Offsets (match cities.js)
        const OFFSET_X = 35;
        const OFFSET_Y = -35;

        let position;
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

        // Apply Offsets, Scaling and Transformation
        const scaledX = (svgX + OFFSET_X) * scale;
        const scaledY = (svgY + OFFSET_Y) * scale;
        const baseLat = mapHeight - scaledY;

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

            const position = [baseLat, scaledX + xOffset];

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
        const topType = units[0].unit_type;
        const icon = this.unitIcons[topType] || '⚔️';
        const totalCount = units.length;

        html += `<div class="unit-main-icon">${icon}</div>`;
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
        if (this.regionManager && typeof this.regionManager.selectRegion === 'function') {
            this.regionManager.selectRegion(regionId);
        } else if (window.app && window.app.regionManager && typeof window.app.regionManager.selectRegion === 'function') {
            window.app.regionManager.selectRegion(regionId);
        } else {
            const unitList = units.map(u => {
                const icon = this.unitIcons[u.unit_type] || '⚔️';
                const name = u.name || u.unit_name || `${u.nation_code || ''} ${u.unit_type || 'Division'}`;
                const strength = u.strength !== undefined ? u.strength : (u.military_strength || 100);
                return `${icon} ${name} (${strength}% str)`;
            }).join('\n');

            if (window.app && window.app.showToast) {
                window.app.showToast(`Units in region:\n${unitList}`, 'info');
            } else {
                alert(`Units in region:\n\n${unitList}`);
            }
        }
    }

    /**
     * Create a new unit
     */
    async createUnit(unitData) {
        try {
            const response = await fetch('/api/units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unitData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create unit');
            }

            const newUnit = await response.json();
            console.log('Unit created:', newUnit);

            // Reload units
            await this.loadUnits(unitData.nation_code);
            this.displayUnits();

            return newUnit;
        } catch (error) {
            console.error('Error creating unit:', error);
            alert(`Failed to create unit: ${error.message}`);
        }
    }

    /**
     * Move a unit to a different region
     */
    async moveUnit(unitId, toRegionId) {
        try {
            const response = await fetch(`/api/units/${unitId}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_region_id: toRegionId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to move unit');
            }

            const result = await response.json();
            console.log('Unit moved:', result);

            // TODO: Animate movement
            // For now, just reload
            const unit = this.units.find(u => u.id === unitId);
            if (unit) {
                await this.loadUnits(unit.nation_code);
                this.displayUnits();
            }

            return result;
        } catch (error) {
            console.error('Error moving unit:', error);
            alert(`Failed to move unit: ${error.message}`);
        }
    }

    /**
     * Disband a unit
     */
    async disbandUnit(unitId) {
        if (!confirm('Are you sure you want to disband this unit?')) return;

        try {
            const response = await fetch(`/api/units/${unitId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to disband unit');
            }

            console.log('Unit disbanded');

            // Reload units
            const unit = this.units.find(u => u.id === unitId);
            if (unit) {
                await this.loadUnits(unit.nation_code);
                this.displayUnits();
            }
        } catch (error) {
            console.error('Error disbanding unit:', error);
            alert(`Failed to disband unit: ${error.message}`);
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
