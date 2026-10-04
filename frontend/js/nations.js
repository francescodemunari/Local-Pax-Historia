/**
 * Nation Label Manager
 * Handles visualization of geographic dynamic nation name overlays on the map.
 * Nation labels are angled, scaled, and styled dynamically along national territory footprints.
 */

class NationLabelManager {
    constructor(map) {
        this.map = map;
        this.nationLabels = [];
        this.nationsData = {};
        this.labelsVisible = true;
        // Labels travel with Leaflet's pane; panning needs no DOM rebuild.

        // Dedicated pane for nation labels (above SVG map overlay, below cities/units)
        if (!this.map.getPane('nationsPane')) {
            const pane = this.map.createPane('nationsPane');
            pane.style.zIndex = 480;
            pane.style.pointerEvents = 'none';
        }


    }

    /**
     * Load nation data and render labels on map
     */
    async loadNationLabels(saveId = null) {
        try {
            const response = await fetch(`/api/map/colors${saveId ? `?saveId=${encodeURIComponent(saveId)}` : ''}`);
            if (!response.ok) throw new Error('Failed to fetch nation colors');
            this.nationsData = await response.json();
            console.log('Loaded nation data for labels:', Object.keys(this.nationsData).length);
            this.displayNationLabels();
        } catch (error) {
            console.error('Error loading nation labels:', error);
        }
    }

    /**
     * Display geographic nation name labels on map (with 3-copy world wrapping replication)
     */
    displayNationLabels() {
        this._visibilityZoom=null;
        this.clearLabels();

        const mapWidth = (gameMap && gameMap.svgWidth) ? gameMap.svgWidth : 1400.16;

        // Combine defined nation coordinates with all nations from API data
        const pathsByNation = new Map();
        for (const path of gameMap.svgLayer.getElement().querySelectorAll('path')) {
            const code = path.regionData?.nation_code || path.regionData?.nation;
            if (!code) continue;
            if (!pathsByNation.has(code)) pathsByNation.set(code, []);
            pathsByNation.get(code).push(path);
        }
        const territoryCodes = new Set(pathsByNation.keys());
        const allNationCodes = new Set([
            ...Object.keys(this.nationsData)
        ]);

        allNationCodes.forEach(code => {
            // A label without territory is both misleading and a frequent source
            // of overlap. It will be shown once a scenario actually supplies a
            // matching region instead of being drawn at a stale hard-coded point.
            if (!territoryCodes.has(code)) return;

            const nationData = this.nationsData[code] || {};
            const info = {};

            let coords = info.coords || nationData.label_anchor;
            let text = info.label || (nationData.name ? nationData.name.toUpperCase() : code);
            // Labels without a scenario-curated anchor are usually compact
            // states or fragmented colonial holdings. Keep them until a close
            // zoom instead of allowing a stack of approximate centroids to
            // obscure the main map labels.
            let sizeClass = info.size || 'tiny';
            let angle = info.angle || 0;
            let letterSpacing = info.letterSpacing || '0.15em';

            const paths = pathsByNation.get(code) || [];
            // Curated anchors may become foreign territory after a turn.
            if (!coords || !paths.some(path => path.isPointInFill(new DOMPoint(...coords)))) {
                const capitalPath = paths.find(path => path.regionData.id === nationData.capital?.region_id);
                const ranked = paths.sort((a, b) => {
                    const first = a.getBBox(), second = b.getBBox();
                    return second.width * second.height - first.width * first.height;
                });
                coords = capitalPath ? nationData.capital.coords : ranked.map(path => gameMap.getInteriorAnchor(path)).find(Boolean);
            }

            if (!coords) return; // Skip if position cannot be resolved
            const span = this.getTerritorySpan(paths, coords, angle);
            // Uncurated nations must not all inherit the tiny-state zoom tier.
            if (!info.size) sizeClass = span > 80 ? 'huge' : span > 30 ? 'large' : span > 12 ? 'medium' : span > 4 ? 'small' : 'tiny';


            // Render 3 copies for world wrapping: middle, left (-mapWidth), right (+mapWidth)
            const xOffsets = [0, -mapWidth, mapWidth];

            xOffsets.forEach(xOffset => {
                const iconClass = `nation-label-container ${sizeClass} geographic-label`;
                const safeText = text.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
                const labelHtml = `<div class="nation-label" data-angle="${angle}" style="--label-angle: ${angle}deg; --label-spacing: ${letterSpacing};">${safeText}</div>`;

                const icon = L.divIcon({
                    className: iconClass,
                    html: labelHtml,
                    iconSize: [200, 40],
                    iconAnchor: [100, 20]
                });

                const position = gameMap.svgToLatLng(coords, xOffset);

                const marker = L.marker(position, {
                    icon: icon,
                    pane: 'nationsPane',
                    interactive: false
                });

                this.nationLabels.push({ marker, sizeClass, nationCode: code, coords, span });
            });
        });

        console.log(`Rendered ${this.nationLabels.length} HOI4 nation labels on map (including world wrap copies).`);
        this.updateVisibility(this.map.getZoom());
        // Leaflet creates marker DOM nodes on the next frame. Apply visibility a
        // second time once those nodes exist, otherwise every label flashes and
        // remains visible until the player manually zooms.
        requestAnimationFrame(() => this.updateVisibility(this.map.getZoom()));
    }

    /**
     * Clear all nation label markers
     */
    getTerritorySpan(paths, coords, angle) {
        const boxes = paths.map(path => ({ path, box: path.getBBox() }));
        const seed = boxes.find(item => item.path.isPointInFill(new DOMPoint(...coords)));
        if (!seed) return 0;
        const connected = [seed], remaining = new Set(boxes.filter(item => item !== seed));
        for (let i = 0; i < connected.length; i++) {
            const a = connected[i].box;
            for (const item of remaining) {
                const b = item.box;
                if (a.x <= b.x + b.width + 0.5 && a.x + a.width + 0.5 >= b.x &&
                    a.y <= b.y + b.height + 0.5 && a.y + a.height + 0.5 >= b.y) {
                    connected.push(item); remaining.delete(item);
                }
            }
        }
        const minX = Math.min(...connected.map(item => item.box.x));
        const maxX = Math.max(...connected.map(item => item.box.x + item.box.width));
        const minY = Math.min(...connected.map(item => item.box.y));
        const maxY = Math.max(...connected.map(item => item.box.y + item.box.height));
        const radians = angle * Math.PI / 180;
        const width = 2 * Math.min(coords[0] - minX, maxX - coords[0]);
        const height = 2 * Math.min(coords[1] - minY, maxY - coords[1]);
        const horizontalSpan = width / Math.max(0.01, Math.abs(Math.cos(radians)));
        const verticalSpan = height / Math.max(0.01, Math.abs(Math.sin(radians)));
        return Math.max(0, Math.min(horizontalSpan, verticalSpan)) * 0.85;
    }

    clearLabels() {
        this.nationLabels.forEach(({ marker }) => this.map.removeLayer(marker));
        this.nationLabels = [];
    }

    setVisible(visible) {
        this.labelsVisible = Boolean(visible);
        this.updateVisibility(this.map.getZoom());
    }

    /**
     * Update label font scaling smoothly on map zoom while preserving rotation
     */
    updateVisibility(zoom) {
        if (this._visibilityZoom === zoom && this._visibilityCount === this.nationLabels.length && this._visibilityEnabled === this.labelsVisible) return;
        this._visibilityZoom=zoom; this._visibilityCount=this.nationLabels.length; this._visibilityEnabled=this.labelsVisible;
        const minimumZoomBySize = {
            huge: -Infinity,
            large: 0.75,
            medium: 1.25,
            small: 2.5,
            tiny: 3.5
        };
        const zoomScale = Math.min(1.6, Math.max(0.8, 1 + (zoom - 1.25) * 0.16));

        const visibleLabels = [];
        this.nationLabels.forEach(({ marker, sizeClass, span }) => {
            const inView = true;
            const visible = this.labelsVisible && inView && zoom >= (minimumZoomBySize[sizeClass] ?? 1.9);
            if (!visible) { if (this.map.hasLayer(marker)) this.map.removeLayer(marker); return; }
            if (!this.map.hasLayer(marker)) marker.addTo(this.map);
            const element = marker.getElement();
            if (!element) return;
            element.classList.toggle('nation-label-hidden', !visible);
            if (visible) { const label = element.querySelector('.nation-label'); if (label) visibleLabels.push({label,span}); }
        });
        // Batch layout reads before style writes; alternating them for every
        // label forced a new layout hundreds of times after each zoom.
        const measurements = visibleLabels.map(({label,span}) => ({ label,
            scale: Math.max(10 / Math.max(1,parseFloat(getComputedStyle(label).fontSize)),
                Math.min(zoomScale,span * Math.pow(2,zoom) / Math.max(1,label.offsetWidth))) }));
        measurements.forEach(({label,scale})=>label.style.setProperty('--label-scale',scale));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NationLabelManager;
}

