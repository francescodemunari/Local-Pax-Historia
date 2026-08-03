/**
 * Pax Historia - Map Module
 * Handles the interactive world map using Leaflet
 */

class GameMap {
    constructor() {
        this.map = null;
        this.svgLayer = null; // New native SVG overlay
        this.svgWidth = 1400.16;
        this.svgHeight = 600;
        this.nationColors = {};
        this.selectedSVGPath = null;
        this.mainLayerGroup = null;
    }

    /**
     * Initialize the flat SVG map using Leaflet
     */
    init() {
        // Create map with simple CRS for flat SVG coordinates
        this.map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -1,  // Will be recalculated dynamically after SVG loads
            maxZoom: 5,
            zoomControl: false,
            attributionControl: false,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 120,
            maxBoundsViscosity: 1.0
        });

        // Add zoom listener for labels
        this.map.on('zoomend', () => this.updateLabelsVisibility());

        // Setup controls
        this.setupControls();

        // Setup search
        this.setupSearch();

        console.log('Map initialized');
    }

    /**
     * Load nation colors from backend (JSON-based)
     */
    async loadNationColors() {
        try {
            const response = await fetch('/api/map/colors');
            const colors = await response.json();
            this.nationColors = colors;
            return colors;
        } catch (error) {
            console.error('Failed to load nation colors:', error);
            return {};
        }
    }

    /**
     * Load and display HOI4 map data from SVG-derived JSON
     */
    async asyncLoadMapData() {
        try {
            console.log('Loading HOI4 colors and map data...');

            // Load colors first
            await this.loadNationColors();

            const mapRes = await fetch('/api/map/geojson');
            const mapData = await mapRes.json();

            this.renderSVGMap(mapData);
        } catch (error) {
            console.error('Failed to load map data:', error);
            app.showToast('Error loading map', 'error');
        }
    }

    /**
     * Render SVG-derived regions on the map
     */
    renderSVGMap(mapData) {
        console.log('Using Native SVG Overlay approach...');

        // Clear existing layers
        if (this.mainLayerGroup) {
            this.map.removeLayer(this.mainLayerGroup);
        }
        this.mainLayerGroup = L.layerGroup().addTo(this.map);

        // Fetch original SVG for native rendering
        fetch('1936.svg')
            .then(response => response.text())
            .then(svgText => {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgElement = svgDoc.querySelector('svg');

                if (!svgElement) {
                    console.error('Failed to parse SVG element');
                    return;
                }

                // Parse viewBox to set map bounds
                const viewBox = mapData.viewBox.split(' ').map(Number);
                const svgW = viewBox[2];
                const svgH = viewBox[3];

                this.svgWidth = svgW;
                this.svgHeight = svgH;

                // Calculate scale factor relative to standard HOI4 data coordinates (1400x600)
                this.scaleFactor = svgW / 1400.16;
                console.log(`Map Scale Factor: ${this.scaleFactor} (Base: 1400.16, Actual: ${svgW})`);

                // Leaflet bounds [y, x] for middle, left, and right overlays (360-degree world wrapping)
                const bounds = [[0, 0], [svgH, svgW]];
                const boundsLeft = [[0, -svgW], [svgH, 0]];
                const boundsRight = [[0, svgW], [svgH, 2 * svgW]];

                // Calculate minZoom dynamically so the map always fills the viewport vertically
                const mapContainer = this.map.getContainer();
                const containerH = mapContainer.clientHeight || 600;
                const containerW = mapContainer.clientWidth || 1200;
                // In CRS.Simple, zoom 0 means 1px = 1 unit. We need the map to fill the container.
                // minZoom = log2(containerHeight / svgHeight) ensures the map fills vertically.
                const minZoomH = Math.log2(containerH / svgH);
                const minZoomW = Math.log2(containerW / svgW);
                const computedMinZoom = Math.max(minZoomH, minZoomW);
                // Round up to nearest 0.25 to work with zoomSnap
                const safeMinZoom = Math.ceil(computedMinZoom * 4) / 4;
                this.map.setMinZoom(safeMinZoom);
                console.log(`Dynamic minZoom: ${safeMinZoom} (containerH: ${containerH}, svgH: ${svgH})`);

                // Tight vertical bounds to prevent blue sky; wide horizontal for wrapping
                const wrapBounds = [[0, -svgW * 0.5], [svgH, svgW * 1.5]];
                this.map.setMaxBounds(wrapBounds);

                // Ensure Leaflet knows the container size
                this.map.invalidateSize();

                // Improved fitting: ensure whole world is visible
                const fitOptions = { padding: [10, 10], animate: false };
                this.map.fitBounds(bounds, fitOptions);

                // Clone SVG element for seamless horizontal wrapping
                const svgLeft = svgElement.cloneNode(true);
                const svgRight = svgElement.cloneNode(true);

                // Add SVG overlays (Left, Middle, Right)
                this.svgLayerLeft = L.svgOverlay(svgLeft, boundsLeft, { interactive: true, className: 'map-svg-overlay' }).addTo(this.map);
                this.svgLayer = L.svgOverlay(svgElement, bounds, { interactive: true, className: 'map-svg-overlay' }).addTo(this.map);
                this.svgLayerRight = L.svgOverlay(svgRight, boundsRight, { interactive: true, className: 'map-svg-overlay' }).addTo(this.map);

                // Add interactivity to the SVG paths
                this.setupSVGInteractivity(svgElement, mapData.regions);
                this.setupSVGInteractivity(svgLeft, mapData.regions);
                this.setupSVGInteractivity(svgRight, mapData.regions);

                // Initial coloring across all map copies
                this.applyNationColorsToSVG(svgElement, mapData.regions);
                this.applyNationColorsToSVG(svgLeft, mapData.regions);
                this.applyNationColorsToSVG(svgRight, mapData.regions);

                // Seamless horizontal wrap — use 'moveend' to avoid per-frame jank
                this.map.off('moveend', this._wrapHandler);
                this._wrapHandler = () => {
                    if (this.isWrapping) return;
                    const center = this.map.getCenter();
                    const w = svgW;
                    let newLng = center.lng;
                    let newLat = center.lat;
                    let needsCorrection = false;

                    // Horizontal wrap
                    if (newLng < 0) {
                        newLng += w;
                        needsCorrection = true;
                    } else if (newLng > w) {
                        newLng -= w;
                        needsCorrection = true;
                    }

                    // Clamp vertical position to map extent
                    if (newLat < 0) {
                        newLat = 0;
                        needsCorrection = true;
                    } else if (newLat > svgH) {
                        newLat = svgH;
                        needsCorrection = true;
                    }

                    if (needsCorrection) {
                        this.isWrapping = true;
                        this.map.setView([newLat, newLng], this.map.getZoom(), { animate: false });
                        this.isWrapping = false;
                    }
                };
                this.map.on('moveend', this._wrapHandler);

                // Also recalculate minZoom on window resize
                window.addEventListener('resize', () => {
                    const ch = mapContainer.clientHeight || 600;
                    const cw = mapContainer.clientWidth || 1200;
                    const newMinH = Math.log2(ch / svgH);
                    const newMinW = Math.log2(cw / svgW);
                    const newMin = Math.ceil(Math.max(newMinH, newMinW) * 4) / 4;
                    this.map.setMinZoom(newMin);
                    if (this.map.getZoom() < newMin) {
                        this.map.setZoom(newMin);
                    }
                });

                console.log('Native SVG Overlay with World Wrapping rendered successfully.');

                // Final stabilization & initial world object load
                setTimeout(() => {
                    this.map.invalidateSize();
                    this.map.fitBounds(bounds, { padding: [20, 20] });

                    if (window.app) {
                        if (window.app.nationManager) {
                            window.app.nationManager.loadNationLabels();
                        }
                        if (window.app.cityManager) {
                            window.app.cityManager.loadCities();
                        }
                    }
                }, 100);
            })
            .catch(err => {
                console.error('Error loading SVG for overlay:', err);
            });
    }

    /**
     * Setup interactivity on native SVG elements
     */
    setupSVGInteractivity(svgElement, regionsData) {
        const paths = svgElement.querySelectorAll('path');

        // Build a lookup for region data by ID
        const regionLookup = {};
        regionsData.forEach(r => regionLookup[r.id] = r);

        let isDragging = false;
        let startPos = { x: 0, y: 0 };

        paths.forEach(path => {
            const id = path.getAttribute('id');
            const region = regionLookup[id];

            if (!region) return;

            // Store data for easy access
            path.regionData = region;

            // Handlers
            path.style.pointerEvents = 'auto';
            path.style.cursor = 'pointer';

            path.addEventListener('mousedown', (e) => {
                isDragging = false;
                startPos = { x: e.clientX, y: e.clientY };
            });

            path.addEventListener('mousemove', (e) => {
                if (Math.abs(e.clientX - startPos.x) > 5 || Math.abs(e.clientY - startPos.y) > 5) {
                    isDragging = true;
                }
            });

            path.addEventListener('mouseup', (e) => {
                if (!isDragging) {
                    this.selectSVGRegion(e.target);
                }
            });

            path.addEventListener('dblclick', (e) => {
                const r = e.target.regionData;
                if (r && r.nation_code) {
                    this.showNationPopup(r.nation_code);
                }
            });

            path.addEventListener('mouseover', (e) => this.highlightSVGRegion(e.target, e));
            path.addEventListener('mouseout', (e) => this.unhighlightSVGRegion(e.target));
        });
    }

    /**
     * Highlight an SVG path
     */
    highlightSVGRegion(path, event) {
        const r = path.regionData;

        // Save original fill
        if (!path.getAttribute('data-original-fill')) {
            path.setAttribute('data-original-fill', path.getAttribute('fill') || '#ffffff');
        }

        // Apply highlight
        path.setAttribute('fill', '#ffff00');
        path.setAttribute('fill-opacity', '0.7');
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '1');

        if (window.app && window.app.ui && event) {
            window.app.ui.showTooltip(event, r.name || r.id);
        }
    }

    /**
     * Unhighlight an SVG path
     */
    unhighlightSVGRegion(path) {
        if (path === this.selectedSVGPath) return;

        const originalFill = path.getAttribute('data-original-fill') || '#ffffff';
        path.setAttribute('fill', originalFill);
        path.removeAttribute('fill-opacity');
        path.setAttribute('stroke', '#000000');
        path.setAttribute('stroke-width', '0.2');

        if (window.app && window.app.ui) {
            window.app.ui.hideTooltip();
        }
    }

    /**
     * Select an SVG path
     */
    selectSVGRegion(path, silent = false) {
        if (this.selectedSVGPath) {
            const prev = this.selectedSVGPath;
            this.selectedSVGPath = null; // Unset to allow unhighlight logic
            this.unhighlightSVGRegion(prev);
        }

        this.selectedSVGPath = path;
        this.highlightSVGRegion(path);

        const r = path.regionData;
        if (this.onRegionClick && !silent) {
            this.onRegionClick(r);
        }
    }

    /**
     * Apply nation colors to native SVG paths
     */
    applyNationColorsToSVG(svgElement, regionsData) {
        const paths = svgElement.querySelectorAll('path');
        const regionLookup = {};
        regionsData.forEach(r => regionLookup[r.id] = r);

        paths.forEach(path => {
            const id = path.getAttribute('id');
            const region = regionLookup[id];
            if (!region) return;

            let fillColor = region.fill || '#ffffff';

            // Override with nation color if exists
            if (region.nation_code && this.nationColors[region.nation_code]) {
                fillColor = this.nationColors[region.nation_code].color;
            }

            path.setAttribute('fill', fillColor);
            path.setAttribute('stroke', '#000000');
            path.setAttribute('stroke-width', '0.2'); // Very thin border for aesthetics
        });
    }

    // SVG parsing logic removed as it's no longer used (using native SVG overlay)



    /**
     * Fix map rendering issues by invalidating size
     */
    refreshSize() {
        if (this.map) {
            this.map.invalidateSize();
            // Multiple attempts to ensure it catches the resize after transition
            setTimeout(() => this.map.invalidateSize(), 100);
            setTimeout(() => this.map.invalidateSize(), 300);
            setTimeout(() => this.map.invalidateSize(), 600);
            console.log('Map size refreshed');
        }
    }



    /**
     * Show nation info popup
     */
    async showNationPopup(nationCode) {
        try {
            const saveId = app.currentGame?.saveId;
            const nation = await api.getNationInfoForMap(nationCode, saveId);

            if (!nation) return;

            // Update popup content
            document.getElementById('popup-nation-name').textContent = nation.name;
            document.getElementById('popup-nation-type').textContent = nation.name_local || nation.government_type;
            document.getElementById('popup-leader').textContent = `${nation.leader_name} (${nation.leader_title})`;
            document.getElementById('popup-ideology').textContent = this.formatIdeology(nation.ideology);
            document.getElementById('popup-population').textContent = this.formatPopulation(nation.population);
            document.getElementById('popup-military').textContent = `${nation.military_strength}/100`;

            // Set flag color
            const flagEl = document.getElementById('popup-flag');
            if (flagEl) flagEl.style.backgroundColor = nation.color;

            // Store nation code for actions
            document.getElementById('nation-popup').dataset.nationCode = nationCode;

            // Show popup
            document.getElementById('nation-popup').classList.remove('hidden');
        } catch (error) {
            console.error('Failed to load nation info:', error);
        }
    }

    /**
     * Format ideology for display
     */
    formatIdeology(ideology) {
        const map = {
            'fascist': 'Fascist',
            'democratic': 'Democratic',
            'communist': 'Communist',
            'authoritarian': 'Authoritarian',
            'monarchy': 'Monarchy'
        };
        return map[ideology] || ideology;
    }

    /**
     * Format population number
     */
    formatPopulation(pop) {
        if (!pop) return 'N/A';
        if (pop >= 1000000000) {
            return (pop / 1000000000).toFixed(1) + ' billion';
        }
        if (pop >= 1000000) {
            return (pop / 1000000).toFixed(1) + ' million';
        }
        return pop.toLocaleString();
    }

    /**
     * Setup map controls
     */
    setupControls() {
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            this.map.zoomIn();
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            this.map.zoomOut();
        });

        document.getElementById('btn-reset-view').addEventListener('click', () => {
            const bounds = this.svgLayer ? this.svgLayer.getBounds() : null;
            if (bounds) {
                this.map.fitBounds(bounds, { padding: [20, 20] });
            } else {
                this.map.setView([1500, 2500], 1); // Fallback to a rough world center
            }
        });

        // Close popup button
        document.querySelector('#nation-popup .popup-close').addEventListener('click', () => {
            this.closePopup();
        });

        // Popup action buttons
        const chatBtn = document.getElementById('nation-popup-btn-chat');
        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                const nationCode = document.getElementById('nation-popup').dataset.nationCode;
                if (nationCode && app.currentGame) {
                    diplomacyPanel.startChatWithNation(nationCode);
                }
            });
        }
    }

    /**
     * Close nation popup
     */
    closePopup() {
        document.getElementById('nation-popup').classList.add('hidden');
        if (this.selectedSVGPath) {
            const prev = this.selectedSVGPath;
            this.selectedSVGPath = null;
            this.unhighlightSVGRegion(prev);
        }
    }

    /**
     * Setup map search
     */
    setupSearch() {
        const searchInput = document.getElementById('map-search-input');
        const resultsContainer = document.getElementById('map-search-results');
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length < 2) {
                resultsContainer.classList.add('hidden');
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const results = await api.searchMap(query);
                    this.showSearchResults(results, resultsContainer);
                } catch (error) {
                    console.error('Search error:', error);
                }
            }, 300);
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                resultsContainer.classList.remove('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.classList.add('hidden');
            }
        });
    }

    /**
     * Show search results
     */
    showSearchResults(results, container) {
        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = '<div class="search-result">No results</div>';
            container.classList.remove('hidden');
            return;
        }

        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.innerHTML = `
                <div class="search-result-flag" style="background-color: ${result.color}"></div>
                <span class="search-result-name">${result.name}</span>
                <span class="search-result-type">${result.category}</span>
            `;
            div.addEventListener('click', () => {
                this.focusOnNation(result.id);
                container.classList.add('hidden');
                document.getElementById('map-search-input').value = result.name;
            });
            container.appendChild(div);
        });

        container.classList.remove('hidden');
    }

    /**
     * Update labels visibility based on zoom level
     */
    updateLabelsVisibility() {
        const zoom = this.map.getZoom();
        console.log(`Zoom level: ${zoom}`);

        if (app.cityManager) {
            app.cityManager.updateVisibility(zoom);
        }
        if (app.nationManager) {
            app.nationManager.updateVisibility(zoom);
        }
    }




    /**
     * Focus map on a nation
     */
    focusOnNation(nationCode, silent = false) {
        if (!this.svgLayer) return;

        const svgElement = this.svgLayer.getElement();
        if (!svgElement) return;

        const paths = svgElement.querySelectorAll('path');
        let targetPath = null;

        // Find the first path belonging to this nation
        for (const path of paths) {
            if (path.regionData && path.regionData.nation_code === nationCode) {
                targetPath = path;
                break;
            }
        }

        if (targetPath) {
            this.selectSVGRegion(targetPath, silent);

            // Highlight it but also center the map on it if possible
            const bbox = targetPath.getBBox();
            const center = [bbox.y + bbox.height / 2, bbox.x + bbox.width / 2];
            this.map.panTo(center);
        }
    }

    /**
     * Update map for game state changes
     */
    updateForGameState(gameState) {
        // Could update colors based on war status, alliances, etc.
        // For now, just refresh the view
    }
}

// Create global instance
const gameMap = new GameMap();
