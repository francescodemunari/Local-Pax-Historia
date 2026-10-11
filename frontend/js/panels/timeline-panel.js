/**
 * Pax Historia - Timeline Panel
 * Handles time advancement and turn management
 */

const timelinePanel = {
    isAdvancing: false,
    isContinuing: false,

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
        if(this.isContinuing)return;
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
        if (!app.currentGame || this.isAdvancing || this.isContinuing) return;

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
        const game=app.currentGame;
        const revision=Number.isSafeInteger(result.revision) && result.revision>=0 ? result.revision : null;
        const knownRevision=Number.isSafeInteger(game.revision) ? game.revision : 0;
        if(revision===null ? knownRevision>0 : revision<knownRevision)return;
        const key = `${saveId}:${result.turn_number}:${result.revision || ''}`;
        if (this.lastPresentedTurn === key) return;
        this.lastPresentedTurn = key;
        if(revision!==null)game.revision=revision;
        const isCurrent=()=>app.currentGame===game && this.lastPresentedTurn===key &&
            (revision===null || game.revision===revision);
        if(result.resumed_from_event) {
            turnPlayback.stop();
            app.currentGame.currentDate=result.new_date;
            app.currentGame.turnNumber=result.turn_number;
            if(result.state?.playerNation)app.currentGame.playerNation=result.state.playerNation;
            this.updateDateDisplay();
            const draft=document.getElementById('action-input')?.value || '';
            actionsPanel.reset();
            if(document.getElementById('action-input'))document.getElementById('action-input').value=draft;
            actionsPanel.updateComposer();
            actionsPanel.updatePanelInfo();
            if(typeof diplomacyPanel!=='undefined')diplomacyPanel.reset();
            if(typeof advisorPanel!=='undefined')advisorPanel.reset();
            await app.refreshAfterTurn({...result,world_changed:true});
            if(!isCurrent())return;
            const history=result.state?.events || await api.getEvents(saveId);
            if(!isCurrent())return;
            eventsPanel.replaceEvents(history);
            app.closeAllPanels();
            document.getElementById('region-popup')?.classList.add('hidden');
            document.getElementById('nation-popup')?.classList.add('hidden');
            app.showToast(`Playing from ${app.formatDate(result.new_date)}. Later simulated outcomes were discarded.`, 'success');
            return;
        }
        app.currentGame.currentDate = result.new_date;
        app.currentGame.turnNumber = result.turn_number;
        this.updateDateDisplay();
        await app.refreshAfterTurn(result);
        if (!isCurrent()) return;
        eventsPanel.addEvents(result.events || []);
        if(result.next_event_checkpoint)app.showToast(`Paused after ${result.advanced_days} days at a progress checkpoint. No strategic milestone was resolved; standing orders continue.`, 'info');
        if(result.resolution_notes?.some(n=>n.kind==='order'))app.showToast('Some orders are still awaiting an outcome. They remain available in Actions.', 'info');
        else if(result.resolution_notes?.length)app.showToast('Some fronts or support requests still need an outcome. Their standing orders remain active.', 'info');
        document.getElementById('action-suggestions')?.replaceChildren();
        await turnPlayback.play(result.events, saveId, result);
    },

    async resumeFromEvent(event) {
        if(!app.currentGame || this.isContinuing || !event?.can_resume)return;
        if(this.isAdvancing && !turnPlayback.queue?.length)return;
        const saveId=app.currentGame.saveId;
        this.isContinuing=true;
        try {
            const result=await api.request('/game/resume-event',{method:'POST',body:{saveId,eventId:event.id,revision:event.resume_revision}});
            await this.receiveTurn(result,saveId);
        } catch(error) {
            if(app.currentGame?.saveId===saveId) {
                app.showToast(error.message || 'Unable to continue from this event. Your save is unchanged.','error');
                await eventsPanel.loadEvents();
            }
        } finally {
            this.isContinuing=false;
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
