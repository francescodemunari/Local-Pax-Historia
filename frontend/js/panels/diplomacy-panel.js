/**
 * Pax Historia - Diplomacy Panel
 * Handles diplomatic relations and chat between nations
 */

const diplomacyPanel = {
    chats: [],
    selectedNations: [],
    currentChatId: null,

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Toggle diplomacy panel
        document.querySelector('[data-panel="diplomacy"]').addEventListener('click', () => {
            this.toggle();
        });

        // Close panel
        document.querySelector('#diplomacy-panel .panel-close').addEventListener('click', () => {
            this.hide();
        });

        // New Chat button
        document.getElementById('btn-new-chat').addEventListener('click', () => {
            this.showNewChatModal();
        });

        // Send message button
        document.getElementById('btn-send-chat').addEventListener('click', () => {
            this.sendMessage();
        });

        // Chat input Enter key
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.sendMessage();
            }
        });

        // Back button in chat modal
        document.querySelector('#chat-modal .btn-back').addEventListener('click', () => {
            this.hideChatModal();
        });

        // Close chat modal
        document.querySelector('#chat-modal .panel-close').addEventListener('click', () => {
            this.hideChatModal();
            this.hide();
        });

        // Back button in new chat modal
        document.querySelector('#new-chat-modal .btn-back').addEventListener('click', () => {
            this.hideNewChatModal();
        });

        // Close new chat modal
        document.querySelector('#new-chat-modal .panel-close').addEventListener('click', () => {
            this.hideNewChatModal();
            this.hide();
        });

        // Start chat button
        document.getElementById('btn-start-chat').addEventListener('click', () => {
            this.startNewChat();
        });

        // Nation search in new chat
        document.getElementById('nations-search').addEventListener('input', (e) => {
            this.filterNationsList(e.target.value);
        });
    },

    show() {
        document.getElementById('diplomacy-panel').classList.remove('hidden');
        this.loadChats();
    },

    hide() {
        document.getElementById('diplomacy-panel').classList.add('hidden');
    },

    toggle() {
        if (document.getElementById('diplomacy-panel').classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    },

    reset() {
        this.chats = [];
        this.selectedNations = [];
        this.currentChatId = null;
        document.getElementById('chats-list').innerHTML = '';
    },

    async loadChats() {
        if (!app.currentGame) return;

        try {
            const chats = await api.getChats(app.currentGame.saveId);
            this.chats = chats;
            this.renderChatsList();
        } catch (error) {
            console.error('Failed to load chats:', error);
            app.showToast('Error loading chats', 'error');
        }
    },

    renderChatsList() {
        const container = document.getElementById('chats-list');
        container.innerHTML = '';

        if (this.chats.length === 0) {
            container.innerHTML = '<p class="panel-hint">No active conversations. Start a new diplomatic chat!</p>';
            return;
        }

        this.chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            
            const participantsText = chat.participant_nations
                .filter(n => n !== app.currentGame.playerNation.code)
                .join(', ');

            div.innerHTML = `
                <div class="chat-item-info">
                    <div class="chat-item-title">${chat.topic || 'Negotiation with ' + participantsText}</div>
                    <div class="chat-item-last-msg">${chat.last_message || 'No messages'}</div>
                </div>
                <div class="chat-item-meta">
                    <span class="chat-msg-count">${chat.message_count}</span>
                </div>
            `;

            div.addEventListener('click', () => {
                this.openChat(chat.id, chat.topic || 'Chat with ' + participantsText);
            });

            container.appendChild(div);
        });
    },

    async showNewChatModal() {
        document.getElementById('new-chat-modal').classList.remove('hidden');
        this.selectedNations = [];
        this.updateSelectedNationsCount();
        
        try {
            const nations = await api.getAvailableNationsForChat(app.currentGame.saveId);
            this.renderNationsList(nations);
        } catch (error) {
            console.error('Failed to load available nations:', error);
        }
    },

    hideNewChatModal() {
        document.getElementById('new-chat-modal').classList.add('hidden');
    },

    renderNationsList(nations) {
        const container = document.getElementById('nations-list');
        container.innerHTML = '';

        nations.forEach(nation => {
            const div = document.createElement('div');
            div.className = 'nation-select-item';
            div.dataset.code = nation.code;
            div.innerHTML = `
                <div class="nation-flag-mini" style="background-color: ${nation.color}"></div>
                <div class="nation-select-info">
                    <div class="nation-select-name">${nation.name}</div>
                    <div class="nation-select-leader">${nation.leader_name}</div>
                </div>
                <div class="nation-select-check"></div>
            `;

            div.addEventListener('click', () => {
                this.toggleNationSelection(div, nation.code);
            });

            container.appendChild(div);
        });
    },

    toggleNationSelection(element, code) {
        if (this.selectedNations.includes(code)) {
            this.selectedNations = this.selectedNations.filter(n => n !== code);
            element.classList.remove('selected');
        } else {
            this.selectedNations.push(code);
            element.classList.add('selected');
        }
        this.updateSelectedNationsCount();
    },

    updateSelectedNationsCount() {
        document.getElementById('selected-nations-count').textContent = this.selectedNations.length;
        document.getElementById('btn-start-chat').disabled = this.selectedNations.length === 0;
    },

    filterNationsList(query) {
        const items = document.querySelectorAll('.nation-select-item');
        const q = query.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.nation-select-name').textContent.toLowerCase();
            const leader = item.querySelector('.nation-select-leader').textContent.toLowerCase();
            
            if (name.includes(q) || leader.includes(q)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    },

    async startNewChat() {
        if (this.selectedNations.length === 0) return;

        try {
            const participants = [app.currentGame.playerNation.code, ...this.selectedNations];
            const chat = await api.startChat(app.currentGame.saveId, participants);
            
            this.hideNewChatModal();
            this.loadChats();
            this.openChat(chat.id, 'New Conversation');
        } catch (error) {
            console.error('Failed to start chat:', error);
            app.showToast('Error opening chat', 'error');
        }
    },

    async openChat(chatId, title) {
        this.currentChatId = chatId;
        document.getElementById('chat-title').textContent = title;
        document.getElementById('chat-modal').classList.remove('hidden');
        document.getElementById('chat-messages').innerHTML = '<div class="loading-spinner-mini"></div>';
        
        try {
            const messages = await api.getChatMessages(chatId);
            this.renderMessages(messages);
        } catch (error) {
            console.error('Failed to load messages:', error);
            app.showToast('Error loading messages', 'error');
        }
    },

    hideChatModal() {
        document.getElementById('chat-modal').classList.add('hidden');
        this.currentChatId = null;
    },

    renderMessages(messages) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = '<div class="chat-message system"><p>Start the diplomatic conversation.</p></div>';
            return;
        }

        messages.forEach(msg => {
            const isPlayer = msg.sender_nation === app.currentGame.playerNation.code;
            const div = document.createElement('div');
            div.className = `chat-message ${isPlayer ? 'player' : 'ai'}`;
            
            div.innerHTML = `
                <div class="message-sender">${msg.sender_name} (${msg.leader_name})</div>
                <div class="message-text">${msg.message_text}</div>
                <div class="message-date">${app.formatDate(msg.game_date)}</div>
            `;
            
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;
    },

    async sendMessage() {
        if (!this.currentChatId) return;
        
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;

        const sendBtn = document.getElementById('btn-send-chat');
        sendBtn.disabled = true;
        
        try {
            const playerNation = app.currentGame.playerNation.code;
            
            // Optimistically add player message
            this.addMessageToUI({
                sender_nation: playerNation,
                sender_name: app.currentGame.playerNation.name,
                leader_name: app.currentGame.playerNation.leader_name || 'Leader',
                message_text: message,
                game_date: app.currentGame.currentDate
            });
            
            input.value = '';
            
            const result = await api.sendDiplomaticMessage(this.currentChatId, message, playerNation);
            
            if (result.success && result.responses) {
                result.responses.forEach(resp => {
                    this.addMessageToUI({
                        sender_nation: resp.nation,
                        sender_name: resp.nation_name,
                        leader_name: resp.leader,
                        message_text: resp.message,
                        game_date: app.currentGame.currentDate
                    });
                });
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            app.showToast('Error sending message', 'error');
        } finally {
            sendBtn.disabled = false;
        }
    },

    addMessageToUI(msg) {
        const container = document.getElementById('chat-messages');
        
        // Remove "system" message if present
        const systemMsg = container.querySelector('.system');
        if (systemMsg) systemMsg.remove();
        
        const isPlayer = msg.sender_nation === app.currentGame.playerNation.code;
        const div = document.createElement('div');
        div.className = `chat-message ${isPlayer ? 'player' : 'ai'}`;
        
        div.innerHTML = `
            <div class="message-sender">${msg.sender_name} (${msg.leader_name})</div>
            <div class="message-text">${msg.message_text}</div>
            <div class="message-date">${app.formatDate(msg.game_date)}</div>
        `;
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
};
