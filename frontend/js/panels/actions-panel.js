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

        // Map search toggle
        document.getElementById('btn-toggle-map-search').addEventListener('click', () => {
            document.getElementById('actions-map-search').classList.toggle('hidden');
        });
    },

    show() {
        document.getElementById('actions-panel').classList.remove('hidden');
        this.updatePanelInfo();
        this.loadPendingActions();
    },

    hide() {
        document.getElementById('actions-panel').classList.add('hidden');
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
            const actions = await api.getPendingActions(app.currentGame.saveId);
            this.pendingActions = actions;
            this.renderPendingActions();
        } catch (error) {
            console.error('Failed to load pending actions:', error);
        }
    },

    renderPendingActions() {
        const container = document.getElementById('pending-actions');
        container.innerHTML = '';

        if (this.pendingActions.length === 0) {
            container.innerHTML = '<p class="panel-hint">No pending actions. Write your first action!</p>';
            return;
        }

        this.pendingActions.forEach(action => {
            const div = document.createElement('div');
            div.className = `pending-action ${action.status}`;
            div.innerHTML = `
                <p class="pending-action-text">${action.action_text}</p>
                <p class="pending-action-status">
                    ${action.status === 'pending' ? '⏳ Pending' :
                    action.status === 'rejected' ? '❌ Rejected: ' + (action.ai_response || 'Action not feasible') :
                        '✅ Processed'}
                </p>
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
        btn.innerHTML = '<span class="icon">⏳</span> Validating...';

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
                app.showToast(`Action rejected: ${result.validation.reason}`, 'error');
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
            await api.deleteAction(actionId);
            app.showToast('Action deleted', 'info');
            this.loadPendingActions();
        } catch (error) {
            console.error('Failed to delete action:', error);
            app.showToast('Error deleting action', 'error');
        }
    },

    async brainstormActions() {
        if (!app.currentGame) return;

        const btn = document.getElementById('btn-brainstorm');
        btn.disabled = true;
        btn.textContent = '⏳ Thinking...';

        try {
            const result = await api.brainstormActions(app.currentGame.saveId);

            // Show suggestions in a modal or insert into chat
            app.showToast('Suggestions received! Check the panel.', 'success');

            // Insert suggestions into the actions panel
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.className = 'brainstorm-suggestions';
            suggestionsDiv.innerHTML = `
                <h4>💡 Advisor Suggestions:</h4>
                <div class="suggestions-content">${this.formatSuggestions(result.suggestions)}</div>
            `;

            const container = document.getElementById('pending-actions');
            if (!container) return;

            // Remove any previously shown brainstorm suggestions to keep it clean
            container.querySelectorAll('.brainstorm-suggestions')
                .forEach(el => el.remove());

            // Defensive insert (works whether container already has a hint or is empty)
            if (container.firstChild) {
                container.insertBefore(suggestionsDiv, container.firstChild);
            } else {
                container.appendChild(suggestionsDiv);
            }

        } catch (error) {
            console.error('Failed to brainstorm:', error);
            app.showToast('Error during brainstorming', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ Help me plan actions';
        }
    },

    formatSuggestions(text) {
        // Convert markdown-like formatting to HTML
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }
};
