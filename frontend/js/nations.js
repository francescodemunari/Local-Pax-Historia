/**
 * Nation Label Manager
 * Handles visualization of HOI4-style dynamic nation name overlays on the map.
 * Nation labels are angled, scaled, and styled dynamically along national territory footprints.
 */

class NationLabelManager {
    constructor(map) {
        this.map = map;
        this.nationLabels = [];
        this.nationsData = {};

        // Dedicated pane for nation labels (above SVG map overlay, below cities/units)
        if (!this.map.getPane('nationsPane')) {
            const pane = this.map.createPane('nationsPane');
            pane.style.zIndex = 480;
            pane.style.pointerEvents = 'none';
        }

        // Exact SVG home territory coordinates [x, y], sizing tiers, orientation angles, and letter spacings
        this.nationCoordinates = {
            // Huge Nations
            'USA': { coords: [315.0, 150.0], size: 'huge', angle: 0, letterSpacing: '0.35em', label: 'UNITED STATES' },
            'SOV': { coords: [890.0, 110.0], size: 'huge', angle: -5, letterSpacing: '0.4em', label: 'SOVIET UNION' },
            'BRA': { coords: [485.0, 332.0], size: 'huge', angle: -45, letterSpacing: '0.3em', label: 'BRAZIL' },
            'AST': { coords: [1240.0, 426.0], size: 'huge', angle: -10, letterSpacing: '0.3em', label: 'AUSTRALIA' },
            'CHI': { coords: [1145.0, 220.0], size: 'huge', angle: -15, letterSpacing: '0.3em', label: 'CHINA' },

            // Big Powers & Large Countries
            'GER': { coords: [745.0, 123.0], size: 'large', angle: -15, letterSpacing: '0.2em', label: 'GERMAN REICH' },
            'FRA': { coords: [708.0, 150.0], size: 'large', angle: -25, letterSpacing: '0.2em', label: 'FRANCE' },
            'ENG': { coords: [692.0, 105.0], size: 'large', angle: -50, letterSpacing: '0.25em', label: 'UNITED KINGDOM' },
            'JAP': { coords: [1245.0, 205.0], size: 'large', angle: -45, letterSpacing: '0.25em', label: 'JAPAN' },
            'ARG': { coords: [445.0, 425.0], size: 'large', angle: -75, letterSpacing: '0.3em', label: 'ARGENTINA' },
            'MEX': { coords: [260.0, 210.0], size: 'large', angle: -30, letterSpacing: '0.25em', label: 'MEXICO' },
            'RAJ': { coords: [980.0, 260.0], size: 'large', angle: -15, letterSpacing: '0.25em', label: 'INDIA' },
            'CAN': { coords: [331.0, 55.0], size: 'large', angle: 0, letterSpacing: '0.35em', label: 'CANADA' },

            // Medium Nations
            'ITA': { coords: [762.0, 195.0], size: 'medium', angle: -55, letterSpacing: '0.2em', label: 'ITALY' },
            'SPR': { coords: [681.0, 188.0], size: 'medium', angle: -15, letterSpacing: '0.2em', label: 'SPAIN' },
            'POL': { coords: [785.0, 121.0], size: 'medium', angle: -10, letterSpacing: '0.2em', label: 'POLAND' },
            'TUR': { coords: [831.0, 185.0], size: 'medium', angle: 5, letterSpacing: '0.25em', label: 'TURKEY' },
            'PER': { coords: [910.0, 210.0], size: 'medium', angle: 15, letterSpacing: '0.25em', label: 'IRAN' },
            'SAU': { coords: [870.0, 250.0], size: 'medium', angle: 20, letterSpacing: '0.25em', label: 'SAUDI ARABIA' },
            'SWE': { coords: [760.0, 70.0], size: 'medium', angle: -70, letterSpacing: '0.25em', label: 'SWEDEN' },
            'NOR': { coords: [730.0, 70.0], size: 'medium', angle: -75, letterSpacing: '0.25em', label: 'NORWAY' },
            'FIN': { coords: [800.0, 60.0], size: 'medium', angle: -60, letterSpacing: '0.25em', label: 'FINLAND' },
            'EGY': { coords: [820.0, 230.0], size: 'medium', angle: -45, letterSpacing: '0.25em', label: 'EGYPT' },
            'SAF': { coords: [780.0, 480.0], size: 'medium', angle: 0, letterSpacing: '0.25em', label: 'SOUTH AFRICA' },
            'MAN': { coords: [1182.0, 155.0], size: 'medium', angle: -20, letterSpacing: '0.25em', label: 'MANCHUKUO' },
            'SIA': { coords: [1090.0, 295.0], size: 'medium', angle: -70, letterSpacing: '0.2em', label: 'SIAM' },
            'COL': { coords: [411.0, 277.0], size: 'medium', angle: -20, letterSpacing: '0.2em', label: 'COLOMBIA' },
            'CHL': { coords: [422.0, 440.0], size: 'medium', angle: -85, letterSpacing: '0.35em', label: 'CHILE' },

            // Small Nations
            'CZE': { coords: [765.0, 135.0], size: 'small', angle: -10, letterSpacing: '0.12em', label: 'CZECHOSLOVAKIA' },
            'HUN': { coords: [773.0, 146.0], size: 'small', angle: 0, letterSpacing: '0.15em', label: 'HUNGARY' },
            'ROM': { coords: [810.0, 155.0], size: 'small', angle: 15, letterSpacing: '0.15em', label: 'ROMANIA' },
            'YUG': { coords: [770.0, 161.0], size: 'small', angle: -20, letterSpacing: '0.15em', label: 'YUGOSLAVIA' },
            'BUL': { coords: [795.0, 168.0], size: 'small', angle: 0, letterSpacing: '0.15em', label: 'BULGARIA' },
            'GRE': { coords: [789.0, 186.0], size: 'small', angle: -60, letterSpacing: '0.15em', label: 'GREECE' },
            'IRQ': { coords: [869.0, 212.0], size: 'small', angle: 30, letterSpacing: '0.15em', label: 'IRAQ' },
            'AFG': { coords: [957.0, 207.0], size: 'small', angle: 20, letterSpacing: '0.15em', label: 'AFGHANISTAN' },
            'ETH': { coords: [870.0, 345.0], size: 'small', angle: -25, letterSpacing: '0.15em', label: 'ETHIOPIA' },
            'PHI': { coords: [1175.0, 303.0], size: 'small', angle: -60, letterSpacing: '0.15em', label: 'PHILIPPINES' },
            'NZL': { coords: [1375.0, 478.0], size: 'small', angle: -45, letterSpacing: '0.15em', label: 'NEW ZEALAND' },
            'PRC': { coords: [1115.0, 185.0], size: 'small', angle: -15, letterSpacing: '0.12em', label: 'COMMUNIST CHINA' },

            // Tiny / Compact Nations
            'POR': { coords: [665.0, 188.0], size: 'tiny', angle: -75, letterSpacing: '0.12em', label: 'PORTUGAL' },
            'HOL': { coords: [715.0, 126.0], size: 'tiny', angle: -20, letterSpacing: '0.1em', label: 'NETHERLANDS' },
            'BEL': { coords: [710.0, 133.0], size: 'tiny', angle: -20, letterSpacing: '0.1em', label: 'BELGIUM' },
            'SWI': { coords: [721.0, 148.0], size: 'tiny', angle: 0, letterSpacing: '0.1em', label: 'SWITZERLAND' },
            'AUS': { coords: [755.0, 144.0], size: 'tiny', angle: -10, letterSpacing: '0.1em', label: 'AUSTRIA' },
            'DEN': { coords: [738.0, 105.0], size: 'tiny', angle: -45, letterSpacing: '0.1em', label: 'DENMARK' }
        };
    }

    /**
     * Load nation data and render labels on map
     */
    async loadNationLabels() {
        try {
            const response = await fetch('/api/map/colors');
            if (!response.ok) throw new Error('Failed to fetch nation colors');
            this.nationsData = await response.json();
            console.log('Loaded nation data for labels:', Object.keys(this.nationsData).length);
            this.displayNationLabels();
        } catch (error) {
            console.error('Error loading nation labels:', error);
        }
    }

    /**
     * Display HOI4-style nation name labels on map (with 3-copy world wrapping replication)
     */
    displayNationLabels() {
        this.clearLabels();

        const scale = gameMap.scaleFactor || 1.0;
        const mapHeight = (gameMap && gameMap.svgHeight) ? gameMap.svgHeight : 600;
        const mapWidth = (gameMap && gameMap.svgWidth) ? gameMap.svgWidth : 1400.16;

        // Combine defined nation coordinates with all nations from API data
        const allNationCodes = new Set([
            ...Object.keys(this.nationCoordinates),
            ...Object.keys(this.nationsData)
        ]);

        allNationCodes.forEach(code => {
            const nationData = this.nationsData[code] || {};
            const info = this.nationCoordinates[code] || {};

            let coords = info.coords;
            let text = info.label || (nationData.name ? nationData.name.toUpperCase() : code);
            let sizeClass = info.size || 'small';
            let angle = info.angle || 0;
            let letterSpacing = info.letterSpacing || '0.15em';

            // FALLBACK: Calculate centroid from SVG map paths if no hardcoded coordinates
            if (!coords) {
                const paths = Array.from(document.querySelectorAll('.map-svg-overlay path'))
                    .filter(p => p.regionData && (p.regionData.nation_code === code || p.regionData.nation === code));

                if (paths.length > 0) {
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    paths.forEach(p => {
                        try {
                            const bbox = p.getBBox();
                            if (bbox && bbox.width > 0 && bbox.height > 0) {
                                minX = Math.min(minX, bbox.x);
                                maxX = Math.max(maxX, bbox.x + bbox.width);
                                minY = Math.min(minY, bbox.y);
                                maxY = Math.max(maxY, bbox.y + bbox.height);
                            }
                        } catch (e) {}
                    });

                    if (minX !== Infinity) {
                        coords = [(minX + maxX) / 2, (minY + maxY) / 2];
                    }
                }
            }

            if (!coords) return; // Skip if position cannot be resolved

            const scaledX = coords[0] * scale;
            const scaledY = coords[1] * scale;
            const baseLat = mapHeight - scaledY;

            // Render 3 copies for world wrapping: middle, left (-mapWidth), right (+mapWidth)
            const xOffsets = [0, -mapWidth, mapWidth];

            xOffsets.forEach(xOffset => {
                const iconClass = `nation-label-container ${sizeClass}`;
                const labelHtml = `<div class="nation-label" data-angle="${angle}" style="transform: rotate(${angle}deg); letter-spacing: ${letterSpacing};">${text}</div>`;

                const icon = L.divIcon({
                    className: iconClass,
                    html: labelHtml,
                    iconSize: [200, 40],
                    iconAnchor: [100, 20]
                });

                const position = [baseLat, scaledX + xOffset];

                const marker = L.marker(position, {
                    icon: icon,
                    pane: 'nationsPane',
                    interactive: false
                });

                marker.addTo(this.map);
                this.nationLabels.push(marker);
            });
        });

        console.log(`Rendered ${this.nationLabels.length} HOI4 nation labels on map (including world wrap copies).`);
        this.updateVisibility(this.map.getZoom());
    }

    /**
     * Clear all nation label markers
     */
    clearLabels() {
        this.nationLabels.forEach(marker => this.map.removeLayer(marker));
        this.nationLabels = [];
    }

    /**
     * Update label font scaling smoothly on map zoom while preserving rotation
     */
    updateVisibility(zoom) {
        const labels = document.querySelectorAll('.nation-label');
        const zoomScale = Math.min(2.2, Math.max(0.75, 1 + (zoom - 1) * 0.25));
        labels.forEach(label => {
            const angle = label.getAttribute('data-angle') || 0;
            label.style.transform = `rotate(${angle}deg) scale(${zoomScale})`;
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NationLabelManager;
}

