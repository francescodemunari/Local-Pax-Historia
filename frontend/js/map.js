/**
 * Pax Historia - Map Module
 * Handles the interactive world map using Leaflet
 */

class GameMap {
    constructor() {
        this.map = null;
        this.svgLayer = null; // Hidden geometry reference for tiles and selection
        this.svgWidth = 1400.16;
        this.svgHeight = 600;
        this.svgOrigin = [0, 0];
        this.nationColors = {};
        this.currentScenarioId = null;
        this.selectedSVGPath = null;
        this.mainLayerGroup = null;
    }

    /**
     * Convert scenario SVG coordinates into the matching Leaflet world copy.
     */
    svgToLatLng([x, y], worldOffset = 0) {
        return [this.svgHeight - (y - this.svgOrigin[1]), x - this.svgOrigin[0] + worldOffset];
    }

    init() {
        // Create map with simple CRS for flat SVG coordinates
        this.map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -1,  // Will be recalculated dynamically after SVG loads
            maxZoom: 5,
            zoomControl: false,
            fadeAnimation: false,
            attributionControl: false,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 120,
            maxBoundsViscosity: 1.0
        });

        // Add zoom listener for labels
        this.map.on('zoomend', () => this.updateLabelsVisibility());

        this.map.on('dragstart zoomstart', () => {
            this.interacting = true;
            this.map.getContainer().classList.add('map-interacting');
            window.app?.ui?.hideTooltip();
        });
        this.map.on('dragend zoomend', () => {
            this.interacting = false;
            this.map.getContainer().classList.remove('map-interacting');
        });

        // Setup controls
        this.setupControls();

        // Setup search
        this.setupSearch();

        console.log('Map initialized');
    }

    /**
     * Load nation colors from backend (JSON-based)
     */
    async loadNationColors(saveId = null) {
        try {
            const response = await fetch(`/api/map/colors${saveId ? `?saveId=${encodeURIComponent(saveId)}` : ''}`);
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
    async asyncLoadMapData(saveId = null) {
        try {
            console.log('Loading HOI4 colors and map data...');

            // Load colors first
            await this.loadNationColors(saveId);

            const mapRes = await fetch(`/api/map/geojson?compact=1${saveId ? `&saveId=${encodeURIComponent(saveId)}` : ''}`);
            const mapData = await mapRes.json();

            return this.renderSVGMap(mapData);
        } catch (error) {
            console.error('Failed to load map data:', error);
            app.showToast('Error loading map', 'error');
        }
    }

    /**
     * Render SVG-derived regions on the map
     */
    renderSVGMap(mapData) {
        this.currentScenarioId = mapData.scenarioId || null;
        document.getElementById('map-source-credit')?.classList.toggle('hidden', mapData.coordinateSystem !== 'WGS84');
        console.log('Using Native SVG Overlay approach...');

        // A game can be loaded more than once without recreating the Leaflet
        // instance. SVG overlays are not members of mainLayerGroup, so removing
        // only that group used to leave the previous world's paths mounted below
        // the new map. Besides wasting memory it made hit-testing and labels
        // drift out of sync with the active save.
        this.clearSVGOverlays();
        if (this._wrapHandler) this.map.off('moveend', this._wrapHandler);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);

        // Clear existing non-SVG layers.
        if (this.mainLayerGroup) {
            this.map.removeLayer(this.mainLayerGroup);
        }
        this.mainLayerGroup = L.layerGroup().addTo(this.map);

        // Fetch original SVG for native rendering
        const svgUrl = mapData.renderer?.svgUrl;
        if (!svgUrl) throw new Error('Scenario map renderer is missing');
        if (mapData.renderer?.type && mapData.renderer.type !== 'svg-overlay') {
            throw new Error(`Unsupported map renderer: ${mapData.renderer.type}`);
        }
        return fetch(svgUrl)
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
                const viewBox = mapData.viewBox.trim().split(/\s+/).map(Number);
                const svgW = viewBox[2];
                const svgH = viewBox[3];

                this.svgWidth = svgW;
                this.svgHeight = svgH;

                this.svgOrigin = viewBox.slice(0, 2);

                // Leaflet bounds [y, x] for middle, left, and right overlays (360-degree world wrapping)
                const bounds = [[0, 0], [svgH, svgW]];

                // Calculate minZoom dynamically so the map always fills the viewport vertically
                const mapContainer = this.map.getContainer();
                const containerH = mapContainer.clientHeight || 600;
                const containerW = mapContainer.clientWidth || 1200;
                // In CRS.Simple, zoom 0 means 1px = 1 unit. We need the map to fill the container.
                // minZoom = log2(containerHeight / svgHeight) ensures the map fills vertically.
                const minZoomH = Math.log2(containerH / svgH);
                const minZoomW = Math.log2(containerW / svgW);
                const computedMinZoom = Math.min(minZoomH, minZoomW);
                // Round up to nearest 0.25 to work with zoomSnap
                const safeMinZoom = Math.floor(computedMinZoom * 4) / 4;
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

                // Keep one unpainted vector reference for labels, focus and selection.
                // Actual map painting uses reusable canvas tiles instead of three SVG worlds.
                this.svgLayer = L.svgOverlay(svgElement, bounds, { interactive: false, className: 'map-svg-overlay map-vector-reference' }).addTo(this.map);
                // Keep the geometry reference at a fixed size: Leaflet resizing a
                // hidden 10k-path SVG on zoom still triggers expensive SVG layout.
                svgElement.style.setProperty('width',`${svgW}px`,'important');
                svgElement.style.setProperty('height',`${svgH}px`,'important');
                const lookup = new Map(mapData.regions.map(region => [region.id, region]));
                svgElement.querySelectorAll('path[id]').forEach(path => { path.regionData = lookup.get(path.id); });
                this.applyNationColorsToAllSVG(mapData.regions);
                this.tileLayer = new ScenarioTiles(this, svgElement).addTo(this.map);
                // Geometry is a data reference, not a live Leaflet overlay. Keeping
                // thousands of hidden paths attached still incurs style/layout work
                // whenever camera transforms or interaction classes change.
                this.map.removeLayer(this.svgLayer);
                this.installTileInteractions();

                // Seamless horizontal wrap — use 'moveend' to avoid per-frame jank
                if (this._wrapHandler) this.map.off('moveend', this._wrapHandler);
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
                this._resizeHandler = () => {
                    const ch = mapContainer.clientHeight || 600;
                    const cw = mapContainer.clientWidth || 1200;
                    const newMinH = Math.log2(ch / svgH);
                    const newMinW = Math.log2(cw / svgW);
                    const newMin = Math.floor(Math.min(newMinH, newMinW) * 4) / 4;
                    this.map.setMinZoom(newMin);
                    if (this.map.getZoom() < newMin) {
                        this.map.setZoom(newMin);
                    }
                };
                window.addEventListener('resize', this._resizeHandler);

                console.log('Native SVG Overlay with World Wrapping rendered successfully.');

                // Final stabilization. World objects are loaded by app.startGame()
                // after this promise resolves, so labels and markers are always
                // positioned against a fully rendered map.
                setTimeout(() => {
                    this.map.invalidateSize();
                }, 100);
            })
            .catch(err => {
                console.error('Error loading SVG for overlay:', err);
            });
    }

    /**
     * Release cached tiles, the hidden vector reference, and pointer handlers.
     */
    clearSVGOverlays() {
        if (this.tileLayer) this.map.removeLayer(this.tileLayer);
        this.tileLayer = null;
        for (const layer of this.highlightLayers || []) this.map.removeLayer(layer);
        this.highlightLayers = [];
        for (const [event, handler] of Object.entries(this.tileHandlers || {})) this.map.off(event, handler);
        this.tileHandlers = null;
        if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
        this.hoverFrame = null;
        this.map.getContainer().style.cursor = "";
        this.hoverPath = null;
        ['svgLayerLeft', 'svgLayer', 'svgLayerRight'].forEach(layerName => {
            const layer = this[layerName];
            if (layer && this.map?.hasLayer(layer)) {
                this.map.removeLayer(layer);
            }
            this[layerName] = null;
        });
        this.selectedSVGPath = null;
    }

    installTileInteractions() {
        this.tileHandlers = {
            mousemove: event => {
                this.lastHoverEvent = event;
                if (this.hoverFrame || this.interacting) return;
                this.hoverFrame = requestAnimationFrame(async () => {
                    this.hoverFrame = null;
                    if (this.interacting || !this.tileLayer) return;
                    const event = this.lastHoverEvent;
                    const layer=this.tileLayer;
                    const path = await layer.regionAtAsync(event.latlng);
                    if(this.interacting || layer!==this.tileLayer || event!==this.lastHoverEvent)return;
                    if (path === this.hoverPath) return;
                    if (this.hoverPath) this.unhighlightSVGRegion(this.hoverPath);
                    this.hoverPath = path;
                    if (path) this.highlightSVGRegion(path, event.originalEvent);
                    else this.drawTileHighlight(this.selectedSVGPath);
                    this.map.getContainer().style.cursor = path ? 'pointer' : '';
                });
            },
            mouseout: () => {
                if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
                this.hoverFrame = null;
                this.hoverPath = null;
                this.drawTileHighlight(this.selectedSVGPath);
                this.map.getContainer().style.cursor = "";
                window.app?.ui?.hideTooltip();
            },
            click: event => {
                if (this.interacting || this.map.dragging.moved()) return;
                const path = this.tileLayer.regionAt(event.latlng);
                if (path) this.selectSVGRegion(path);
            },
            dblclick: event => {
                const path = this.tileLayer.regionAt(event.latlng);
                if (path?.regionData?.nation_code) this.showNationPopup(path.regionData.nation_code);
            }
        };
        for (const [event, handler] of Object.entries(this.tileHandlers)) this.map.on(event, handler);
    }

    drawTileHighlight(path) {
        for (const layer of this.highlightLayers || []) this.map.removeLayer(layer);
        this.highlightLayers = [];
        if (!path || !this.tileLayer) return;
        for (const offset of [-this.svgWidth, 0, this.svgWidth]) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `${this.svgOrigin[0]} ${this.svgOrigin[1]} ${this.svgWidth} ${this.svgHeight}`);
            const outline = path.cloneNode(false);
            outline.removeAttribute('id'); outline.removeAttribute('style');
            outline.setAttribute('fill', 'none'); outline.setAttribute('pointer-events', 'none');
            svg.append(outline);
            this.highlightLayers.push(L.svgOverlay(svg, [[0, offset], [this.svgHeight, offset + this.svgWidth]],
                { interactive: false, className: 'map-selection-overlay' }).addTo(this.map));
        }
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

        // Retain the country colour; a thin outline identifies the region
        // without painting a bright block over its cities and labels.
        path.setAttribute('fill', path.getAttribute('data-original-fill'));
        path.removeAttribute('fill-opacity');
        path.setAttribute('stroke', path === this.selectedSVGPath ? '#d4bb83' : '#b4becb');
        path.setAttribute('stroke-opacity', path === this.selectedSVGPath ? '0.85' : '0.45');
        path.setAttribute('stroke-width', path === this.selectedSVGPath ? '1.4' : '0.8');
        path.setAttribute('vector-effect', 'non-scaling-stroke');

        this.drawTileHighlight(path);
        if (window.app && window.app.ui && event) {
            window.app.ui.showTooltip(event, r.name || r.id);
        }
    }

    /**
     * Unhighlight an SVG path
     */
    unhighlightSVGRegion(path) {
        if (path === this.selectedSVGPath) return;
        this.drawTileHighlight(this.selectedSVGPath);

        const originalFill = path.getAttribute('data-original-fill') || '#ffffff';
        path.setAttribute('fill', originalFill);
        path.removeAttribute('fill-opacity');
        path.removeAttribute('stroke-opacity');
        path.removeAttribute('vector-effect');
        path.setAttribute('stroke', path.regionData?.geographic_anchor ? 'none' : '#000000');
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
        if (!svgElement || !Array.isArray(regionsData)) return;
        // Continuous country shapes under the clickable sectors prevent seams
        // at every zoom, without removing region hit targets or occupation fills.
        svgElement.querySelectorAll('[data-nation-base]').forEach(path => {
            path.setAttribute('fill', this.nationColors[path.getAttribute('data-nation-base')]?.color || '#3b4650');
        });
        const paths = svgElement.querySelectorAll('path');
        const regionLookup = {};
        regionsData.forEach(r => regionLookup[r.id] = r);

        paths.forEach(path => {
            const id = path.getAttribute('id');
            const region = regionLookup[id];
            if (!region) return;

            // The path handlers read this object at click time. Updating it
            // keeps click/double-click dossiers in sync with post-turn control.
            path.regionData = region;

            let fillColor = region.fill || '#ffffff';

            // Override with nation color if exists
            if (region.nation_code && this.nationColors[region.nation_code]) {
                fillColor = this.nationColors[region.nation_code].color;
            }

            path.setAttribute('fill', fillColor);
            path.setAttribute('data-original-fill', fillColor);
            path.setAttribute('stroke', region.geographic_anchor ? 'none' : '#000000');
            path.setAttribute('stroke-width', '0.2');
        });
    }

    /**
     * Refresh the geometry reference and invalidate cached ownership tiles.
     */
    applyNationColorsToAllSVG(regionsData) {
        const svg=this.svgLayer?.getElement?.();
        // Ownership refreshes omit geometry; retain anchors and geographic paint metadata.
        if(this._paintedSVG===svg && this.currentRegions) {
            const previous=new Map(this.currentRegions.map(region=>[region.id,region]));
            regionsData=regionsData.map(region=>({...previous.get(region.id),...region}));
        }
        if(this._paintedSVG===svg && this._paintedColors===this.nationColors && this.currentRegions?.length===regionsData.length &&
            regionsData.every((r,i)=>r.id===this.currentRegions[i].id && r.nation_code===this.currentRegions[i].nation_code)) {
            this.currentRegions=regionsData;return;
        }
        this._paintedSVG=svg;this._paintedColors=this.nationColors;
        this.currentRegions = regionsData;
        [this.svgLayer, this.svgLayerLeft, this.svgLayerRight]
            .map(layer => layer?.getElement?.())
            .filter(Boolean)
            .forEach(svgElement => this.applyNationColorsToSVG(svgElement, regionsData));
        this.tileLayer?.redraw();
    }




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

            if (!nation || app.currentGame?.saveId!==saveId) return;

            // Update popup content
            countryFlags.paint(document.getElementById('popup-flag'),nationCode,app.currentGame?.scenario?.id,app.currentGame?.currentDate);
            document.getElementById('popup-nation-name').textContent = nation.name;
            document.getElementById('nation-government').textContent=nation.government_type==='unconfigured'?'Government not yet recorded':nation.government_type||'Government not yet recorded';
            document.getElementById('nation-head-of-state').textContent=nation.head_of_state?`Head of state: ${nation.head_of_state}`:'';
            document.getElementById('nation-political-ideology').textContent=nation.ideology==='unconfigured'?'Not recorded':this.formatIdeology(nation.ideology)||'Not recorded';
            const portrait=document.getElementById('leader-portrait'),initials=document.getElementById('leader-initials');
            const hasPortrait=nation.leader_portrait && nation.portrait_leader===(nation.leader_name||'');
            portrait.hidden=!hasPortrait;initials.hidden=Boolean(hasPortrait);
            portrait.onerror=()=>{portrait.hidden=true;initials.hidden=false;};
            if(hasPortrait)portrait.src=nation.leader_portrait;else portrait.removeAttribute('src');
            const credit=document.getElementById('portrait-credit');credit.hidden=!(hasPortrait && nation.leader_portrait.startsWith('/assets/') && nation.portrait_source);
            if(!credit.hidden){credit.href=nation.portrait_source;credit.textContent=nation.portrait_credit;}
            const license=document.getElementById('portrait-license');license.hidden=credit.hidden || !nation.portrait_license;
            if(!license.hidden)license.href=nation.portrait_license;
            initials.textContent=(nation.leader_name||nation.name).split(/\s+/).map(n=>n[0]).slice(0,2).join('');
            document.getElementById('portrait-controls').hidden=nationCode!==app.currentGame.playerNation.code;
            document.getElementById('portrait-prompt').value=`Create a fictional ${app.currentGame.scenario?.era||''} national leader portrait for ${nation.name}. Formal painted head-and-shoulders portrait, period-appropriate civilian clothing, neutral expression and plain background. No text or insignia. Character description: [describe your new leader here].`;
            const savePortrait=async image=>{
                if(app.currentGame?.saveId!==saveId)return;
                try {await api.request(`/nations/portrait/${encodeURIComponent(saveId)}`,{method:'PUT',body:JSON.stringify({portrait:image,leader_name:nation.leader_name||''})});await this.showNationPopup(nationCode);}
                catch(error){app.showToast(error.message,'error');}
            };
            document.getElementById('portrait-remove').onclick=()=>savePortrait(null);
            document.getElementById('portrait-upload').onchange=async event=>{
                const file=event.target.files[0];event.target.value='';if(!file)return;
                if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){app.showToast('Choose a JPG, PNG or WebP smaller than 8 MB.','error');return;}
                const url=URL.createObjectURL(file),image=new Image();
                image.onload=async()=>{try{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#172131';ctx.fillRect(0,0,320,400);const scale=Math.min(320/image.width,400/image.height);ctx.drawImage(image,(320-image.width*scale)/2,(400-image.height*scale)/2,image.width*scale,image.height*scale);await savePortrait(canvas.toDataURL('image/jpeg',.85));}finally{URL.revokeObjectURL(url);}};
                image.onerror=()=>{URL.revokeObjectURL(url);app.showToast('This image could not be read.','error');};image.src=url;
            };
            document.getElementById('popup-nation-type').textContent = nation.annexed_by ? `Annexed by ${countryFlags.name(nation.annexed_by)}` : `Capital: ${nation.capital || 'No controlled capital designated'}`;
            document.getElementById('popup-leader').textContent = nation.leader_name ? `${nation.leader_name}${nation.leader_title ? ` (${nation.leader_title})` : ''}` : 'Not recorded';
            document.getElementById('popup-ideology').textContent = nation.ruling_party || this.formatIdeology(nation.ideology);
            for(const [id,value] of [['popup-leader',nation.leader_name],['popup-ideology',nation.ruling_party||nation.ideology]])document.getElementById(id).closest('.stat').hidden=!value || value==='unconfigured';
            document.getElementById('popup-population').textContent = String(nation.controlled_provinces ?? 0);
            document.getElementById('popup-military').textContent = String(nation.formations ?? 0);
            const relations = document.getElementById('popup-diplomatic-status');
            if (relations) relations.textContent = `Wars: ${(nation.warWith || []).map(c=>countryFlags.name(c)).join(', ') || 'None'} · Allies: ${(nation.allies || []).map(c=>countryFlags.name(c)).join(', ') || 'None'}`;

            // Set flag color
            const flagEl = document.getElementById('popup-flag');
            if (flagEl) flagEl.style.backgroundColor = nation.color;

            document.getElementById('nation-popup-btn-chat').hidden=nationCode===app.currentGame.playerNation.code || Boolean(nation.annexed_by);

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
            this.resetView();
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

        const infoBtn = document.getElementById('nation-popup-btn-info');
        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                const nationCode = document.getElementById('nation-popup').dataset.nationCode;
                if (nationCode) {
                    this.closePopup();
                    this.focusOnNation(nationCode, true);
                }
            });
        }
    }

    resetView() {
        const bounds = this.svgLayer ? this.svgLayer.getBounds() : null;
        if (bounds) {
            this.map.fitBounds(bounds, { padding: [20, 20] });
        } else {
            this.map.setView([1500, 2500], 1); // Fallback to a rough world center
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
                    const results = await api.searchMap(query, app.currentGame?.saveId);
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
            const flag = document.createElement('div');
            flag.className = 'search-result-flag';
            flag.style.backgroundColor = result.color || '#666';
            const name = document.createElement('span');
            name.className = 'search-result-name';
            name.textContent = result.name;
            const type = document.createElement('span');
            type.className = 'search-result-type';
            type.textContent = result.category;
            div.append(flag, name, type);
            div.addEventListener('click', () => {
                if (result.type === 'nation') {
                    this.focusOnNation(result.id);
                } else {
                    const path = Array.from(this.svgLayer.getElement().querySelectorAll('path'))
                        .find(path => path.regionData?.id === result.region_id);
                    if (path) this.selectSVGRegion(path);
                    if (result.coords) this.map.setView(this.svgToLatLng(result.coords), Math.max(this.map.getZoom(), 4.25), { animate: false });
                }
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
    focusEvent(event) {
        const regionId = event.applied_unit_change?.unit?.region_id || event.region_id;
        const region = this.currentRegions?.find(region => region.id === regionId);
        let coords = region?.marker_anchor || region?.centroid;
        let name = region?.name;
        if (!coords && Number.isFinite(event.location?.longitude) && Number.isFinite(event.location?.latitude)) {
            coords = [(event.location.longitude + 180) * 4, (90 - event.location.latitude) * 4];
            name = event.location.name || 'Event location';
        }
        if (!coords) {
            const code = event.affected_nations?.find(code => this.nationColors[code]?.capital?.coords);
            coords = this.nationColors[code]?.capital?.coords;
            name = coords ? `${this.nationColors[code].name || code} — national context` : '';
        }
        if (coords) {
            const target = this.svgToLatLng(coords);
            target[1] += Math.round((this.map.getCenter().lng - target[1]) / this.svgWidth) * this.svgWidth;
            this.map.flyTo(target,Math.max(this.map.getZoom(),event.location || region ? 2.75 : 1.75),{duration:1.1});
        }
        return name;
    }

    clearEventRoute() {
        for(const layer of this.eventRouteLayers||[])this.map.removeLayer(layer);
        this.eventRouteLayers=[];
        if(this.routeFrame)cancelAnimationFrame(this.routeFrame);
        this.routeFrame=null;
    }

    showEventRoute(change) { this.showEventRoutes(change ? [change] : [],[]); }

    showEventRoutes(changes=[],support=[]) {
        this.clearEventRoute();
        const lookup=new Map(this.currentRegions.map(r=>[r.id,r])),routes=[];
        for(const change of changes) {
            const coords=change.route?.coordinates || change.route?.region_ids?.map(id=>lookup.get(id)?.marker_anchor).filter(Boolean);
            if(coords?.length>1)routes.push({coords,unit:change.unit,color:change.captured_regions?.length?'#edb75a':'#9ac9ed'});
        }
        for(const unit of support) {
            const origin=lookup.get(unit.region_id)?.marker_anchor,target=lookup.get(unit.mission?.target_region_id)?.marker_anchor;
            if(origin && target)routes.push({coords:[origin,target,origin],unit,color:'#95daf5'});
        }
        const travellers=[];
        for(const route of routes) {
            let longitude=this.map.getCenter().lng;
            const points=route.coords.map(coord=>{const p=this.svgToLatLng(coord);p[1]+=Math.round((longitude-p[1])/this.svgWidth)*this.svgWidth;longitude=p[1];return p;});
            this.eventRouteLayers.push(L.polyline(points,{color:route.color,weight:3,dashArray:'8 6',interactive:false}).addTo(this.map));
            const icon=app.unitManager.unitIcons[route.unit?.unit_type]||'⚔️';
            const marker=L.marker(points[0],{interactive:false,icon:L.divIcon({className:'unit-marker',html:`<div class="unit-icon-stack">${icon}</div>`,iconSize:[32,32]})}).addTo(this.map);
            this.eventRouteLayers.push(marker);travellers.push({marker,points});
        }
        if(!travellers.length)return;
        const start=performance.now();
        const animate=now=>{
            const elapsed=Math.min(1,(now-start)/2200);
            for(const {marker,points} of travellers) {
                const progress=elapsed*(points.length-1),index=Math.min(points.length-2,Math.floor(progress)),fraction=progress-index;
                marker.setLatLng([points[index][0]+(points[index+1][0]-points[index][0])*fraction,points[index][1]+(points[index+1][1]-points[index][1])*fraction]);
            }
            if(elapsed<1)this.routeFrame=requestAnimationFrame(animate);
            else {for(const {marker} of travellers)this.map.removeLayer(marker);this.routeFrame=null;}
        };
        this.routeFrame=requestAnimationFrame(animate);
    }

    focusOnNation(nationCode, silent = false) {
        if (!this.svgLayer) return;

        const svgElement = this.svgLayer.getElement();
        if (!svgElement) return;

        const paths = Array.from(svgElement.querySelectorAll('path'))
            .filter(path => path.regionData?.nation_code === nationCode);
        const capital = this.nationColors[nationCode]?.capital;
        const capitalPath = paths.find(path => path.regionData.id === capital?.region_id);
        const targetPath = capitalPath || paths.sort((a, b) => {
            const first = a.getBBox(), second = b.getBBox();
            return second.width * second.height - first.width * first.height;
        })[0];

        if (targetPath) {
            this.selectSVGRegion(targetPath, silent);

            // Highlight it and move close enough to make the country useful on
            // first load. The prior implementation only panned, and often ran
            // before the SVG was available, leaving a new game at world zoom.
            const coords = capitalPath ? capital.coords : this.getInteriorAnchor(targetPath);
            if (!coords) return;
            const center = this.svgToLatLng(coords);
            const usefulZoom = Math.max(this.map.getZoom(), this.map.getMinZoom() + 1.5);
            this.map.setView(center, usefulZoom, { animate: false });
        }
    }

    /**
     * Find an interior point in the rendered region.
     */
    getInteriorAnchor(path) {
        const stored = path.regionData?.marker_anchor;
        if (stored && path.isPointInFill(new DOMPoint(...stored))) return stored;
        // Scenario fallback: accept a point only if the rendered shape contains it.
        const b = path.getBBox();
        for (const steps of [5, 15, 45]) {
            for (let y = 0; y < steps; y++) for (let x = 0; x < steps; x++) {
                const point = [b.x + (x + 0.5) * b.width / steps, b.y + (y + 0.5) * b.height / steps];
                if (path.isPointInFill(new DOMPoint(...point))) return point;
            }
        }
        return null;
    }

    updateForGameState(gameState) {
        // Could update colors based on war status, alliances, etc.
        // For now, just refresh the view
    }
}

// Create global instance
const gameMap = new GameMap();
