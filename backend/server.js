require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

// Import routes
const nationsRouter = require('./routes/nations');
const gameRouter = require('./routes/game');
const mapRouter = require('./routes/map');
const chatRouter = require('./routes/chat');
const advisorRouter = require('./routes/advisor');
const actionsRouter = require('./routes/actions');
const eventsRouter = require('./routes/events');
const regionsRouter = require('./routes/regions');
const unitsRouter = require('./routes/units');
const llmRouter = require('./routes/llm');

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

// Make pool available to routes
app.locals.wss = wss;

// Middleware
app.use(cors());
app.use('/api/nations/portrait',express.json({limit:'550kb'}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
});

// API Routes
app.use('/api/nations', nationsRouter);
app.use('/api/game', gameRouter);
app.use('/api/map', mapRouter);
app.use('/api/chat', chatRouter);
app.use('/api/advisor', advisorRouter);
app.use('/api/actions', actionsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/regions', regionsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/llm', llmRouter);

// Ping endpoint for verification
app.get('/api/ping', (req, res) => {
    res.json({ pong: true, time: new Date().toISOString(), message: "Server is running with latest Pax Historia routes" });
});

// Static files (MOVE AFTER API ROUTES). Game data, saves, debug output, and
// provider credentials are deliberately served only through scoped API routes.
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist')));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/data', (req, res) => res.sendStatus(404));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'none (file-based)' });
});

// Serve frontend
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ error: error.status === 400 ? 'Invalid JSON request body' : 'Request failed' });
});
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');

    ws.on('message', (message) => {
        console.log('Received:', message.toString());
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Broadcast to all connected clients
app.locals.broadcast = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    // ws forwards HTTP listen errors. Handle both emitters without reporting
    // the same failure twice or throwing an unhandled WebSocket error.
    const reportedErrors = new WeakSet();
    const reportServerError = error => {
        if (reportedErrors.has(error)) return;
        reportedErrors.add(error);
        if (error.code === 'EADDRINUSE') {
            console.error(`\nPort ${PORT} is already in use. Pax Historia could not start.`);
            console.error(`If Pax Historia is already running, open http://localhost:${PORT} in your browser.`);
            console.error('Otherwise close the application using that port, or set PORT in backend/.env.');
        } else {
            console.error(`Pax Historia server error: ${error.message}`);
        }
        process.exitCode = 1;
    };
    server.on('error', reportServerError);
    wss.on('error', reportServerError);
    server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    PAX HISTORIA                          ║
║          Scenario-Driven Grand Strategy Game             ║
╠══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}               ║
║  System: File-Based (HOI4 Data)                          ║
║  LLM API: ${process.env.LLM_API_URL || 'http://127.0.0.1:1234/v1'}        ║
╚══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    server.close(() => process.exit(0));
});
}

module.exports = { app, server, wss };
