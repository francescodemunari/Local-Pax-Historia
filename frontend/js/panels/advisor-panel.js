/**
 * Pax Historia - Advisor Panel
 * AI-powered advisor for strategic advice
 */

const advisorPanel = {
    messages: [],

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Send question button
        document.getElementById('btn-ask-advisor').addEventListener('click', () => {
            this.askQuestion();
        });

        // Enter key in input
        document.getElementById('advisor-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.askQuestion();
            }
        });

        // Quick action buttons
        document.querySelectorAll('#advisor-panel .quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.quickAction(action);
            });
        });
    },

    show() {
        document.getElementById('advisor-panel').classList.remove('hidden');
    },

    hide() {
        document.getElementById('advisor-panel').classList.add('hidden');
    },

    toggle() {
        const panel = document.getElementById('advisor-panel');
        if (panel.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    },

    addMessage(content, type = 'assistant') {
        const message = { content, type, timestamp: new Date() };
        this.messages.push(message);
        this.renderMessages();
    },

    renderMessages() {
        const container = document.getElementById('advisor-messages');
        container.innerHTML = '';

        this.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `chat-message ${msg.type}`;
            div.innerHTML = this.formatMessage(msg.content);
            container.appendChild(div);
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    },

    formatMessage(text) {
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^- /gm, '• ');
    },

    showTyping() {
        const container = document.getElementById('advisor-messages');
        const typing = document.createElement('div');
        typing.className = 'chat-message assistant typing-indicator';
        typing.id = 'advisor-typing';
        typing.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(typing);
        container.scrollTop = container.scrollHeight;
    },

    hideTyping() {
        const typing = document.getElementById('advisor-typing');
        if (typing) typing.remove();
    },

    async askQuestion() {
        const input = document.getElementById('advisor-input');
        const question = input.value.trim();

        if (!question) return;

        if (!app.currentGame) {
            app.showToast('No game in progress', 'error');
            return;
        }

        // Add user message
        this.addMessage(question, 'user');
        input.value = '';

        // Show typing indicator
        this.showTyping();

        try {
            const result = await api.askAdvisor(app.currentGame.saveId, question);
            this.hideTyping();
            this.addMessage(result.response, 'assistant');
        } catch (error) {
            this.hideTyping();
            console.error('Advisor error:', error);
            this.addMessage('I apologize, but I am unable to respond at the moment. Please try again later.', 'system');
        }
    },

    async quickAction(action) {
        if (!app.currentGame) {
            app.showToast('No game in progress', 'error');
            return;
        }

        let question = '';
        switch (action) {
            case 'summary':
                question = 'Give me a complete summary of the current situation: domestic politics, international situation, threats, and opportunities.';
                break;
            case 'strategic':
                question = 'Give me general strategic advice. What should be my next move?';
                break;
            case 'threats':
                question = 'What are the main threats our nation faces? Who should we defend against?';
                break;
            default:
                return;
        }

        // Add the question as user message
        this.addMessage(question, 'user');
        this.showTyping();

        try {
            let result;
            if (action === 'summary') {
                result = await api.getGameSummary(app.currentGame.saveId);
            } else if (action === 'strategic') {
                result = await api.getStrategicAdvice(app.currentGame.saveId, 'general');
            } else {
                result = await api.askAdvisor(app.currentGame.saveId, question);
            }

            this.hideTyping();
            this.addMessage(result.response, 'assistant');
        } catch (error) {
            this.hideTyping();
            console.error('Quick action error:', error);
            this.addMessage('Error retrieving information.', 'system');
        }
    },

    reset() {
        this.messages = [];
        this.renderMessages();
    }
};
