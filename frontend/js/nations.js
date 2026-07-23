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
            'USA': { coords: [315.0, 160.0], size: 'huge', angle: 0, letterSpacing: '0.35em', label: 'UNITED STATES' },
            'SOV': { coords: [890.0, 115.0], size: 'huge', angle: -5, letterSpacing: '0.4em', label: 'SOVIET UNION' },
            'BRA': { coords: [480.0, 395.0], size: 'huge', angle: -45, letterSpacing: '0.3em', label: 'BRAZIL' },
            'AST': { coords: [1270.0, 430.0], size: 'huge', angle: -10, letterSpacing: '0.3em', label: 'AUSTRALIA' },
            'CHI': { coords: [1120.0, 225.0], size: 'huge', angle: -15, letterSpacing: '0.3em', label: 'CHINA' },

            // Big Powers & Large Countries
            'GER': { coords: [755.0, 132.0], size: 'large', angle: -15, letterSpacing: '0.2em', label: 'GERMAN REICH' },
            'FRA': { coords: [705.0, 158.0], size: 'large', angle: -25, letterSpacing: '0.2em', label: 'FRANCE' },
            'ENG': { coords: [695.0, 115.0], size: 'large', angle: -50, letterSpacing: '0.25em', label: 'UNITED KINGDOM' },
            'JAP': { coords: [1250.0, 210.0], size: 'large', angle: -45, letterSpacing: '0.25em', label: 'JAPAN' },
            'ARG': { coords: [475.0, 480.0], size: 'large', angle: -75, letterSpacing: '0.3em', label: 'ARGENTINA' },
            'MEX': { coords: [255.0, 230.0], size: 'large', angle: -30, letterSpacing: '0.25em', label: 'MEXICO' },
            'RAJ': { coords: [980.0, 275.0], size: 'large', angle: -15, letterSpacing: '0.25em', label: 'INDIA' },

            // Medium Nations
            'ITA': { coords: [745.0, 180.0], size: 'medium', angle: -55, letterSpacing: '0.2em', label: 'ITALY' },
            'SPA': { coords: [675.0, 192.0], size: 'medium', angle: -15, letterSpacing: '0.2em', label: 'SPAIN' },
            'SPR': { coords: [675.0, 192.0], size: 'medium', angle: -15, letterSpacing: '0.2em', label: 'SPAIN' },
            'GLC': { coords: [675.0, 192.0], size: 'medium', angle: -15, letterSpacing: '0.2em', label: 'SPAIN' },
            'POL': { coords: [790.0, 126.0], size: 'medium', angle: -10, letterSpacing: '0.2em', label: 'POLAND' },
            'DNZ': { coords: [790.0, 126.0], size: 'medium', angle: -10, letterSpacing: '0.2em', label: 'POLAND' },
            'TUR': { coords: [845.0, 192.0], size: 'medium', angle: 5, letterSpacing: '0.25em', label: 'TURKEY' },
            'PER': { coords: [935.0, 210.0], size: 'medium', angle: 15, letterSpacing: '0.25em', label: 'IRAN' },
            'IRA': { coords: [935.0, 210.0], size: 'medium', angle: 15, letterSpacing: '0.25em', label: 'IRAN' },
            'SAU': { coords: [890.0, 260.0], size: 'medium', angle: 20, letterSpacing: '0.25em', label: 'SAUDI ARABIA' },
            'SWE': { coords: [755.0, 85.0], size: 'medium', angle: -70, letterSpacing: '0.25em', label: 'SWEDEN' },
            'NOR': { coords: [725.0, 85.0], size: 'medium', angle: -75, letterSpacing: '0.25em', label: 'NORWAY' },
            'FIN': { coords: [815.0, 68.0], size: 'medium', angle: -60, letterSpacing: '0.25em', label: 'FINLAND' },
            'EGY': { coords: [835.0, 250.0], size: 'medium', angle: -45, letterSpacing: '0.25em', label: 'EGYPT' },
            'SAF': { coords: [810.0, 490.0], size: 'medium', angle: 0, letterSpacing: '0.25em', label: 'SOUTH AFRICA' },
            'MAN': { coords: [1200.0, 155.0], size: 'medium', angle: -20, letterSpacing: '0.25em', label: 'MANCHUKUO' },
            'SIA': { coords: [1090.0, 310.0], size: 'medium', angle: -70, letterSpacing: '0.2em', label: 'SIAM' },
            'COL': { coords: [415.0, 315.0], size: 'medium', angle: -20, letterSpacing: '0.2em', label: 'COLOMBIA' },
            'CHL': { coords: [445.0, 465.0], size: 'medium', angle: -85, letterSpacing: '0.35em', label: 'CHILE' },

            // Small Nations
            'CZE': { coords: [768.0, 140.0], size: 'small', angle: -10, letterSpacing: '0.12em', label: 'CZECHOSLOVAKIA' },
            'HUN': { coords: [782.0, 152.0], size: 'small', angle: 0, letterSpacing: '0.15em', label: 'HUNGARY' },
            'ROM': { coords: [812.0, 165.0], size: 'small', angle: 15, letterSpacing: '0.15em', label: 'ROMANIA' },
            'YUG': { coords: [785.0, 172.0], size: 'small', angle: -20, letterSpacing: '0.15em', label: 'YUGOSLAVIA' },
            'BUL': { coords: [805.0, 185.0], size: 'small', angle: 0, letterSpacing: '0.15em', label: 'BULGARIA' },
            'GRE': { coords: [800.0, 202.0], size: 'small', angle: -60, letterSpacing: '0.15em', label: 'GREECE' },
            'IRQ': { coords: [886.0, 230.0], size: 'small', angle: 30, letterSpacing: '0.15em', label: 'IRAQ' },
            'AFG': { coords: [975.0, 215.0], size: 'small', angle: 20, letterSpacing: '0.15em', label: 'AFGHANISTAN' },
            'ETH': { coords: [875.0, 345.0], size: 'small', angle: -25, letterSpacing: '0.15em', label: 'ETHIOPIA' },
            'PHI': { coords: [1185.0, 310.0], size: 'small', angle: -60, letterSpacing: '0.15em', label: 'PHILIPPINES' },
            'NZL': { coords: [1370.0, 480.0], size: 'small', angle: -45, letterSpacing: '0.15em', label: 'NEW ZEALAND' },
            'PRC': { coords: [1110.0, 200.0], size: 'small', angle: -15, letterSpacing: '0.12em', label: 'COMMUNIST CHINA' },

            // Tiny / Compact Nations
            'POR': { coords: [662.0, 195.0], size: 'tiny', angle: -75, letterSpacing: '0.12em', label: 'PORTUGAL' },
            'HOL': { coords: [715.0, 126.0], size: 'tiny', angle: -20, letterSpacing: '0.1em', label: 'NETHERLANDS' },
            'NED': { coords: [715.0, 126.0], size: 'tiny', angle: -20, letterSpacing: '0.1em', label: 'NETHERLANDS' },
            'BEL': { coords: [710.0, 136.0], size: 'tiny', angle: -20, letterSpacing: '0.1em', label: 'BELGIUM' },
            'SWI': { coords: [722.0, 160.0], size: 'tiny', angle: 0, letterSpacing: '0.1em', label: 'SWITZERLAND' },
            'AUS': { coords: [762.0, 150.0], size: 'tiny', angle: -10, letterSpacing: '0.1em', label: 'AUSTRIA' },
            'DEN': { coords: [738.0, 108.0], size: 'tiny', angle: -45, letterSpacing: '0.1em', label: 'DENMARK' }
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
     * Display HOI4-style nation name labels on map
     */
    displayNationLabels() {
        this.clearLabels();

        const scale = gameMap.scaleFactor || 1.0;
        const mapHeight = (gameMap && gameMap.svgHeight) ? gameMap.svgHeight : 600;

        // Iterate over defined nation coordinates
        Object.keys(this.nationCoordinates).forEach(code => {
            const info = this.nationCoordinates[code];
            const nationData = this.nationsData[code] || {};
            
            // Format label text: prefer explicit uppercase HOI4 label or nation name
            const text = info.label || (nationData.name ? nationData.name.toUpperCase() : code);
            const sizeClass = info.size || 'medium';
            const angle = info.angle || 0;
            const letterSpacing = info.letterSpacing || '0.15em';

            const iconClass = `nation-label-container ${sizeClass}`;
            const labelHtml = `<div class="nation-label" data-angle="${angle}" style="transform: rotate(${angle}deg); letter-spacing: ${letterSpacing};">${text}</div>`;

            const icon = L.divIcon({
                className: iconClass,
                html: labelHtml,
                iconSize: [200, 40],
                iconAnchor: [100, 20]
            });

            // Convert SVG x, y to Leaflet simple CRS lat, lng
            const scaledX = info.coords[0] * scale;
            const scaledY = info.coords[1] * scale;
            const position = [mapHeight - scaledY, scaledX];

            const marker = L.marker(position, {
                icon: icon,
                pane: 'nationsPane',
                interactive: false
            });

            marker.addTo(this.map);
            this.nationLabels.push(marker);
        });

        console.log(`Rendered ${this.nationLabels.length} HOI4 nation labels on map.`);
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
