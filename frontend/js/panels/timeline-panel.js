/**
 * Pax Historia - Timeline Panel
 * Handles time advancement and turn management
 */

const timelinePanel = {
    isAdvancing: false,

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Advance time button in header
        document.getElementById('btn-advance-time').addEventListener('click', () => {
            this.showTimeModal();
        });

        // Time jump buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const jump = btn.dataset.jump;
                if (jump === 'custom') {
                    this.showCustomTimeInput();
                } else {
                    this.advanceTime(jump);
                }
            });
        });

        // Modal close
        document.querySelectorAll('#time-modal .modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hideTimeModal();
            });
        });

        // Click outside modal to close
        document.getElementById('time-modal').addEventListener('click', (e) => {
            if (e.target.id === 'time-modal') {
                this.hideTimeModal();
            }
        });
    },

    showTimeModal() {
        if (!app.currentGame) return;
        if (turnPlayback.queue?.length) { app.showToast('Finish event playback before advancing again.', 'info'); return; }

        const currentDate = new Date(app.currentGame.currentDate);

        // Update "from" date
        document.getElementById('time-from-date').textContent = app.formatDate(currentDate);

        // Calculate and show target dates
        this.updateTargetDates(currentDate);

        document.getElementById('time-modal').classList.remove('hidden');
    },

    hideTimeModal() {
        document.getElementById('time-modal').classList.add('hidden');
    },

    updateTargetDates(fromDate) {
        const jumps = ['1_week','1_month','3_months','6_months','1_year'];
        for (const jump of jumps) {
            const element=document.getElementById(`time-${jump.replace('_','')}`);
            if(element)element.textContent=app.formatDate(this.targetDate(fromDate,jump));
        }
    },

    targetDate(fromDate,jump) {
        const date=new Date(fromDate),[amount,unit]=jump.split('_'),count=Number(amount);
        if(unit.startsWith('day') || unit.startsWith('week')) date.setUTCDate(date.getUTCDate()+count*(unit.startsWith('week')?7:1));
        else {
            const day=date.getUTCDate();date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth()+count*(unit.startsWith('year')?12:1));
            const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1,0);
            date.setUTCDate(Math.min(day,last.getUTCDate()));
        }
        return date;
    },

    showCustomTimeInput() {
        // For now, just show a prompt. Could be improved with a custom modal.
        const input = prompt('Enter the time jump (e.g., 10_days, 2_weeks, 4_months):');
        if (input && input.match(/^\d+_(days?|weeks?|months?|years?)$/i)) {
            this.advanceTime(input.toLowerCase());
        } else if (input) {
            app.showToast('Invalid format. Use: number_unit (e.g., 10_days)', 'error');
        }
    },

    async advanceTime(timeJump) {
        if (!app.currentGame || this.isAdvancing) return;

        const saveId = app.currentGame.saveId;
        this.hideTimeModal();
        this.isAdvancing = true;

        // Show loading state
        const btn = document.getElementById('btn-advance-time');
        btn.disabled = true;
        btn.innerHTML = '⏳';
        document.getElementById('current-date').textContent = 'Simulating...';

        app.showToast('Simulating world events...', 'info');

        try {
            const result = await api.advanceTime(saveId, timeJump);
            await this.receiveTurn(result, saveId);

        } catch (error) {
            console.error('Failed to advance time:', error);
            app.showToast(error.message || 'Unable to resolve this turn. Pending orders were preserved.', 'error');

            // Restore date display
            this.updateDateDisplay();
        } finally {
            this.isAdvancing = false;
            btn.disabled = false;
            btn.innerHTML = '≫';
        }
    },

    async receiveTurn(result, saveId) {
        if (app.currentGame?.saveId !== saveId) return;
        const key = `${saveId}:${result.turn_number}`;
        if (this.lastPresentedTurn === key) return;
        this.lastPresentedTurn = key;
        app.currentGame.currentDate = result.new_date;
        app.currentGame.turnNumber = result.turn_number;
        this.updateDateDisplay();
        await app.refreshAfterTurn(result);
        if (app.currentGame?.saveId !== saveId) return;
        eventsPanel.addEvents(result.events || []);
        if(result.next_event_checkpoint)app.showToast(`Paused after ${result.advanced_days} days at a progress checkpoint. No strategic milestone was resolved; standing orders continue.`, 'info');
        if(result.resolution_notes?.some(n=>n.kind==='order'))app.showToast('Some orders are still awaiting an outcome. They remain available in Actions.', 'info');
        else if(result.resolution_notes?.length)app.showToast('Some fronts or support requests still need an outcome. Their standing orders remain active.', 'info');
        document.getElementById('action-suggestions')?.replaceChildren();
        await turnPlayback.play(result.events, saveId, result);
    },

    updateDateDisplay() {
        if (app.currentGame) {
            document.getElementById('current-date').textContent =
                app.formatDate(app.currentGame.currentDate);
        }
    },

    formatTimeJump(jump) {
        const formats = {
            '1_week': '1 week',
            '1_month': '1 month',
            '3_months': '3 months',
            '6_months': '6 months',
            '1_year': '1 year'
        };
        return formats[jump] || jump;
    }
};
