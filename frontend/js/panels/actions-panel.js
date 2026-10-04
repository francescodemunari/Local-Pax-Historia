/**
 * Pax Historia - Actions Panel
 * Handles player action input and submission
 */

const actionsPanel = {
    pendingActions: [],

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Send action button
        document.getElementById('btn-send-action').addEventListener('click', () => {
            this.submitAction();
        });

        // Enter key in action input
        document.getElementById('action-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.submitAction();
            }
        });

        // Brainstorm button
        document.getElementById('btn-brainstorm').addEventListener('click', () => {
            this.brainstormActions();
        });

    },

    reset() {
        this.saveId = app.currentGame?.saveId;
        this.pendingActions = [];
        this.draftGeneration = (this.draftGeneration || 0) + 1;
        document.getElementById('action-suggestions').replaceChildren();
        document.getElementById('action-input').value = '';
        document.getElementById('active-campaigns').replaceChildren();
    },

    show() {
        if(this.saveId !== app.currentGame?.saveId)this.reset();
        document.getElementById('actions-panel').classList.remove('hidden');
        this.updatePanelInfo();
        this.loadPendingActions();
        this.loadCampaigns();
    },

    hide() {
        document.getElementById('actions-panel').classList.add('hidden');
    },

    async loadCampaigns() {
        const container=document.getElementById('active-campaigns'),saveId=app.currentGame?.saveId;
        if(!container || !saveId)return;
        try {
            const campaigns=await api.request(`/actions/campaigns/${saveId}`);
            if(app.currentGame?.saveId!==saveId)return;
            container.replaceChildren();
            for(const campaign of campaigns.filter(c=>!['completed','cancelled'].includes(c.status))) {
                const card=document.createElement('div');card.className='pending-action';
                const title=document.createElement('p');title.textContent=`Campaign: ${campaign.target_name} — ${campaign.status}`;card.append(title);
                for(const progress of campaign.front_progress||[]) {
                    const row=document.createElement('p');
                    const labels={reported:'Outcome reported',awaiting_report:'Awaiting an outcome; orders remain active',held:'Held position',blocked:'Blocked'};
                    row.textContent=`${progress.name}: ${labels[progress.status]||'Awaiting an outcome'}`;
                    card.append(row);
                }
                if((campaign.pending_updates||[]).some(n=>n.kind==='air_support')) {
                    const row=document.createElement('p');row.textContent='Air support: no mission reported yet; the request remains active.';card.append(row);
                }
                if((campaign.pending_updates||[]).some(n=>n.kind==='planning')) {
                    const row=document.createElement('p');row.textContent='Part of the standing order still needs a plan. It remains active for the next turn.';card.append(row);
                }
                for(const [label,status] of [[campaign.status==='active'?'Pause campaign':'Resume campaign',campaign.status==='active'?'held':'active'],['Cancel campaign','cancelled']]) {
                    const button=document.createElement('button');button.className='btn secondary';button.textContent=label;
                    button.onclick=async()=>{button.disabled=true;try{await api.request(`/actions/campaigns/${saveId}/${campaign.id}`,{method:'POST',body:{status}});await this.loadCampaigns();}catch(error){app.showToast(error.message,'error');button.disabled=false;}};
                    card.append(button);
                }
                container.append(card);
            }
        }catch(error){app.showToast(error.message,'error');}
    },

    toggle() {
        const panel = document.getElementById('actions-panel');
        if (panel.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    },

    updatePanelInfo() {
        if (app.currentGame) {
            document.getElementById('actions-nation').textContent = app.currentGame.playerNation.name;
            document.getElementById('actions-date').textContent = app.formatDate(app.currentGame.currentDate);
        }
    },

    async loadPendingActions() {
        if (!app.currentGame) return;

        try {
            const saveId = app.currentGame.saveId;
            const actions = await api.getActions(saveId);
            if (app.currentGame?.saveId !== saveId) return;
            this.pendingActions = actions.filter(action => action.status === 'pending');
            this.renderPendingActions();
        } catch (error) {
            console.error('Failed to load pending actions:', error);
        }
    },

    renderPendingActions() {
        const container = document.getElementById('pending-actions');
        container.innerHTML = '';

        if (this.pendingActions.length === 0) {
            container.innerHTML = '<p class="panel-hint">No orders yet. The Game Master resolves issued orders when time advances.</p>';
            return;
        }

        this.pendingActions.forEach(action => {
            const div = document.createElement('div');
            div.className = `pending-action ${action.status}`;
            div.innerHTML = `
                <p class="pending-action-text">${this.escapeHtml(action.action_text)}</p>
                <p class="pending-action-status">Queued for the next simulation</p>
            `;

            // Add delete button for pending actions
            if (action.status === 'pending') {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-icon-only';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.onclick = () => this.deleteAction(action.id);
                div.appendChild(deleteBtn);
            }

            container.appendChild(div);
        });
    },

    prefillAction(actionText) {
        this.show();
        const input = document.getElementById('action-input');
        input.value = actionText;
        input.focus();
        input.setSelectionRange(actionText.length, actionText.length);
    },

    async submitAction() {
        const input = document.getElementById('action-input');
        const actionText = input.value.trim();

        if (!actionText) {
            app.showToast('Write an action before sending', 'error');
            return;
        }

        if (!app.currentGame) {
            app.showToast('No game in progress', 'error');
            return;
        }

        const btn = document.getElementById('btn-send-action');
        btn.disabled = true;
        btn.innerHTML = '<span class="icon">⏳</span> Queuing...';

        try {
            const result = await api.submitAction(
                app.currentGame.saveId,
                actionText
            );

            if (result.success) {
                app.showToast('Action sent!', 'success');
                input.value = '';
                this.loadPendingActions();
            } else {
                app.showToast('The order could not be queued.', 'error');
                this.loadPendingActions();
            }
        } catch (error) {
            console.error('Failed to submit action:', error);
            app.showToast('Error sending action', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="icon">➤</span> Send Action';
        }
    },

    async deleteAction(actionId) {
        try {
            await api.deleteAction(actionId, app.currentGame.saveId);
            app.showToast('Action deleted', 'info');
            this.loadPendingActions();
        } catch (error) {
            console.error('Failed to delete action:', error);
            app.showToast('Error deleting action', 'error');
        }
    },

    async brainstormActions() {
        if (!app.currentGame) return;
        const generation = this.draftGeneration = (this.draftGeneration || 0) + 1;

        const btn = document.getElementById('btn-brainstorm');
        btn.disabled = true;
        btn.textContent = '⏳ Thinking...';

        try {
            const saveId = app.currentGame.saveId;
            const goal = document.getElementById('action-input').value.trim();
            const result = await api.brainstormActions(saveId, goal);
            if (app.currentGame?.saveId !== saveId || generation !== this.draftGeneration) return;
            const container = document.getElementById('action-suggestions');
            container.replaceChildren();
            for (const action of result.actions || []) {
                const card = document.createElement('div');
                card.className = 'brainstorm-suggestions';
                const text = document.createElement('textarea');
                text.value = action; text.rows = 4; text.setAttribute('aria-label','Suggested action');
                const controls = document.createElement('div');controls.className='action-buttons';
                const queue = document.createElement('button');queue.className='btn primary';queue.textContent='Queue action';
                const remove = document.createElement('button');remove.className='btn secondary';remove.textContent='Delete suggestion';
                remove.onclick=()=>card.remove();
                queue.onclick=async()=>{
                    if(!text.value.trim() || app.currentGame?.saveId!==saveId)return;
                    queue.disabled=true;
                    try {const response=await api.submitAction(saveId,text.value.trim());
                        if(!response.success)throw new Error('The order could not be queued.');
                        card.remove();if(app.currentGame?.saveId===saveId)this.loadPendingActions();
                    }catch(error){app.showToast(error.message,'error');queue.disabled=false;}
                };
                controls.append(queue,remove);card.append(text,controls);container.append(card);
            }
            if (!result.actions?.length) app.showToast('No actionable suggestions returned. Try again with a more specific goal.', 'info');

        } catch (error) {
            console.error('Failed to brainstorm:', error);
            app.showToast(error.message || 'Unable to generate action drafts.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Help me plan actions';
        }
    },

    formatSuggestions(text) {
        // Escape model output before applying the tiny formatting subset we support.
        return this.escapeHtml(text)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
    }
};
