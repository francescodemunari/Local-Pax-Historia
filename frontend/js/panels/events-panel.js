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
        const saveId=app.currentGame.saveId;
        const request=this.historyRequest=(this.historyRequest || 0)+1;

        try {
            const events = await api.getEvents(saveId);
            if(app.currentGame?.saveId!==saveId || request!==this.historyRequest)return;
            this.replaceEvents(events);
        } catch (error) {
            if(app.currentGame?.saveId===saveId && request===this.historyRequest)console.error('Failed to load events:', error);
        }
    },

    replaceEvents(events) {
        this.historyRequest=(this.historyRequest || 0)+1;
        this.events=events;
        this.renderEvents();
    },

    renderEvents() {
        const container = document.getElementById('events-list');
        container.innerHTML = '';

        let filtered = this.events;
        if(this.currentFilter==='player') {
            filtered=this.events.filter(e=>this.isImportantForPlayer(e));
        } else if (this.currentFilter !== 'all') {
            filtered = this.events.filter(e => e.event_type === this.currentFilter);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p class="panel-hint">No events to display.</p>';
            return;
        }

        filtered.forEach(event => {
            const div = document.createElement('div');
            div.className = `event-item ${event.event_type} ${event.severity}`;
            const affectedNations = (event.affected_nations || [])
                .map(nation => this.escapeHtml(countryFlags.name(nation)))
                .join(', ');
            div.innerHTML = `
                <div class="event-header">
                    <span class="event-title">${this.getEventIcon(event.event_type)} ${this.escapeHtml(event.title)}</span>
                    <span class="event-date">${app.formatDate(event.game_date)}</span>
                </div>
                <p class="event-description">${this.escapeHtml(event.description)}</p>
                <div class="event-tags">
                    <span class="event-tag">${this.escapeHtml(this.formatEventType(event.event_type))}</span>
                    <span class="event-tag">${this.escapeHtml(this.formatSeverity(event.severity))}</span>
                    ${this.isImportantForPlayer(event) ? '<span class="event-tag player-milestone">Important for your nation</span>' : ['major','critical'].includes(event.severity) ? '<span class="event-tag">World news</span>' : ''}
                    ${affectedNations ? `<span class="event-tag">${affectedNations}</span>` : ''}
                </div>
                ${this.renderAppliedEffects(event)}
            `;
            if(this.isImportantForPlayer(event) && event.player_impact?.reason) {
                const impact=document.createElement('p');impact.className='event-impact';
                impact.textContent=countryFlags.prose(event.player_impact.reason);div.appendChild(impact);
            }
            if(event.can_resume) {
                const controls=document.createElement('div');controls.className='event-continuation';
                const button=document.createElement('button');button.className='btn secondary';button.textContent='Play from this event';
                button.title='Continue from this date with all same-day effects. Later simulated outcomes will be discarded.';
                button.onclick=async()=>{button.disabled=true;button.textContent='Restoring…';try{await timelinePanel.resumeFromEvent(event);}finally{button.disabled=false;button.textContent='Play from this event';}};
                const hint=document.createElement('p');hint.className='panel-hint';hint.textContent='Continues from this date; discards later simulated outcomes.';
                controls.append(button,hint);div.appendChild(controls);
            }
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

    isImportantForPlayer(event) {
        if(typeof event.important_for_player==='boolean')return event.important_for_player;
        const code=app.currentGame?.playerNation?.code,impact=event.player_impact;
        if(impact!==undefined)return impact?.nation_code===code && ['major','critical'].includes(impact.importance) &&
            typeof impact.reason==='string' && !!impact.reason.trim() &&
            (event.development_status==null || event.development_status==='occurred');
        return ['major','critical'].includes(event.severity) && (event.affected_nations||[]).includes(code);
    },

    renderAppliedEffects(event) {
        const changes = Array.isArray(event.applied_state_changes) ? event.applied_state_changes : [];
        const effects = changes.flatMap(change => Object.entries(change).filter(([field]) => field !== 'nation_code')
            .map(([field, value]) => `${change.nation_code}: ${field.replace(/_/g, ' ')} ${Array.isArray(value) ? value.join(', ') : (value > 0 ? '+' : '') + value}`));
        if (!effects.length) return '';
        return `<p class="event-description"><strong>Applied changes:</strong> ${this.escapeHtml(effects.join('; '))}</p>`;
    },

    escapeHtml(value) {
        return (typeof countryFlags !== 'undefined' ? countryFlags.prose(value) : String(value ?? '')).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    },

    addEvents(newEvents) {
        this.historyRequest=(this.historyRequest || 0)+1;
        // Add new events to the beginning
        const byId=new Map([...this.events.map(event=>({...event,can_resume:false})),...newEvents].map(event=>[event.id,event]));
        this.events=[...byId.values()].sort((a,b)=>String(b.game_date||'').localeCompare(String(a.game_date||'')));
        this.renderEvents();

        // Show notification for critical events
        const critical = newEvents.filter(e => this.isImportantForPlayer(e));
        if (critical.length > 0) {
            app.showToast(`${critical.length} important ${critical.length===1?'event':'events'} for your nation`, 'info');
        }
    },

    reset() {
        this.historyRequest=(this.historyRequest || 0)+1;
        this.events = [];
        this.currentFilter = 'all';
    }
};
