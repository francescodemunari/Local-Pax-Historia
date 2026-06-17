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
        const jumps = {
            '1_week': 7,
            '1_month': 30,
            '3_months': 90,
            '6_months': 180,
            '1_year': 365
        };

        Object.entries(jumps).forEach(([key, days]) => {
            const targetDate = new Date(fromDate);
            targetDate.setDate(targetDate.getDate() + days);

            const element = document.getElementById(`time-${key.replace('_', '')}`);
            if (element) {
                element.textContent = app.formatDate(targetDate);
            }
        });
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

        this.hideTimeModal();
        this.isAdvancing = true;

        // Show loading state
        const btn = document.getElementById('btn-advance-time');
        btn.disabled = true;
        btn.innerHTML = '⏳';
        document.getElementById('current-date').textContent = 'Simulating...';

        app.showToast('Simulating world events...', 'info');

        try {
            const result = await api.advanceTime(app.currentGame.saveId, timeJump);

            // Update game state
            app.currentGame.currentDate = result.new_date;
            app.currentGame.turnNumber = result.turn_number;

            // Update UI
            this.updateDateDisplay();

            // Show new events
            if (result.events && result.events.length > 0) {
                eventsPanel.addEvents(result.events);
                app.showToast(`${result.events.length} new events!`, 'success');

                // Automatically show events panel
                eventsPanel.show();
            } else {
                app.showToast('Time advanced. No significant events.', 'info');
            }

            // Reload pending actions
            actionsPanel.loadPendingActions();

        } catch (error) {
            console.error('Failed to advance time:', error);
            app.showToast('Error advancing time', 'error');

            // Restore date display
            this.updateDateDisplay();
        } finally {
            this.isAdvancing = false;
            btn.disabled = false;
            btn.innerHTML = '≫';
        }
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
