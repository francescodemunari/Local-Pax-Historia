/**
 * Region Manager
 * Handles visualization and interaction with map regions
 */

class RegionManager {
    constructor(map) {
        this.map = map;
        this.regions = [];
        this.regionLayers = {};
        this.selectedRegion = null;

        // Create a custom pane for regions to stay above nation colors
        // Default overlayPane is 400. We'll put regions at 450.
        if (!this.map.getPane('regionsPane')) {
            const pane = this.map.createPane('regionsPane');
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none'; // Will be enabled per layer
        }

        this.initPopup();

        // Map click handler to deselect
        this.map.on('click', () => {
            this.deselectAll();
            this.closePopup();
        });
    }

    initPopup() {
        this.popup = document.getElementById('region-popup');
        if (this.popup) {
            this.popupElements = {
                name: document.getElementById('popup-region-name'),
                nation: document.getElementById('popup-region-nation'),
                capacity: document.getElementById('popup-region-capacity'),
                infra: document.getElementById('popup-region-infra'),
                units: document.getElementById('popup-region-units'),
                unitList: document.getElementById('popup-unit-list'),
                closeBtn: this.popup.querySelector('.popup-close'),
                moveBtn: document.getElementById('popup-btn-move-here')
            };

            if (this.popupElements.closeBtn) {
                this.popupElements.closeBtn.onclick = () => this.closePopup();
            }

            if (this.popupElements.moveBtn) {
                this.popupElements.moveBtn.onclick = () => {
                    console.log(`Moving unit to region: ${this.selectedRegion}`);
                    alert(`Command received: Moving unit to ${this.popupElements.name.textContent}`);
                };
            }
        }
    }

    async loadRegions(nationCode = null) {
        try {
            const url = nationCode
                ? `/api/regions?nation_code=${nationCode}`
                : '/api/regions';

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load regions');

            this.regions = await response.json();
            console.log(`Loaded ${this.regions.length} regions`);
            return this.regions;
        } catch (error) {
            console.error('Error loading regions:', error);
            return [];
        }
    }

    drawRegions() {
        this.clearRegions();
        this.regions.forEach(region => {
            if (!region.coordinates) return;
            try {
                const coordinates = typeof region.coordinates === 'string'
                    ? JSON.parse(region.coordinates)
                    : region.coordinates;

                const layer = L.geoJSON(coordinates, {
                    style: this.getDefaultStyle(),
                    pane: 'regionsPane',
                    interactive: true
                });

                layer.on({
                    mouseover: (e) => {
                        L.DomEvent.stopPropagation(e);
                        this.highlightRegion(region.id);
                    },
                    mouseout: (e) => {
                        L.DomEvent.stopPropagation(e);
                        this.unhighlightRegion(region.id);
                    },
                    click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        this.selectRegion(region.id);
                    }
                });

                layer.addTo(this.map);
                this.regionLayers[region.id] = layer;
            } catch (error) {
                console.error(`Error drawing region ${region.name}:`, error);
            }
        });
    }

    getDefaultStyle() {
        return {
            color: '#ffffff',
            weight: 1.5,
            opacity: 0.6,
            fillOpacity: 0,
            dashArray: '4, 4'
        };
    }

    getHoverStyle() {
        return {
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.1
        };
    }

    getSelectedStyle() {
        return {
            color: '#f59e0b',
            fillColor: '#f59e0b',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.2,
            dashArray: null
        };
    }

    highlightRegion(regionId) {
        if (regionId === this.selectedRegion) return;
        const layer = this.regionLayers[regionId];
        if (layer) {
            layer.setStyle(this.getHoverStyle());
            layer.bringToFront();
        }
    }

    unhighlightRegion(regionId) {
        if (regionId === this.selectedRegion) return;
        const layer = this.regionLayers[regionId];
        if (layer) {
            layer.setStyle(this.getDefaultStyle());
        }
    }

    selectRegion(regionId) {
        this.deselectAll();
        this.selectedRegion = regionId;
        const layer = this.regionLayers[regionId];
        if (layer) {
            layer.setStyle(this.getSelectedStyle());
            layer.bringToFront();
        }
        const region = this.regions.find(r => r.id === regionId);
        if (region) {
            this.showRegionInfo(region);
        }
    }

    deselectAll() {
        if (this.selectedRegion) {
            const layer = this.regionLayers[this.selectedRegion];
            if (layer) {
                layer.setStyle(this.getDefaultStyle());
            }
            this.selectedRegion = null;
        }
    }

    async showRegionInfo(region) {
        if (!this.popup) return;
        try {
            this.popupElements.name.textContent = region.name;
            this.popupElements.nation.textContent = region.nation_code || '';
            this.popupElements.capacity.textContent = region.supply_capacity || '15';
            this.popupElements.infra.textContent = `${region.infrastructure || 0}/10`;
            this.popupElements.units.textContent = '...';
            this.popupElements.unitList.innerHTML = '<p class="loading">Loading units...</p>';

            this.popup.classList.remove('hidden');

            // Fetch region stats (count)
            const statsResponse = await fetch(`/api/regions/${region.id}/stats`);
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                this.popupElements.nation.textContent = stats.nation_name || region.nation_code;
                this.popupElements.units.textContent = stats.unit_count || 0;
            }

            // Fetch actual units
            const unitsResponse = await fetch(`/api/units?region_id=${region.id}`);
            if (unitsResponse.ok) {
                const units = await unitsResponse.json();
                this.renderUnitsList(units);
            }
        } catch (error) {
            console.error('Error loading region info:', error);
        }
    }

    /**
     * Render list of units in the popup
     */
    renderUnitsList(units) {
        if (!this.popupElements.unitList) return;

        if (units.length === 0) {
            this.popupElements.unitList.innerHTML = '<p class="no-units">No units stationed here.</p>';
            return;
        }

        const unitIcons = {
            'infantry': '💂',
            'armor': '🚜',
            'naval': '⚓',
            'air': '✈️'
        };

        this.popupElements.unitList.innerHTML = units.map(unit => `
        <div class="unit-item">
            <div class="unit-item-icon">${unitIcons[unit.unit_type] || '⚔️'}</div>
            <div class="unit-item-info">
                <span class="unit-item-name">${unit.unit_name}</span>
                <span class="unit-item-stats">Str: ${unit.strength}% | Org: ${unit.organization}%</span>
            </div>
        </div>
    `).join('');
    }

    closePopup() {
        if (this.popup) {
            this.popup.classList.add('hidden');
        }
    }

    clearRegions() {
        Object.values(this.regionLayers).forEach(layer => {
            this.map.removeLayer(layer);
        });
        this.regionLayers = {};
        this.selectedRegion = null;
    }

    toggleRegions(visible) {
        Object.values(this.regionLayers).forEach(layer => {
            if (visible) layer.addTo(this.map);
            else this.map.removeLayer(layer);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RegionManager;
}
