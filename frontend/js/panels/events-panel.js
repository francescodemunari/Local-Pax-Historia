/**
 * Pax Historia - Events Panel
 * Displays game events and notifications
 */

const eventsPanel = {
    events: [],
    currentFilter: 'all',

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Filter buttons
        document.querySelectorAll('#events-panel .filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilter(btn.dataset.type);
            });
        });
    },

    show() {
        document.getElementById('events-panel').classList.remove('hidden');
        this.loadEvents();
    },

    hide() {
        document.getElementById('events-panel').classList.add('hidden');
    },

    toggle() {
        const panel = document.getElementById('events-panel');
        if (panel.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    },

    setFilter(type) {
        this.currentFilter = type;

        // Update active button
        document.querySelectorAll('#events-panel .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        this.renderEvents();
    },

    async loadEvents() {
        if (!app.currentGame) return;

        try {
            const events = await api.getEvents(app.currentGame.saveId);
            this.events = events;
            this.renderEvents();
        } catch (error) {
            console.error('Failed to load events:', error);
        }
    },

    renderEvents() {
        const container = document.getElementById('events-list');
        container.innerHTML = '';

        let filtered = this.events;
        if (this.currentFilter !== 'all') {
            filtered = this.events.filter(e => e.event_type === this.currentFilter);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p class="panel-hint">No events to display.</p>';
            return;
        }

        filtered.forEach(event => {
            const div = document.createElement('div');
            div.className = `event-item ${event.event_type} ${event.severity}`;
            div.innerHTML = `
                <div class="event-header">
                    <span class="event-title">${this.getEventIcon(event.event_type)} ${event.title}</span>
                    <span class="event-date">${app.formatDate(event.game_date)}</span>
                </div>
                <p class="event-description">${event.description}</p>
                <div class="event-tags">
                    <span class="event-tag">${this.formatEventType(event.event_type)}</span>
                    <span class="event-tag">${this.formatSeverity(event.severity)}</span>
                    ${event.affected_nations?.length ?
                    `<span class="event-tag">${event.affected_nations.join(', ')}</span>` : ''}
                </div>
            `;
            container.appendChild(div);
        });
    },

    getEventIcon(type) {
        const icons = {
            military: '⚔️',
            political: '🏛️',
            economic: '💰',
            diplomatic: '🤝',
            social: '👥'
        };
        return icons[type] || '📰';
    },

    formatEventType(type) {
        const types = {
            military: 'Military',
            political: 'Political',
            economic: 'Economic',
            diplomatic: 'Diplomatic',
            social: 'Social'
        };
        return types[type] || type;
    },

    formatSeverity(severity) {
        const severities = {
            minor: 'Minor',
            moderate: 'Moderate',
            major: 'Major',
            critical: 'Critical'
        };
        return severities[severity] || severity;
    },

    addEvents(newEvents) {
        // Add new events to the beginning
        this.events = [...newEvents, ...this.events];
        this.renderEvents();

        // Show notification for critical events
        const critical = newEvents.filter(e => e.severity === 'critical' || e.severity === 'major');
        if (critical.length > 0) {
            app.showToast(`${critical.length} important events!`, 'info');
        }
    },

    reset() {
        this.events = [];
        this.currentFilter = 'all';
    }
};
